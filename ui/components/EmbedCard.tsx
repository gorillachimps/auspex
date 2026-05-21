"use client";

import { ArrowUpRight } from "lucide-react";
import { useLiveMid } from "@/lib/useLiveMarket";
import { fmtImpliedPct, fmtUSDCompact } from "@/lib/format";
import { useFlashOnChange, flashClass } from "@/lib/useFlashOnChange";
import { cn } from "@/lib/cn";
import type { TableRow } from "@/lib/types";

type Props = {
  market: TableRow;
};

/**
 * The actual embed UI. Client component so we can subscribe to the live
 * mid via WS. Static fallback uses the snapshot's `impliedYes`.
 *
 * Two CTAs:
 *   - The whole card is a link wrapping the entire surface, target="_top"
 *     so the parent page navigates (escapes the iframe) when clicked.
 *   - A small "Trade →" pill in the corner reiterates the action for
 *     scanners.
 */
export function EmbedCard({ market }: Props) {
  const liveMid = useLiveMid(market.tokenYes);
  const yesPrice = liveMid ?? market.impliedYes ?? null;
  const noPrice = yesPrice != null ? 1 - yesPrice : null;
  const flash = useFlashOnChange(yesPrice, { minDelta: 0.005 });

  const href = `https://auspex.to/markets/${market.slug}?ref=embed`;

  return (
    <a
      href={href}
      target="_top"
      rel="noopener"
      className="group flex h-screen w-screen flex-col bg-background p-3 text-foreground transition-colors hover:bg-surface/40"
      title={`Trade on Auspex: ${market.question}`}
    >
      {/* Top row: brand mark + "Trade →" affordance */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight">
          <img
            src="/logo.png"
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 select-none"
            draggable={false}
          />
          <span className="text-foreground">Auspex</span>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
            Polymarket
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5 rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent group-hover:bg-accent/25">
          Trade
          <ArrowUpRight className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      </div>

      {/* Market question — clamped to 2 lines so very long titles don't
          break the layout in tighter iframe sizes */}
      <h2 className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight tracking-tight text-foreground">
        {market.question}
      </h2>

      {/* Live odds — YES on the left, NO on the right */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
        <div
          className={cn(
            "rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 transition-colors duration-300",
            flashClass(flash),
          )}
        >
          <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
            YES
          </div>
          <div className="tabular text-[18px] font-bold leading-none text-emerald-100">
            {yesPrice != null ? fmtImpliedPct(yesPrice) : "—"}
          </div>
        </div>
        <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-rose-300">
            NO
          </div>
          <div className="tabular text-[18px] font-bold leading-none text-rose-100">
            {noPrice != null ? fmtImpliedPct(noPrice) : "—"}
          </div>
        </div>
      </div>

      {/* Micro-footer: volume + 0% fee badge */}
      <div className="mt-2 flex items-center justify-between text-[9px] text-muted-2">
        <span>{fmtUSDCompact(market.volume24h)} · 24h volume</span>
        <span className="rounded-full bg-emerald-500/10 px-1.5 text-emerald-300 ring-1 ring-emerald-400/30">
          0% added fees
        </span>
      </div>
    </a>
  );
}
