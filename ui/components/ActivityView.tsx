"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { useClobSession } from "@/lib/useClobSession";
import { cn } from "@/lib/cn";
import { csvFilename, downloadCsv, toCsv } from "@/lib/csv";
import { fmtAgoUnixWithSuffix, fmtShares, fmtUSD } from "@/lib/format";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";
import { SortableTh, Td, Th } from "./ui/DataTable";
import type { SortDir } from "./ui/DataTable";
import { MobileTradeList } from "./MobileTradeList";

type SideFilter = "all" | "buys" | "sells";
type SortKey = "when" | "market" | "side" | "outcome" | "price" | "shares" | "usdc";

// Local alias for back-compat with all the existing `fmtAge(unixSec)` call
// sites; canonical now lives in lib/format.ts.
const fmtAge = fmtAgoUnixWithSuffix;
const fmtSize = fmtShares;

const REFRESH_MS = 60_000;
const HOST = "https://data-api.polymarket.com";

type Trade = {
  proxyWallet?: string;
  side: "BUY" | "SELL";
  asset: string; // token id
  conditionId?: string;
  outcome?: string; // "Yes" | "No"
  outcomeIndex?: number; // 0 | 1
  price: number;
  size: number;
  sizeUsdc?: number;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  transactionHash?: string;
  timestamp: number; // unix seconds (data-api convention)
};

type State = {
  trades: Trade[] | null;
  loading: boolean;
  error: string | null;
};

const ZERO: State = { trades: null, loading: false, error: null };

export function ActivityView() {
  const session = useClobSession();
  const funder = session.funderAddress;
  const [state, setState] = useState<State>(ZERO);
  const [query, setQuery] = useState("");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  // Default: most recent first — matches what users expect when they open
  // the page. Server already sends newest-first; this is an explicit sort
  // so users can reorder.
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function setSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    // Text fields default to ascending, numeric/time to descending.
    setSortDir(next === "market" || next === "side" || next === "outcome" ? "asc" : "desc");
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      if (!funder) {
        setState(ZERO);
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const url = `${HOST}/trades?user=${funder}&limit=200`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        const trades: Trade[] = Array.isArray(data) ? data : [];
        // Defensive sort: newest first.
        trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        setState({ trades, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          trades: s.trades,
          loading: false,
          error: (e as Error).message,
        }));
      } finally {
        if (!cancelled) timer = setTimeout(load, REFRESH_MS);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [funder]);

  const summary = useMemo(() => {
    if (!state.trades) return null;
    let buys = 0;
    let sells = 0;
    let totalUsdc = 0;
    for (const t of state.trades) {
      const usdc = t.sizeUsdc != null ? t.sizeUsdc : t.size * t.price;
      if (isFinite(usdc)) totalUsdc += usdc;
      if (t.side === "BUY") buys++;
      else if (t.side === "SELL") sells++;
    }
    return { count: state.trades.length, buys, sells, totalUsdc };
  }, [state.trades]);

  // Client-side filter — runs over already-loaded trades, no extra API hits.
  // Matches market title OR the raw asset id (handy if you only remember a
  // token), case-insensitive substring.
  const filteredTrades = useMemo(() => {
    if (!state.trades) return null;
    const q = query.trim().toLowerCase();
    const filtered = state.trades.filter((t) => {
      if (sideFilter === "buys" && t.side !== "BUY") return false;
      if (sideFilter === "sells" && t.side !== "SELL") return false;
      if (!q) return true;
      const title = (t.title ?? "").toLowerCase();
      const asset = (t.asset ?? "").toLowerCase();
      return title.includes(q) || asset.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const cmpNum = (a: number, b: number) => (a - b) * dir;
    const usdcOf = (t: Trade) => (t.sizeUsdc != null ? t.sizeUsdc : t.size * t.price);
    const outcomeOf = (t: Trade) =>
      t.outcome ??
      (t.outcomeIndex === 0 ? "Yes" : t.outcomeIndex === 1 ? "No" : "");
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "when":
          return cmpNum(a.timestamp ?? 0, b.timestamp ?? 0);
        case "market":
          return (a.title ?? "").localeCompare(b.title ?? "") * dir;
        case "side":
          return a.side.localeCompare(b.side) * dir;
        case "outcome":
          return outcomeOf(a).localeCompare(outcomeOf(b)) * dir;
        case "price":
          return cmpNum(a.price ?? 0, b.price ?? 0);
        case "shares":
          return cmpNum(a.size ?? 0, b.size ?? 0);
        case "usdc":
          return cmpNum(usdcOf(a), usdcOf(b));
        default:
          return 0;
      }
    });
  }, [state.trades, query, sideFilter, sortKey, sortDir]);

  const filterActive = query.trim().length > 0 || sideFilter !== "all";

  function exportCsv() {
    const trades = filteredTrades ?? [];
    if (trades.length === 0) return;
    const headers = [
      "timestamp_iso",
      "timestamp_unix",
      "market",
      "side",
      "outcome",
      "price",
      "shares",
      "usdc",
      "tx_hash",
      "slug",
      "asset",
    ];
    const rows = trades.map((t) => {
      const ts = t.timestamp ?? 0;
      const iso = ts > 0 ? new Date(ts * 1000).toISOString() : "";
      const usdc = t.sizeUsdc != null ? t.sizeUsdc : t.size * t.price;
      const outcomeText =
        t.outcome ??
        (t.outcomeIndex === 0
          ? "Yes"
          : t.outcomeIndex === 1
            ? "No"
            : "");
      return [
        iso,
        ts,
        t.title ?? "",
        t.side,
        outcomeText,
        t.price,
        t.size,
        isFinite(usdc) ? usdc : "",
        t.transactionHash ?? "",
        t.slug ?? "",
        t.asset,
      ];
    });
    downloadCsv(csvFilename("trades"), toCsv(headers, rows));
  }

  if (session.status === "loading" || session.status === "deriving") {
    return (
      <div className="mt-6">
        <LoadingState
          variant="panel"
          title="Connecting…"
          body="Authorizing your session with the Polymarket CLOB."
        />
      </div>
    );
  }

  if (session.status !== "ready" || !funder) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<Wallet className="h-5 w-5 text-muted" aria-hidden="true" />}
          title="Connect your wallet to see fills"
          body="Use the Connect button in the top-right. Your fill history will show up here once you've placed your first trade."
        />
      </div>
    );
  }

  if (state.loading && !state.trades) {
    return (
      <div className="mt-6">
        <LoadingState
          variant="panel"
          title="Pulling your fills…"
          body="Fetching from Polymarket. This usually takes a second."
        />
      </div>
    );
  }

  if (state.error && !state.trades) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Couldn't load your fills"
          body={state.error}
          tone="error"
        />
      </div>
    );
  }

  if (!state.trades || state.trades.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<Wallet className="h-5 w-5 text-muted" aria-hidden="true" />}
          title="No fills yet"
          body="Place a YES or NO order from the screener — any filled shares show up here."
        />
      </div>
    );
  }

  const shownCount = filteredTrades?.length ?? 0;

  return (
    <div className="mt-4">
      {summary ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-[12px]">
          <Stat
            label={filterActive ? "Shown" : "Total fills"}
            value={
              filterActive
                ? `${shownCount.toLocaleString()} / ${summary.count.toLocaleString()}`
                : summary.count.toLocaleString()
            }
          />
          <span className="text-border-strong">·</span>
          <Stat
            label="Buys / Sells"
            value={`${summary.buys} / ${summary.sells}`}
          />
          <span className="text-border-strong">·</span>
          <Stat label="Volume traded" value={fmtUSD(summary.totalUsdc)} />
          <div className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-2">
            {state.loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            <span>Refreshes every {Math.round(REFRESH_MS / 1000)}s</span>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by market…"
            aria-label="Filter trades by market"
            className="w-full rounded-md border border-border-strong bg-surface px-7 py-1.5 text-[12px] text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-2 hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div
          role="group"
          aria-label="Filter by side"
          className="inline-flex items-center rounded-md border border-border-strong bg-surface text-[11px]"
        >
          {(["all", "buys", "sells"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSideFilter(opt)}
              aria-pressed={sideFilter === opt}
              className={cn(
                "px-2.5 py-1.5 font-medium capitalize first:rounded-l-md last:rounded-r-md",
                sideFilter === opt
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={shownCount === 0}
          title={
            filterActive
              ? `Download ${shownCount} filtered trades as CSV`
              : "Download all trades as CSV"
          }
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {filterActive && shownCount === 0 ? (
        <div className="rounded-md border border-border bg-surface/40 px-6 py-10 text-center">
          <p className="text-sm text-muted">
            No fills match your filter.{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSideFilter("all");
              }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          </p>
        </div>
      ) : (
      <>
      <MobileTradeList trades={filteredTrades ?? []} />
      <div className="hidden sm:block overflow-x-auto rounded-md border border-border bg-surface/20 scrollbar-thin">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <SortableTh sortKey="when" current={sortKey} dir={sortDir} onClick={setSort}>When</SortableTh>
              <SortableTh sortKey="market" current={sortKey} dir={sortDir} onClick={setSort}>Market</SortableTh>
              <SortableTh sortKey="side" current={sortKey} dir={sortDir} onClick={setSort}>Side</SortableTh>
              <SortableTh sortKey="outcome" current={sortKey} dir={sortDir} onClick={setSort}>Outcome</SortableTh>
              <SortableTh sortKey="price" current={sortKey} dir={sortDir} onClick={setSort} align="right">Price</SortableTh>
              <SortableTh sortKey="shares" current={sortKey} dir={sortDir} onClick={setSort} align="right">Shares</SortableTh>
              <SortableTh sortKey="usdc" current={sortKey} dir={sortDir} onClick={setSort} align="right">USDC</SortableTh>
              <Th align="right">Tx</Th>
            </tr>
          </thead>
          <tbody>
            {(filteredTrades ?? []).map((t, i) => {
              const ts = t.timestamp ?? 0;
              const usdc =
                t.sizeUsdc != null ? t.sizeUsdc : t.size * t.price;
              const outcomeText = t.outcome ?? (t.outcomeIndex === 0 ? "Yes" : t.outcomeIndex === 1 ? "No" : "—");
              const isYes = /^yes$/i.test(outcomeText);
              const bullish =
                (t.side === "BUY" && isYes) || (t.side === "SELL" && !isYes);
              const sideTone = bullish
                ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                : "bg-rose-500/15 text-rose-200 ring-rose-400/30";
              return (
                <tr
                  key={`${t.transactionHash ?? i}-${t.asset}-${ts}`}
                  className="border-b border-border/70 hover:bg-surface/40"
                >
                  <Td>
                    <span
                      className="tabular text-[12px] text-muted"
                      title={
                        ts > 0
                          ? new Date(ts * 1000).toISOString()
                          : undefined
                      }
                    >
                      {ts > 0 ? fmtAge(ts) : "—"}
                    </span>
                  </Td>
                  <Td>
                    {t.slug && t.title ? (
                      <a
                        href={`/markets/${t.slug}`}
                        className="block max-w-[28rem] truncate text-[12px] text-foreground hover:text-accent hover:underline"
                        title={t.title}
                      >
                        {t.title}
                      </a>
                    ) : (
                      <span
                        className="font-mono text-[11px] text-muted-2"
                        title={t.asset}
                      >
                        {(t.asset ?? "—").slice(0, 14)}…
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider ring-1",
                        sideTone,
                      )}
                    >
                      {t.side}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "text-[12px] font-medium uppercase",
                        isYes ? "text-emerald-300" : "text-rose-300",
                      )}
                    >
                      {outcomeText}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-foreground/90">
                      ${(t.price ?? 0).toFixed(3)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-muted">{fmtSize(t.size)}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-foreground/85">
                      {fmtUSD(usdc)}
                    </span>
                  </Td>
                  <Td align="right">
                    {t.transactionHash ? (
                      <a
                        href={`https://polygonscan.com/tx/${t.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-muted hover:text-foreground"
                        title={t.transactionHash}
                      >
                        {t.transactionHash.slice(0, 8)}…
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
      </div>
      </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className="tabular text-[13px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}
