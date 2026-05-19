"use client";

import { useEffect, useMemo, useState } from "react";
import type { Trade } from "./walletPnl";

const HOST = "https://data-api.polymarket.com";
const PER_WALLET_LIMIT = 20;
const REFRESH_MS = 60_000;

export type ActivityTrade = Trade & {
  /** The followed wallet this trade belongs to. Added by the hook for
   *  rendering attribution in the merged feed. */
  followedWallet: `0x${string}`;
};

type State = {
  trades: ActivityTrade[];
  loading: boolean;
  error: string | null;
};

/**
 * Combined trade feed across the user's followed wallets. Polls
 * data-api `/trades?user=<addr>&limit=20` in parallel for each followed
 * wallet, merges the results, sorts newest-first, and caps at 50 rows
 * for render. Refreshes every 60 s.
 *
 * Cost scales with the number of followed wallets — N concurrent fetches
 * per cycle. Acceptable up to ~20 followed wallets; beyond that we'd
 * want batching or server-side aggregation.
 */
export function useFollowedActivityFeed(
  addresses: `0x${string}`[],
): State {
  const [state, setState] = useState<State>({
    trades: [],
    loading: false,
    error: null,
  });

  // Stable key for the effect deps. Addresses are already lowercased by
  // useFollowedWallets but normalise here as a defensive guard.
  const key = useMemo(
    () => addresses.map((a) => a.toLowerCase()).sort().join(","),
    [addresses],
  );

  useEffect(() => {
    if (!key) {
      setState({ trades: [], loading: false, error: null });
      return;
    }
    const list = key.split(",") as `0x${string}`[];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const results = await Promise.allSettled(
          list.map(async (addr) => {
            const r = await fetch(
              `${HOST}/trades?user=${addr}&limit=${PER_WALLET_LIMIT}`,
              { cache: "no-store" },
            );
            if (!r.ok) throw new Error(`HTTP ${r.status} for ${addr}`);
            const data: unknown = await r.json();
            if (!Array.isArray(data)) {
              throw new Error(`unexpected /trades response shape for ${addr}`);
            }
            return { addr, trades: data as Trade[] };
          }),
        );
        if (cancelled) return;

        const merged: ActivityTrade[] = [];
        let firstError: string | null = null;
        for (const res of results) {
          if (res.status === "fulfilled") {
            for (const t of res.value.trades) {
              merged.push({ ...t, followedWallet: res.value.addr });
            }
          } else if (!firstError) {
            firstError = (res.reason as Error)?.message ?? "fetch failed";
          }
        }
        merged.sort((a, b) => b.timestamp - a.timestamp);
        setState({
          trades: merged.slice(0, 50),
          loading: false,
          // Surface the first error only if NO fetches succeeded — partial
          // success still renders the trades we got.
          error: merged.length === 0 ? firstError : null,
        });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          trades: s.trades,
          loading: false,
          error: (e as Error).message,
        }));
      } finally {
        if (!cancelled) timer = setTimeout(load, REFRESH_MS);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  return state;
}
