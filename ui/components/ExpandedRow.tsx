import { ExternalLink, ChevronRight } from "lucide-react";
import {
  fmtCompactUSD,
  fmtImpliedPct,
  fmtSignedPP,
  fmtSourceLabel,
  fmtUSD,
} from "@/lib/format";
import { summarizeRules } from "@/lib/rules";
import type { TableRow } from "@/lib/types";
import { Sparkline } from "./Sparkline";

type Props = {
  row: TableRow;
  colSpan: number;
};

function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function buildHistory(r: TableRow): number[] {
  const now = clamp01(r.impliedYes ?? 0.5);
  const minus1h = clamp01(now - (r.oneHourChange ?? 0));
  const minus24h = clamp01(now - (r.oneDayChange ?? 0));
  const minus7d = clamp01(now - (r.oneWeekChange ?? r.oneDayChange ?? 0));
  const minus30d = clamp01(
    now - (r.oneMonthChange ?? r.oneWeekChange ?? r.oneDayChange ?? 0),
  );
  return [minus30d, minus7d, minus24h, minus1h, now];
}

function changeBadge(p: number | null) {
  const v = fmtSignedPP(p);
  if (!v) return <span className="text-muted-2">—</span>;
  if (v.sign === 0) return <span className="text-muted">0%</span>;
  return (
    <span className={v.sign > 0 ? "text-emerald-300" : "text-rose-300"}>
      {v.sign > 0 ? "▲" : "▼"} {v.text}
    </span>
  );
}

export function ExpandedRow({ row, colSpan }: Props) {
  const summary = summarizeRules(row);
  const spread =
    row.liveState === "live" && row.distancePct != null
      ? `${(row.distancePct * 100).toFixed(2)}%`
      : "—";
  const bidAsk =
    row.bestBid != null && row.bestAsk != null
      ? `${fmtImpliedPct(row.bestBid)} / ${fmtImpliedPct(row.bestAsk)}`
      : "—";
  const history = buildHistory(row);
  const overallTrend = history[history.length - 1] - history[0];
  const sparkColor =
    overallTrend > 0.001
      ? "text-emerald-300"
      : overallTrend < -0.001
        ? "text-rose-300"
        : "text-muted-2";

  return (
    <tr className="bg-surface/30">
      <td colSpan={colSpan} className="border-b border-border px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-[12px] leading-snug text-foreground/90">
            <span className="mr-2 inline-block rounded bg-accent/15 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-accent ring-1 ring-accent/30">
              Rule
            </span>
            {summary}
            {row.liveState === "deferred" && row.liveReason ? (
              <span className="ml-2 text-muted">({row.liveReason})</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-2">
                30d → now
              </span>
              <span className={sparkColor}>
                <Sparkline values={history} width={120} height={28} />
              </span>
            </div>
            <ChangeStat label="1h" value={row.oneHourChange} />
            <ChangeStat label="24h" value={row.oneDayChange} />
            <ChangeStat label="7d" value={row.oneWeekChange} />
            <ChangeStat label="30d" value={row.oneMonthChange} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
            <Field label="PM implied" value={fmtImpliedPct(row.impliedYes)} />
            <Field label="Best bid / ask" value={bidAsk} />
            <Field label="Volume total" value={fmtCompactUSD(row.volumeTotal)} />
            <Field label="Liquidity" value={fmtCompactUSD(row.liquidity)} />
            {row.liveState === "live" ? (
              <>
                <Field label="Current state" value={fmtUSD(row.currentValue)} />
                <Field label="Distance to trigger" value={spread} />
              </>
            ) : (
              <Field label="State" value="deferred" />
            )}
            <Field label="Source" value={fmtSourceLabel(row.source, row.pair)} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <a
              href={`/markets/${row.slug}`}
              className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/15 px-2 py-1 font-semibold text-accent hover:bg-accent/25"
            >
              Detail page <ChevronRight className="h-3 w-3" />
            </a>
            <a
              href={`https://polymarket.com/event/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-border-strong bg-surface px-2 py-1 text-foreground hover:bg-surface-2"
            >
              Open on Polymarket <ExternalLink className="h-3 w-3" />
            </a>
            <span className="font-mono text-muted-2">id {row.id}</span>
          </div>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-foreground/90">{value}</span>
    </div>
  );
}

function ChangeStat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        Δ {label}
      </span>
      <span className="tabular text-[12px] font-medium">
        {changeBadge(value)}
      </span>
    </div>
  );
}
