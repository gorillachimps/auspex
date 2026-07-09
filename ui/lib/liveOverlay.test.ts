import { describe, expect, it } from "vitest";
import { applyLivePrices } from "./liveOverlay";
import type { TableRow } from "./types";

// Minimal live row; overlay only reads liveState/pair/threshold*/current*.
function row(over: Partial<TableRow>): TableRow {
  return {
    liveState: "live",
    pair: "BTC/USDT",
    thresholdValue: 62000,
    thresholdOp: ">=",
    currentValue: 60000,
    alreadyTriggered: false,
    distancePct: (62000 - 60000) / 62000,
    ...over,
  } as TableRow;
}

const P = { BTCUSDT: 62185, ETHUSDT: 1746 };

describe("applyLivePrices — >= markets", () => {
  it("flips to triggered when spot crosses above threshold", () => {
    const { rows, updated } = applyLivePrices(
      [row({ thresholdValue: 62000, thresholdOp: ">=", currentValue: 60000 })],
      P,
    );
    expect(updated).toBe(1);
    expect(rows[0].currentValue).toBe(62185);
    expect(rows[0].alreadyTriggered).toBe(true);
    // spot above threshold → distance goes negative (past the line)
    expect(rows[0].distancePct).toBeCloseTo((62000 - 62185) / 62000, 10);
  });

  it("stays below with a positive distance when spot is under threshold", () => {
    const { rows } = applyLivePrices(
      [row({ thresholdValue: 70000, thresholdOp: ">=" })],
      P,
    );
    expect(rows[0].alreadyTriggered).toBe(false);
    expect(rows[0].distancePct).toBeCloseTo((70000 - 62185) / 70000, 10);
    expect(rows[0].distancePct).toBeGreaterThan(0);
  });
});

describe("applyLivePrices — <= markets", () => {
  it("triggers when spot is at/below threshold", () => {
    const { rows } = applyLivePrices(
      [row({ thresholdValue: 65000, thresholdOp: "<=", currentValue: 66000 })],
      P,
    );
    expect(rows[0].alreadyTriggered).toBe(true); // 62185 <= 65000
    expect(rows[0].distancePct).toBeCloseTo((62185 - 65000) / 65000, 10);
  });

  it("not triggered when spot is above a <= threshold", () => {
    const { rows } = applyLivePrices(
      [row({ thresholdValue: 60000, thresholdOp: "<=" })],
      P,
    );
    expect(rows[0].alreadyTriggered).toBe(false); // 62185 > 60000
    expect(rows[0].distancePct).toBeCloseTo((62185 - 60000) / 60000, 10);
  });
});

describe("applyLivePrices — pass-through (never mutate)", () => {
  it("leaves non-live rows untouched", () => {
    const r = row({ liveState: "deferred" as TableRow["liveState"] });
    const { rows, updated } = applyLivePrices([r], P);
    expect(updated).toBe(0);
    expect(rows[0]).toBe(r); // same reference
  });

  it("leaves rows whose symbol isn't in the live set", () => {
    const r = row({ pair: "DOGE/USDT" });
    const { rows, updated } = applyLivePrices([r], P);
    expect(updated).toBe(0);
    expect(rows[0]).toBe(r);
  });

  it("leaves zero-threshold rows (undefined fraction)", () => {
    const r = row({ thresholdValue: 0 });
    expect(applyLivePrices([r], P).updated).toBe(0);
  });

  it("leaves rows with no pair or missing op", () => {
    expect(applyLivePrices([row({ pair: null })], P).updated).toBe(0);
    expect(applyLivePrices([row({ thresholdOp: null })], P).updated).toBe(0);
  });

  it("does not count a no-op when live spot equals the snapshot", () => {
    const r = row({ currentValue: 62185, thresholdValue: 62000, thresholdOp: ">=", alreadyTriggered: true, distancePct: (62000 - 62185) / 62000 });
    const { updated } = applyLivePrices([r], P);
    expect(updated).toBe(0);
  });
});
