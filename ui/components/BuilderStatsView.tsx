"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { BUILDER_CODE, CLOB_HOST } from "@/lib/polymarket";
import { useMarketLookup } from "@/lib/useMarketLookup";
import { cn } from "@/lib/cn";
import { fmtAgoUnix, fmtUSD, fmtUSDCompact } from "@/lib/format";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";

const fmtCompactUSD = fmtUSDCompact;
const fmtAge = fmtAgoUnix;

const REFRESH_MS = 60_000;

type RawTrade = {
  id: string;
  tradeType?: string;
  /** Set later when Polymarket attaches the builder org info; usually empty. */
  builder?: string;
  /** The bytes32 builder code on the order — this is what we tally on. */
  builderCode?: string;
  market?: string;
  assetId?: string;
  side?: string;
  size?: string;
  sizeUsdc?: string;
  price?: string;
  status?: string;
  outcome?: string;
  matchTime?: string;
  timestamp?: string;
  owner?: string;
  transactionHash?: string;
};

type StatsState = {
  trades: RawTrade[] | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
};

const ZERO: StatsState = {
  trades: null,
  loading: false,
  error: null,
  fetchedAt: null,
};

export function BuilderStatsView() {
  const [state, setState] = useState<StatsState>(ZERO);

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const url = `${CLOB_HOST}/builder/trades?builder_code=${BUILDER_CODE}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // The endpoint returns `{ data: [...] }`. Fall through to other shapes
      // defensively in case Polymarket changes the wrapper.
      const trades: RawTrade[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.trades)
          ? data.trades
          : Array.isArray(data)
            ? data
            : [];
      setState({
        trades,
        loading: false,
        error: null,
        fetchedAt: Date.now(),
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (e as Error).message,
      }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function loop() {
      if (cancelled) return;
      await load();
      timer = setTimeout(loop, REFRESH_MS);
    }
    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const summary = useMemo(() => {
    if (!state.trades) return null;
    let count = 0;
    let buyCount = 0;
    let sellCount = 0;
    let totalUsdc = 0;
    let oldest: number | null = null;
    let newest: number | null = null;
    const traders = new Set<string>();
    for (const t of state.trades) {
      count++;
      const usdc = parseFloat(t.sizeUsdc ?? "0");
      if (isFinite(usdc)) totalUsdc += usdc;
      const side = (t.side ?? "").toUpperCase();
      if (side === "BUY") buyCount++;
      else if (side === "SELL") sellCount++;
      const ts = parseFloat(t.matchTime ?? t.timestamp ?? "");
      if (isFinite(ts)) {
        if (oldest == null || ts < oldest) oldest = ts;
        if (newest == null || ts > newest) newest = ts;
      }
      // Polymarket reports an empty `builder` org field for most trades; the
      // `owner` (UUID of the wallet that placed the order) is the meaningful
      // grouping for "unique traders".
      const traderKey = (t.owner ?? t.builder ?? "").toLowerCase();
      if (traderKey) traders.add(traderKey);
    }
    return { count, buyCount, sellCount, totalUsdc, oldest, newest, traders };
  }, [state.trades]);

  if (state.trades == null && state.loading) {
    return (
      <div className="mt-8">
        <LoadingState
          variant="panel"
          title="Loading builder trades…"
          body="Pulling attributed fills from the Polymarket CLOB."
        />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="mt-8">
        <EmptyState
          title="Couldn't reach the CLOB"
          body={`The builder-trades endpoint returned an error: ${state.error}`}
          tone="error"
        />
      </div>
    );
  }
  if (!state.trades || state.trades.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          title="No builder-attributed trades yet"
          body="When someone places an order through this site with the Auspex builder code attached, attributed fills show up here. Empty at launch is the expected state."
        >
          <p className="text-[11px] text-muted-2">
            Endpoint:{" "}
            <code className="font-mono">
              {CLOB_HOST}/builder/trades?builder_code=
              {BUILDER_CODE.slice(0, 10)}…
            </code>
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2">
        {summary ? (
          <>
            <Stat
              label="Attributed fills"
              value={summary.count.toLocaleString()}
            />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat
              label="Volume"
              value={fmtCompactUSD(summary.totalUsdc)}
              hint={fmtUSD(summary.totalUsdc)}
            />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat
              label="Unique builders"
              value={summary.traders.size.toLocaleString()}
            />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat
              label="Buys / Sells"
              value={`${summary.buyCount} / ${summary.sellCount}`}
            />
          </>
        ) : null}
        <div className="ml-auto">
          <button
            type="button"
            onClick={load}
            disabled={state.loading}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            {state.loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-surface/20">
        <BuilderTradesTable trades={state.trades.slice(0, 50)} />
      </div>
      {state.trades.length > 50 ? (
        <p className="mt-2 text-[11px] text-muted-2">
          Showing the 50 most recent of {state.trades.length.toLocaleString()} attributed
          fills. Hit the raw endpoint for the full list.
        </p>
      ) : null}
      <a
        href={`${CLOB_HOST}/builder/trades?builder_code=${BUILDER_CODE}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
      >
        Raw endpoint <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function BuilderTradesTable({ trades }: { trades: RawTrade[] }) {
  const tokenIds = useMemo(
    () => trades.map((t) => t.assetId ?? "").filter(Boolean),
    [trades],
  );
  const lookup = useMarketLookup(tokenIds);
  return (
    <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Market</Th>
          <Th>Side</Th>
          <Th>Outcome</Th>
          <Th>Price</Th>
          <Th>Size (USDC)</Th>
          <Th>Tx</Th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => {
          const ts = parseFloat(t.matchTime ?? t.timestamp ?? "");
          const side = (t.side ?? "").toUpperCase();
          const market = t.assetId ? lookup[t.assetId] : undefined;
          return (
            <tr
              key={t.id}
              className="border-b border-border hover:bg-surface/40"
            >
              <Td>
                <span
                  className="tabular text-[12px] text-muted"
                  title={isFinite(ts) ? new Date(ts * 1000).toISOString() : undefined}
                >
                  {isFinite(ts) ? fmtAge(ts) : "—"}
                </span>
              </Td>
              <Td>
                {market ? (
                  <a
                    href={`/markets/${market.slug}`}
                    className="block max-w-[28rem] truncate text-[12px] text-foreground hover:text-accent hover:underline"
                    title={market.question}
                  >
                    {market.question}
                  </a>
                ) : (
                  <span
                    className="font-mono text-[11px] text-muted-2"
                    title={t.assetId}
                  >
                    {(t.assetId ?? "—").slice(0, 14)}…
                  </span>
                )}
              </Td>
              <Td>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                    side === "BUY"
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                      : "bg-rose-500/15 text-rose-200 ring-rose-400/30",
                  )}
                >
                  {side || "—"}
                </span>
              </Td>
              <Td>
                <span className="text-[12px] text-muted">
                  {t.outcome ?? "—"}
                </span>
              </Td>
              <Td>
                <span className="tabular text-foreground">
                  ${parseFloat(t.price ?? "0").toFixed(3)}
                </span>
              </Td>
              <Td>
                <span className="tabular text-foreground">
                  {fmtUSD(parseFloat(t.sizeUsdc ?? "0"))}
                </span>
              </Td>
              <Td>
                {t.transactionHash ? (
                  <a
                    href={`https://polygonscan.com/tx/${t.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-foreground"
                    title={t.transactionHash}
                  >
                    {t.transactionHash.slice(0, 10)}…
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="font-mono text-[11px] text-muted-2">—</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-[13px] font-semibold text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="tabular text-[10px] text-muted-2">{hint}</span>
      ) : null}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-border bg-surface/40 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b border-border/70 px-3 py-2 align-middle">
      {children}
    </td>
  );
}
