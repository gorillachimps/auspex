"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  useLastTrade,
  useLiveBook,
  useWsStatus,
} from "@/lib/useLiveMarket";
import { fmtShares } from "@/lib/format";

const fmtSize = fmtShares;

const DEPTH = 8;

type Outcome = "yes" | "no";

type Props = {
  /** Conditional-token id for the YES outcome. */
  tokenYes: string | null;
  /** Conditional-token id for the NO outcome. */
  tokenNo: string | null;
};

export function OrderBookView({ tokenYes, tokenNo }: Props) {
  const [outcome, setOutcome] = useState<Outcome>("yes");
  const tokenId = outcome === "yes" ? tokenYes : tokenNo;
  const book = useLiveBook(tokenId);
  const lastTrade = useLastTrade(tokenId);
  const wsStatus = useWsStatus();

  // Best `DEPTH` levels on each side, oriented so the spread sits in the middle.
  //   Asks rendered top→bottom = worst (highest price) → best (lowest price,
  //   just above the spread).
  //   Bids rendered top→bottom = best (highest price, just below the spread)
  //   → worst (lowest).
  //
  // Cumulative depth follows the exchange convention: each row's `cum` is
  // the total size fillable at THIS price or BETTER (closer to spread).
  // So the bar grows OUTWARD from the spread — the row closest to the
  // spread shows just its own level's size, the row furthest shows the
  // full sum. This matches Coinbase / Hyperliquid / dYdX.
  const { topBids, topAsks, maxCum } = useMemo(() => {
    if (!book) return { topBids: [], topAsks: [], maxCum: 1 };
    const asks = book.asks.slice(-DEPTH);
    const bids = book.bids.slice(-DEPTH).reverse();

    // Asks are descending in `asks`: asks[0] = worst, asks[last] = best.
    // Walk from BEST (last) backward toward worst, accumulating, so the
    // best-ask row gets `cum = its own size` and the worst-ask row gets
    // `cum = sum of all 8 levels`.
    let cumA = 0;
    const asksDecorated = new Array<{ price: string; size: string; cum: number }>(
      asks.length,
    );
    for (let i = asks.length - 1; i >= 0; i--) {
      cumA += parseFloat(asks[i].size);
      asksDecorated[i] = { ...asks[i], cum: cumA };
    }

    // Bids are descending after the reverse above: bids[0] = best, bids[last]
    // = worst. Walk forward, accumulating, so best-bid row gets just its own
    // size and the worst-bid row gets the full sum.
    let cumB = 0;
    const bidsDecorated = bids.map((lvl) => {
      cumB += parseFloat(lvl.size);
      return { ...lvl, cum: cumB };
    });
    return {
      topAsks: asksDecorated,
      topBids: bidsDecorated,
      maxCum: Math.max(cumA, cumB, 1),
    };
  }, [book]);

  const bestBid =
    book && book.bids.length > 0
      ? parseFloat(book.bids[book.bids.length - 1].price)
      : null;
  const bestAsk =
    book && book.asks.length > 0
      ? parseFloat(book.asks[book.asks.length - 1].price)
      : null;
  const spread =
    bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const mid =
    bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : null;

  if (!tokenYes && !tokenNo) return null;

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Order book
          <LivePip status={wsStatus} />
        </h2>
        <div className="inline-flex rounded-md border border-border-strong bg-background p-0.5">
          <SideToggle
            active={outcome === "yes"}
            tone="emerald"
            onClick={() => setOutcome("yes")}
            label="YES"
          />
          <SideToggle
            active={outcome === "no"}
            tone="rose"
            onClick={() => setOutcome("no")}
            label="NO"
          />
        </div>
      </div>

      {!book ? (
        <p className="text-[12px] text-muted">
          {wsStatus === "reconnecting"
            ? "Reconnecting to the live feed…"
            : "Subscribing to the live feed…"}
        </p>
      ) : topAsks.length === 0 && topBids.length === 0 ? (
        <p className="text-[12px] text-muted">No resting orders.</p>
      ) : (
        <div className="overflow-hidden rounded border border-border/60 bg-background/40">
          <Header />
          {topAsks.map((lvl, i) => (
            <Row
              key={`a-${i}`}
              price={parseFloat(lvl.price)}
              size={parseFloat(lvl.size)}
              cum={lvl.cum}
              max={maxCum}
              tone="ask"
            />
          ))}
          <Spread mid={mid} spread={spread} lastTradePrice={lastTrade?.price ?? null} />
          {topBids.map((lvl, i) => (
            <Row
              key={`b-${i}`}
              price={parseFloat(lvl.price)}
              size={parseFloat(lvl.size)}
              cum={lvl.cum}
              max={maxCum}
              tone="bid"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-b border-border/60 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-2">
      <span>Price</span>
      <span className="text-right">Size</span>
      <span className="text-right">Cumul.</span>
    </div>
  );
}

function Row({
  price,
  size,
  cum,
  max,
  tone,
}: {
  price: number;
  size: number;
  cum: number;
  max: number;
  tone: "bid" | "ask";
}) {
  const pct = Math.min(100, (cum / max) * 100);
  const bg = tone === "bid" ? "bg-emerald-500/15" : "bg-rose-500/15";
  const fg = tone === "bid" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="relative grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-1 text-[12px]">
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0", bg)}
        style={{ width: `${pct}%` }}
      />
      <span className={cn("relative tabular font-medium", fg)}>
        {price.toFixed(4)}
      </span>
      <span className="relative tabular text-right text-foreground/90">
        {fmtSize(size)}
      </span>
      <span className="relative tabular text-right text-muted">
        {fmtSize(cum)}
      </span>
    </div>
  );
}

function Spread({
  mid,
  spread,
  lastTradePrice,
}: {
  mid: number | null;
  spread: number | null;
  lastTradePrice: number | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 border-y border-border/60 bg-surface/30 px-3 py-1 text-[11px] text-muted">
      <span>
        Mid{" "}
        <span className="tabular text-foreground">
          {mid != null ? mid.toFixed(4) : "—"}
        </span>
      </span>
      <span className="text-center">
        Last{" "}
        <span className="tabular text-foreground">
          {lastTradePrice != null ? lastTradePrice.toFixed(4) : "—"}
        </span>
      </span>
      <span className="text-right">
        Spread{" "}
        <span className="tabular text-foreground">
          {spread != null ? spread.toFixed(4) : "—"}
        </span>
      </span>
    </div>
  );
}

function SideToggle({
  active,
  tone,
  onClick,
  label,
}: {
  active: boolean;
  tone: "emerald" | "rose";
  onClick: () => void;
  label: string;
}) {
  const activeClass =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40"
      : "bg-rose-500/15 text-rose-200 ring-rose-400/40";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-transparent",
        active ? activeClass : "text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function LivePip({ status }: { status: "idle" | "connecting" | "open" | "reconnecting" | "closed" }) {
  const cfg =
    status === "open"
      ? { dot: "bg-emerald-400", label: "live", tone: "text-emerald-300", pulse: true }
      : status === "connecting" || status === "reconnecting"
        ? { dot: "bg-amber-400", label: status === "connecting" ? "connecting" : "reconnecting", tone: "text-amber-300", pulse: true }
        : { dot: "bg-zinc-500", label: "offline", tone: "text-muted", pulse: false };
  return (
    <span className={cn("inline-flex items-center gap-1 normal-case", cfg.tone)}>
      <span className="relative grid h-2 w-2 place-items-center">
        {cfg.pulse ? (
          <span
            aria-hidden
            className={cn(
              "absolute h-2 w-2 rounded-full opacity-50",
              cfg.dot,
              "motion-safe:animate-ping",
            )}
          />
        ) : null}
        <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      </span>
      <span className="text-[10px] font-semibold tracking-wider">{cfg.label}</span>
    </span>
  );
}

