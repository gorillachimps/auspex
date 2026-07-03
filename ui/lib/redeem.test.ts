import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi, toFunctionSelector } from "viem";
import {
  buildRedeemTxns,
  COLLATERALS,
  CONDITIONAL_TOKENS,
  NEG_RISK_ADAPTER,
} from "./redeem";
import type { Position } from "./useUserPositions";

const CTF_ABI = parseAbi([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);
const NEG_RISK_ABI = parseAbi([
  "function redeemPositions(bytes32 _conditionId, uint256[] _amounts)",
]);

const CONDITION_A =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONDITION_B =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function pos(overrides: Partial<Position>): Position {
  return {
    asset: "1",
    slug: "test-market",
    conditionId: CONDITION_A,
    title: "Test market",
    outcome: "Yes",
    outcomeIndex: 0,
    size: 10,
    avgPrice: 0.5,
    curPrice: 1,
    currentValue: 10,
    cashPnl: 5,
    percentPnl: 100,
    redeemable: true,
    endDate: "2026-07-01T00:00:00Z",
    negativeRisk: false,
    ...overrides,
  } as Position;
}

describe("contract addresses", () => {
  // Mirror @polymarket/clob-client-v2's Polygon config — if these ever drift,
  // redemptions would silently no-op (wrong positionIds burn nothing).
  it("match Polymarket's published Polygon deployments", () => {
    expect(CONDITIONAL_TOKENS).toBe(
      "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
    );
    expect(NEG_RISK_ADAPTER).toBe(
      "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
    );
    expect(COLLATERALS).toEqual([
      "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
    ]);
  });
});

describe("buildRedeemTxns — binary (CTF) conditions", () => {
  it("emits one CTF call per collateral era, both outcome slots", () => {
    const txns = buildRedeemTxns([pos({})]);
    expect(txns).toHaveLength(2);
    for (const [i, txn] of txns.entries()) {
      expect(txn.to).toBe(CONDITIONAL_TOKENS);
      expect(txn.value).toBe("0");
      expect(
        txn.data.startsWith(toFunctionSelector(CTF_ABI[0])),
      ).toBe(true);
      const { args } = decodeFunctionData({
        abi: CTF_ABI,
        data: txn.data as `0x${string}`,
      });
      expect(args[0]).toBe(COLLATERALS[i]);
      expect(args[2]).toBe(CONDITION_A);
      expect(args[3]).toEqual([1n, 2n]); // both outcome index sets
    }
  });

  it("groups YES + NO of the same condition into the same calls", () => {
    const txns = buildRedeemTxns([
      pos({ asset: "1", outcomeIndex: 0 }),
      pos({ asset: "2", outcomeIndex: 1, outcome: "No" }),
    ]);
    // One condition → still just the per-collateral pair, not four calls.
    expect(txns).toHaveLength(2);
  });

  it("emits separate calls per distinct condition", () => {
    const txns = buildRedeemTxns([
      pos({ asset: "1", conditionId: CONDITION_A }),
      pos({ asset: "2", conditionId: CONDITION_B }),
    ]);
    expect(txns).toHaveLength(4);
    const conditions = txns.map(
      (t) =>
        decodeFunctionData({ abi: CTF_ABI, data: t.data as `0x${string}` })
          .args[2],
    );
    expect(new Set(conditions)).toEqual(new Set([CONDITION_A, CONDITION_B]));
  });
});

describe("buildRedeemTxns — neg-risk conditions", () => {
  it("redeems exact 6-decimal amounts through the adapter", () => {
    const txns = buildRedeemTxns([
      pos({ negativeRisk: true, outcomeIndex: 1, outcome: "No", size: 16 }),
    ]);
    expect(txns).toHaveLength(1);
    expect(txns[0].to).toBe(NEG_RISK_ADAPTER);
    expect(
      txns[0].data.startsWith(toFunctionSelector(NEG_RISK_ABI[0])),
    ).toBe(true);
    const { args } = decodeFunctionData({
      abi: NEG_RISK_ABI,
      data: txns[0].data as `0x${string}`,
    });
    expect(args[0]).toBe(CONDITION_A);
    expect(args[1]).toEqual([0n, 16_000_000n]); // [YES, NO]
  });

  it("aggregates YES and NO amounts of the same condition", () => {
    const txns = buildRedeemTxns([
      pos({ negativeRisk: true, asset: "1", outcomeIndex: 0, size: 7.5 }),
      pos({
        negativeRisk: true,
        asset: "2",
        outcomeIndex: 1,
        outcome: "No",
        size: 3.2,
      }),
    ]);
    expect(txns).toHaveLength(1);
    const { args } = decodeFunctionData({
      abi: NEG_RISK_ABI,
      data: txns[0].data as `0x${string}`,
    });
    expect(args[1]).toEqual([7_500_000n, 3_200_000n]);
  });

  it("floors float dust so amounts can never exceed on-chain balance", () => {
    // 1.005 * 1e6 = 1004999.999… in float — must floor to 1_004_999, never
    // round to 1_005_000 (an over-ask reverts the whole relayed batch).
    const txns = buildRedeemTxns([
      pos({ negativeRisk: true, size: 1.005 }),
    ]);
    const { args } = decodeFunctionData({
      abi: NEG_RISK_ABI,
      data: txns[0].data as `0x${string}`,
    });
    expect(args[1][0]).toBe(1_004_999n);
  });
});

describe("buildRedeemTxns — filtering", () => {
  it("ignores non-redeemable positions and empty input", () => {
    expect(buildRedeemTxns([])).toEqual([]);
    expect(buildRedeemTxns([pos({ redeemable: false })])).toEqual([]);
    expect(
      buildRedeemTxns([pos({ conditionId: "" as never })]),
    ).toEqual([]);
  });
});
