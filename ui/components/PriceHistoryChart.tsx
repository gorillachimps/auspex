"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { CLOB_HOST } from "@/lib/polymarket";
import { cn } from "@/lib/cn";

type Range = "1d" | "7d" | "30d" | "all";

type Point = { t: number; p: number };

type RangeSpec = {
  label: string;
  /** CLOB `interval` value. The old `startTs`/`endTs` time-window form is
   *  still accepted but the server now rejects windows beyond ~14 days as
   *  "interval too long", so we switched to the named-interval form which
   *  has no such cap. */
  interval: "1d" | "1w" | "1m" | "max";
  /** Minutes between samples. */
  fidelity: number;
};

const RANGES: Record<Range, RangeSpec> = {
  "1d": { label: "1D", interval: "1d", fidelity: 5 },
  "7d": { label: "7D", interval: "1w", fidelity: 60 },
  "30d": { label: "30D", interval: "1m", fidelity: 240 },
  all: { label: "All", interval: "max", fidelity: 1440 },
};

async function fetchHistory(
  tokenId: string,
  interval: RangeSpec["interval"],
  fidelity: number,
): Promise<Point[]> {
  const params = new URLSearchParams({
    market: tokenId,
    interval,
    fidelity: String(fidelity),
  });
  const r = await fetch(`${CLOB_HOST}/prices-history?${params}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = (await r.json()) as { history?: Point[] } | Point[];
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.history)
      ? (data.history as Point[])
      : [];
  // Normalise: server times are seconds in this endpoint. Convert to ms.
  return raw
    .filter((d) => d && isFinite(d.t) && isFinite(d.p))
    .map((d) => ({
      t: d.t > 1e12 ? d.t : d.t * 1000,
      p: Math.max(0, Math.min(1, d.p)),
    }));
}

type Props = {
  tokenId: string | null;
};

/**
 * Implied-probability history for a market. Renders via TradingView's open-
 * source `lightweight-charts` — same engine Coinbase and dYdX use — which
 * buys us:
 *
 *   - Pixel-precise canvas rendering at 60fps even on long series
 *   - A real crosshair with snap-to-bar price/time readout
 *   - Pinch/scroll-to-zoom, panning, double-click-to-reset for free
 *   - The "this looks like a real product" perception bump
 *
 * We replaced a Recharts AreaChart that did roughly the same thing but
 * looked indie. The data-fetch (CLOB /prices-history) and range selector
 * are unchanged.
 */
export function PriceHistoryChart({ tokenId }: Props) {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  // Bumped each time the chart instance is (re)created so the data + tone
  // effects know to re-apply. Necessary because React strict mode in dev
  // mounts effects twice — without this counter, the second mount creates
  // a fresh chart that never receives `data` (which hasn't changed) and
  // renders blank canvases.
  const [chartGen, setChartGen] = useState(0);

  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;
    setData(null);
    setErr(null);
    const spec = RANGES[range];
    fetchHistory(tokenId, spec.interval, spec.fidelity)
      .then((points) => {
        if (!cancelled) setData(points);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId, range]);

  const { first, last, deltaPp } = useMemo(() => {
    if (!data || data.length < 2) return { first: null, last: null, deltaPp: 0 };
    const f = data[0].p;
    const l = data[data.length - 1].p;
    return { first: f, last: l, deltaPp: (l - f) * 100 };
  }, [data]);

  const tone: "up" | "down" | "flat" =
    deltaPp > 0 ? "up" : deltaPp < 0 ? "down" : "flat";

  // Mount the chart once; tear down on unmount. All data + style updates
  // happen via the series API in subsequent effects so we never thrash
  // canvas creation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8a91a3",
        fontSize: 11,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(167,139,250,0.6)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2a3142",
        },
        horzLine: {
          color: "rgba(167,139,250,0.6)",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2a3142",
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "rgba(167,139,250,0.4)",
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => `${(price * 100).toFixed(1)}%`,
        minMove: 0.001,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    setChartGen((g) => g + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push fresh data into the existing series when the range changes — or
  // when the chart instance was just (re)created (chartGen bump).
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !data) return;
    if (data.length === 0) {
      series.setData([]);
      return;
    }
    series.setData(
      data.map((d) => ({
        time: Math.floor(d.t / 1000) as UTCTimestamp,
        value: d.p,
      })),
    );
    chart.timeScale().fitContent();
  }, [data, chartGen]);

  // Recolour line + fill when the trend flips between up/down/flat. Also
  // re-runs on chart re-creation so the new series picks up the current tone.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const palette =
      tone === "up"
        ? { line: "#34d399", top: "rgba(52,211,153,0.28)", bottom: "rgba(52,211,153,0)" }
        : tone === "down"
          ? { line: "#f87171", top: "rgba(248,113,113,0.28)", bottom: "rgba(248,113,113,0)" }
          : { line: "#a1a1aa", top: "rgba(161,161,170,0.22)", bottom: "rgba(161,161,170,0)" };
    series.applyOptions({
      lineColor: palette.line,
      topColor: palette.top,
      bottomColor: palette.bottom,
    });
  }, [tone, chartGen]);

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Implied probability
          {last != null ? (
            <span className="text-foreground normal-case font-normal text-[13px] tabular tracking-normal">
              {(last * 100).toFixed(1)}%
            </span>
          ) : null}
          {first != null && Math.abs(deltaPp) >= 0.05 ? (
            <span
              className={cn(
                "tabular normal-case font-medium text-[11px]",
                tone === "up" ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {deltaPp > 0 ? "+" : ""}
              {deltaPp.toFixed(1)}%
            </span>
          ) : null}
        </h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="relative h-56 w-full">
        {/* Always render the chart container so the chart instance can mount
            once. Overlays cover it while loading/error/empty. */}
        <div ref={containerRef} className="absolute inset-0" />
        {err ? (
          <p className="absolute inset-0 grid place-items-center bg-surface/40 text-[12px] text-rose-300">
            Couldn&apos;t load history: {err}
          </p>
        ) : !data ? (
          <div className="absolute inset-0 grid place-items-center bg-surface/40 text-[12px] text-muted">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading {RANGES[range].label}…
            </span>
          </div>
        ) : data.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center bg-surface/40 text-[12px] text-muted">
            No history for this range.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RangeSelector({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border-strong bg-background p-0.5">
      {(Object.keys(RANGES) as Range[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-transparent",
            value === r
              ? "bg-accent/15 text-accent ring-accent/40"
              : "text-muted hover:text-foreground",
          )}
        >
          {RANGES[r].label}
        </button>
      ))}
    </div>
  );
}
