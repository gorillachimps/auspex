"use client";

import { ExternalLink } from "lucide-react";
import type { Trade } from "@/lib/walletPnl";
import { cn } from "@/lib/cn";

type Props = {
  trades: Trade[] | null;
  loading: boolean;
  error: string | null;
  /** Optionally truncate to the most-recent N trades for the wallet detail
   *  page (set to e.g. 50 to keep the DOM small). */
  limit?: number;
};

/**
 * Trade history for a tracked wallet, newest-first. Reuses the trade shape
 * from data-api `/trades?user=…`. Notional in USDC is `size * price`.
 */
export function WalletTradesView({ trades, loading, error, limit }: Props) {
  if (error) {
    return (
      <section className="rounded-md border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-200">
        Couldn&apos;t load trades: {error}
      </section>
    );
  }
  if (trades == null) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4 text-[12px] text-muted">
        Loading trades…
      </section>
    );
  }
  if (trades.length === 0) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4 text-[12px] text-muted">
        No trades found for this wallet.
      </section>
    );
  }

  const sorted = [...trades].sort((a, b) => b.timestamp - a.timestamp);
  const rows = limit ? sorted.slice(0, limit) : sorted;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface/40">
      <table className="w-full text-[12px]">
        <thead className="bg-surface-2/40 text-[10px] uppercase tracking-wider text-muted-2">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Market</th>
            <th className="px-2 py-2 text-left font-semibold">Side</th>
            <th className="px-2 py-2 text-left font-semibold">Outcome</th>
            <th className="px-2 py-2 text-right font-semibold">Shares</th>
            <th className="px-2 py-2 text-right font-semibold">Price</th>
            <th className="px-2 py-2 text-right font-semibold">Notional</th>
            <th className="px-3 py-2 text-right font-semibold">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={`${t.transactionHash}-${t.asset}-${t.timestamp}`}
              className="border-t border-border/60 hover:bg-surface-2/30"
            >
              <td className="max-w-[320px] truncate px-3 py-2 text-foreground">
                {t.slug ? (
                  <a
                    href={`/markets/${t.slug}`}
                    className="inline-flex items-center gap-1 hover:underline"
                    title={t.title}
                  >
                    <span className="truncate">{t.title ?? "—"}</span>
                    <ExternalLink
                      className="h-3 w-3 shrink-0 text-muted-2"
                      aria-hidden="true"
                    />
                  </a>
                ) : (
                  <span className="truncate">{t.title ?? "—"}</span>
                )}
              </td>
              <td className="px-2 py-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    t.side === "BUY"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-rose-500/15 text-rose-300",
                  )}
                >
                  {t.side}
                </span>
              </td>
              <td className="px-2 py-2 text-muted">{t.outcome ?? "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtShares(t.size)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted">
                {fmtCents(t.price)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {fmtUSD(t.size * t.price)}
              </td>
              <td className="px-3 py-2 text-right text-[11px] text-muted-2">
                {fmtRelative(t.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? (
        <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
          Refreshing…
        </div>
      ) : null}
      {limit && trades.length > limit ? (
        <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
          Showing {limit} of {trades.length} trades.
        </div>
      ) : null}
    </section>
  );
}

function fmtShares(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(n >= 100 ? 0 : 2);
}

function fmtCents(p: number): string {
  if (!isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

function fmtUSD(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtRelative(unixSec: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unixSec;
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 30 * 86_400) return `${Math.floor(diffSec / 86_400)}d`;
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
