"use client";

import { useMemo } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useClobSession } from "@/lib/useClobSession";
import { useBalanceAllowance } from "@/lib/useBalanceAllowance";
import { useEnsureClientOnMount } from "@/lib/useEnsureClientOnMount";
import { useUserPositions } from "@/lib/useUserPositions";
import { cn } from "@/lib/cn";

/**
 * Headline total-balance widget for /portfolio. Aggregates:
 *
 *   total = liquid pUSD (collateral balance from the SDK)
 *         + sum of position.currentValue across all open Polymarket positions
 *
 *   unrealized P&L = sum of position.cashPnl across the same set
 *
 * No double-counting: data-api `/positions` excludes already-closed (net zero)
 * outcomes by construction, and pUSD is the user's free collateral — orthogonal
 * to the in-positions value.
 *
 * Renders nothing when the wallet isn't connected, so the portfolio page stays
 * clean for unauthenticated viewers.
 */
export function TotalBalance() {
  const session = useClobSession();
  // Navigating to /portfolio is intentful — the user wants to see their
  // balances. Auto-derive CLOB credentials on mount so the Liquid pUSD
  // tile populates without requiring a separate "Sign in to load balance"
  // click. Safe even when status isn't "linked"; the hook no-ops then.
  useEnsureClientOnMount();
  const allowance = useBalanceAllowance(session.client);
  const positions = useUserPositions(session.funderAddress);

  const stats = useMemo(() => {
    // Liquid pUSD: 6-decimal collateral units → divide by 1e6 for dollars.
    const liquid =
      allowance.balance != null ? Number(allowance.balance) / 1_000_000 : 0;
    const ps = positions.positions ?? [];
    const inPositions = ps.reduce(
      (s, p) => s + (Number.isFinite(p.currentValue) ? p.currentValue : 0),
      0,
    );
    const cashPnl = ps.reduce(
      (s, p) => s + (Number.isFinite(p.cashPnl) ? p.cashPnl : 0),
      0,
    );
    const initialValue = ps.reduce(
      (s, p) =>
        s + (Number.isFinite(p.initialValue) ? p.initialValue : 0),
      0,
    );
    const total = liquid + inPositions;
    const pctPnl = initialValue > 0 ? (cashPnl / initialValue) * 100 : 0;
    return { liquid, inPositions, cashPnl, total, pctPnl, count: ps.length };
  }, [allowance.balance, positions.positions]);

  // Render in both "linked" (creds derivation in flight / about to fire on
  // mount-effect) AND "ready". The skeleton state on the tiles handles the
  // brief gap where allowance is still null.
  if (session.status !== "ready" && session.status !== "linked") return null;

  // Both sources still loading + no data yet — show a thin skeleton so the
  // page doesn't shift when the numbers fill in.
  const loadingFirstPass =
    allowance.balance == null && positions.positions == null;

  const pnlSign =
    stats.cashPnl > 0.005 ? 1 : stats.cashPnl < -0.005 ? -1 : 0;

  return (
    <section className="mt-4 rounded-md border border-border bg-surface/40 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        <Wallet className="h-3 w-3" aria-hidden="true" />
        Total balance
        {(allowance.loading || positions.loading) && !loadingFirstPass ? (
          <Loader2 className="h-3 w-3 animate-spin opacity-60" aria-hidden="true" />
        ) : null}
      </h2>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-3xl font-semibold tracking-tight text-foreground">
          {loadingFirstPass ? (
            <span className="inline-block h-8 w-32 animate-pulse rounded bg-surface-2" />
          ) : (
            fmtUSD(stats.total)
          )}
        </span>
        {!loadingFirstPass && Math.abs(stats.cashPnl) >= 0.005 ? (
          <span
            className={cn(
              "tabular text-[13px] font-medium",
              pnlSign > 0
                ? "text-emerald-300"
                : pnlSign < 0
                  ? "text-rose-300"
                  : "text-muted",
            )}
          >
            {fmtSignedUSD(stats.cashPnl)}
            {Math.abs(stats.pctPnl) >= 0.05 ? (
              <span className="ml-1 opacity-80">
                ({fmtSignedPct(stats.pctPnl)})
              </span>
            ) : null}
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-2">
              unrealized
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Available to trade"
          value={loadingFirstPass ? "—" : fmtUSD(stats.liquid)}
          hint="USDC you can spend on new orders"
        />
        <Tile
          label="In positions"
          value={loadingFirstPass ? "—" : fmtUSD(stats.inPositions)}
          hint={
            stats.count > 0
              ? `${stats.count} open outcome${stats.count === 1 ? "" : "s"}`
              : "No open positions"
          }
        />
        <Tile
          label="Unrealized P&L"
          value={loadingFirstPass ? "—" : fmtSignedUSD(stats.cashPnl)}
          tone={pnlSign > 0 ? "emerald" : pnlSign < 0 ? "rose" : "neutral"}
          hint={
            Math.abs(stats.pctPnl) >= 0.05
              ? `${fmtSignedPct(stats.pctPnl)} on entry cost`
              : "—"
          }
        />
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "emerald" | "rose";
}) {
  const colour =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
        ? "text-rose-300"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div className={cn("tabular text-base font-semibold", colour)}>
        {value}
      </div>
      {hint ? (
        <div className="tabular text-[10px] text-muted-2">{hint}</div>
      ) : null}
    </div>
  );
}

function fmtUSD(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 0.005) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

function fmtSignedUSD(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 0.005) return "$0.00";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${fmtUSD(Math.abs(n))}`;
}

function fmtSignedPct(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 0.05) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}
