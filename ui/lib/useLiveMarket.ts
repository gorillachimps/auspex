"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { polymarketMarketWs, type WsStatus } from "./polymarketWs";
import { CLOB_HOST } from "./polymarket";

/**
 * Public React hooks over the Polymarket market-data WS singleton.
 *
 * Pricing convention reminders (matches the HTTP /book endpoint):
 *   - bids are sorted ASCENDING by price → best bid is at array[length - 1]
 *   - asks are sorted DESCENDING by price → best ask is at array[length - 1]
 *
 * Hooks here normalise event payloads, sort levels per the above, and expose
 * stable React state. Internally each hook owns its own copy of book state per
 * tokenId — the singleton WS only dispatches events to subscribers, it doesn't
 * cache books.
 */

export type Level = { price: string; size: string };

export type LiveBook = {
  bids: Level[];
  asks: Level[];
  /** Server-supplied timestamp string, opaque format. */
  timestamp?: string;
  /** Monotonically increasing version, useful for memo deps. */
  version: number;
};

export type LiveLastTrade = {
  price: number;
  size: number;
  side: "BUY" | "SELL";
  /** Unix milliseconds. */
  timestamp: number;
};

type RawChange = { price: string; side: "BUY" | "SELL"; size: string };

function sortBids(levels: Map<string, string>): Level[] {
  return [...levels.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
}

function sortAsks(levels: Map<string, string>): Level[] {
  return [...levels.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
}

function applyPriceChanges(book: LiveBook, changes: RawChange[]): LiveBook {
  const bids = new Map<string, string>();
  const asks = new Map<string, string>();
  for (const lvl of book.bids) bids.set(lvl.price, lvl.size);
  for (const lvl of book.asks) asks.set(lvl.price, lvl.size);
  for (const c of changes ?? []) {
    const target = c.side === "BUY" ? bids : asks;
    const n = parseFloat(c.size);
    if (!isFinite(n) || n <= 0) target.delete(c.price);
    else target.set(c.price, c.size);
  }
  return {
    bids: sortBids(bids),
    asks: sortAsks(asks),
    timestamp: book.timestamp,
    version: book.version + 1,
  };
}

function topBid(book: LiveBook | null): number | null {
  if (!book || book.bids.length === 0) return null;
  const v = parseFloat(book.bids[book.bids.length - 1].price);
  return isFinite(v) ? v : null;
}

function topAsk(book: LiveBook | null): number | null {
  if (!book || book.asks.length === 0) return null;
  const v = parseFloat(book.asks[book.asks.length - 1].price);
  return isFinite(v) ? v : null;
}

function midFromBook(book: LiveBook | null): number | null {
  const b = topBid(book);
  const a = topAsk(book);
  if (b != null && a != null) return (b + a) / 2;
  if (b != null) return b;
  if (a != null) return a;
  return null;
}

function bookFromBidsAsks(
  bids: Level[],
  asks: Level[],
  timestamp: string | undefined,
  version: number,
): LiveBook {
  const bidMap = new Map<string, string>();
  const askMap = new Map<string, string>();
  for (const l of bids) if (l?.price) bidMap.set(l.price, l.size);
  for (const l of asks) if (l?.price) askMap.set(l.price, l.size);
  return {
    bids: sortBids(bidMap),
    asks: sortAsks(askMap),
    timestamp,
    version,
  };
}

/**
 * Live, mutable order book for a single token. Null while loading.
 *
 * Hybrid load strategy: an HTTP `/book` request gives us the initial snapshot
 * synchronously (well, on the next tick) regardless of how the WS server
 * decides to handle our subscribe message. The WS then layers `price_change`
 * deltas on top. If the WS server ALSO delivers a `book` snapshot we just
 * accept it — the new one wins (with the version reset).
 *
 * This belt-and-braces approach exists because Polymarket's WS doesn't
 * reliably re-deliver a `book` snapshot when a new asset is added via a
 * subsequent subscribe message on an open connection (the first asset works,
 * subsequent ones don't always). Without the HTTP fallback, toggling the
 * order book between YES and NO leaves the second side stuck on a loading
 * spinner forever.
 */
export function useLiveBook(tokenId: string | null | undefined): LiveBook | null {
  const [book, setBook] = useState<LiveBook | null>(null);
  useEffect(() => {
    if (!tokenId) {
      setBook(null);
      return;
    }
    setBook(null);
    let cancelled = false;

    // 1. HTTP snapshot for instant render. Survives WS server quirks.
    fetch(`${CLOB_HOST}/book?token_id=${encodeURIComponent(tokenId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { bids?: Level[]; asks?: Level[]; timestamp?: string }) => {
        if (cancelled) return;
        // Only seed if we haven't already got a fresher book from the WS.
        setBook((prev) =>
          prev != null
            ? prev
            : bookFromBidsAsks(data.bids ?? [], data.asks ?? [], data.timestamp, 0),
        );
      })
      .catch(() => {
        // Network glitch — the WS book event (if/when it comes) will fill in.
      });

    // 2. WS for live deltas + any server-delivered book snapshots.
    const unsub = polymarketMarketWs.subscribe([tokenId], {
      onBook: (e) => {
        if (cancelled) return;
        setBook(
          bookFromBidsAsks(
            (e.bids as Level[] | undefined) ?? [],
            (e.asks as Level[] | undefined) ?? [],
            e.timestamp as string | undefined,
            0,
          ),
        );
      },
      onPriceChange: (e) => {
        if (cancelled) return;
        const changes = (e.changes as RawChange[] | undefined) ?? [];
        setBook((prev) => (prev ? applyPriceChanges(prev, changes) : prev));
      },
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [tokenId]);
  return book;
}

/** Just the live mid (bid+ask)/2 for a token. */
export function useLiveMid(tokenId: string | null | undefined): number | null {
  const book = useLiveBook(tokenId);
  // `book` is a fresh object on every update (applyPriceChanges/bookFromBidsAsks
  // never mutate in place), so its identity alone is the correct, sufficient
  // dependency. The extra `book?.version` dep was redundant.
  return useMemo(() => midFromBook(book), [book]);
}

/** Most recent matched trade for a token. */
export function useLastTrade(
  tokenId: string | null | undefined,
): LiveLastTrade | null {
  const [lt, setLt] = useState<LiveLastTrade | null>(null);
  useEffect(() => {
    if (!tokenId) {
      setLt(null);
      return;
    }
    const unsub = polymarketMarketWs.subscribe([tokenId], {
      onLastTrade: (e) => {
        const price = parseFloat(e.price as string);
        const size = parseFloat(e.size as string);
        const tsRaw = e.timestamp as string | undefined;
        const tsNum = tsRaw ? parseFloat(tsRaw) : NaN;
        // Polymarket sends ms in some channels, seconds in others. Normalise.
        const ts = isFinite(tsNum)
          ? tsNum > 1e12
            ? tsNum
            : tsNum * 1000
          : Date.now();
        if (isFinite(price)) {
          setLt({
            price,
            size: isFinite(size) ? size : 0,
            side: (e.side as "BUY" | "SELL") ?? "BUY",
            timestamp: ts,
          });
        }
      },
    });
    return unsub;
  }, [tokenId]);
  return lt;
}

/**
 * Batch hook for the screener: subscribe to many tokens, get a Map of live
 * mids. Books are tracked internally per token; the returned Map identity
 * changes when ANY mid changes, so consumers should `useMemo` for derived
 * arrays of rows.
 */
export function useLiveMidMap(tokenIds: string[]): Map<string, number> {
  const depKey = useMemo(
    () => [...new Set(tokenIds)].filter((x) => !!x).sort().join(","),
    [tokenIds],
  );
  const [mids, setMids] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    const ids = depKey ? depKey.split(",") : [];
    if (ids.length === 0) {
      setMids(new Map());
      return;
    }
    let cancelled = false;
    // Per-token book state lives in this closure, NOT in component state, so
    // we don't trigger a re-render on every price_change event — only when a
    // mid actually changes.
    const localBooks = new Map<string, { bids: Map<string, string>; asks: Map<string, string> }>();

    function recomputeMid(id: string) {
      if (cancelled) return;
      const b = localBooks.get(id);
      if (!b) return;
      // Best bid = highest price in bids; best ask = lowest in asks.
      let bestBid: number | null = null;
      for (const p of b.bids.keys()) {
        const n = parseFloat(p);
        if (isFinite(n) && (bestBid == null || n > bestBid)) bestBid = n;
      }
      let bestAsk: number | null = null;
      for (const p of b.asks.keys()) {
        const n = parseFloat(p);
        if (isFinite(n) && (bestAsk == null || n < bestAsk)) bestAsk = n;
      }
      const mid =
        bestBid != null && bestAsk != null
          ? (bestBid + bestAsk) / 2
          : bestBid ?? bestAsk;
      if (mid == null) return;
      setMids((prev) => {
        const cur = prev.get(id);
        if (cur != null && Math.abs(cur - mid) < 1e-9) return prev;
        const next = new Map(prev);
        next.set(id, mid);
        return next;
      });
    }

    const unsub = polymarketMarketWs.subscribe(ids, {
      onBook: (e) => {
        const id = e.asset_id as string;
        const bids = new Map<string, string>();
        const asks = new Map<string, string>();
        for (const lvl of ((e.bids as Level[] | undefined) ?? [])) {
          if (lvl?.price) bids.set(lvl.price, lvl.size);
        }
        for (const lvl of ((e.asks as Level[] | undefined) ?? [])) {
          if (lvl?.price) asks.set(lvl.price, lvl.size);
        }
        localBooks.set(id, { bids, asks });
        recomputeMid(id);
      },
      onPriceChange: (e) => {
        const id = e.asset_id as string;
        const b = localBooks.get(id);
        if (!b) return;
        for (const c of ((e.changes as RawChange[] | undefined) ?? [])) {
          const target = c.side === "BUY" ? b.bids : b.asks;
          const n = parseFloat(c.size);
          if (!isFinite(n) || n <= 0) target.delete(c.price);
          else target.set(c.price, c.size);
        }
        recomputeMid(id);
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [depKey]);

  return mids;
}

/** WS connection status. Useful for showing a "Live"/"Reconnecting" pip. */
export function useWsStatus(): WsStatus {
  const [status, setStatus] = useState<WsStatus>("idle");
  useEffect(() => polymarketMarketWs.onStatus(setStatus), []);
  return status;
}

/** Per-token metadata needed to render a trade event into a human row. */
export type TokenInfo = {
  marketTitle: string;
  marketSlug: string;
  outcome: "yes" | "no";
};

export type WhaleTrade = {
  /** Stable key: assetId + timestamp. */
  id: string;
  assetId: string;
  marketTitle: string;
  marketSlug: string;
  outcome: "yes" | "no";
  side: "BUY" | "SELL";
  price: number;
  size: number;
  notionalUsd: number;
  /** Unix milliseconds. */
  timestamp: number;
};

/**
 * Tap the WS `last_trade_price` channel and surface fills whose USDC notional
 * meets a threshold. Captures live activity across the supplied tokens (the
 * screener's top-N set is the natural input).
 *
 * Returns the most recent `maxItems`, sorted newest-first. Stale on page load —
 * the feed is empty until a fresh fill arrives. Seeding from data-api would
 * fix that but isn't free; we lean on the screener already being open during
 * an active session.
 */
export function useWhaleFeed(
  tokenInfo: Map<string, TokenInfo>,
  thresholdUsd = 100,
  maxItems = 20,
): WhaleTrade[] {
  const [feed, setFeed] = useState<WhaleTrade[]>([]);
  const depKey = useMemo(
    () => [...tokenInfo.keys()].sort().join(","),
    [tokenInfo],
  );
  // Read the latest tokenInfo via a ref so the subscribe effect does NOT
  // re-run on every parent re-render that rebuilds the Map identity (which
  // happens on each screener data refresh). The handler reads current
  // metadata at event time; only the token SET (depKey) should re-subscribe.
  const tokenInfoRef = useRef(tokenInfo);
  useEffect(() => {
    tokenInfoRef.current = tokenInfo;
  }, [tokenInfo]);

  useEffect(() => {
    const ids = depKey ? depKey.split(",") : [];
    if (ids.length === 0) {
      setFeed([]);
      return;
    }
    let cancelled = false;
    const unsub = polymarketMarketWs.subscribe(ids, {
      onLastTrade: (e) => {
        if (cancelled) return;
        const assetId = e.asset_id as string;
        const info = tokenInfoRef.current.get(assetId);
        if (!info) return;
        const price = parseFloat(e.price as string);
        const size = parseFloat(e.size as string);
        const notional = price * size;
        if (!isFinite(notional) || notional < thresholdUsd) return;
        const tsRaw = e.timestamp as string | undefined;
        const tsNum = tsRaw ? parseFloat(tsRaw) : NaN;
        const ts = isFinite(tsNum)
          ? tsNum > 1e12
            ? tsNum
            : tsNum * 1000
          : Date.now();
        const trade: WhaleTrade = {
          id: `${assetId}-${ts}`,
          assetId,
          marketTitle: info.marketTitle,
          marketSlug: info.marketSlug,
          outcome: info.outcome,
          side: (e.side as "BUY" | "SELL") ?? "BUY",
          price,
          size,
          notionalUsd: notional,
          timestamp: ts,
        };
        setFeed((prev) => {
          // De-dup: if the same id arrives twice (e.g. a server re-broadcast),
          // skip the second occurrence rather than rendering two identical rows.
          if (prev.length > 0 && prev[0].id === trade.id) return prev;
          return [trade, ...prev].slice(0, maxItems);
        });
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [depKey, thresholdUsd, maxItems]);

  return feed;
}

/** Rolling buy/sell flow stats for a token, derived from WS last_trade_price
 *  events over a configurable window. Useful for an "order-flow pressure" bar
 *  on the market detail page. */
export type TradePressure = {
  /** Total BUY notional in the window. */
  buyVolume: number;
  /** Total SELL notional in the window. */
  sellVolume: number;
  /** Trade count in the window. */
  count: number;
  /** Window length in ms. */
  windowMs: number;
};

export function useTradePressure(
  tokenId: string | null | undefined,
  windowMs = 5 * 60 * 1000,
): TradePressure {
  const [trades, setTrades] = useState<
    Array<{ ts: number; side: "BUY" | "SELL"; notional: number }>
  >([]);
  useEffect(() => {
    if (!tokenId) {
      setTrades([]);
      return;
    }
    setTrades([]);
    let cancelled = false;
    const unsub = polymarketMarketWs.subscribe([tokenId], {
      onLastTrade: (e) => {
        if (cancelled) return;
        const price = parseFloat(e.price as string);
        const size = parseFloat(e.size as string);
        const notional = price * size;
        if (!isFinite(notional) || notional <= 0) return;
        const tsRaw = e.timestamp as string | undefined;
        const tsNum = tsRaw ? parseFloat(tsRaw) : NaN;
        const ts = isFinite(tsNum)
          ? tsNum > 1e12
            ? tsNum
            : tsNum * 1000
          : Date.now();
        setTrades((prev) => {
          const cutoff = Date.now() - windowMs;
          const next = [
            ...prev.filter((t) => t.ts >= cutoff),
            { ts, side: (e.side as "BUY" | "SELL") ?? "BUY", notional },
          ];
          return next;
        });
      },
    });
    // Prune aged-out trades on a slow tick so a quiet market's bar doesn't
    // keep showing volume that has actually left the window. Only changes
    // state (→ re-render) when something genuinely expired.
    const prune = setInterval(() => {
      if (cancelled) return;
      setTrades((prev) => {
        const cutoff = Date.now() - windowMs;
        const next = prev.filter((t) => t.ts >= cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(prune);
      unsub();
    };
  }, [tokenId, windowMs]);

  // Trim on render so the window stays current even between events.
  return useMemo(() => {
    const cutoff = Date.now() - windowMs;
    let buy = 0;
    let sell = 0;
    let count = 0;
    for (const t of trades) {
      if (t.ts < cutoff) continue;
      count++;
      if (t.side === "BUY") buy += t.notional;
      else sell += t.notional;
    }
    return { buyVolume: buy, sellVolume: sell, count, windowMs };
  }, [trades, windowMs]);
}
