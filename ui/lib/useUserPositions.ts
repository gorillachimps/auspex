"use client";

import { useEffect, useMemo, useState } from "react";

const POSITIONS_HOST = "https://data-api.polymarket.com";
const REFRESH_MS = 30_000;

/** Shape of one row from data-api.polymarket.com/positions. */
export type Position = {
  proxyWallet: string;
  asset: string; // conditional-token ID (uint256 decimal string)
  conditionId: string;
  size: number; // shares currently held
  avgPrice: number; // volume-weighted entry price
  initialValue: number; // size × avgPrice
  currentValue: number; // size × curPrice
  cashPnl: number; // unrealized P&L in USDC
  percentPnl: number; // unrealized P&L as a percentage (e.g. 25 = +25%)
  totalBought: number;
  realizedPnl: number; // realized P&L from any prior SELLs of this position
  curPrice: number; // current mid (server-computed snapshot)
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string; // "Yes" | "No"
  outcomeIndex: number; // 0 | 1
  endDate?: string;
  negativeRisk?: boolean;
};

type State = {
  positions: Position[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const NOOP = () => {};

/**
 * Fetch all open positions for a Polymarket account (the proxy/funder wallet),
 * auto-refresh every 30s. Returns `positions: null` until the first fetch
 * completes — this distinguishes "loading" from "loaded, no positions".
 *
 * Used by PortfolioView (full list) and PositionCard via
 * useUserMarketPositions (filtered to one market).
 */
export function useUserPositions(
  funder: `0x${string}` | null | undefined,
): State {
  const [state, setState] = useState<State>({
    positions: null,
    loading: false,
    error: null,
    refresh: NOOP,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (!funder) {
        setState({ positions: null, loading: false, error: null, refresh: load });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null, refresh: load }));
      try {
        const url = `${POSITIONS_HOST}/positions?user=${funder}&sizeThreshold=0`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const positions: Position[] = Array.isArray(data) ? data : [];
        setState({ positions, loading: false, error: null, refresh: load });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          positions: s.positions,
          loading: false,
          error: (e as Error).message,
          refresh: load,
        }));
      } finally {
        if (!cancelled) timer = setTimeout(load, REFRESH_MS);
      }
    }

    // Listen for order-placed events from OrderTicket so consumers
    // (TotalBalance, PositionCard, TabTitleBadge) see new fills without
    // waiting up to 30s for the next auto-poll tick.
    function onOrderPlaced() {
      if (timer) clearTimeout(timer);
      load();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("auspex:order-placed", onOrderPlaced);
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("auspex:order-placed", onOrderPlaced);
      }
    };
  }, [funder]);

  return state;
}

/** Filtered view: only positions whose `asset` matches one of the given token
 *  IDs. Useful on a market detail page where you want this market's entries
 *  for the PositionCard. */
export function useUserMarketPositions(
  funder: `0x${string}` | null | undefined,
  tokenIds: (string | null | undefined)[],
): {
  yes: Position | null;
  no: Position | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const state = useUserPositions(funder);
  const key = tokenIds.filter(Boolean).join(",");

  return useMemo(() => {
    const wanted = new Set(tokenIds.filter((t): t is string => Boolean(t)));
    const positions = state.positions ?? [];
    let yes: Position | null = null;
    let no: Position | null = null;
    for (const p of positions) {
      if (!wanted.has(p.asset)) continue;
      // outcomeIndex 0 = YES, 1 = NO on Polymarket binary markets.
      if (p.outcomeIndex === 0 || /^yes$/i.test(p.outcome)) yes = p;
      else if (p.outcomeIndex === 1 || /^no$/i.test(p.outcome)) no = p;
    }
    return {
      yes,
      no,
      loading: state.loading,
      error: state.error,
      refresh: state.refresh,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.positions, state.loading, state.error, state.refresh, key]);
}
