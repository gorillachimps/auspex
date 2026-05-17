"use client";

import { ExternalLink } from "lucide-react";
import type { Position } from "@/lib/useUserPositions";
import { cn } from "@/lib/cn";

type Props = {
  positions: Position[] | null;
  loading: boolean;
  error: string | null;
};

/**
 * Read-only positions table for a tracked wallet. Mirrors the visual
 * language of /portfolio's table but without the in-app actions (no
 * close-position, no allowance prompts). Sorted by current value desc.
 */
export function WalletPositionsView({ positions, loading, error }: Props) {
  if (error) {
    return (
      <section className="rounded-md border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-[12px] text-rose-200">
        Couldn&apos;t load positions: {error}
      </section>
    );
  }
  if (positions == null) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4 text-[12px] text-muted">
        Loading positions…
      </section>
    );
  }
  if (positions.length === 0) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4 text-[12px] text-muted">
        No open positions.
      </section>
    );
  }

  const sorted = [...positions].sort(
    (a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0),
  );

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface/40">
      <table className="w-full text-[12px]">
        <thead className="bg-surface-2/40 text-[10px] uppercase tracking-wider text-muted-2">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Market</th>
            <th className="px-2 py-2 text-left font-semibold">Outcome</th>
            <th className="px-2 py-2 text-right font-semibold">Shares</th>
            <th className="px-2 py-2 text-right font-semibold">Avg entry</th>
            <th className="px-2 py-2 text-right font-semibold">Current</th>
            <th className="px-3 py-2 text-right font-semibold">P&L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const pnlSign =
              p.cashPnl > 0.005 ? 1 : p.cashPnl < -0.005 ? -1 : 0;
            return (
              <tr
                key={`${p.conditionId}-${p.outcomeIndex}`}
                className="border-t border-border/60 hover:bg-surface-2/30"
              >
                <td className="max-w-[360px] truncate px-3 py-2 text-foreground">
                  <a
                    href={`/markets/${p.slug}`}
                    className="inline-flex items-center gap-1 hover:underline"
                    title={p.title}
                  >
                    <span className="truncate">{p.title}</span>
                    <ExternalLink
                      className="h-3 w-3 shrink-0 text-muted-2"
                      aria-hidden="true"
                    />
                  </a>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      p.outcomeIndex === 0
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300",
                    )}
                  >
                    {p.outcome}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtShares(p.size)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {fmtCents(p.avgPrice)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {fmtCents(p.curPrice)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    pnlSign > 0
                      ? "text-emerald-300"
                      : pnlSign < 0
                        ? "text-rose-300"
                        : "text-muted",
                  )}
                >
                  {fmtSignedUSD(p.cashPnl)}
                  <span className="ml-1 text-[10px] text-muted-2">
                    {p.percentPnl > 0 ? "+" : ""}
                    {p.percentPnl.toFixed(1)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading ? (
        <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
          Refreshing…
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

function fmtSignedUSD(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 0.005) return "$0.00";
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : "−";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}
