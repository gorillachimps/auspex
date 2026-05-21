"use client";

import { useEffect, useState } from "react";
import { fmtUSDCompact } from "@/lib/format";

const BUILDER_CODE =
  "0x1cc4300fca20eb0449c32d3c56d937d0a46e172d2707a62860b5f5311f2b608b";

type Stats = {
  markets: number | null;
  attributedUsd: number | null;
  attributedTrades: number | null;
};

/**
 * Above-the-fold "proof of life" banner on /welcome. Pulls two numbers
 * in parallel:
 *   1. /api/health → live count of markets in our snapshot
 *   2. clob.polymarket.com/builder/trades → cumulative builder-attributed
 *      volume + trade count
 *
 * Both calls fail open with "—" if the upstream is unreachable; cold
 * visitors should never see a broken stats banner.
 */
export function WelcomeStatsBanner() {
  const [stats, setStats] = useState<Stats>({
    markets: null,
    attributedUsd: null,
    attributedTrades: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [healthRes, builderRes] = await Promise.allSettled([
        fetch("/api/health", { cache: "no-store" }).then((r) => r.json()),
        fetch(
          `https://clob.polymarket.com/builder/trades?builder_code=${BUILDER_CODE}`,
          { cache: "no-store" },
        ).then((r) => r.json()),
      ]);
      if (cancelled) return;

      const markets =
        healthRes.status === "fulfilled" &&
        typeof healthRes.value?.markets === "number"
          ? healthRes.value.markets
          : null;

      let attributedUsd: number | null = null;
      let attributedTrades: number | null = null;
      if (builderRes.status === "fulfilled") {
        const data = builderRes.value?.data ?? builderRes.value;
        if (Array.isArray(data)) {
          attributedTrades = data.length;
          attributedUsd = data.reduce((sum: number, t: { sizeUsdc?: string }) => {
            const n = parseFloat(t.sizeUsdc ?? "0");
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0);
        }
      }

      setStats({ markets, attributedUsd, attributedTrades });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-6 grid grid-cols-3 gap-3 rounded-md border border-border bg-surface/40 px-4 py-3">
      <Stat
        label="Markets indexed"
        value={
          stats.markets != null ? stats.markets.toLocaleString() : "—"
        }
      />
      <Stat
        label="Trades attributed"
        value={
          stats.attributedTrades != null
            ? stats.attributedTrades.toLocaleString()
            : "—"
        }
      />
      <Stat
        label="Volume attributed"
        value={
          stats.attributedUsd != null ? fmtUSDCompact(stats.attributedUsd) : "—"
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-[18px] font-semibold text-foreground sm:text-[20px]">
        {value}
      </span>
    </div>
  );
}
