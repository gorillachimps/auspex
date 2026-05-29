import { z } from "zod";

export const FamilySchema = z.enum([
  "binance_price",
  "fdv_after_launch",
  "holdings_event",
  "public_sale",
  "subjective",
  "unmatched",
]);
export type Family = z.infer<typeof FamilySchema>;

export const LiveStateSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("live"),
    current_value: z.number(),
    current_value_unit: z.string().optional(),
    threshold_value: z.number().nullable().optional(),
    threshold_op: z.string().nullable().optional(),
    already_triggered: z.boolean().optional(),
    distance_to_trigger_pct: z.number().nullable().optional(),
  }),
  z.object({
    state: z.literal("deferred"),
    ambiguity: z.boolean().optional(),
    reason: z.string().optional(),
  }),
]);

export const EnrichedMarketSchema = z
  .object({
    id: z.string(),
    question: z.string(),
    slug: z.string(),
    event_title: z.string().optional(),
    end_date: z.string().nullable().optional(),
    volume_total: z.number().nullable().optional(),
    volume_24h: z.number().nullable().optional(),
    liquidity: z.number().nullable().optional(),
    best_bid: z.number().nullable().optional(),
    best_ask: z.number().nullable().optional(),
    last_price: z.number().nullable().optional(),
    implied_yes: z.number().nullable().optional(),
    one_hour_change: z.number().nullable().optional(),
    one_day_change: z.number().nullable().optional(),
    one_week_change: z.number().nullable().optional(),
    one_month_change: z.number().nullable().optional(),
    neg_risk: z.boolean().optional(),
    tick_size: z.number().optional(),
    token_yes: z.string().optional(),
    token_no: z.string().optional(),
    family: FamilySchema,
    source: z.string().optional(),
    pair: z.string().optional(),
    symbol: z.string().optional(),
    entity: z.string().optional(),
    action: z.string().optional(),
    asset: z.string().optional(),
    threshold_value: z.number().optional(),
    threshold_op: z.string().optional(),
    currency: z.string().optional(),
    ambiguity: z.boolean().optional(),
    live: LiveStateSchema.optional(),
    resolution_confidence: z.number().nullable().optional(),
  })
  .passthrough();
export type EnrichedMarket = z.infer<typeof EnrichedMarketSchema>;

export type TableRow = {
  id: string;
  question: string;
  slug: string;
  family: Family;
  source: string | null;
  pair: string | null;
  symbol: string | null;
  currency: string | null;
  entity: string | null;
  action: string | null;
  asset: string | null;
  /** Token IDs needed to place orders (Conditional Token IDs). */
  tokenYes: string | null;
  tokenNo: string | null;
  tickSize: number | null;
  negRisk: boolean;
  impliedYes: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  currentValue: number | null;
  currentValueUnit: string | null;
  thresholdValue: number | null;
  thresholdOp: string | null;
  distancePct: number | null;
  alreadyTriggered: boolean;
  liveState: "live" | "deferred";
  liveReason: string | null;
  rc: number | null;
  endDate: string | null;
  oneHourChange: number | null;
  oneDayChange: number | null;
  oneWeekChange: number | null;
  oneMonthChange: number | null;
  volumeTotal: number;
  volume24h: number;
  liquidity: number | null;
};

export function projectToRow(m: EnrichedMarket): TableRow {
  const live = m.live;
  const isLive = live?.state === "live";
  return {
    id: m.id,
    question: m.question,
    slug: m.slug,
    family: m.family,
    source: m.source ?? null,
    pair: m.pair ?? null,
    symbol: m.symbol ?? null,
    currency: m.currency ?? null,
    entity: m.entity ?? null,
    action: m.action ?? null,
    asset: m.asset ?? null,
    tokenYes: m.token_yes ?? null,
    tokenNo: m.token_no ?? null,
    tickSize: m.tick_size ?? null,
    negRisk: !!m.neg_risk,
    impliedYes: m.implied_yes ?? null,
    bestBid: m.best_bid ?? null,
    bestAsk: m.best_ask ?? null,
    currentValue: isLive ? (live.current_value ?? null) : null,
    currentValueUnit: isLive ? (live.current_value_unit ?? null) : null,
    thresholdValue: isLive ? (live.threshold_value ?? null) : (m.threshold_value ?? null),
    thresholdOp: isLive ? (live.threshold_op ?? null) : (m.threshold_op ?? null),
    distancePct: isLive ? (live.distance_to_trigger_pct ?? null) : null,
    alreadyTriggered: isLive ? !!live.already_triggered : false,
    liveState: live?.state ?? "deferred",
    liveReason: live?.state === "deferred" ? (live.reason ?? null) : null,
    rc: m.resolution_confidence ?? null,
    endDate: m.end_date ?? null,
    oneHourChange: m.one_hour_change ?? null,
    oneDayChange: m.one_day_change ?? null,
    oneWeekChange: m.one_week_change ?? null,
    oneMonthChange: m.one_month_change ?? null,
    volumeTotal: m.volume_total ?? 0,
    volume24h: m.volume_24h ?? 0,
    liquidity: m.liquidity ?? null,
  };
}
