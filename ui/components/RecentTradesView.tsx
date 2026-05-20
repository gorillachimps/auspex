"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { polymarketMarketWs } from "@/lib/polymarketWs";
import { fmtAgoUnixMs, fmtShares } from "@/lib/format";

const fmtAge = fmtAgoUnixMs;
const fmtSize = fmtShares;

const MAX_ITEMS = 20;

type Trade = {
  id: string; // stable: timestampMs + assetId + side
  side: "BUY" | "SELL";
  outcome: "yes" | "no";
  price: number;
  size: number;
  notionalUsd: number;
  timestampMs: number;
};

type Props = {
  tokenYes: string | null;
  tokenNo: string | null;
};

/**
 * Live ticker of fills for the current market — both YES and NO outcomes.
 * Subscribes to the WS `last_trade_price` channel for each token and keeps the
 * 20 most-recent fills. Empty on mount until something prints; that's an
 * honest "this market is quiet right now" signal.
 *
 * The market detail page already subscribes to the same tokens via the order
 * book + position card, so the ref-counted WS pays no additional connection
 * cost when this widget mounts.
 */
export function RecentTradesView({ tokenYes, tokenNo }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);

  // Re-mount the subscription when the market changes (tokenIds change).
  const depKey = useMemo(
    () => [tokenYes ?? "", tokenNo ?? ""].join("|"),
    [tokenYes, tokenNo],
  );

  useEffect(() => {
    const ids = [tokenYes, tokenNo].filter((x): x is string => !!x);
    if (ids.length === 0) {
      setTrades([]);
      return;
    }
    setTrades([]);
    const yesId = tokenYes;
    const unsub = polymarketMarketWs.subscribe(ids, {
      onLastTrade: (e) => {
        const assetId = e.asset_id as string;
        const price = parseFloat(e.price as string);
        const size = parseFloat(e.size as string);
        if (!isFinite(price) || !isFinite(size) || size <= 0) return;
        const tsRaw = e.timestamp as string | undefined;
        const tsNum = tsRaw ? parseFloat(tsRaw) : NaN;
        const tsMs = isFinite(tsNum)
          ? tsNum > 1e12
            ? tsNum
            : tsNum * 1000
          : Date.now();
        const trade: Trade = {
          id: `${tsMs}-${assetId}-${e.side ?? ""}`,
          side: (e.side as "BUY" | "SELL") ?? "BUY",
          outcome: assetId === yesId ? "yes" : "no",
          price,
          size,
          notionalUsd: price * size,
          timestampMs: tsMs,
        };
        setTrades((prev) => {
          if (prev.length > 0 && prev[0].id === trade.id) return prev;
          return [trade, ...prev].slice(0, MAX_ITEMS);
        });
      },
    });
    return unsub;
    // depKey covers tokenYes/tokenNo changes; the yesId capture is OK since it's
    // refreshed every render and the effect closure resets on each re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  if (!tokenYes && !tokenNo) return null;

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Recent trades
        </h2>
        <span className="text-[11px] text-muted-2">
          {trades.length === 0 ? "waiting…" : `${trades.length} live`}
        </span>
      </div>
      {trades.length === 0 ? (
        <p className="text-[12px] text-muted-2">
          No fills since you opened this page. Live activity will appear here as
          orders match.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-border/60 bg-background/40">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_64px] gap-2 border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-2">
            <span>Time</span>
            <span>Side</span>
            <span className="text-right">Price</span>
            <span className="text-right">Shares</span>
            <span className="text-right">USDC</span>
          </div>
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {trades.map((t) => {
              const bullish =
                (t.side === "BUY" && t.outcome === "yes") ||
                (t.side === "SELL" && t.outcome === "no");
              const tone = bullish ? "text-emerald-300" : "text-rose-300";
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_64px] gap-2 px-3 py-1 text-[12px] hover:bg-surface/40"
                >
                  <span
                    className="tabular text-muted-2"
                    title={new Date(t.timestampMs).toLocaleString()}
                  >
                    {fmtAge(t.timestampMs)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                      tone,
                    )}
                  >
                    {t.side} {t.outcome.toUpperCase()}
                  </span>
                  <span className="tabular text-right text-foreground/90">
                    ${t.price.toFixed(3)}
                  </span>
                  <span className="tabular text-right text-muted">
                    {fmtSize(t.size)}
                  </span>
                  <span className="tabular text-right text-foreground/85">
                    ${t.notionalUsd.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

