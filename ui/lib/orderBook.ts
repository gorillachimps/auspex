// Pure order-book math, extracted from OrderTicket so it can be unit-tested
// without rendering React. No imports from component code — takes plain
// price/size level arrays.

/** A single order-book level. Matches the {price, size} string shape the
 *  Polymarket CLOB + our WS layer (lib/useLiveMarket Level) both produce. */
export type PriceLevel = { price: string; size: string };

export type MarketSide = "buy" | "sell";

export type FillEstimate = {
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

const EMPTY: FillEstimate = {
  avgPrice: null,
  shares: 0,
  usdc: 0,
  slippagePct: null,
  fullyFillable: false,
};

/**
 * Walk the order book to estimate the volume-weighted fill for a market order.
 * For BUY we hit the asks (lowest price first); for SELL we hit the bids
 * (highest price first). Polymarket's book convention puts the inside-of-book
 * at `array[length - 1]` on BOTH sides, so we reverse to iterate best→worst.
 *
 * @param amount BUY: USD to spend. SELL: shares to sell.
 */
export function estimateMarketFill({
  side,
  amount,
  asks,
  bids,
  mid,
}: {
  side: MarketSide;
  amount: number;
  asks: PriceLevel[];
  bids: PriceLevel[];
  mid: number | null;
}): FillEstimate {
  if (!isFinite(amount) || amount <= 0) return EMPTY;
  const levels = side === "buy" ? [...asks].reverse() : [...bids].reverse();
  if (levels.length === 0) return EMPTY;

  let sharesAccum = 0;
  let usdcAccum = 0;
  let remaining = amount;
  for (const lvl of levels) {
    const price = parseFloat(lvl.price);
    const sizeAvailable = parseFloat(lvl.size);
    if (!isFinite(price) || !isFinite(sizeAvailable) || sizeAvailable <= 0)
      continue;
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
  return {
    avgPrice,
    shares: sharesAccum,
    usdc: usdcAccum,
    slippagePct,
    fullyFillable,
  };
}
