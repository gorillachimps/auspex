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

export type PositionsState = {
  positions: Position[] | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => void;
};

const NOOP = () => {};
const EMPTY: PositionsState = {
  positions: null,
  loading: false,
  error: null,
  fetchedAt: null,
  refresh: NOOP,
};

/**
 * Module-level shared store keyed by funder address.
 *
 * Before this, every consumer (TotalBalance, useTabTitleBadge,
 * useSettlementNotifications, each PositionCard via useUserMarketPositions,
 * and PortfolioView's own inline copy) ran an independent 30s poll against
 * /positions for the SAME wallet — 4-5 concurrent identical requests, and a
 * thundering herd of refetches on every `auspex:order-placed`. Now there is
 * exactly one poll per funder, fanned out to all subscribers. Mirrors the
 * cache pattern in useMarketLookup.
 */
type StoreEntry = {
  funder: `0x${string}`;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  /** Stable snapshot object — identity changes only when data changes, so
   *  consuming components only re-render on real updates. */
  snapshot: PositionsState;
};

const store = new Map<string, StoreEntry>();

function keyFor(funder: string): string {
  return funder.toLowerCase();
}

function emit(entry: StoreEntry, patch: Partial<PositionsState>) {
  entry.snapshot = { ...entry.snapshot, ...patch };
  for (const listener of entry.listeners) listener();
}

async function load(funder: `0x${string}`) {
  const entry = store.get(keyFor(funder));
  if (!entry) return;
  if (entry.inFlight) return; // dedupe overlapping loads
  entry.inFlight = true;
  emit(entry, { loading: true, error: null });
  try {
    const url = `${POSITIONS_HOST}/positions?user=${funder}&sizeThreshold=0`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const positions: Position[] = Array.isArray(data) ? data : [];
    emit(entry, {
      positions,
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    // Keep the prior positions on error so the UI doesn't blank out.
    emit(entry, { loading: false, error: (e as Error).message });
  } finally {
    entry.inFlight = false;
    // Reschedule only while someone is still listening.
    if (entry.listeners.size > 0) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => load(funder), REFRESH_MS);
    }
  }
}

// One global order-placed listener (not one per consumer). On a fresh fill,
// reload every actively-subscribed funder immediately rather than waiting up
// to 30s for the next tick.
let orderListenerBound = false;
function ensureOrderListener() {
  if (orderListenerBound || typeof window === "undefined") return;
  orderListenerBound = true;
  window.addEventListener("auspex:order-placed", () => {
    for (const entry of store.values()) {
      if (entry.listeners.size > 0) {
        if (entry.timer) clearTimeout(entry.timer);
        load(entry.funder);
      }
    }
  });
}

function subscribe(funder: `0x${string}`, listener: () => void): () => void {
  ensureOrderListener();
  const k = keyFor(funder);
  let entry = store.get(k);
  if (!entry) {
    entry = {
      funder,
      listeners: new Set(),
      timer: null,
      inFlight: false,
      snapshot: { ...EMPTY, refresh: () => load(funder) },
    };
    store.set(k, entry);
  }
  const wasIdle = entry.listeners.size === 0;
  entry.listeners.add(listener);
  // First subscriber (re)starts the poll loop. If a cached snapshot already
  // exists from a previous mount, the subscriber sees it instantly and the
  // fresh load refreshes it.
  if (wasIdle) load(funder);
  return () => {
    const e = store.get(k);
    if (!e) return;
    e.listeners.delete(listener);
    if (e.listeners.size === 0 && e.timer) {
      clearTimeout(e.timer);
      e.timer = null;
    }
  };
}

/**
 * Subscribe to the shared positions store for a funder. Returns `positions:
 * null` until the first fetch completes (distinguishes "loading" from
 * "loaded, empty"). All callers for the same funder share one poll.
 */
export function useUserPositions(
  funder: `0x${string}` | null | undefined,
): PositionsState {
  const [snap, setSnap] = useState<PositionsState>(() => {
    if (!funder) return EMPTY;
    return store.get(keyFor(funder))?.snapshot ?? EMPTY;
  });

  useEffect(() => {
    if (!funder) {
      setSnap(EMPTY);
      return;
    }
    const k = keyFor(funder);
    const update = () => {
      const e = store.get(k);
      if (e) setSnap(e.snapshot);
    };
    const unsub = subscribe(funder, update);
    update(); // sync the freshest snapshot on (re)mount
    return unsub;
  }, [funder]);

  return snap;
}

/** Filtered view: only positions whose `asset` matches one of the given token
 *  IDs. Useful on a market detail page where you want this market's entries
 *  for the PositionCard. Shares the same underlying poll as every other
 *  consumer of useUserPositions for this funder. */
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
