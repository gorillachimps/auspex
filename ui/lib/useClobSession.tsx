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
  | "linked" // Wallet + funder known, CLOB credentials NOT yet derived
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
  /** Derive CLOB credentials on demand. Call this just-in-time from
   *  components that actually need to sign / read authenticated endpoints
   *  (order placement, allowance update, /portfolio balance). Returns the
   *  client once creds are derived. Idempotent — subsequent calls return the
   *  cached client without prompting again. */
  ensureClient: () => Promise<ClobClient>;
};

const DISABLED: ClobSession = {
  status: "disabled",
  signerAddress: null,
  funderAddress: null,
  client: null,
  error: null,
  refresh: () => {},
  ensureClient: () =>
    Promise.reject(new Error("Privy not configured — trading disabled")),
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

  // Compute status declaratively from the upstream state. No longer triggers
  // CLOB credential derivation on its own — that's lazy, behind `ensureClient`.
  useEffect(() => {
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
    // Wallet + funder ready. If we've already derived a client (e.g. from a
    // previous explicit ensureClient call within this session), surface that
    // via "ready". Otherwise sit at "linked" and wait for a consumer to
    // explicitly request derivation. This is the change that eliminates the
    // second wallet-signature prompt right after Privy connect.
    setError(null);
    setStatus((prev) => {
      if (client) return "ready";
      // Preserve "deriving" if a derivation is currently in flight (the
      // ensureClient method sets it; we don't clobber it back to "linked").
      if (prev === "deriving") return prev;
      return "linked";
    });
  }, [ready, authenticated, eoa, walletClient, funder, refreshTick, linkingForEoa, client]);

  // Promise-based ensureClient. Returns the cached client when one is already
  // available, otherwise runs the derivation + build sequence and caches the
  // result. Idempotent across concurrent calls thanks to deriveInFlight.
  const deriveInFlight = useRef<Promise<ClobClient> | null>(null);
  const ensureClient = useMemo(
    () => async (): Promise<ClobClient> => {
      if (client) return client;
      if (deriveInFlight.current) return deriveInFlight.current;
      if (!walletClient || !eoa || !funder) {
        throw new Error(
          "Cannot authenticate — connect a wallet and link your Polymarket account first.",
        );
      }
      setStatus("deriving");
      setError(null);
      const promise = (async () => {
        try {
          const creds = await ensureCreds(walletClient, eoa, funder);
          const c = buildClobClient({
            walletClient,
            funderAddress: funder,
            creds,
          });
          setClient(c);
          setStatus("ready");
          return c;
        } catch (e) {
          const msg = (e as Error).message ?? "auth failed";
          setError(msg);
          setStatus("error");
          setClient(null);
          throw e;
        } finally {
          deriveInFlight.current = null;
        }
      })();
      deriveInFlight.current = promise;
      return promise;
    },
    [walletClient, eoa, funder, client],
  );

  // Reset the cached client whenever the connecting wallet changes, the
  // funder changes, or refresh is called. This forces a fresh derive on the
  // next ensureClient call — matters when the user switches wallets mid-session.
  useEffect(() => {
    setClient(null);
    deriveInFlight.current = null;
  }, [walletClient, funder, refreshTick]);

  return useMemo(
    () => ({
      status,
      signerAddress: eoa ?? null,
      funderAddress: funder,
      client,
      error,
      refresh,
      ensureClient,
    }),
    [status, eoa, funder, client, error, refresh, ensureClient],
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
