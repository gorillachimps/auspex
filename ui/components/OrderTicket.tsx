"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useClobSession } from "@/lib/useClobSession";
import { useBalanceAllowance, fmtCollateral } from "@/lib/useBalanceAllowance";
import {
  placeLimitOrder,
  placeMarketOrder,
  Side,
  updateAllowance,
} from "@/lib/polymarket";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useLiveBook, type Level } from "@/lib/useLiveMarket";
import { track } from "@/lib/track";
import { cn } from "@/lib/cn";
import type { TableRow } from "@/lib/types";
import { BridgeButton } from "./BridgeButton";

type Outcome = "yes" | "no";
type SideMode = "buy" | "sell";
type OrderMode = "limit" | "market";

type Props = {
  open: boolean;
  market: TableRow | null;
  initialOutcome: Outcome;
  /** Defaults to "buy". When "sell", the size input is in SHARES (not USD), the
   *  allowance check uses the conditional-token balance for the chosen outcome,
   *  and the submit posts a SELL order. */
  side?: SideMode;
  /** Defaults to "limit". Set "market" to open the ticket pre-configured for a
   *  market order (used by the one-click close-position flow). */
  initialOrderMode?: OrderMode;
  /** When set, pre-fills size in SELL mode and caps the Max button. If
   *  `initialOrderMode === "market"`, also seeds the size input to this value. */
  maxShares?: number;
  onClose: () => void;
};

const TICK_SIZES = ["0.0001", "0.001", "0.01", "0.1"] as const;
type TickStr = (typeof TICK_SIZES)[number];

function tickToString(t: number | null): TickStr {
  if (t == null) return "0.01";
  const s = t.toString();
  return (TICK_SIZES.includes(s as TickStr) ? s : "0.01") as TickStr;
}

type FillEstimate = {
  /** Volume-weighted avg price per share at the estimated fill. */
  avgPrice: number | null;
  /** Total shares the book can absorb up to the requested amount. */
  shares: number;
  /** Total USDC spent (BUY) or received (SELL) at the estimated fill. */
  usdc: number;
  /** Slippage from mid in pp (positive = unfavorable). */
  slippagePct: number | null;
  /** True iff the book has enough depth to fully absorb the request. */
  fullyFillable: boolean;
};

/** Walk the order book to estimate the volume-weighted fill for a market
 *  order. For BUY we hit the asks (lowest price first); for SELL we hit
 *  the bids (highest price first). Polymarket book convention has the
 *  inside-of-book at `array[length-1]` on both sides, so we reverse to
 *  iterate best→worst. */
function estimateMarketFill({
  side,
  amount,
  asks,
  bids,
  mid,
}: {
  side: SideMode;
  /** BUY: USD to spend. SELL: shares to sell. */
  amount: number;
  asks: Level[];
  bids: Level[];
  mid: number | null;
}): FillEstimate {
  if (!isFinite(amount) || amount <= 0) {
    return { avgPrice: null, shares: 0, usdc: 0, slippagePct: null, fullyFillable: false };
  }
  const levels = side === "buy" ? [...asks].reverse() : [...bids].reverse();
  if (levels.length === 0) {
    return { avgPrice: null, shares: 0, usdc: 0, slippagePct: null, fullyFillable: false };
  }

  let sharesAccum = 0;
  let usdcAccum = 0;
  let remaining = amount;
  for (const lvl of levels) {
    const price = parseFloat(lvl.price);
    const sizeAvailable = parseFloat(lvl.size);
    if (!isFinite(price) || !isFinite(sizeAvailable) || sizeAvailable <= 0) continue;
    if (side === "buy") {
      const usdcAtLvl = Math.min(remaining, sizeAvailable * price);
      const sharesAtLvl = usdcAtLvl / price;
      sharesAccum += sharesAtLvl;
      usdcAccum += usdcAtLvl;
      remaining -= usdcAtLvl;
    } else {
      const sharesAtLvl = Math.min(remaining, sizeAvailable);
      const usdcAtLvl = sharesAtLvl * price;
      sharesAccum += sharesAtLvl;
      usdcAccum += usdcAtLvl;
      remaining -= sharesAtLvl;
    }
    if (remaining <= 1e-9) break;
  }

  const fullyFillable = remaining <= 1e-9;
  const avgPrice = sharesAccum > 0 ? usdcAccum / sharesAccum : null;
  const slippagePct =
    avgPrice != null && mid != null && mid > 0
      ? ((avgPrice - mid) / mid) * 100
      : null;
  return { avgPrice, shares: sharesAccum, usdc: usdcAccum, slippagePct, fullyFillable };
}

export function OrderTicket({
  open,
  market,
  initialOutcome,
  side = "buy",
  initialOrderMode = "limit",
  maxShares,
  onClose,
}: Props) {
  const session = useClobSession();
  const [orderMode, setOrderMode] = useState<OrderMode>(initialOrderMode);
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);

  // SELL: check the conditional-token allowance for the chosen outcome.
  // BUY:  check the collateral (pUSD) allowance.
  const allowanceTokenId =
    side === "sell"
      ? outcome === "yes"
        ? market?.tokenYes ?? undefined
        : market?.tokenNo ?? undefined
      : undefined;
  const allowance = useBalanceAllowance(session.client, allowanceTokenId);

  const [priceStr, setPriceStr] = useState("");
  const [sizeStr, setSizeStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef, 'input[inputmode="decimal"]');

  // Opening the order ticket is the strongest "intent to trade" signal we
  // have — that's where we fire the (now lazy) CLOB credential derivation.
  // No second wallet-signature prompt right after Privy connect; the prompt
  // appears here, with clear context for the user.
  //
  // Fires AT MOST ONCE per open transition (tracked via `firedForOpen` ref).
  // That's important because:
  //   - It would otherwise re-fire on every render where session changes,
  //     including the very status flip ("linked" → "deriving") triggered by
  //     the previous call.
  //   - If ensureClient errors (user rejects signature), status becomes
  //     "error". Without the once-per-open guard, the next render would
  //     immediately re-fire the prompt, trapping the user in a loop.
  // To retry after rejection the user closes the dialog and re-opens it —
  // a clear, learnable interaction.
  const firedForOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      firedForOpen.current = false;
      return;
    }
    if (firedForOpen.current) return;
    if (session.status !== "linked" && session.status !== "error") return;
    firedForOpen.current = true;
    session.ensureClient().catch(() => {
      // Errors are surfaced via session.error → sessionBlocker below;
      // no need to handle here.
    });
  }, [open, session]);

  const tokenId =
    outcome === "yes" ? market?.tokenYes ?? null : market?.tokenNo ?? null;

  // Live book — drives bid/ask/mid pills AND the market-order fill estimate.
  // Only subscribe while the ticket is open.
  const liveBook = useLiveBook(open ? tokenId : null);
  const bestBid =
    liveBook && liveBook.bids.length > 0
      ? parseFloat(liveBook.bids[liveBook.bids.length - 1].price)
      : null;
  const bestAsk =
    liveBook && liveBook.asks.length > 0
      ? parseFloat(liveBook.asks[liveBook.asks.length - 1].price)
      : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;

  // Reset on open with sensible defaults: snap price near current mid.
  // When `initialOrderMode === "market"` and we have a `maxShares` (close-flow),
  // also pre-fill the size input so the user just has to click "Sell" once.
  useEffect(() => {
    if (open && market) {
      setOutcome(initialOutcome);
      setOrderMode(initialOrderMode);
      const implied = market.impliedYes ?? 0.5;
      const start = initialOutcome === "yes" ? implied : 1 - implied;
      setPriceStr(start ? Math.max(0.01, Math.min(0.99, start)).toFixed(2) : "0.50");
      if (initialOrderMode === "market" && maxShares != null && maxShares > 0) {
        setSizeStr(maxShares.toFixed(2));
      } else {
        setSizeStr("");
      }
    }
  }, [open, market, initialOutcome, initialOrderMode, maxShares]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tickSize = market ? tickToString(market.tickSize) : "0.01";
  const tickNumeric = parseFloat(tickSize);

  const price = parseFloat(priceStr);
  const sizeInput = parseFloat(sizeStr);

  // LIMIT-order projection
  // BUY: user types USD, shares = USD / price.
  // SELL: user types shares, USD = shares * price.
  const limitShares =
    side === "buy"
      ? isFinite(price) && price > 0 && isFinite(sizeInput) && sizeInput > 0
        ? sizeInput / price
        : 0
      : isFinite(sizeInput) && sizeInput > 0
        ? sizeInput
        : 0;
  const limitNotionalUsd =
    isFinite(price) && price > 0 ? limitShares * price : 0;

  // MARKET-order fill estimate
  const marketFill = useMemo(() => {
    if (orderMode !== "market") return null;
    if (!liveBook) return null;
    if (!isFinite(sizeInput) || sizeInput <= 0) return null;
    return estimateMarketFill({
      side,
      amount: sizeInput,
      asks: liveBook.asks,
      bids: liveBook.bids,
      mid,
    });
  }, [orderMode, liveBook, sizeInput, side, mid]);

  // sharesNumeric is what the allowance check needs to know about.
  const effectiveShares =
    orderMode === "limit" ? limitShares : marketFill?.shares ?? 0;
  const effectiveUsd =
    orderMode === "limit" ? limitNotionalUsd : marketFill?.usdc ?? 0;

  const errors = useMemo(() => {
    const list: string[] = [];
    if (orderMode === "limit") {
      if (!isFinite(price) || price <= 0 || price >= 1) {
        list.push("Price must be between 0 and 1.");
      } else {
        const ratio = price / tickNumeric;
        if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
          list.push(`Price must be a multiple of ${tickSize}.`);
        }
      }
      if (side === "buy") {
        if (!isFinite(sizeInput) || sizeInput <= 0) {
          list.push("Size must be > $0.");
        } else if (sizeInput < 1) {
          list.push("Minimum order is $1.");
        } else if (limitNotionalUsd < 1) {
          list.push(
            "Resulting notional is under $1 after share rounding — bump size by a cent or two.",
          );
        }
      } else {
        if (!isFinite(sizeInput) || sizeInput <= 0) {
          list.push("Size must be > 0 shares.");
        } else if (limitNotionalUsd < 1) {
          list.push(
            `Resulting notional is $${limitNotionalUsd.toFixed(4)} — minimum is $1.`,
          );
        }
        if (maxShares != null && sizeInput > maxShares + 1e-6) {
          list.push(
            `You only hold ${maxShares.toFixed(2)} ${outcome.toUpperCase()} shares.`,
          );
        }
      }
    } else {
      // MARKET — amount is USD for BUY, shares for SELL.
      if (!isFinite(sizeInput) || sizeInput <= 0) {
        list.push(side === "buy" ? "Size must be > $0." : "Size must be > 0 shares.");
      } else if (side === "buy" && sizeInput < 1) {
        list.push("Minimum order is $1.");
      }
      if (side === "sell" && maxShares != null && sizeInput > maxShares + 1e-6) {
        list.push(
          `You only hold ${maxShares.toFixed(2)} ${outcome.toUpperCase()} shares.`,
        );
      }
      if (marketFill) {
        if (marketFill.avgPrice == null && sizeInput > 0) {
          list.push("No depth available to fill this market order.");
        } else if (marketFill.usdc > 0 && marketFill.usdc < 1) {
          list.push(
            `Estimated notional is $${marketFill.usdc.toFixed(4)} — minimum is $1.`,
          );
        }
      }
    }
    return list;
  }, [
    orderMode,
    price,
    sizeInput,
    tickNumeric,
    tickSize,
    side,
    maxShares,
    limitNotionalUsd,
    outcome,
    marketFill,
  ]);

  if (!open || !market) return null;

  const canSubmit =
    session.status === "ready" &&
    session.client !== null &&
    !!tokenId &&
    errors.length === 0 &&
    !submitting;

  async function approve() {
    if (!session.client) return;
    setApproving(true);
    const what = side === "buy" ? "pUSD" : `${outcome.toUpperCase()} shares`;
    const toastId = toast.loading(`Approving ${what} for trading…`);
    try {
      await updateAllowance(session.client, allowanceTokenId);
      toast.success(`${what} approved. You can place orders now.`, {
        id: toastId,
        duration: 5000,
      });
      track("allowance_approved", {
        side,
        outcome,
        slug: market?.slug,
        family: market?.family,
      });
      allowance.refresh();
    } catch (e) {
      const msg = (e as Error).message ?? "approval failed";
      toast.error(`Approval failed: ${msg}`, { id: toastId, duration: 8000 });
      track("allowance_failed", {
        side,
        outcome,
        slug: market?.slug,
        reason: msg.slice(0, 80),
      });
    } finally {
      setApproving(false);
    }
  }

  async function submit() {
    if (!session.client || !tokenId || !market) return;
    setSubmitting(true);
    const verb = side === "buy" ? "Buy" : "Sell";
    const modeLabel = orderMode === "market" ? " market" : "";
    const toastId = toast.loading(
      `Placing ${verb} ${outcome.toUpperCase()}${modeLabel} order…`,
    );
    try {
      const resp =
        orderMode === "limit"
          ? await placeLimitOrder({
              client: session.client,
              tokenID: tokenId,
              price,
              size: limitShares,
              side: side === "buy" ? Side.BUY : Side.SELL,
              tickSize,
              negRisk: market.negRisk,
            })
          : await placeMarketOrder({
              client: session.client,
              tokenID: tokenId,
              amount: sizeInput,
              side: side === "buy" ? Side.BUY : Side.SELL,
              tickSize,
              negRisk: market.negRisk,
            });
      if (resp && typeof resp === "object" && resp.success === false) {
        throw new Error(resp.errorMsg || "order rejected");
      }
      const desc =
        orderMode === "limit"
          ? `${limitShares.toFixed(2)} shares @ $${priceStr}`
          : marketFill && marketFill.avgPrice != null
            ? `~${marketFill.shares.toFixed(2)} shares @ ~$${marketFill.avgPrice.toFixed(3)}`
            : "submitted";
      toast.success(
        `${verb} ${outcome.toUpperCase()}${modeLabel}: ${desc}`,
        { id: toastId, duration: 6000 },
      );
      track("order_placed", {
        outcome,
        side,
        orderMode,
        slug: market.slug,
        family: market.family,
        size_usd: effectiveUsd,
        price: orderMode === "limit" ? price : marketFill?.avgPrice,
      });
      allowance.refresh();
      onClose();
    } catch (e) {
      const msg = (e as Error).message ?? "unknown error";
      toast.error(`Order failed: ${msg}`, { id: toastId, duration: 8000 });
      track("order_failed", {
        outcome,
        side,
        orderMode,
        slug: market.slug,
        family: market.family,
        reason: msg.slice(0, 80),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const sessionBlocker = (() => {
    switch (session.status) {
      case "disabled":
        return "Trading isn't configured.";
      case "loading":
        return "Authenticating…";
      case "unconnected":
        return "Connect a wallet first (top-right).";
      case "linking":
        return "Finding your Polymarket account…";
      case "no-funder":
        return "Set your trading account first (Connect menu → Connect your trading account).";
      case "linked":
        return "Authorising your session…";
      case "deriving":
        return "Authorising — please sign the wallet prompt.";
      case "error":
        return session.error ?? "Auth error";
      case "ready":
        return null;
    }
  })();

  const needsApproval =
    session.status === "ready" &&
    !allowance.loading &&
    !allowance.error &&
    !allowance.hasAnyAllowance;

  const allowanceBlocker = (() => {
    if (session.status !== "ready") return null;
    if (allowance.loading || allowance.error) return null;
    if (needsApproval) return null;
    if (side === "buy") {
      const sizeForCheck =
        Number.isFinite(effectiveUsd) && effectiveUsd > 0
          ? Math.max(1, Math.ceil(effectiveUsd))
          : 1;
      if (
        allowance.balance != null &&
        allowance.balance < BigInt(sizeForCheck * 1_000_000)
      ) {
        return `Insufficient pUSD balance (${fmtCollateral(allowance.balance)}).`;
      }
    } else {
      if (
        allowance.balance != null &&
        effectiveShares > 0 &&
        allowance.balance < BigInt(Math.ceil(effectiveShares * 1_000_000))
      ) {
        const heldShares = Number(allowance.balance) / 1_000_000;
        return `Only ${heldShares.toFixed(2)} ${outcome.toUpperCase()} shares available to sell.`;
      }
    }
    return null;
  })();

  const blocker = sessionBlocker ?? allowanceBlocker;
  const submitDisabled = !canSubmit || !!blocker;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-ticket-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border-strong bg-surface p-4 shadow-2xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2
              id="order-ticket-title"
              className="text-base font-semibold tracking-tight"
            >
              {side === "buy" ? "Buy shares" : "Sell shares"}
            </h2>
            <p className="mt-1 line-clamp-2 text-[12px] text-muted">
              {market.question}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SideButton
            active={outcome === "yes"}
            tone="emerald"
            onClick={() => setOutcome("yes")}
            label="Yes"
            sub={
              market.impliedYes != null
                ? `${(market.impliedYes * 100).toFixed(0)}¢`
                : "—"
            }
          />
          <SideButton
            active={outcome === "no"}
            tone="rose"
            onClick={() => setOutcome("no")}
            label="No"
            sub={
              market.impliedYes != null
                ? `${((1 - market.impliedYes) * 100).toFixed(0)}¢`
                : "—"
            }
          />
        </div>

        <OrderModeToggle value={orderMode} onChange={setOrderMode} />

        {orderMode === "limit" ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Input
                label="Limit price"
                value={priceStr}
                onChange={setPriceStr}
                suffix={`tick ${tickSize}`}
                placeholder="0.50"
                inputMode="decimal"
              />
              {side === "buy" ? (
                <Input
                  label="Size (USD)"
                  value={sizeStr}
                  onChange={setSizeStr}
                  prefix="$"
                  placeholder="5.00"
                  inputMode="decimal"
                />
              ) : (
                <SellSizeInput
                  value={sizeStr}
                  onChange={setSizeStr}
                  maxShares={maxShares}
                />
              )}
            </div>

            {side === "buy" ? (
              <QuickSizeRow onPick={(usd) => setSizeStr(String(usd))} />
            ) : null}

            <PriceQuickRow
              tick={tickNumeric}
              bid={bestBid}
              ask={bestAsk}
              onPick={(p) =>
                setPriceStr(p.toFixed(decimalsForTick(tickNumeric)))
              }
            />

            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-muted">
              {side === "buy" ? (
                <>
                  <Field
                    label="Shares"
                    value={limitShares > 0 ? limitShares.toFixed(2) : "—"}
                  />
                  <Field
                    label="USDC balance"
                    value={fmtCollateral(allowance.balance)}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Receive (notional)"
                    value={
                      limitNotionalUsd > 0
                        ? `$${limitNotionalUsd.toFixed(limitNotionalUsd >= 1 ? 2 : 4)}`
                        : "—"
                    }
                  />
                  <Field
                    label={`${outcome.toUpperCase()} shares held`}
                    value={
                      allowance.balance != null
                        ? (Number(allowance.balance) / 1_000_000).toFixed(2)
                        : "—"
                    }
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3">
              {side === "buy" ? (
                <Input
                  label="Spend (USD)"
                  value={sizeStr}
                  onChange={setSizeStr}
                  prefix="$"
                  placeholder="5.00"
                  inputMode="decimal"
                />
              ) : (
                <SellSizeInput
                  value={sizeStr}
                  onChange={setSizeStr}
                  maxShares={maxShares}
                />
              )}
              {side === "buy" ? (
                <QuickSizeRow onPick={(usd) => setSizeStr(String(usd))} />
              ) : null}
            </div>

            <FillEstimateCard
              side={side}
              estimate={marketFill}
              mid={mid}
              outcome={outcome}
            />
          </>
        )}

        {errors.length > 0 ? (
          <ul className="mt-3 space-y-1 text-[12px] text-rose-300">
            {errors.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                {e}
              </li>
            ))}
          </ul>
        ) : null}

        {needsApproval ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <div className="text-[12px] text-amber-200">
              <div className="font-medium">
                {side === "buy"
                  ? "Approve pUSD for trading"
                  : `Approve ${outcome.toUpperCase()} shares for selling`}
              </div>
              <div className="text-amber-200/80">
                One-time on-chain transaction signed by your connected wallet.
                Auspex never custodies funds.
              </div>
            </div>
            <button
              type="button"
              onClick={approve}
              disabled={approving}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-amber-300/50 bg-amber-400/20 px-3 py-1.5 text-[12px] font-semibold text-amber-100 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approving ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : null}
              {approving ? "Approving…" : "Approve"}
            </button>
          </div>
        ) : blocker ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <span className="text-[12px] text-amber-200">{blocker}</span>
            {/^Insufficient pUSD/.test(blocker) && session.funderAddress ? (
              <BridgeButton
                toAddress={session.funderAddress}
                variant="secondary"
                label="Top up"
                className="shrink-0"
              />
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end text-[11px] text-muted-2">
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 ring-1 ring-emerald-400/30">
            0% fee · Polygon
          </span>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitDisabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
              outcome === "yes"
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                : "border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
            )}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {submitting
              ? "Placing…"
              : `${side === "buy" ? "Buy" : "Sell"} ${outcome.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderModeToggle({
  value,
  onChange,
}: {
  value: OrderMode;
  onChange: (m: OrderMode) => void;
}) {
  return (
    <div className="mt-3 inline-flex w-full rounded-md border border-border-strong bg-background p-0.5">
      <ModeButton
        active={value === "limit"}
        label="Limit"
        onClick={() => onChange("limit")}
      />
      <ModeButton
        active={value === "market"}
        label="Market"
        onClick={() => onChange("market")}
      />
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded px-2 py-1 text-[12px] font-semibold",
        active
          ? "bg-accent/15 text-accent ring-1 ring-accent/40"
          : "text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function FillEstimateCard({
  side,
  estimate,
  mid,
  outcome,
}: {
  side: SideMode;
  estimate: FillEstimate | null;
  mid: number | null;
  outcome: Outcome;
}) {
  if (!estimate) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-[12px] text-muted">
        Enter a size to see the estimated fill against the live book.
      </div>
    );
  }
  if (estimate.avgPrice == null) {
    return (
      <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
        No depth available — the book is empty on this side.
      </div>
    );
  }
  const slipAbs = estimate.slippagePct != null ? Math.abs(estimate.slippagePct) : null;
  const slipTone =
    slipAbs == null
      ? "text-muted-2"
      : slipAbs > 5
        ? "text-rose-300"
        : slipAbs > 1
          ? "text-amber-300"
          : "text-muted-2";

  return (
    <div className="mt-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-muted">Est. fill price</span>
        <span className="tabular text-foreground">
          ${estimate.avgPrice.toFixed(4)}
          {estimate.slippagePct != null ? (
            <span className={cn("ml-2 text-[10px]", slipTone)}>
              ({estimate.slippagePct >= 0 ? "+" : ""}
              {estimate.slippagePct.toFixed(2)}% vs mid)
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-muted">
          {side === "buy" ? `${outcome.toUpperCase()} shares received` : "USDC received"}
        </span>
        <span className="tabular text-foreground/85">
          {side === "buy"
            ? estimate.shares.toFixed(2)
            : `$${estimate.usdc.toFixed(2)}`}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-2">Mid</span>
        <span className="tabular text-muted-2">
          {mid != null ? `$${mid.toFixed(4)}` : "—"}
        </span>
      </div>
      {!estimate.fullyFillable ? (
        <p className="mt-2 text-[11px] text-amber-300">
          {side === "buy"
            ? `Partial fill: book depth covers $${estimate.usdc.toFixed(2)} of your order.`
            : `Partial fill: book depth absorbs ${estimate.shares.toFixed(2)} of your shares.`}
        </p>
      ) : null}
    </div>
  );
}

function SideButton({
  active,
  tone,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  tone: "emerald" | "rose";
  onClick: () => void;
  label: string;
  sub: string;
}) {
  const colours = active
    ? tone === "emerald"
      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
      : "border-rose-400/60 bg-rose-500/15 text-rose-200"
    : "border-border-strong bg-surface text-muted hover:bg-surface-2";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md border py-2 text-[13px] font-semibold",
        colours,
      )}
    >
      {label}
      <span className="tabular text-[11px] opacity-70">{sub}</span>
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  inputMode = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-2">
            {prefix}
          </span>
        ) : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "w-full rounded-md border border-border-strong bg-background py-1.5 font-mono text-[13px] text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-accent/40",
            prefix ? "pl-6" : "pl-3",
            suffix ? "pr-16" : "pr-3",
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-2">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function SellSizeInput({
  value,
  onChange,
  maxShares,
}: {
  value: string;
  onChange: (v: string) => void;
  maxShares?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-2">
        <span>Size (shares)</span>
        {maxShares != null && maxShares > 0 ? (
          <button
            type="button"
            onClick={() => onChange(maxShares.toFixed(2))}
            className="rounded bg-surface-2 px-1.5 py-0 text-[10px] font-semibold text-accent hover:bg-accent/15"
            title={`Sell all ${maxShares.toFixed(2)} held`}
          >
            Max {maxShares.toFixed(2)}
          </button>
        ) : null}
      </span>
      <span className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "w-full rounded-md border border-border-strong bg-background py-1.5 pl-3 pr-3 font-mono text-[13px] text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-accent/40",
          )}
        />
      </span>
    </label>
  );
}

function decimalsForTick(t: number): number {
  if (t >= 1) return 0;
  if (t >= 0.1) return 1;
  if (t >= 0.01) return 2;
  if (t >= 0.001) return 3;
  return 4;
}

function snapToTick(p: number, tick: number): number {
  return Math.round(p / tick) * tick;
}

function PriceQuickRow({
  tick,
  bid,
  ask,
  onPick,
}: {
  tick: number;
  bid: number | null;
  ask: number | null;
  onPick: (p: number) => void;
}) {
  const mid = bid != null && ask != null ? (bid + ask) / 2 : null;
  const fmt = (p: number) => p.toFixed(decimalsForTick(tick));
  const Pill = ({
    label,
    value,
  }: {
    label: string;
    value: number | null;
  }) => (
    <button
      type="button"
      disabled={value == null}
      onClick={() => value != null && onPick(snapToTick(value, tick))}
      className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      title={value == null ? "Order book unavailable" : `Snap to ${fmt(value)}`}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-foreground/90">
        {value != null ? fmt(value) : "—"}
      </span>
    </button>
  );

  return (
    <div className="mt-2 flex items-center gap-2">
      <Pill label="Bid" value={bid} />
      <Pill label="Mid" value={mid} />
      <Pill label="Ask" value={ask} />
    </div>
  );
}

/** Preset USD amounts users can click to fill the size input instead of
 *  typing. Same visual treatment as PriceQuickRow above so the two rows
 *  look like sibling affordances under their inputs. */
function QuickSizeRow({ onPick }: { onPick: (usd: number) => void }) {
  const presets: number[] = [10, 50, 100, 500];
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        Quick
      </span>
      {presets.map((usd) => (
        <button
          key={usd}
          type="button"
          onClick={() => onPick(usd)}
          className="inline-flex items-center rounded-md border border-border-strong bg-surface px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          title={`Set size to $${usd}`}
        >
          ${usd}
        </button>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-foreground/90">{value}</span>
    </div>
  );
}
