import {
  RelayClient,
  RelayerTxType,
} from "@polymarket/builder-relayer-client";
import { encodeFunctionData, parseAbi, type WalletClient } from "viem";
import { polygon } from "viem/chains";
import type { ProxyType } from "./polymarketDerive";
import type { Position } from "./useUserPositions";

/**
 * Gasless redemption of resolved Polymarket positions through the builder
 * relayer. The winnings land in the user's funder wallet (Safe / proxy /
 * deposit wallet) — the same balance they trade from.
 *
 * Contract addresses mirror @polymarket/clob-client-v2's Polygon config
 * (asserted equal in redeem.test.ts so drift fails CI):
 * - ConditionalTokens (CTF): where binary-market outcome tokens live.
 * - NegRiskAdapter: multi-outcome ("negative risk") markets redeem through
 *   the adapter, which converts wrapped collateral back to the payout token.
 */
export const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
export const NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

/**
 * CTF.redeemPositions pays out for the collateral the market was split from.
 * Polymarket has two eras: pUSD (CLOB v2, 2026-04-28+) and USDC.e (before).
 * data-api position rows don't say which era a condition is from, and calling
 * with the wrong collateral is a harmless no-op (different positionId → zero
 * balance → zero transfer). So binary redemptions submit one call per
 * collateral in the same relayed batch — one pays, the other no-ops, the
 * relayer covers gas either way.
 */
export const COLLATERALS = [
  "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", // pUSD (v2)
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (legacy)
] as const;

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const CTF_ABI = parseAbi([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);
const NEG_RISK_ABI = parseAbi([
  "function redeemPositions(bytes32 _conditionId, uint256[] _amounts)",
]);

export type RedeemTxn = { to: string; data: string; value: string };

/**
 * Build the on-chain calls that claim every redeemable position in the list.
 * Groups by conditionId: binary conditions redeem the full balance of both
 * outcome slots via the CTF (once per collateral era, see COLLATERALS);
 * neg-risk conditions redeem exact amounts via the adapter.
 */
export function buildRedeemTxns(positions: Position[]): RedeemTxn[] {
  const byCondition = new Map<string, Position[]>();
  for (const p of positions) {
    if (!p.redeemable || !p.conditionId) continue;
    const group = byCondition.get(p.conditionId) ?? [];
    group.push(p);
    byCondition.set(p.conditionId, group);
  }

  const txns: RedeemTxn[] = [];
  for (const [conditionId, group] of byCondition) {
    const negRisk = group.some((p) => p.negativeRisk);
    if (negRisk) {
      // amounts indexed by outcome: [YES, NO], 6-decimal integer units.
      // floor() so float dust can never exceed the on-chain balance — an
      // over-ask reverts the whole batch, undershooting strands ≤$0.000001.
      const amounts: [bigint, bigint] = [0n, 0n];
      for (const p of group) {
        const idx = p.outcomeIndex === 0 ? 0 : 1;
        amounts[idx] += BigInt(Math.floor(p.size * 1e6));
      }
      if (amounts[0] === 0n && amounts[1] === 0n) continue;
      txns.push({
        to: NEG_RISK_ADAPTER,
        data: encodeFunctionData({
          abi: NEG_RISK_ABI,
          functionName: "redeemPositions",
          args: [conditionId as `0x${string}`, [amounts[0], amounts[1]]],
        }),
        value: "0",
      });
    } else {
      // indexSets [1, 2] = both outcome slots; CTF redeems whatever balance
      // the caller holds in each, so one call covers YES and NO together.
      for (const collateral of COLLATERALS) {
        txns.push({
          to: CONDITIONAL_TOKENS,
          data: encodeFunctionData({
            abi: CTF_ABI,
            functionName: "redeemPositions",
            args: [
              collateral,
              ZERO_BYTES32,
              conditionId as `0x${string}`,
              [1n, 2n],
            ],
          }),
          value: "0",
        });
      }
    }
  }
  return txns;
}

export type RedeemResult = {
  transactionHash: string;
  state: string;
};

/**
 * Submit the redemption batch through the relayer, signed by the connected
 * wallet, executed as the funder. Resolves when the relayer reports the
 * transaction mined/confirmed; throws on failure or timeout.
 *
 * The RelayClient is pointed at our /api/relay proxy, which attaches the
 * builder credentials server-side — no builderConfig in the browser.
 */
export async function redeemGasless({
  walletClient,
  funder,
  proxyType,
  positions,
}: {
  walletClient: WalletClient;
  funder: string;
  proxyType: ProxyType;
  positions: Position[];
}): Promise<RedeemResult> {
  const txns = buildRedeemTxns(positions);
  if (txns.length === 0) {
    throw new Error("nothing to redeem");
  }

  const client = new RelayClient(
    "/api/relay",
    polygon.id,
    walletClient,
    undefined,
    proxyType === "proxy" ? RelayerTxType.PROXY : RelayerTxType.SAFE,
    { chain: polygon },
  );

  const resp =
    proxyType === "deposit"
      ? await client.executeDepositWalletBatch(
          txns.map((t) => ({ target: t.to, value: t.value, data: t.data })),
          funder,
          // Signature valid for an hour — plenty for one relayed batch.
          String(Math.floor(Date.now() / 1000) + 3600),
        )
      : await client.execute(txns, "auspex-redeem");

  const finalTx = await resp.wait();
  if (!finalTx) {
    throw new Error("relayer reported failure (or timed out) — try again, or claim on Polymarket");
  }
  return {
    transactionHash: finalTx.transactionHash,
    state: finalTx.state,
  };
}
