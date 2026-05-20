"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { fmtImpliedPct, fmtShares } from "@/lib/format";
import { useLiveBook } from "@/lib/useLiveMarket";

type Props = {
  tokenYes: string | null;
  tokenNo: string | null;
  /** Show liquidity within ± this many cents of the mid price. Default 10¢. */
  windowCents?: number;
};

/**
 * Coinbase / Polymarket-Pro-style cumulative depth chart for the currently-
 * focused outcome (YES). Renders bids as a falling step-line on the left
 * and asks as a rising step-line on the right, with the spread at the
 * centerline. Fills below the lines are tinted emerald / rose so the
 * imbalance reads at a glance.
 *
 * Subscribes to the same WS feed as OrderBookView via useLiveBook — the
 * singleton WS dedupes the connection.
 */
export function DepthChart({ tokenYes, tokenNo, windowCents = 10 }: Props) {
  const yesBook = useLiveBook(tokenYes);
  // NO book reserved for future "both sides" mode — not rendered today.
  // Kept subscribed so the WS layer warms the cache for the toggle in
  // OrderBookView below.
  useLiveBook(tokenNo);

  const data = useMemo(() => {
    if (!yesBook) return null;
    const bestBid =
      yesBook.bids.length > 0
        ? parseFloat(yesBook.bids[yesBook.bids.length - 1].price)
        : null;
    const bestAsk =
      yesBook.asks.length > 0
        ? parseFloat(yesBook.asks[yesBook.asks.length - 1].price)
        : null;
    if (bestBid == null || bestAsk == null) return null;
    const mid = (bestBid + bestAsk) / 2;
    const windowFrac = windowCents / 100;
    const low = Math.max(0.001, mid - windowFrac);
    const high = Math.min(0.999, mid + windowFrac);

    // bids = ascending by price → best bid last. We want them descending
    // from mid for the left step plot (closer-to-mid first), accumulating.
    const bids = [...yesBook.bids]
      .reverse() // best → worst (descending)
      .filter((lvl) => parseFloat(lvl.price) >= low);
    let cumBid = 0;
    const bidPoints: Array<{ price: number; cum: number }> = [];
    for (const lvl of bids) {
      const p = parseFloat(lvl.price);
      const s = parseFloat(lvl.size);
      cumBid += s;
      bidPoints.push({ price: p, cum: cumBid });
    }

    // asks = descending by price → best ask last. Reverse to ascending,
    // then accumulate from best outward.
    const asks = [...yesBook.asks].reverse(); // best → worst (ascending)
    let cumAsk = 0;
    const askPoints: Array<{ price: number; cum: number }> = [];
    for (const lvl of asks) {
      const p = parseFloat(lvl.price);
      const s = parseFloat(lvl.size);
      if (p > high) break;
      cumAsk += s;
      askPoints.push({ price: p, cum: cumAsk });
    }

    const maxCum = Math.max(cumBid, cumAsk, 1);
    return {
      mid,
      bestBid,
      bestAsk,
      low,
      high,
      bidPoints,
      askPoints,
      maxCum,
    };
  }, [yesBook, windowCents]);

  if (!data) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Depth chart · YES
        </div>
        <p className="py-6 text-center text-[12px] text-muted">
          Waiting for live book…
        </p>
      </section>
    );
  }

  const W = 1000;
  const H = 140;
  const xForPrice = (p: number) =>
    ((p - data.low) / (data.high - data.low)) * W;
  const yForCum = (c: number) => H - (c / data.maxCum) * H;
  const midX = xForPrice(data.mid);

  // Build SVG path strings for each side. Step-line: jump horizontally to
  // the next price, then vertically up to the new cumulative size — that's
  // the canonical "stairs" look of an exchange depth chart.
  const bidPath = (() => {
    if (data.bidPoints.length === 0) return "";
    const segments: string[] = [];
    // Start at the mid line.
    segments.push(`M ${midX} ${H}`);
    let lastCum = 0;
    for (const { price, cum } of data.bidPoints) {
      const x = xForPrice(price);
      // Vertical step (size accumulates at this price level)
      segments.push(`L ${x} ${yForCum(lastCum)}`);
      segments.push(`L ${x} ${yForCum(cum)}`);
      lastCum = cum;
    }
    // Drop to baseline at the leftmost x so the fill closes cleanly.
    const lastX = xForPrice(data.bidPoints[data.bidPoints.length - 1].price);
    segments.push(`L ${lastX} ${H}`);
    segments.push("Z");
    return segments.join(" ");
  })();

  const askPath = (() => {
    if (data.askPoints.length === 0) return "";
    const segments: string[] = [];
    segments.push(`M ${midX} ${H}`);
    let lastCum = 0;
    for (const { price, cum } of data.askPoints) {
      const x = xForPrice(price);
      segments.push(`L ${x} ${yForCum(lastCum)}`);
      segments.push(`L ${x} ${yForCum(cum)}`);
      lastCum = cum;
    }
    const lastX = xForPrice(data.askPoints[data.askPoints.length - 1].price);
    segments.push(`L ${lastX} ${H}`);
    segments.push("Z");
    return segments.join(" ");
  })();

  const totalBid = data.bidPoints[data.bidPoints.length - 1]?.cum ?? 0;
  const totalAsk = data.askPoints[data.askPoints.length - 1]?.cum ?? 0;
  const bias =
    totalBid + totalAsk > 0
      ? totalBid / (totalBid + totalAsk)
      : 0.5;

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Depth chart · YES
        </div>
        <div className="text-[10px] text-muted-2">
          ±{windowCents}¢ around mid {fmtImpliedPct(data.mid)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
      >
        {/* Bid fill (left) */}
        <path d={bidPath} fill="rgb(16 185 129 / 0.18)" />
        {/* Ask fill (right) */}
        <path d={askPath} fill="rgb(244 63 94 / 0.18)" />
        {/* Centerline at the mid */}
        <line
          x1={midX}
          x2={midX}
          y1={0}
          y2={H}
          stroke="rgb(161 161 170 / 0.5)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] tabular text-muted-2">
        <span>
          Bids{" "}
          <span className="text-emerald-300">{fmtShares(totalBid)}</span>
        </span>
        <div className="relative h-1.5 self-center rounded-full bg-border">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/40"
            style={{ width: `${bias * 100}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-full bg-rose-500/40"
            style={{ left: `${bias * 100}%`, right: 0 }}
          />
        </div>
        <span className="text-right">
          <span className="text-rose-300">{fmtShares(totalAsk)}</span> Asks
        </span>
      </div>
    </section>
  );
}
