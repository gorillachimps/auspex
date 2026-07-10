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
import { createWalletClient, custom, type WalletClient } from "viem";
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
import { isPrivyConfigured } from "./env-client";
import { findPolymarketProxy } from "./findPolymarketProxy";
import { classifyProxy } from "./polymarketDerive";

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

/**
 * Read the cached funder, but ONLY trust it if it is still CREATE2-derivable
 * from the connected EOA. localStorage is attacker-influenceable (shared
 * machine / XSS) and the funder flows straight into bridge/onramp recipient
 * fields — so a poisoned, non-derivable entry must be dropped here, before it
 * can ever be funded. This is the SEC-1 CREATE2 guard applied to the cache, not
 * just the manual-paste path. Legit funders always pass (find-proxy only ever
 * returns deriveCandidates addresses, which classifyProxy matches).
 */
function readTrustedFunder(eoa: `0x${string}`): `0x${string}` | null {
  const cached = readFunderAddress(eoa);
  if (!cached) return null;
  if (classifyProxy(eoa, cached) == null) return null;
  return cached;
}

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
    setFunder(readTrustedFunder(eoa));
  }, [eoa, refreshTick]);

  // Auto-link: when a wallet connects and has no cached funder, derive their
  // Polymarket account via /api/find-proxy (deterministic CREATE2 + on-chain
  // deployment check) and save it silently — no dialog, no extra click. This is
  // the happy path for everyone who already has a Polymarket account, of any
  // type (Safe / Magic proxy / Deposit Wallet).
  //
  // Falls through to the dialog only when find-proxy returns nothing (a
  // brand-new wallet with no account yet) or on any network failure (fail open).
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
        if (!lookup.proxy) return; // no deployed account derived → no-funder

        // find-proxy derives this address from the connected EOA and confirms
        // it's deployed on-chain, so it's guaranteed to be this wallet's
        // account — save it silently.
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
      setFunder(readTrustedFunder(eoa!));
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
  // Generation token: bumped whenever the wallet/funder changes (the reset
  // effect below). A derivation captures the generation it started under and
  // refuses to commit its result if it's been superseded — otherwise an
  // in-flight derive that started under funder A could resolve AFTER the user
  // switched to funder B and call setClient(clientBoundToA) + ready, signing
  // subsequent orders against the wrong account.
  const deriveGen = useRef(0);
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
      const gen = deriveGen.current;
      const capturedWallet = walletClient;
      const capturedFunder = funder;
      // Classify the funder against the EOA (pure CREATE2, no network) so we
      // authenticate and sign with the correct CLOB signature type —
      // Safe(2) / Magic-proxy(1) / Deposit-Wallet(3). Falls back to deposit
      // (POLY_1271) if the funder isn't derivable from this EOA.
      const capturedProxyType = classifyProxy(eoa, capturedFunder) ?? "deposit";
      const stale = () => deriveGen.current !== gen;
      const promise = (async () => {
        try {
          const creds = await ensureCreds(
            capturedWallet,
            eoa,
            capturedFunder,
            capturedProxyType,
          );
          // Bail if the wallet/funder changed while we were signing — do not
          // build or surface a client bound to a now-stale funder.
          if (stale()) {
            throw new Error(
              "Account changed during authentication — please retry.",
            );
          }
          const c = buildClobClient({
            walletClient: capturedWallet,
            funderAddress: capturedFunder,
            creds,
            proxyType: capturedProxyType,
          });
          if (stale()) {
            throw new Error(
              "Account changed during authentication — please retry.",
            );
          }
          setClient(c);
          setStatus("ready");
          return c;
        } catch (e) {
          // Only clobber session state if this derivation is still current; a
          // superseded one must not stomp the new session's status/error.
          if (!stale()) {
            const msg = (e as Error).message ?? "auth failed";
            setError(msg);
            setStatus("error");
            setClient(null);
          }
          throw e;
        } finally {
          // Don't clear a newer in-flight derive that a fresh ensureClient
          // may have installed after this one was superseded.
          if (!stale()) deriveInFlight.current = null;
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
  // Bumping deriveGen invalidates any derivation still in flight.
  useEffect(() => {
    setClient(null);
    deriveInFlight.current = null;
    deriveGen.current += 1;
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
