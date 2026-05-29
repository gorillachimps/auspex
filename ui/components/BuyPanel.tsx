"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtImpliedPct } from "@/lib/format";
import { useLiveMid } from "@/lib/useLiveMarket";
import { useClobSession } from "@/lib/useClobSession";
import type { TableRow } from "@/lib/types";
import { OrderTicket } from "./OrderTicket";

type Props = {
  market: TableRow;
  /** When set (via the market URL's ?copy=yes|no), auto-open the buy ticket
   *  for that outcome once on mount. Powers "copy this fill" from the follow
   *  feed — routes the user straight into a pre-filled ticket. Never sizes or
   *  submits anything; the user still chooses the amount and signs. */
  autoOpenOutcome?: "yes" | "no" | null;
};

/**
 * Primary buy entry-point on the market detail page. Two big buttons —
 * Buy YES (emerald) and Buy NO (rose) — that open the OrderTicket modal
 * pre-configured for the chosen side. Pulls live mid from the WS so the
 * label price reflects what's actually on the book, not the snapshot.
 *
 * For users who aren't connected, the buttons still render but clicking
 * them surfaces the OrderTicket's connect-wallet step (handled inside
 * OrderTicket itself).
 *
 * Closing existing positions (sell) is owned by PositionCard, which
 * appears below this panel. Keeping the entry points split keeps the
 * UI honest about which direction you're trading.
 */
export function BuyPanel({ market, autoOpenOutcome }: Props) {
  const liveYesMid = useLiveMid(market.tokenYes);
  const session = useClobSession();
  const [ticket, setTicket] = useState<{ outcome: "yes" | "no" } | null>(null);

  const yesPrice = liveYesMid ?? market.impliedYes ?? null;
  const noPrice = yesPrice != null ? 1 - yesPrice : null;
  const settled = !!market.endDate && Date.parse(market.endDate) <= Date.now();
  const disabled =
    !market.tokenYes || !market.tokenNo || session.status === "disabled";

  // "Copy this fill": open the ticket once on mount for the outcome named in
  // the URL. Guarded by a ref so closing the modal (or a re-render) doesn't
  // re-open it. Skipped if the market isn't tradable/settled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!autoOpenOutcome) return;
    if (disabled || settled) return;
    autoOpenedRef.current = true;
    setTicket({ outcome: autoOpenOutcome });
  }, [autoOpenOutcome, disabled, settled]);

  // For settled markets, hide the panel entirely — no one should be
  // placing new positions in a market that's already resolving.
  if (settled) {
    return null;
  }

  return (
    <>
      <section className="rounded-md border border-border bg-surface/40 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            Place a trade
          </h2>
          <span className="text-[10px] text-muted-2">
            Builder-attributed · 0% added fees
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setTicket({ outcome: "yes" })}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-md border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-200">
              <ArrowUpFromLine className="h-3 w-3" aria-hidden="true" />
              Buy YES
            </span>
            <span className="tabular text-[18px] font-bold text-emerald-100">
              {yesPrice != null ? fmtImpliedPct(yesPrice) : "—"}
            </span>
            <span className="text-[10px] text-emerald-200/60">
              {yesPrice != null
                ? `Pays $1 if market resolves YES · ${(yesPrice * 100).toFixed(1)}¢ a share`
                : "Pricing unavailable"}
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setTicket({ outcome: "no" })}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-md border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              "border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20",
            )}
          >
            <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-rose-200">
              <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
              Buy NO
            </span>
            <span className="tabular text-[18px] font-bold text-rose-100">
              {noPrice != null ? fmtImpliedPct(noPrice) : "—"}
            </span>
            <span className="text-[10px] text-rose-200/60">
              {noPrice != null
                ? `Pays $1 if market resolves NO · ${(noPrice * 100).toFixed(1)}¢ a share`
                : "Pricing unavailable"}
            </span>
          </button>
        </div>
        {session.status === "unconnected" ? (
          <p className="mt-2 text-[11px] text-muted-2">
            Connect a wallet in the top-right to enable trading.
          </p>
        ) : null}
      </section>

      <OrderTicket
        open={ticket !== null}
        market={market}
        initialOutcome={ticket?.outcome ?? "yes"}
        onClose={() => setTicket(null)}
      />
    </>
  );
}
