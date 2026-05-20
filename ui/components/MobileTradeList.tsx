"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  fmtAgoUnixWithSuffix,
  fmtPrice,
  fmtShares,
  fmtUSD,
} from "@/lib/format";

// Minimal shape — both ActivityView and WalletTradesView pass slightly
// different fields but the subset we render is the same.
type Trade = {
  side: "BUY" | "SELL";
  asset: string;
  outcome?: string;
  outcomeIndex?: number;
  price: number;
  size: number;
  sizeUsdc?: number;
  title?: string;
  slug?: string;
  transactionHash?: string;
  timestamp: number;
};

type Props = {
  trades: Trade[];
};

/**
 * Card-stack reflow for fill/trade history on narrow viewports. Used on
 * both /activity and the /wallets/[address] detail page — both feeds use
 * the same data-api `/trades?user=…` shape.
 */
export function MobileTradeList({ trades }: Props) {
  return (
    <div className="flex flex-col gap-2 sm:hidden">
      {trades.map((t, i) => {
        const outcome =
          t.outcome ??
          (t.outcomeIndex === 0
            ? "Yes"
            : t.outcomeIndex === 1
              ? "No"
              : "—");
        const isYes = /^yes$/i.test(outcome);
        const bullish =
          (t.side === "BUY" && isYes) || (t.side === "SELL" && !isYes);
        const sideTone = bullish
          ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
          : "bg-rose-500/15 text-rose-200 ring-rose-400/30";
        const usdc = t.sizeUsdc != null ? t.sizeUsdc : t.size * t.price;
        const key = `${t.transactionHash ?? i}-${t.asset}-${t.timestamp}`;
        const titleNode = t.slug ? (
          <a
            href={`/markets/${t.slug}`}
            className="line-clamp-2 text-[13px] font-medium text-foreground hover:text-accent hover:underline"
          >
            {t.title ?? "—"}
          </a>
        ) : (
          <span className="line-clamp-2 text-[13px] font-medium text-foreground">
            {t.title ?? "—"}
          </span>
        );
        return (
          <div
            key={key}
            className="rounded-md border border-border bg-surface/40 px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">{titleNode}</div>
              <span
                className="text-[10px] tabular text-muted-2 shrink-0"
                title={new Date(t.timestamp * 1000).toLocaleString()}
              >
                {fmtAgoUnixWithSuffix(t.timestamp)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                  sideTone,
                )}
              >
                {t.side}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium uppercase",
                  isYes ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {outcome}
              </span>
              {t.transactionHash ? (
                <a
                  href={`https://polygonscan.com/tx/${t.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-0.5 font-mono text-[10px] text-muted hover:text-foreground"
                  title={t.transactionHash}
                >
                  {t.transactionHash.slice(0, 8)}…
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <Cell label="Price" value={fmtPrice(t.price)} />
              <Cell label="Shares" value={fmtShares(t.size)} />
              <Cell label="USDC" value={fmtUSD(usdc)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular font-semibold text-foreground">{value}</span>
    </div>
  );
}
