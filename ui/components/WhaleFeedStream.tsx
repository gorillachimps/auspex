"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useWhaleFeed, type TokenInfo, type WhaleTrade } from "@/lib/useLiveMarket";
import type { TableRow } from "@/lib/types";
import { fmtAgoUnixMs, fmtUSDCompact } from "@/lib/format";

const fmtCompactUSD = fmtUSDCompact;
const fmtAge = fmtAgoUnixMs;

const THRESHOLD_USD = 100;
const MAX_ITEMS = 20;

type Props = {
  rows: TableRow[];
  /** Cap how many of the top-volume markets we listen to. Should match (or be
   *  a subset of) the screener's live-mid subscription set so we reuse the
   *  same WS refs. */
  topN?: number;
};

/**
 * Live ticker of attention-worthy fills (≥ $100 USDC notional) flowing across
 * the top-volume markets. Subscribes to the WS `last_trade_price` channel and
 * renders the newest items as a scrolling marquee. Each item is a link into
 * the relevant market detail page.
 */
export function WhaleFeedStream({ rows, topN = 50 }: Props) {
  const tokenInfo = useMemo(() => {
    const byVolume = [...rows]
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, topN);
    const m = new Map<string, TokenInfo>();
    for (const r of byVolume) {
      if (r.tokenYes) {
        m.set(r.tokenYes, {
          marketTitle: r.question,
          marketSlug: r.slug,
          outcome: "yes",
        });
      }
      if (r.tokenNo) {
        m.set(r.tokenNo, {
          marketTitle: r.question,
          marketSlug: r.slug,
          outcome: "no",
        });
      }
    }
    return m;
  }, [rows, topN]);

  const trades = useWhaleFeed(tokenInfo, THRESHOLD_USD, MAX_ITEMS);

  // Always render the strip; render a placeholder when empty so users know
  // the feed exists and is listening.
  return (
    <div
      className="border-b border-border bg-surface/60"
      role="region"
      aria-label="Live whale-fill ticker"
    >
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-2">
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/40">
          🐋 Whale fills
        </span>
        {trades.length === 0 ? (
          <span className="text-[12px] text-muted-2">
            Watching for ${THRESHOLD_USD}+ fills across the top {topN} markets…
          </span>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <div
              className="marquee-track flex w-max items-center gap-6 whitespace-nowrap text-[12px]"
              aria-label="Recent whale fills"
            >
              {/* Two copies so the marquee can scroll without a visible seam. */}
              {[...trades, ...trades].map((t, i) => (
                <WhaleRow key={`${t.id}-${i}`} trade={t} />
              ))}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface/95 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface/95 to-transparent"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WhaleRow({ trade }: { trade: WhaleTrade }) {
  // Color rule: "BUY YES" + "SELL NO" both express bullish flow on this
  // market's YES side → emerald. The opposite pair → rose.
  const bullish =
    (trade.side === "BUY" && trade.outcome === "yes") ||
    (trade.side === "SELL" && trade.outcome === "no");
  const tone = bullish ? "text-emerald-300" : "text-rose-300";
  const ring = bullish
    ? "bg-emerald-500/15 ring-emerald-400/40 text-emerald-200"
    : "bg-rose-500/15 ring-rose-400/40 text-rose-200";

  return (
    <a
      href={`/markets/${trade.marketSlug}`}
      className="flex items-center gap-2 rounded px-1 hover:bg-surface-2"
      title={`${fmtAge(trade.timestamp)} — ${trade.marketTitle}`}
    >
      <span
        className={cn(
          "rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider ring-1",
          ring,
        )}
      >
        {trade.side} {trade.outcome.toUpperCase()}
      </span>
      <span className={cn("tabular font-semibold", tone)}>
        {fmtCompactUSD(trade.notionalUsd)}
      </span>
      <span className="text-muted">@</span>
      <span className="tabular text-foreground/90">
        {trade.price.toFixed(3)}
      </span>
      <span className="text-border-strong">·</span>
      <span className="max-w-[28ch] truncate text-foreground/85">
        {trade.marketTitle}
      </span>
      <span className="tabular text-[10px] text-muted-2">
        {fmtAge(trade.timestamp)}
      </span>
    </a>
  );
}

