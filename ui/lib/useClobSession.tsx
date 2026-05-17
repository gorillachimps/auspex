"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { polygon } from "viem/chains";
import type { ClobClient } from "@polymarket/clob-client-v2";
import {
  buildClobClient,
  ensureCreds,
  readFunderAddress,
  FUNDER_CHANGED_EVENT,
} from "./polymarket";
import { isPrivyConfigured } from "./env-client";

export type ClobSessionStatus =
  | "disabled" // Privy not configured
  | "loading" // Privy initialising
  | "unconnected" // No wallet connected
  | "no-funder" // Connected, deposit wallet not set
  | "deriving" // Authenticating with Polymarket (signing L1 message)
  | "ready" // Fully authenticated; client available
  | "error";

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
      setStatus("no-funder");
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
  }, [ready, authenticated, eoa, walletClient, funder, refreshTick]);

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
