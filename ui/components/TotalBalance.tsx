"use client";

import { useMemo } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useClobSession } from "@/lib/useClobSession";
import { useBalanceAllowance } from "@/lib/useBalanceAllowance";
import { useEnsureClientOnMount } from "@/lib/useEnsureClientOnMount";
import { useUserPositions } from "@/lib/useUserPositions";
import { cn } from "@/lib/cn";
import { fmtPctSigned, fmtUSD, fmtUSDSignedText } from "@/lib/format";

const fmtSignedUSD = fmtUSDSignedText;
const fmtSignedPct = fmtPctSigned;

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

  // Track liquid and position data independently so each tile can show its
  // own skeleton while the other has resolved. Previously a single
  // "loadingFirstPass" flag flipped to false as soon as either source
  // returned, which made the liquid tile flash "$0.00" in the brief window
  // between positions arriving (no creds needed) and ensureClient completing
  // (creds derived). Now each tile is independently aware of its load state.
  const liquidLoading = allowance.balance == null;
  const positionsLoading = positions.positions == null;
  const allLoading = liquidLoading && positionsLoading;

  const pnlSign =
    stats.cashPnl > 0.005 ? 1 : stats.cashPnl < -0.005 ? -1 : 0;

  return (
    <section className="mt-4 rounded-md border border-border bg-surface/40 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        <Wallet className="h-3 w-3" aria-hidden="true" />
        Total balance
        {(allowance.loading || positions.loading) && !allLoading ? (
          <Loader2 className="h-3 w-3 animate-spin opacity-60" aria-hidden="true" />
        ) : null}
      </h2>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-3xl font-semibold tracking-tight text-foreground">
          {liquidLoading || positionsLoading ? (
            <span className="inline-block h-8 w-32 animate-pulse rounded bg-surface-2" />
          ) : (
            fmtUSD(stats.total)
          )}
        </span>
        {!positionsLoading && Math.abs(stats.cashPnl) >= 0.005 ? (
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
          value={liquidLoading ? null : fmtUSD(stats.liquid)}
          hint="USDC you can spend on new orders"
        />
        <Tile
          label="In positions"
          value={positionsLoading ? null : fmtUSD(stats.inPositions)}
          hint={
            positionsLoading
              ? undefined
              : stats.count > 0
                ? `${stats.count} open outcome${stats.count === 1 ? "" : "s"}`
                : "No open positions"
          }
        />
        <Tile
          label="Unrealized P&L"
          value={positionsLoading ? null : fmtSignedUSD(stats.cashPnl)}
          tone={pnlSign > 0 ? "emerald" : pnlSign < 0 ? "rose" : "neutral"}
          hint={
            positionsLoading
              ? undefined
              : Math.abs(stats.pctPnl) >= 0.05
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
  /** `null` means "still loading" — renders a skeleton bar in place of the
   *  number. The component handles loading per-tile so independent data
   *  sources don't make the whole widget flash placeholder values. */
  value: string | null;
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
      {value == null ? (
        <div className="my-0.5 h-5 w-20 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className={cn("tabular text-base font-semibold", colour)}>
          {value}
        </div>
      )}
      {hint ? (
        <div className="tabular text-[10px] text-muted-2">{hint}</div>
      ) : null}
    </div>
  );
}

