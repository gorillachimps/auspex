"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { polymarketMarketWs } from "@/lib/polymarketWs";
import { fmtUSDCompact } from "@/lib/format";

const fmtCompactUSD = fmtUSDCompact;

const MAX_SAMPLES = 500;

// Notional-size buckets in USDC. Edges chosen so the most common Polymarket
// fills (~$5–$200 retail) get separated from the rarer-but-significant
// whale fills ($1k+).
const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "<$50", min: 0, max: 50 },
  { label: "$50–200", min: 50, max: 200 },
  { label: "$200–1k", min: 200, max: 1_000 },
  { label: "$1k–5k", min: 1_000, max: 5_000 },
  { label: "$5k+", min: 5_000, max: Infinity },
];

const BAR_COLOURS = [
  "#374151", // <$50 — quiet retail
  "#4f46e5", // $50–200 — typical retail
  "#7c3aed", // $200–1k — engaged
  "#c026d3", // $1k–5k — sharp / professional
  "#f59e0b", // $5k+ — whale
];

type Sample = {
  id: string;
  notionalUsd: number;
  timestampMs: number;
};

type Props = {
  tokenYes: string | null;
  tokenNo: string | null;
};

/**
 * Live histogram of fill sizes for this market — answers "is the activity
 * here mostly retail or are there meaningful whales?". Subscribes to the
 * same WS `last_trade_price` feed the recent-trades ticker uses, so it
 * costs no extra connection. Accumulates fills as they print, capped at
 * MAX_SAMPLES; the page lifespan is typically minutes so the cap is rarely
 * hit. Empty state is honest: a quiet market produces an empty histogram.
 *
 * The ref-counted singleton lets the market detail page mount this
 * alongside RecentTradesView and OrderBookView with zero extra WS overhead.
 */
export function TradeSizeDistribution({ tokenYes, tokenNo }: Props) {
  const [samples, setSamples] = useState<Sample[]>([]);

  const depKey = useMemo(
    () => [tokenYes ?? "", tokenNo ?? ""].join("|"),
    [tokenYes, tokenNo],
  );

  useEffect(() => {
    const ids = [tokenYes, tokenNo].filter((x): x is string => !!x);
    if (ids.length === 0) {
      setSamples([]);
      return;
    }
    setSamples([]);
    const unsub = polymarketMarketWs.subscribe(ids, {
      onLastTrade: (e) => {
        const price = parseFloat(e.price as string);
        const size = parseFloat(e.size as string);
        if (!isFinite(price) || !isFinite(size) || size <= 0) return;
        const tsRaw = e.timestamp as string | undefined;
        const tsNum = tsRaw ? parseFloat(tsRaw) : NaN;
        const tsMs = isFinite(tsNum)
          ? tsNum > 1e12
            ? tsNum
            : tsNum * 1000
          : Date.now();
        const sample: Sample = {
          id: `${tsMs}-${e.asset_id ?? ""}-${e.side ?? ""}`,
          notionalUsd: price * size,
          timestampMs: tsMs,
        };
        setSamples((prev) => {
          if (prev.length > 0 && prev[0].id === sample.id) return prev;
          const next = [sample, ...prev];
          return next.length > MAX_SAMPLES
            ? next.slice(0, MAX_SAMPLES)
            : next;
        });
      },
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  const buckets = useMemo(() => {
    const counts = BUCKETS.map(() => 0);
    const totals = BUCKETS.map(() => 0);
    for (const s of samples) {
      for (let i = 0; i < BUCKETS.length; i++) {
        const b = BUCKETS[i];
        if (s.notionalUsd >= b.min && s.notionalUsd < b.max) {
          counts[i]++;
          totals[i] += s.notionalUsd;
          break;
        }
      }
    }
    return BUCKETS.map((b, i) => ({
      label: b.label,
      count: counts[i],
      totalUsd: totals[i],
    }));
  }, [samples]);

  const totalFills = samples.length;
  const totalUsd = useMemo(
    () => samples.reduce((s, x) => s + x.notionalUsd, 0),
    [samples],
  );

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          <Activity className="h-3 w-3" aria-hidden="true" />
          Trade size distribution
        </h3>
        <span className="text-[10px] text-muted-2">
          {totalFills === 0
            ? "watching for fills…"
            : `${totalFills} fill${totalFills === 1 ? "" : "s"} · ${fmtCompactUSD(totalUsd)} volume`}
        </span>
      </div>

      {totalFills === 0 ? (
        <div className="grid h-32 place-items-center text-[11px] text-muted-2">
          Live — distribution fills in as trades print.
        </div>
      ) : (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={buckets}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fill: "#5d6478", fontSize: 10 }}
                axisLine={{ stroke: "#1d2230" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#5d6478", fontSize: 10 }}
                axisLine={{ stroke: "#1d2230" }}
                tickLine={false}
                width={30}
              />
              <Tooltip
                cursor={{ fill: "#1d2230", opacity: 0.4 }}
                contentStyle={{
                  background: "#0d0f14",
                  border: "1px solid #2a3142",
                  borderRadius: 4,
                  fontSize: 11,
                  padding: "6px 8px",
                }}
                labelStyle={{ color: "#e6e8ee", marginBottom: 2 }}
                formatter={(value, _name, item) => {
                  const count = typeof value === "number" ? value : 0;
                  const payload = (item as { payload?: { totalUsd?: number } })
                    ?.payload;
                  const total = payload?.totalUsd ?? 0;
                  return [
                    `${count} fill${count === 1 ? "" : "s"} · ${fmtCompactUSD(total)}`,
                    "Bucket",
                  ];
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {buckets.map((_, i) => (
                  <Cell key={i} fill={BAR_COLOURS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

