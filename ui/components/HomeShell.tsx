"use client";

import { useEffect, useRef, useState } from "react";
import { MarqueeBar } from "./MarqueeBar";
import { Screener } from "./Screener";
import { SnapshotMeta } from "./SnapshotMeta";
import { WhaleFeedStream } from "./WhaleFeedStream";
import type { TableRow } from "@/lib/types";

const REFRESH_MS = 60_000;
const MAX_ROWS = 500;
const FETCH_URL = `/api/markets?limit=${MAX_ROWS}`;

type Props = {
  initialRows: TableRow[];
  initialSnapshotAt: string;
  liveCount: number;
  totalVolume24h: number;
};

const compact24h = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function HomeShell({
  initialRows,
  initialSnapshotAt,
  liveCount: initialLiveCount,
  totalVolume24h: initialTotalVolume24h,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [snapshotAt, setSnapshotAt] = useState(initialSnapshotAt);
  const [liveCount, setLiveCount] = useState(initialLiveCount);
  const [totalVolume24h, setTotalVolume24h] = useState(initialTotalVolume24h);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function refresh() {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) {
        scheduleNext();
        return;
      }
      inFlightRef.current = true;
      setRefreshing(true);
      try {
        const res = await fetch(FETCH_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: {
          generatedAt: string;
          markets: TableRow[];
        } = await res.json();
        if (cancelled || !Array.isArray(data.markets)) return;
        setRows(data.markets);
        setSnapshotAt(data.generatedAt);
        setLiveCount(
          data.markets.filter((r) => r.liveState === "live").length,
        );
        setTotalVolume24h(
          data.markets.reduce((s, r) => s + (r.volume24h ?? 0), 0),
        );
      } catch {
        // network glitch — leave the previous snapshot in place
      } finally {
        if (!cancelled) setRefreshing(false);
        inFlightRef.current = false;
        scheduleNext();
      }
    }

    function scheduleNext() {
      if (cancelled) return;
      timeoutId = setTimeout(refresh, REFRESH_MS);
    }

    function onVisibility() {
      if (!document.hidden) refresh();
    }

    scheduleNext();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      <WhaleFeedStream rows={rows} />
      <MarqueeBar rows={rows} />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 pt-6 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Crypto bets, sorted by signal.
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                For every market, we check the live data it settles on —
                Binance prices, token launches, treasury balances — and show
                how close it is to flipping YES. Click any column to sort:
                which markets are closest to triggering, which close soonest,
                which have the most action.
              </p>
              <div
                className="mt-2 flex items-center gap-2"
                aria-live="polite"
                aria-atomic="true"
              >
                <SnapshotMeta snapshotAt={snapshotAt} />
                {refreshing ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent ring-1 ring-accent/30"
                    role="status"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse"
                    />
                    refreshing…
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted tabular">
              <Stat label="Markets shown" value={rows.length.toLocaleString()} />
              <Stat label="Live state" value={liveCount.toLocaleString()} />
              <Stat label="Vol 24h" value={compact24h.format(totalVolume24h)} />
            </div>
          </div>
        </div>
        <Screener rows={rows} />
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
