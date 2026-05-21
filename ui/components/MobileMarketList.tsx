"use client";

import type { SortingState } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Sparkle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { familyMeta, FAMILY_TONE_CLASSES } from "@/lib/families";
import {
  fmtCompactUSD,
  fmtDaysLeft,
  fmtSignedPP,
  fmtSourceLabel,
  fmtUSD,
  urgencyForEnd,
} from "@/lib/format";
import type { TableRow } from "@/lib/types";
import { DeltaBar } from "./DeltaBar";
import { ExpandedRow } from "./ExpandedRow";
import { PmBar } from "./PmBar";
import { RcBar } from "./RcBar";
import { StarToggle } from "./StarToggle";

/** Same criterion as the desktop sigil — flag the small subset of rows
 *  where Clarity is high, distance is still material, market is uncertain,
 *  not yet triggered. Kept in sync with MarketTable.isSharpSignal. */
function isSharpSignal(r: TableRow): boolean {
  if (r.rc == null || r.rc < 70) return false;
  if (r.distancePct == null || Math.abs(r.distancePct) < 0.05) return false;
  if (r.alreadyTriggered) return false;
  if (r.impliedYes == null) return false;
  if (r.impliedYes < 0.2 || r.impliedYes > 0.8) return false;
  return true;
}

type Props = {
  rows: TableRow[];
  sorting: SortingState;
  onClearFilters?: () => void;
};

function sortRows(rows: TableRow[], sorting: SortingState): TableRow[] {
  if (sorting.length === 0) return rows;
  const { id, desc } = sorting[0];
  const dir = desc ? -1 : 1;
  const get = (r: TableRow): number | null => {
    switch (id) {
      case "implied":
        return r.impliedYes;
      case "state":
        return r.currentValue;
      case "delta":
        return r.distancePct == null ? null : Math.abs(r.distancePct);
      case "rc":
        return r.rc;
      case "days": {
        // Time-until-close, not absolute endDate. Ended / date-less
        // markets sink to the bottom of asc sort instead of bubbling up
        // (since their absolute timestamp would be the smallest).
        if (!r.endDate) return null;
        const t = Date.parse(r.endDate);
        if (!Number.isFinite(t)) return null;
        const remaining = t - Date.now();
        return remaining > 0 ? remaining : null;
      }
      case "delta24h":
        return r.oneDayChange == null ? null : Math.abs(r.oneDayChange);
      case "volume24h":
        return r.volume24h;
      default:
        return null;
    }
  };
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });
}

export function MobileMarketList({ rows, sorting, onClearFilters }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const sorted = sortRows(rows, sorting);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted">
        <span>No markets match the current filter.</span>
        {onClearFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-md border border-border-strong bg-surface px-3 py-1 text-[12px] font-medium text-foreground hover:bg-surface-2"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    );
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function trade(id: string, outcome: "yes" | "no") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("auspex:open-ticket", {
        detail: { id, outcome },
      }),
    );
  }

  return (
    <ul className="divide-y divide-border border-t border-border">
      {sorted.map((r) => {
        const meta = familyMeta(r.family);
        const tone = FAMILY_TONE_CLASSES[meta.tone];
        const isOpen = expanded.has(r.id);
        const tier = urgencyForEnd(r.endDate);
        const settling = tier === "ended";
        const tradable = !!r.tokenYes && !!r.tokenNo && !settling;
        const sharp = isSharpSignal(r);
        const change = fmtSignedPP(r.oneDayChange);
        const daysCls =
          tier === "urgent"
            ? "text-rose-300 font-medium"
            : tier === "soon"
              ? "text-amber-300"
              : tier === "ended"
                ? "text-muted-2 italic"
                : "text-muted-2";
        return (
          <li
            key={r.id}
            data-row-id={r.id}
            className="flex flex-col gap-2 px-4 py-3"
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={() => toggle(r.id)}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-2 hover:text-foreground"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              <StarToggle marketId={r.id} />
              <div className="min-w-0 flex-1">
                <a
                  href={`/markets/${r.slug}`}
                  className="block text-[13px] font-medium leading-snug text-foreground hover:text-accent"
                >
                  {sharp ? (
                    <Sparkle
                      className="mr-1 inline h-3 w-3 align-text-top text-accent"
                      aria-hidden="true"
                      role="img"
                    >
                      <title>
                        Sharp signal — high clarity with the market still
                        pricing it as uncertain.
                      </title>
                    </Sparkle>
                  ) : null}
                  {r.question}
                </a>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ring-1",
                      tone,
                    )}
                  >
                    {meta.short}
                  </span>
                  {settling ? (
                    <span
                      className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/40"
                      title="Trading closed — waiting on oracle / arbitration."
                    >
                      Settling
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-2">
                  Odds
                </div>
                <PmBar impliedYes={r.impliedYes} />
              </div>
              <div>
                <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-2">
                  Clarity
                </div>
                <RcBar rc={r.rc} />
              </div>
            </div>

            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-2">
                Distance
              </div>
              <DeltaBar
                distance={r.distancePct}
                alreadyTriggered={r.alreadyTriggered}
                deferred={r.liveState !== "live"}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>{fmtSourceLabel(r.source, r.pair)}</span>
              {r.liveState === "live" && r.currentValue != null ? (
                <span className="tabular text-foreground">
                  {fmtUSD(r.currentValue)}
                </span>
              ) : null}
              <span className={cn("tabular", daysCls)}>
                {fmtDaysLeft(r.endDate)}
              </span>
              {change ? (
                <span
                  className={cn(
                    "tabular",
                    change.sign > 0
                      ? "text-emerald-300"
                      : change.sign < 0
                        ? "text-rose-300"
                        : "text-muted",
                  )}
                >
                  {change.sign > 0 ? "▲" : change.sign < 0 ? "▼" : ""}{" "}
                  {change.text}
                </span>
              ) : null}
              {r.liquidity != null && r.liquidity > 0 ? (
                <span
                  className={cn(
                    "tabular",
                    r.liquidity >= 10_000
                      ? "text-accent"
                      : r.liquidity >= 1_000
                        ? "text-foreground"
                        : "text-muted-2",
                  )}
                  title="Depth — how much you could trade near the current price"
                >
                  {fmtCompactUSD(r.liquidity)} depth
                </span>
              ) : null}
              <span className="ml-auto tabular">
                {fmtCompactUSD(r.volume24h)}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!tradable}
                onClick={() => trade(r.id, "yes")}
                className="flex-1 rounded-md border border-emerald-400/30 bg-emerald-500/5 px-2 py-1.5 text-[12px] font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={!tradable}
                onClick={() => trade(r.id, "no")}
                className="flex-1 rounded-md border border-rose-400/30 bg-rose-500/5 px-2 py-1.5 text-[12px] font-semibold text-rose-300 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                No
              </button>
            </div>

            {isOpen ? (
              <table className="mt-1 w-full">
                <tbody>
                  <ExpandedRow row={r} colSpan={1} />
                </tbody>
              </table>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
