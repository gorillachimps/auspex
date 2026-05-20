"use client";

import { cn } from "@/lib/cn";
import { useTradePressure } from "@/lib/useLiveMarket";
import { fmtUSDCompact } from "@/lib/format";

const fmtUSD = fmtUSDCompact;

const WINDOW_MIN = 5;
const WINDOW_MS = WINDOW_MIN * 60 * 1000;

type Props = {
  tokenYes: string | null;
};

/**
 * Live order-flow indicator. Tracks BUY vs SELL notional in a rolling
 * `WINDOW_MIN`-minute window on the YES-token last-trade stream, then renders
 * the split as a horizontal bar. The convention is YES-centric: any BUY YES
 * is bullish on the YES side; any SELL YES is bearish.
 *
 * Empty during the first 5 minutes after the page mounts because the only
 * data source is the live WS feed — no HTTP seed (yet). On a busy market
 * the bar populates within seconds; on a quiet one it stays neutral until
 * something fills.
 */
export function TradePressureBar({ tokenYes }: Props) {
  const p = useTradePressure(tokenYes, WINDOW_MS);

  const total = p.buyVolume + p.sellVolume;
  const hasData = total > 0;
  const buyPct = hasData ? (p.buyVolume / total) * 100 : 50;
  const sellPct = 100 - buyPct;
  const skewSign =
    !hasData ? 0 : buyPct > 55 ? 1 : buyPct < 45 ? -1 : 0;

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Order flow
          <span className="text-muted-2/70 font-normal normal-case">
            (last {WINDOW_MIN} min)
          </span>
        </h2>
        <span className="tabular text-[11px] text-muted">
          {hasData ? `${p.count} fill${p.count === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      <div
        className="relative h-6 w-full overflow-hidden rounded border border-border/60 bg-background/40"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(buyPct)}
        aria-label={`Buyers ${buyPct.toFixed(0)} percent vs sellers ${sellPct.toFixed(0)} percent`}
      >
        {hasData ? (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/30"
              style={{ width: `${buyPct}%` }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 right-0 bg-rose-500/30"
              style={{ width: `${sellPct}%` }}
              aria-hidden
            />
          </>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={cn("tabular", hasData ? "text-emerald-300" : "text-muted-2")}>
          {hasData ? (
            <>
              <span className="font-semibold">{fmtUSD(p.buyVolume)}</span>{" "}
              <span className="opacity-70">buyers ({buyPct.toFixed(0)}%)</span>
            </>
          ) : (
            <>Waiting for live fills…</>
          )}
        </span>
        <span
          className={cn(
            "tabular text-[10px] font-medium uppercase tracking-wider",
            skewSign > 0
              ? "text-emerald-300"
              : skewSign < 0
                ? "text-rose-300"
                : "text-muted-2",
          )}
        >
          {skewSign > 0
            ? "Bullish skew"
            : skewSign < 0
              ? "Bearish skew"
              : hasData
                ? "Balanced"
                : ""}
        </span>
        <span className={cn("tabular text-right", hasData ? "text-rose-300" : "text-muted-2")}>
          {hasData ? (
            <>
              <span className="opacity-70">({sellPct.toFixed(0)}%) sellers</span>{" "}
              <span className="font-semibold">{fmtUSD(p.sellVolume)}</span>
            </>
          ) : null}
        </span>
      </div>
    </section>
  );
}

