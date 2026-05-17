"use client";

import { useEffect, useState } from "react";
import type { Trade } from "./walletPnl";

const HOST = "https://data-api.polymarket.com";
// The data-api /trades endpoint caps at 500 per page. We pull `MAX_PAGES`
// pages then stop. 500 × 5 = 2500 trades — enough for the 30d window we
// care about on typical active wallets. Heavy whales may have older
// trades that won't appear in the curve; acceptable for v1.
const MAX_PAGES = 5;
const PAGE_LIMIT = 500;
const REFRESH_MS = 60_000;

type State = {
  trades: Trade[] | null;
  loading: boolean;
  error: string | null;
};

/**
 * Fetch the full trade history for a Polymarket proxy address by paginating
 * data-api `/trades?user=…&limit=500&offset=…` until the response is short
 * or we hit the page cap. Auto-refreshes every minute. `trades: null` means
 * still loading the first page — distinguishes loading from empty.
 */
export function useWalletTrades(
  proxy: `0x${string}` | null | undefined,
): State {
  const [state, setState] = useState<State>({
    trades: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (!proxy) {
        setState({ trades: null, loading: false, error: null });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      const accumulator: Trade[] = [];
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const offset = page * PAGE_LIMIT;
          const url = `${HOST}/trades?user=${proxy}&limit=${PAGE_LIMIT}&offset=${offset}`;
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as Trade[];
          if (cancelled) return;
          if (!Array.isArray(data) || data.length === 0) break;
          accumulator.push(...data);
          if (data.length < PAGE_LIMIT) break;
        }
        if (cancelled) return;
        setState({ trades: accumulator, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          trades: s.trades, // preserve any previous successful fetch
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
  }, [proxy]);

  return state;
}
