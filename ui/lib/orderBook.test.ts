import { describe, it, expect } from "vitest";
import { estimateMarketFill } from "./orderBook";

// Polymarket book convention: inside-of-book (best price) sits at array[last].
describe("estimateMarketFill", () => {
  it("BUY: spends USD against the best ask", () => {
    const f = estimateMarketFill({
      side: "buy",
      amount: 10, // $10
      asks: [{ price: "0.50", size: "100" }], // best ask 0.50, deep
      bids: [],
      mid: 0.5,
    });
    expect(f.shares).toBeCloseTo(20, 6); // $10 / 0.50
    expect(f.usdc).toBeCloseTo(10, 6);
    expect(f.avgPrice).toBeCloseTo(0.5, 6);
    expect(f.fullyFillable).toBe(true);
  });

  it("SELL: sells shares into the best bid", () => {
    const f = estimateMarketFill({
      side: "sell",
      amount: 10, // 10 shares
      asks: [],
      bids: [{ price: "0.40", size: "50" }],
      mid: 0.4,
    });
    expect(f.shares).toBeCloseTo(10, 6);
    expect(f.usdc).toBeCloseTo(4, 6); // 10 * 0.40
    expect(f.avgPrice).toBeCloseTo(0.4, 6);
    expect(f.fullyFillable).toBe(true);
  });

  it("BUY: walks multiple levels best→worst (array[last] is best)", () => {
    const f = estimateMarketFill({
      side: "buy",
      amount: 10,
      // worst→best ordering; best (0.50) at the end
      asks: [
        { price: "0.60", size: "100" },
        { price: "0.50", size: "10" }, // 10 shares * 0.50 = $5 of depth
      ],
      bids: [],
      mid: 0.55,
    });
    // $5 fills at 0.50 (10 shares), remaining $5 fills at 0.60 (8.333 shares)
    expect(f.shares).toBeCloseTo(10 + 5 / 0.6, 5);
    expect(f.usdc).toBeCloseTo(10, 6);
    expect(f.avgPrice).toBeCloseTo(10 / (10 + 5 / 0.6), 5);
    expect(f.fullyFillable).toBe(true);
  });

  it("BUY: not fully fillable when the book is too thin", () => {
    const f = estimateMarketFill({
      side: "buy",
      amount: 100,
      asks: [{ price: "0.50", size: "10" }], // only $5 of depth
      bids: [],
      mid: 0.5,
    });
    expect(f.usdc).toBeCloseTo(5, 6);
    expect(f.shares).toBeCloseTo(10, 6);
    expect(f.fullyFillable).toBe(false);
  });

  it("empty book → empty estimate (drives the 'no depth' UI)", () => {
    const f = estimateMarketFill({ side: "buy", amount: 10, asks: [], bids: [], mid: null });
    expect(f.shares).toBe(0);
    expect(f.avgPrice).toBeNull();
    expect(f.fullyFillable).toBe(false);
  });

  it("non-positive amount → empty estimate", () => {
    const f = estimateMarketFill({
      side: "buy",
      amount: 0,
      asks: [{ price: "0.5", size: "100" }],
      bids: [],
      mid: 0.5,
    });
    expect(f.shares).toBe(0);
  });

  it("computes slippage vs mid", () => {
    const f = estimateMarketFill({
      side: "buy",
      amount: 10,
      asks: [{ price: "0.55", size: "100" }],
      bids: [],
      mid: 0.5,
    });
    // avg 0.55 vs mid 0.50 → +10pp
    expect(f.slippagePct).toBeCloseTo(10, 4);
  });

  it("SELL: below-mid fill is positive (unfavorable) slippage", () => {
    const f = estimateMarketFill({
      side: "sell",
      amount: 10,
      asks: [],
      bids: [{ price: "0.40", size: "100" }],
      mid: 0.5,
    });
    // Selling at 0.40 vs mid 0.50 is 20% unfavorable → +20, not -20.
    expect(f.slippagePct).toBeCloseTo(20, 4);
  });

  it("SELL: above-mid fill is negative (favorable) slippage", () => {
    const f = estimateMarketFill({
      side: "sell",
      amount: 10,
      asks: [],
      bids: [{ price: "0.55", size: "100" }],
      mid: 0.5,
    });
    // Selling above mid is favorable → negative slippage.
    expect(f.slippagePct).toBeCloseTo(-10, 4);
  });
});
