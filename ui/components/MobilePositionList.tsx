"use client";

import { Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  fmtCloseIn,
  fmtPctSigned,
  fmtUSD,
  fmtUSDSigned,
  urgencyForEnd,
} from "@/lib/format";

// Mirror the Position shape used inside PortfolioView. Kept loose so we
// don't need to thread the type through; only the fields below are read.
type Position = {
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  redeemable: boolean;
  title: string;
  slug: string;
  outcome: string;
  endDate?: string;
};

type Props = {
  positions: Position[];
  /** When provided, renders a per-card "Close" button that calls back into
   *  the parent's close-one handler. Omit for read-only contexts (e.g.
   *  someone else's wallet). */
  onClose?: (asset: string) => void;
  /** Set of asset ids currently mid-close, used to spin the per-row button. */
  closing?: Set<string>;
  /** Disable all close buttons (e.g. bulk close in progress). */
  closeDisabled?: boolean;
};

/**
 * Card-stack reflow of /portfolio for narrow viewports. The same data the
 * desktop table shows, presented vertically per position to avoid horizontal
 * scroll on phones.
 */
export function MobilePositionList({
  positions,
  onClose,
  closing,
  closeDisabled,
}: Props) {
  return (
    <div className="flex flex-col gap-2 sm:hidden">
      {positions.map((p) => {
        const isYes = p.outcome.toLowerCase() === "yes";
        const pnl = fmtUSDSigned(p.cashPnl);
        const urgency = urgencyForEnd(p.endDate);
        const closeTone =
          urgency === "urgent"
            ? "text-rose-300"
            : urgency === "soon"
              ? "text-amber-300"
              : urgency === "ended"
                ? "text-muted-2"
                : "text-muted";
        const isClosing = closing?.has(p.asset) ?? false;
        return (
          <div
            key={`${p.conditionId}-${p.asset}`}
            className="rounded-md border border-border bg-surface/40 px-3 py-2.5"
          >
          <a
            href={`/markets/${p.slug}`}
            className="block"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[13px] font-medium text-foreground">
                  {p.title}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                      isYes
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                        : "bg-rose-500/15 text-rose-200 ring-rose-400/30",
                    )}
                  >
                    {p.outcome}
                  </span>
                  {p.redeemable ? (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200 ring-1 ring-amber-400/30">
                      redeem
                    </span>
                  ) : null}
                  <span className={cn("text-[10px] tabular ml-auto", closeTone)}>
                    {fmtCloseIn(p.endDate)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <Cell
                label="Value"
                value={fmtUSD(p.currentValue)}
                valueClass="text-foreground"
              />
              <Cell
                label="P&L"
                value={`${pnl.sign > 0 ? "+" : ""}${pnl.text}`}
                valueClass={
                  pnl.sign > 0
                    ? "text-emerald-300"
                    : pnl.sign < 0
                      ? "text-rose-300"
                      : "text-muted"
                }
                hint={fmtPctSigned(p.percentPnl)}
              />
              <Cell
                label="Shares"
                value={p.size.toFixed(2)}
                valueClass="text-muted"
                hint={`avg ${p.avgPrice > 0 ? `$${p.avgPrice.toFixed(3)}` : "—"}`}
              />
            </div>
          </a>
          {onClose ? (
            <button
              type="button"
              onClick={() => onClose(p.asset)}
              disabled={isClosing || closeDisabled}
              className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[12px] font-semibold text-rose-200 active:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isClosing ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <XCircle className="h-3 w-3" aria-hidden="true" />
              )}
              Close · {fmtUSD(p.currentValue)}
            </button>
          ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Cell({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className={cn("tabular font-semibold", valueClass)}>{value}</span>
      {hint ? (
        <span className="tabular text-[9px] text-muted-2">{hint}</span>
      ) : null}
    </div>
  );
}
