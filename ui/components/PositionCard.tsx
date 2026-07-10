"use client";

import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useClobSession } from "@/lib/useClobSession";
import { getBalanceAllowance } from "@/lib/polymarket";
import { useLiveMid } from "@/lib/useLiveMarket";
import { useUserMarketPositions, type Position } from "@/lib/useUserPositions";
import { cn } from "@/lib/cn";
import type { TableRow } from "@/lib/types";
import { fmtPctSigned, fmtPrice, fmtUSD, fmtUSDSignedText } from "@/lib/format";
import { OrderTicket } from "./OrderTicket";

const fmtSignedUSD = fmtUSDSignedText;
const fmtSignedPct = fmtPctSigned;

const REFRESH_MS = 30_000;

type Holdings = {
  yes: number; // shares (6-decimal collateral units → divided by 1e6)
  no: number;
};

function rawToShares(raw: string): number {
  try {
    const n = Number(BigInt(raw));
    return n / 1_000_000;
  } catch {
    return 0;
  }
}

export function PositionCard({ market }: { market: TableRow }) {
  const session = useClobSession();
  const liveYesMid = useLiveMid(market.tokenYes);
  const liveNoMid = useLiveMid(market.tokenNo);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);
  const [sellOutcome, setSellOutcome] = useState<"yes" | "no" | null>(null);
  // Separate flag for the one-click market-close path. The OrderTicket is the
  // same component instance; we just open it with `initialOrderMode="market"`
  // and the size pre-filled to the user's full holding.
  const [closeOutcome, setCloseOutcome] = useState<"yes" | "no" | null>(null);

  // Data-api positions for this market — gives us avg entry + cash/percent P&L
  // computed against indexed fills (lagging the CLOB balance by a few seconds
  // but the only source of truth for cost basis).
  const positions = useUserMarketPositions(session.funderAddress, [
    market.tokenYes,
    market.tokenNo,
  ]);

  useEffect(() => {
    // Clear the previous account's holdings the moment the wallet/market
    // identity changes, so a stale Close/Sell can't act on the old account
    // while the new one loads (or if its load errors). Same-account transient
    // errors still keep prior holdings — that path is the setTimeout re-poll,
    // which doesn't re-run this effect.
    setHoldings(null);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (!session.client || !market.tokenYes || !market.tokenNo) return;
      setLoading(true);
      try {
        const [yesR, noR] = await Promise.all([
          getBalanceAllowance(session.client, market.tokenYes),
          getBalanceAllowance(session.client, market.tokenNo),
        ]);
        if (cancelled) return;
        setHoldings({
          yes: rawToShares(yesR.balance ?? "0"),
          no: rawToShares(noR.balance ?? "0"),
        });
      } catch {
        // ignore — keep previous holdings
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(load, REFRESH_MS);
        }
      }
    }

    if (session.status === "ready") load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session.client, session.status, market.tokenYes, market.tokenNo]);

  if (session.status !== "ready") return null;
  if (!holdings) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Your position
        </h2>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading holdings…
        </div>
      </section>
    );
  }

  if (holdings.yes === 0 && holdings.no === 0) {
    return (
      <section className="rounded-md border border-border bg-surface/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          <Wallet className="h-3 w-3" />
          Your position
        </h2>
        <p className="text-[12px] text-muted">
          You don&apos;t hold YES or NO shares for this market yet. Use the buttons
          below to place a builder-attributed order.
        </p>
      </section>
    );
  }

  const implied = liveYesMid ?? market.impliedYes ?? 0.5;
  // Mark YES at its live probability. Mark NO at the NO book's OWN live mid when
  // available — with a spread it isn't exactly 1 − YES; fall back to complement.
  const yesMark = holdings.yes * implied;
  const noMark = holdings.no * (liveNoMid ?? 1 - implied);
  const totalMark = yesMark + noMark;

  // Sum P&L across both outcomes when present.
  const cashPnl =
    (positions.yes?.cashPnl ?? 0) + (positions.no?.cashPnl ?? 0);
  const totalCost =
    (positions.yes?.initialValue ?? 0) + (positions.no?.initialValue ?? 0);
  const percentPnl =
    totalCost > 0 ? (cashPnl / totalCost) * 100 : 0;
  const haveAnyPnlData = positions.yes != null || positions.no != null;
  const pnlSign = cashPnl > 0.005 ? 1 : cashPnl < -0.005 ? -1 : 0;

  // Resolved winners must be REDEEMED, not CLOB-sold — a resolved market has no
  // book to sell into. Gate Close/Sell off for redeemable sides and surface a
  // redeem link instead (the Portfolio path already does this; the market-detail
  // card is the surface that fix didn't cover).
  const yesRedeemable = positions.yes?.redeemable ?? false;
  const noRedeemable = positions.no?.redeemable ?? false;

  return (
    <>
      <section className="rounded-md border border-border bg-surface/40 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          <Wallet className="h-3 w-3" />
          Your position
          {loading || positions.loading ? (
            <Loader2 className="h-3 w-3 animate-spin opacity-60" />
          ) : null}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Side
            label="YES shares"
            shares={holdings.yes}
            mark={yesMark}
            tone="emerald"
            position={positions.yes}
            redeemable={yesRedeemable}
            onSell={holdings.yes > 0 && !yesRedeemable ? () => setSellOutcome("yes") : undefined}
            onClose={holdings.yes > 0 && !yesRedeemable ? () => setCloseOutcome("yes") : undefined}
          />
          <Side
            label="NO shares"
            shares={holdings.no}
            mark={noMark}
            tone="rose"
            position={positions.no}
            redeemable={noRedeemable}
            onSell={holdings.no > 0 && !noRedeemable ? () => setSellOutcome("no") : undefined}
            onClose={holdings.no > 0 && !noRedeemable ? () => setCloseOutcome("no") : undefined}
          />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-2">
              Mark-to-market
            </span>
            <span className="tabular text-lg font-semibold text-foreground">
              {fmtUSD(totalMark)}
            </span>
            {haveAnyPnlData ? (
              <span
                className={cn(
                  "tabular text-[11px] font-medium",
                  pnlSign > 0
                    ? "text-emerald-300"
                    : pnlSign < 0
                      ? "text-rose-300"
                      : "text-muted",
                )}
              >
                P&L {fmtSignedUSD(cashPnl)}
                {percentPnl !== 0 && Math.abs(percentPnl) >= 0.05 ? (
                  <span className="ml-1 opacity-80">
                    ({fmtSignedPct(percentPnl)})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-[10px] text-muted">
                at {(implied * 100).toFixed(0)}% implied
              </span>
            )}
          </div>
        </div>
      </section>
      <OrderTicket
        open={sellOutcome !== null}
        market={market}
        initialOutcome={sellOutcome ?? "yes"}
        side="sell"
        maxShares={sellOutcome === "yes" ? holdings.yes : holdings.no}
        onClose={() => setSellOutcome(null)}
      />
      <OrderTicket
        open={closeOutcome !== null}
        market={market}
        initialOutcome={closeOutcome ?? "yes"}
        side="sell"
        initialOrderMode="market"
        maxShares={closeOutcome === "yes" ? holdings.yes : holdings.no}
        onClose={() => setCloseOutcome(null)}
      />
    </>
  );
}

function Side({
  label,
  shares,
  mark,
  tone,
  position,
  redeemable,
  onSell,
  onClose,
}: {
  label: string;
  shares: number;
  mark: number;
  tone: "emerald" | "rose";
  position: Position | null;
  redeemable?: boolean;
  onSell?: () => void;
  onClose?: () => void;
}) {
  const colour =
    tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  const ring =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15"
      : "border-rose-400/30 bg-rose-500/5 text-rose-300 hover:bg-rose-500/15";

  const cashPnl = position?.cashPnl ?? null;
  const percentPnl = position?.percentPnl ?? null;
  const pnlSign =
    cashPnl == null ? 0 : cashPnl > 0.005 ? 1 : cashPnl < -0.005 ? -1 : 0;

  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className={cn("tabular text-lg font-semibold", colour)}>
          {shares.toFixed(2)}
        </span>
        {redeemable && shares > 0 ? (
          <a
            href="/portfolio"
            className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20"
            title="This market resolved — claim your winnings in Portfolio"
          >
            Redeem
          </a>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              ring,
            )}
            title="Market-sell all shares at the best bid"
          >
            Close
          </button>
        ) : null}
        {onSell ? (
          <button
            type="button"
            onClick={onSell}
            className="rounded-md border border-border-strong bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-surface-2 hover:text-foreground"
            title="Open the order ticket"
          >
            Sell
          </button>
        ) : null}
      </div>
      {shares > 0 ? (
        <div className="mt-0.5 flex flex-col gap-0 text-[10px] text-muted">
          {position && position.avgPrice > 0 ? (
            <span className="tabular">
              avg {fmtPrice(position.avgPrice)}{" "}
              <span className="text-muted-2">·</span>{" "}
              now {fmtPrice(position.curPrice || mark / Math.max(shares, 1))}
            </span>
          ) : (
            <span>{fmtUSD(mark)} mark</span>
          )}
          {cashPnl != null && Math.abs(cashPnl) >= 0.005 ? (
            <span
              className={cn(
                "tabular font-medium",
                pnlSign > 0
                  ? "text-emerald-300"
                  : pnlSign < 0
                    ? "text-rose-300"
                    : "text-muted",
              )}
            >
              {fmtSignedUSD(cashPnl)}
              {percentPnl != null && Math.abs(percentPnl) >= 0.05 ? (
                <span className="ml-1 opacity-80">
                  ({fmtSignedPct(percentPnl)})
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
