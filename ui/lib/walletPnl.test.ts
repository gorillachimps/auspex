import { describe, it, expect } from "vitest";
import { computeWalletPnl, deriveTraderTags, type Trade } from "./walletPnl";

function trade(
  p: Partial<Trade> & Pick<Trade, "side" | "asset" | "size" | "price">,
): Trade {
  return {
    proxyWallet: "0xWALLET",
    conditionId: "cond",
    timestamp: 1_700_000_000,
    ...p,
  } as Trade;
}

describe("computeWalletPnl — FIFO realized P&L", () => {
  it("realizes profit on a simple round trip", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 10, price: 0.4, timestamp: 1 }),
        trade({ side: "SELL", asset: "A", size: 10, price: 0.6, timestamp: 2 }),
      ],
      [],
    );
    expect(r.realizedTotal).toBeCloseTo(2, 6); // 10 * (0.6 - 0.4)
    expect(r.closedCount).toBe(1);
    expect(r.wonCount).toBe(1);
  });

  it("matches OLDEST lots first across multiple buys (FIFO)", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 10, price: 0.4, timestamp: 1 }),
        trade({ side: "BUY", asset: "A", size: 10, price: 0.5, timestamp: 2 }),
        trade({ side: "SELL", asset: "A", size: 15, price: 0.6, timestamp: 3 }),
      ],
      [],
    );
    // 10@0.40 -> 10*0.20 = 2.00 ; 5@0.50 -> 5*0.10 = 0.50 ; total 2.50
    expect(r.realizedTotal).toBeCloseTo(2.5, 6);
  });

  it("records a loss (wonCount stays 0)", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 10, price: 0.6, timestamp: 1 }),
        trade({ side: "SELL", asset: "A", size: 10, price: 0.4, timestamp: 2 }),
      ],
      [],
    );
    expect(r.realizedTotal).toBeCloseTo(-2, 6);
    expect(r.wonCount).toBe(0);
    expect(r.closedCount).toBe(1);
  });

  it("only realizes the portion with a cost basis on an oversell", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 5, price: 0.4, timestamp: 1 }),
        trade({ side: "SELL", asset: "A", size: 10, price: 0.6, timestamp: 2 }),
      ],
      [],
    );
    expect(r.realizedTotal).toBeCloseTo(1, 6); // only 5 matched: 5 * 0.20
  });

  it("skips unknown sides rather than mis-counting them (the unvalidated-API lesson)", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 10, price: 0.4, timestamp: 1 }),
        trade({
          side: "REDEEM" as Trade["side"],
          asset: "A",
          size: 10,
          price: 1,
          timestamp: 2,
        }),
      ],
      [],
    );
    expect(r.realizedTotal).toBe(0);
    expect(r.closedCount).toBe(0);
  });

  it("does not cross-match across different assets", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 10, price: 0.4, timestamp: 1 }),
        trade({ side: "SELL", asset: "B", size: 10, price: 0.6, timestamp: 2 }),
      ],
      [],
    );
    expect(r.realizedTotal).toBe(0); // B's SELL has no matching B BUY
  });

  it("skips non-positive / non-finite sizes without crashing", () => {
    const r = computeWalletPnl(
      [
        trade({ side: "BUY", asset: "A", size: 0, price: 0.4, timestamp: 1 }),
        trade({ side: "SELL", asset: "A", size: NaN, price: 0.6, timestamp: 2 }),
      ],
      [],
    );
    expect(r.realizedTotal).toBe(0);
    expect(r.closedCount).toBe(0);
  });

  it("adds unrealized from open positions' cashPnl", () => {
    const r = computeWalletPnl(
      [],
      [
        { asset: "A", size: 10, avgPrice: 0.5, currentValue: 6, cashPnl: 1.0 },
        { asset: "B", size: 5, avgPrice: 0.4, currentValue: 1.5, cashPnl: -0.5 },
      ],
    );
    expect(r.unrealized).toBeCloseTo(0.5, 6);
    expect(r.total).toBeCloseTo(0.5, 6); // realized 0 + unrealized 0.5
  });
});

describe("deriveTraderTags", () => {
  it("flags a thin history as a New wallet (caution)", () => {
    const t = [trade({ side: "BUY", asset: "A", size: 1, price: 0.5, timestamp: 1 })];
    const tags = deriveTraderTags(computeWalletPnl(t, []), t);
    expect(tags.some((x) => x.label === "New wallet")).toBe(true);
  });
});
