import type { TableRow } from "./types";

/**
 * Overlay live Binance prices onto snapshot rows: recompute current value,
 * distance-to-trigger, and the triggered flag from the live spot. Mirrors
 * enrich_state.py's enrich_binance_price exactly:
 *
 *   >=  : triggered = spot >= threshold ; distance = (threshold - spot)/threshold
 *   <=  : triggered = spot <= threshold ; distance = (spot - threshold)/threshold
 *
 * distance is a signed fraction (0.716 = needs +71.6%), same units the snapshot
 * stores and the UI renders. Only Binance-priced live rows with a fetched spot
 * are touched; everything else (deferred families, missing symbol, zero/absent
 * threshold) is returned unchanged, so a stale-price fallback is a no-op.
 */
export function applyLivePrices(
  rows: TableRow[],
  prices: Record<string, number>,
): { rows: TableRow[]; updated: number } {
  let updated = 0;
  const out = rows.map((r) => {
    if (r.liveState !== "live" || !r.pair) return r;
    if (r.thresholdValue == null || !r.thresholdOp) return r;
    // Zero threshold makes the fraction undefined — matches the Python guard.
    if (r.thresholdValue === 0) return r;

    const symbol = r.pair.replace("/", "");
    const spot = prices[symbol];
    if (spot == null || !Number.isFinite(spot)) return r;

    const threshold = r.thresholdValue;
    let alreadyTriggered: boolean;
    let distancePct: number;
    if (r.thresholdOp === ">=") {
      alreadyTriggered = spot >= threshold;
      distancePct = (threshold - spot) / threshold;
    } else {
      alreadyTriggered = spot <= threshold;
      distancePct = (spot - threshold) / threshold;
    }

    // Nothing changed (spot equal to snapshot) — skip the allocation + count.
    if (
      r.currentValue === spot &&
      r.alreadyTriggered === alreadyTriggered &&
      r.distancePct === distancePct
    ) {
      return r;
    }
    updated++;
    return { ...r, currentValue: spot, alreadyTriggered, distancePct };
  });
  return { rows: out, updated };
}
