// FIFO realized P&L computation from Polymarket data-api `/trades` output,
// plus mark-to-market unrealized from `/positions`. Used by the Wallets
// tracker. Pure functions, no React, no fetching — testable in isolation.
//
// FIFO is the convention Polymarket itself uses for cost basis. The math:
//   For each asset (a specific outcome of a specific market), walk trades
//   in chronological order. BUYs push onto a queue at their per-share price.
//   SELLs pop from the front of the queue (oldest buys first), realising
//   `(sell_price - buy_price) * matched_size` per match. Any remaining
//   open position is marked to market using the position's curPrice.

export type Trade = {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string; // tokenid (specific outcome of a market)
  conditionId: string;
  size: number;
  price: number;
  timestamp: number; // unix seconds
  title?: string;
  slug?: string;
  outcome?: string;
  outcomeIndex?: number;
  transactionHash?: string;
};

// Minimal position shape we need. Compatible with useUserPositions.Position.
export type PnlPosition = {
  asset: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
};

export type PnlPoint = {
  /** Unix milliseconds — sample taken at the closing trade. */
  t: number;
  /** Cumulative realized P&L (USDC) up to and including this trade. */
  cumRealized: number;
};

export type WalletPnl = {
  /** Cumulative realized P&L across the wallet's entire history. */
  realizedTotal: number;
  /** Realized P&L within the last 30 days. */
  realized30d: number;
  /** Realized P&L within the last 7 days. */
  realized7d: number;
  /** Mark-to-market unrealized on currently open positions. */
  unrealized: number;
  /** Total (realized lifetime + unrealized). */
  total: number;
  /** Sample points for the P&L curve, in chronological order. */
  curve: PnlPoint[];
  /** Count of SELL trades — proxy for "positions closed". */
  closedCount: number;
  /** Count of SELLs where the per-trade realized P&L was positive. */
  wonCount: number;
};

const SECONDS_PER_DAY = 86_400;

/**
 * Compute realized + unrealized P&L for a wallet from its trades and
 * current open positions. Pure function — call with whatever data you've
 * fetched.
 */
export function computeWalletPnl(
  trades: Trade[],
  positions: PnlPosition[],
): WalletPnl {
  // Group trades by asset (outcome token).
  const byAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    if (!t.asset) continue;
    const arr = byAsset.get(t.asset) ?? [];
    arr.push(t);
    byAsset.set(t.asset, arr);
  }

  // Walk each asset's tape, FIFO-matching. Collect closing-trade samples
  // into a single flat curve sorted at the end.
  const closingTrades: { t: number; pnl: number }[] = [];
  let closedCount = 0;
  let wonCount = 0;

  for (const [, assetTrades] of byAsset) {
    assetTrades.sort((a, b) => a.timestamp - b.timestamp);

    // FIFO queue of open BUYs: each lot tracks remaining size and entry price.
    const buyLots: { size: number; price: number }[] = [];

    for (const trade of assetTrades) {
      if (!isFinite(trade.size) || !isFinite(trade.price) || trade.size <= 0) {
        continue;
      }

      if (trade.side === "BUY") {
        buyLots.push({ size: trade.size, price: trade.price });
        continue;
      }

      // SELL — match against FIFO buy queue.
      let remaining = trade.size;
      let realizedThisTrade = 0;
      while (remaining > 0 && buyLots.length > 0) {
        const lot = buyLots[0];
        const matched = Math.min(remaining, lot.size);
        realizedThisTrade += matched * (trade.price - lot.price);
        remaining -= matched;
        lot.size -= matched;
        if (lot.size <= 1e-9) buyLots.shift();
      }
      // If `remaining > 0` here, the wallet sold more than it bought — usually
      // a short or a redemption. We don't record realized P&L on the unmatched
      // portion since we don't have its cost basis. Polymarket's own
      // realizedPnl on /positions handles this edge case; we accept some drift
      // vs their server-side number in exchange for the FIFO simplicity.

      closingTrades.push({ t: trade.timestamp * 1000, pnl: realizedThisTrade });
      closedCount += 1;
      if (realizedThisTrade > 0) wonCount += 1;
    }
  }

  // Sort closing trades chronologically and build the cumulative curve.
  closingTrades.sort((a, b) => a.t - b.t);
  const curve: PnlPoint[] = [];
  let running = 0;
  for (const c of closingTrades) {
    running += c.pnl;
    curve.push({ t: c.t, cumRealized: running });
  }

  const realizedTotal = running;

  // Realized over windows: find the cumulative at the window's boundary and
  // subtract from final.
  const now = Date.now();
  const cutoff30 = now - 30 * SECONDS_PER_DAY * 1000;
  const cutoff7 = now - 7 * SECONDS_PER_DAY * 1000;

  function cumAt(cutoffMs: number): number {
    // Last sample BEFORE the cutoff. If no samples before, 0.
    let last = 0;
    for (const p of curve) {
      if (p.t < cutoffMs) last = p.cumRealized;
      else break;
    }
    return last;
  }

  const realized30d = realizedTotal - cumAt(cutoff30);
  const realized7d = realizedTotal - cumAt(cutoff7);

  // Unrealized = sum of per-position cashPnl (Polymarket's server-side mark).
  // Could also re-derive from (currentValue - size*avgPrice); these tend to
  // match. We trust /positions' cashPnl since it uses live order-book mid.
  const unrealized = positions.reduce(
    (s, p) => s + (isFinite(p.cashPnl) ? p.cashPnl : 0),
    0,
  );

  return {
    realizedTotal,
    realized30d,
    realized7d,
    unrealized,
    total: realizedTotal + unrealized,
    curve,
    closedCount,
    wonCount,
  };
}
