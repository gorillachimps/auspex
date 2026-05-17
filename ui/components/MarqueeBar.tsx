"use client";

import type { TableRow } from "@/lib/types";
import { Sparkline } from "./Sparkline";

type Props = { rows: TableRow[] };

type Mover = {
  id: string;
  question: string;
  delta: number;
  history: number[];
};

function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function dispatchFocus(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("auspex:focus-market", { detail: id }),
  );
}

export function MarqueeBar({ rows }: Props) {
  const movers: Mover[] = rows
    .filter((r) => r.volumeTotal > 100_000 && r.oneDayChange != null)
    .map((r) => {
      const now = clamp01(r.impliedYes ?? 0.5);
      // Reconstruct historical implied % at -30d, -7d, -24h, -1h, now using the
      // change windows. Each *_change field is "now minus then" in probability points,
      // so subtracting walks the price backward in time.
      const minus1h = clamp01(now - (r.oneHourChange ?? 0));
      const minus24h = clamp01(now - (r.oneDayChange ?? 0));
      const minus7d = clamp01(now - (r.oneWeekChange ?? r.oneDayChange ?? 0));
      const minus30d = clamp01(
        now - (r.oneMonthChange ?? r.oneWeekChange ?? r.oneDayChange ?? 0),
      );
      return {
        id: r.id,
        question: r.question,
        delta: r.oneDayChange ?? 0,
        history: [minus30d, minus7d, minus24h, minus1h, now],
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);

  if (movers.length === 0) return null;

  const items = [...movers, ...movers];

  return (
    <div
      className="border-b border-border bg-surface/60"
      role="region"
      aria-label="Top 24-hour movers"
    >
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-2">
        <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted ring-1 ring-border">
          24h movers
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div
            className="marquee-track flex w-max items-center gap-6 whitespace-nowrap text-[12px]"
            aria-label="Top 24-hour movers"
          >
            {items.map((m, i) => {
              const sign = m.delta >= 0 ? 1 : -1;
              const pp = Math.abs(m.delta * 100);
              const color = sign >= 0 ? "text-emerald-300" : "text-rose-300";
              return (
                <button
                  key={`${m.id}-${i}`}
                  type="button"
                  onClick={() => dispatchFocus(m.id)}
                  className="flex items-center gap-2 rounded px-1 hover:bg-surface-2"
                  title="Jump to row"
                >
                  <span className="max-w-[28ch] truncate text-foreground/90">
                    {m.question}
                  </span>
                  <span className={color}>
                    <Sparkline values={m.history} />
                  </span>
                  <span className={`tabular font-semibold ${color}`}>
                    {sign >= 0 ? "▲" : "▼"} {pp.toFixed(pp >= 1 ? 0 : 1)} pp
                  </span>
                  <span className="text-border-strong">·</span>
                </button>
              );
            })}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface/95 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface/95 to-transparent"
          />
        </div>
      </div>
    </div>
  );
}
