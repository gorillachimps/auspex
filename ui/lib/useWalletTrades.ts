"use client";

import { usePolledResource } from "./usePolledResource";
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
 *
 * Built on the shared usePolledResource (interval + cancellation + keep-prev-
 * on-error are handled there); this hook just supplies the paginating fetcher.
 */
export function useWalletTrades(
  proxy: `0x${string}` | null | undefined,
): State {
  const { data, loading, error } = usePolledResource<Trade[]>(
    async (cancelled) => {
      const accumulator: Trade[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * PAGE_LIMIT;
        const url = `${HOST}/trades?user=${proxy}&limit=${PAGE_LIMIT}&offset=${offset}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json: unknown = await r.json();
        if (cancelled()) return accumulator;
        // Validate shape before subscripting. Distinguishes "wallet has no
        // trades" (empty array) from "API returned something unexpected"
        // (anything else) — the latter must surface as an error, not silently
        // become an empty list.
        if (!Array.isArray(json)) {
          throw new Error(
            "Unexpected response shape from /trades (expected array)",
          );
        }
        if (json.length === 0) break;
        accumulator.push(...(json as Trade[]));
        if (json.length < PAGE_LIMIT) break;
      }
      return accumulator;
    },
    { intervalMs: REFRESH_MS, enabled: !!proxy, deps: [proxy] },
  );

  return { trades: data, loading, error };
}
