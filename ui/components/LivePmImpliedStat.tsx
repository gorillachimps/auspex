"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtImpliedPct } from "@/lib/format";
import { useLiveMid, useWsStatus } from "@/lib/useLiveMarket";

const FLASH_MS = 600;

type Props = {
  /** Conditional-token id for the YES outcome. */
  tokenYes: string | null;
  /** Best bid from the snapshot — used as the static hint. */
  bestBid?: number | null;
  /** Best ask from the snapshot — used as the static hint. */
  bestAsk?: number | null;
  /** Snapshot implied probability, shown until the live feed delivers a mid. */
  fallbackImpliedYes?: number | null;
};

/**
 * Big-stat tile that displays the live PM implied YES probability. Subscribes
 * to the Polymarket WS feed for `tokenYes` and shows the mid of the best bid/
 * ask in real time. Falls back to the static snapshot value while the feed is
 * connecting. A short-lived flash animation on price changes makes the
 * movement readable at a glance.
 */
export function LivePmImpliedStat({
  tokenYes,
  bestBid,
  bestAsk,
  fallbackImpliedYes,
}: Props) {
  const liveMid = useLiveMid(tokenYes);
  const wsStatus = useWsStatus();

  // Flash direction tracking: green when the mid ticks up, rose when down.
  const prevMidRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (liveMid == null) return;
    const prev = prevMidRef.current;
    if (prev != null && Math.abs(prev - liveMid) > 1e-9) {
      setFlash(liveMid > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), FLASH_MS);
      return () => clearTimeout(t);
    }
    prevMidRef.current = liveMid;
  }, [liveMid]);
  // Capture the latest mid for the next comparison (after the effect above
  // reads the previous value).
  useEffect(() => {
    prevMidRef.current = liveMid;
  }, [liveMid]);

  const effective = liveMid ?? fallbackImpliedYes ?? null;
  const isLive = liveMid != null && wsStatus === "open";

  return (
    <div className="rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-2">
        <span>PM implied</span>
        <LivePip status={wsStatus} />
      </div>
      <div
        className={cn(
          "tabular text-lg font-semibold transition-colors duration-500",
          flash === "up"
            ? "text-emerald-300"
            : flash === "down"
              ? "text-rose-300"
              : isLive
                ? "text-foreground"
                : "text-foreground/85",
        )}
      >
        {effective != null ? fmtImpliedPct(effective) : "—"}
        {effective != null ? (
          <span className="ml-2 align-baseline text-[12px] font-normal text-muted">
            ${effective.toFixed(2)}/share
          </span>
        ) : null}
      </div>
      {bestBid != null && bestAsk != null ? (
        <div className="tabular text-[11px] text-muted">
          bid {fmtImpliedPct(bestBid)} / ask {fmtImpliedPct(bestAsk)}
        </div>
      ) : null}
    </div>
  );
}

function LivePip({
  status,
}: {
  status: "idle" | "connecting" | "open" | "reconnecting" | "closed";
}) {
  if (status === "idle" || status === "closed") return null;
  const tone =
    status === "open" ? "bg-emerald-400" : "bg-amber-400";
  return (
    <span className="relative grid h-2 w-2 place-items-center">
      <span
        aria-hidden
        className={cn(
          "absolute h-2 w-2 rounded-full opacity-60 motion-safe:animate-ping",
          tone,
        )}
      />
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} />
    </span>
  );
}
