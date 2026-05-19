"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type WalletClient,
} from "viem";
import { polygon } from "viem/chains";
import type { ClobClient } from "@polymarket/clob-client-v2";
import { toast } from "sonner";
import {
  buildClobClient,
  ensureCreds,
  readFunderAddress,
  writeFunderAddress,
  FUNDER_CHANGED_EVENT,
} from "./polymarket";
import { isPrivyConfigured, POLYGON_RPC_URL } from "./env-client";
import {
  findPolymarketProxy,
  findProxyOwners,
} from "./findPolymarketProxy";

export type ClobSessionStatus =
  | "disabled" // Privy not configured
  | "loading" // Privy initialising
  | "unconnected" // No wallet connected
  | "linking" // Wallet connected, auto-detecting Polymarket account
  | "no-funder" // Connected, auto-detect failed or returned no proxy
  | "deriving" // Authenticating with Polymarket (signing L1 message)
  | "ready" // Fully authenticated; client available
  | "error";

// Module-scoped read-only client for the bytecode check during auto-link.
// We don't use the wagmi-bound publicClient here because useClobSession runs
// upstream of the wagmi provider in some render orders during hydration.
const polygonReadClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

export type ClobSession = {
  status: ClobSessionStatus;
  signerAddress: `0x${string}` | null;
  funderAddress: `0x${string}` | null;
  client: ClobClient | null;
  error: string | null;
  /** Refresh the wallet/funder/creds detection. Call after the user updates
   *  their deposit wallet via DepositWalletDialog. */
  refresh: () => void;
};

const DISABLED: ClobSession = {
  status: "disabled",
  signerAddress: null,
  funderAddress: null,
  client: null,
  error: null,
  refresh: () => {},
};

const ClobSessionContext = createContext<ClobSession>(DISABLED);

/** Build the session state — called exactly once by ClobSessionProvider. */
function useClobSessionState(): ClobSession {
  const privy = usePrivy();
  const { wallets } = useWallets();
  const ready = privy.ready;
  const authenticated = privy.authenticated;

  const eoa = wallets[0]?.address as `0x${string}` | undefined;
  const wallet = wallets[0];

  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [funder, setFunder] = useState<`0x${string}` | null>(null);
  const [client, setClient] = useState<ClobClient | null>(null);
  const [status, setStatus] = useState<ClobSessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /** "linking" while the EOA's Polymarket proxy is being auto-detected, before
   *  we either find one (→ funder is set silently) or give up (→ status moves
   *  to "no-funder" and the DepositWalletDialog manual-entry path is offered). */
  const [linkingForEoa, setLinkingForEoa] = useState<string | null>(null);
  /** Per-EOA flag so we don't re-attempt auto-detect after a single failure. */
  const autoLinkAttempted = useRef<Set<string>>(new Set());

  const refresh = useMemo(
    () => () => {
      setRefreshTick((t) => t + 1);
    },
    [],
  );

  // Resolve the funder address whenever the connected EOA changes (or on refresh).
  useEffect(() => {
    if (!eoa) {
      setFunder(null);
      return;
    }
    setFunder(readFunderAddress(eoa));
  }, [eoa, refreshTick]);

  // Auto-link: when a wallet connects and has no cached funder, try to find
  // their Polymarket proxy on-chain via /api/find-proxy. If the result passes
  // validation (the proxy is a contract AND the connected EOA is in its
  // owners list), save it silently — no dialog, no extra click. This is the
  // happy path for users who already have a Polymarket account.
  //
  // Falls through to the dialog-based manual entry when:
  //   - find-proxy returns no result (user has no Polymarket account yet)
  //   - find-proxy succeeds but bytecode check fails (proxy address doesn't
  //     exist on-chain — shouldn't happen but defensive)
  //   - reverse-owner check fails (proxy isn't owned by this EOA — also a
  //     defensive guard, since find-proxy already filters by owner)
  //   - any RPC / network failure → fail open, user gets the dialog
  useEffect(() => {
    if (!eoa || !walletClient) return;
    if (funder) return; // cached funder; nothing to auto-detect
    if (autoLinkAttempted.current.has(eoa)) return; // already tried this session
    autoLinkAttempted.current.add(eoa);

    let cancelled = false;
    setLinkingForEoa(eoa);

    (async () => {
      try {
        const lookup = await findPolymarketProxy(eoa);
        if (cancelled) return;
        if (!lookup.proxy) return; // no Polymarket account → fall to no-funder

        // Step 1: bytecode check.
        let hasBytecode = false;
        try {
          const code = await polygonReadClient.getCode({
            address: lookup.proxy,
          });
          hasBytecode = !!code && code !== "0x";
        } catch {
          // RPC error: don't auto-save, fall through to dialog so the user
          // can review what we found.
          return;
        }
        if (cancelled) return;
        if (!hasBytecode) return;

        // Step 2: reverse-owner check (when API key is configured).
        const owners = await findProxyOwners(lookup.proxy);
        if (cancelled) return;
        if (owners.available && owners.owners.length > 0) {
          const isOwner = owners.owners.some(
            (o) => o.toLowerCase() === eoa.toLowerCase(),
          );
          if (!isOwner) return; // proxy belongs to a different wallet
        }

        // All checks passed. Save silently and surface a toast.
        writeFunderAddress(eoa, lookup.proxy);
        toast.success(
          `Linked your Polymarket account ${lookup.proxy.slice(0, 6)}…${lookup.proxy.slice(-4)}`,
        );
      } catch {
        // any error → silent fail; user gets the manual dialog
      } finally {
        if (!cancelled) setLinkingForEoa((curr) => (curr === eoa ? null : curr));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eoa, walletClient, funder]);

  // Pick up funder writes from any component or other tab without waiting for
  // a page reload. Both same-tab (CustomEvent) and cross-tab (StorageEvent).
  useEffect(() => {
    if (!eoa) return;
    function reread() {
      setFunder(readFunderAddress(eoa!));
    }
    function onStorage(e: StorageEvent) {
      // Storage key prefix is frozen at the pre-rebrand value so existing
      // users' saved deposit wallets keep working. See lib/polymarket.ts.
      if (e.key && e.key.startsWith("polycrypto.funder.v1.")) reread();
    }
    window.addEventListener(FUNDER_CHANGED_EVENT, reread);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FUNDER_CHANGED_EVENT, reread);
      window.removeEventListener("storage", onStorage);
    };
  }, [eoa]);

  // Build a viem WalletClient from Privy's EIP-1193 provider. Before we hand
  // back the client, force the wallet onto Polygon (chainId 137) — Polymarket
  // V2's signing path embeds chainId 137 in the EIP-712 domain and will reject
  // signatures produced on any other chain. Privy will surface the standard
  // wallet_switchEthereumChain prompt if the user is on a different network.
  useEffect(() => {
    let cancelled = false;
    setWalletClient(null);
    if (!wallet || !eoa) return;
    (async () => {
      try {
        try {
          await wallet.switchChain(polygon.id);
        } catch (switchErr) {
          // eslint-disable-next-line no-console
          console.warn("[auspex] wallet.switchChain failed:", switchErr);
        }
        if (cancelled) return;
        const provider = await wallet.getEthereumProvider();
        if (cancelled) return;
        const wc = createWalletClient({
          account: eoa,
          chain: polygon,
          transport: custom(provider),
        });
        if (!cancelled) setWalletClient(wc);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, eoa]);

  // Derive (or reuse) creds, then build the configured client.
  useEffect(() => {
    let cancelled = false;
    if (!ready) {
      setStatus("loading");
      return;
    }
    if (!authenticated || !eoa || !walletClient) {
      setStatus("unconnected");
      setClient(null);
      return;
    }
    if (!funder) {
      // Distinguish "auto-detect in flight" from "auto-detect failed — show
      // the manual dialog." The connect button reads `linking` to show a
      // friendly "Linking your account…" pill instead of the ⚠️ no-funder
      // warning during the brief window where we're still looking.
      setStatus(linkingForEoa === eoa ? "linking" : "no-funder");
      setClient(null);
      return;
    }
    setStatus("deriving");
    setError(null);
    (async () => {
      try {
        const creds = await ensureCreds(walletClient, eoa, funder);
        if (cancelled) return;
        const c = buildClobClient({
          walletClient,
          funderAddress: funder,
          creds,
        });
        if (!cancelled) {
          setClient(c);
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? "auth failed");
          setStatus("error");
          setClient(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, eoa, walletClient, funder, refreshTick, linkingForEoa]);

  return useMemo(
    () => ({
      status,
      signerAddress: eoa ?? null,
      funderAddress: funder,
      client,
      error,
      refresh,
    }),
    [status, eoa, funder, client, error, refresh],
  );
}

/** Inner provider — only mounted when Privy is configured so the Privy hooks
 *  have a real context to read from. */
function PrivyClobProvider({ children }: { children: ReactNode }) {
  const session = useClobSessionState();
  return (
    <ClobSessionContext.Provider value={session}>
      {children}
    </ClobSessionContext.Provider>
  );
}

/** Top-level provider. Picks between the real and disabled paths once, at the
 *  module boundary, so React's rules-of-hooks consistent-ordering rule holds. */
export const ClobSessionProvider: ({
  children,
}: {
  children: ReactNode;
}) => React.ReactElement = isPrivyConfigured
  ? PrivyClobProvider
  : ({ children }: { children: ReactNode }) => (
      <ClobSessionContext.Provider value={DISABLED}>
        {children}
      </ClobSessionContext.Provider>
    );

/** Hook every Phase 2 component consumes. Reads from the single provider
 *  instance — so wallet.switchChain prompts and credential derivation fire
 *  exactly once per page mount instead of once per consumer. */
export function useClobSession(): ClobSession {
  return useContext(ClobSessionContext);
}
