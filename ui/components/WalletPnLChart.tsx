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
import type { PnlPoint } from "@/lib/walletPnl";

type Props = {
  /** Curve of cumulative realized P&L over time. Empty when no closing
   *  trades exist yet for this wallet. */
  curve: PnlPoint[];
};

/**
 * Cumulative realized P&L curve for a wallet, rendered on TradingView's
 * lightweight-charts. Same library and config approach as PriceHistoryChart —
 * a green/red/grey palette that flips with the sign of the final P&L.
 *
 * Edge case: a single-point curve will still render a flat line; an empty
 * curve renders the placeholder.
 */
export function WalletPnLChart({ curve }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  // chartGen bumps each (re)mount so the data/tone effects re-apply under
  // React strict-mode's double-invoke without leaving the chart empty.
  const [chartGen, setChartGen] = useState(0);

  const final = curve.length > 0 ? curve[curve.length - 1].cumRealized : 0;
  const tone: "up" | "down" | "flat" =
    final > 0.005 ? "up" : final < -0.005 ? "down" : "flat";

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
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: false,
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
        formatter: (v: number) => {
          if (Math.abs(v) >= 1000)
            return `${v >= 0 ? "+" : "−"}$${(Math.abs(v) / 1000).toFixed(1)}k`;
          return `${v >= 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}`;
        },
        minMove: 0.01,
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

  // Lightweight-charts requires strictly ascending UNIQUE timestamps per
  // series. We floor to second precision for the time axis, then dedupe
  // (keep the LAST value at each second) — belt-and-braces over the
  // dedup in computeWalletPnl, in case the curve generator changes.
  const dataPoints = useMemo(() => {
    const bySecond = new Map<number, number>();
    for (const p of curve) {
      const sec = Math.floor(p.t / 1000);
      bySecond.set(sec, p.cumRealized);
    }
    return [...bySecond.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sec, value]) => ({
        time: sec as UTCTimestamp,
        value,
      }));
  }, [curve]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(dataPoints);
    if (dataPoints.length > 0) chart.timeScale().fitContent();
  }, [dataPoints, chartGen]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const palette =
      tone === "up"
        ? {
            line: "#34d399",
            top: "rgba(52,211,153,0.28)",
            bottom: "rgba(52,211,153,0)",
          }
        : tone === "down"
          ? {
              line: "#f87171",
              top: "rgba(248,113,113,0.28)",
              bottom: "rgba(248,113,113,0)",
            }
          : {
              line: "#a1a1aa",
              top: "rgba(161,161,170,0.22)",
              bottom: "rgba(161,161,170,0)",
            };
    series.applyOptions({
      lineColor: palette.line,
      topColor: palette.top,
      bottomColor: palette.bottom,
    });
  }, [tone, chartGen]);

  return (
    <div className="relative h-56 w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {curve.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center bg-surface/40 text-[12px] text-muted">
          No closing trades yet — once this wallet sells positions, the curve
          will fill in here.
        </div>
      ) : null}
    </div>
  );
}
