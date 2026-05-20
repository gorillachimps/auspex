"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import type { Trade } from "@/lib/walletPnl";
import { cn } from "@/lib/cn";
import { fmtAgoUnix, fmtCents, fmtShares, fmtUSDCompact } from "@/lib/format";
import { SortableTh } from "./ui/DataTable";
import type { SortDir } from "./ui/DataTable";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";
import { MobileTradeList } from "./MobileTradeList";

type Props = {
  trades: Trade[] | null;
  loading: boolean;
  error: string | null;
  /** Optionally truncate to the most-recent N trades for the wallet detail
   *  page (set to e.g. 50 to keep the DOM small). Applies AFTER any active
   *  search/side filter — so filtering doesn't get hidden by the limit. */
  limit?: number;
};

type SideFilter = "all" | "buys" | "sells";
type SortKey =
  | "when"
  | "market"
  | "side"
  | "outcome"
  | "shares"
  | "price"
  | "notional";

// Local aliases — the file's old internal names mapped to canonical formatters.
const fmtUSD = fmtUSDCompact;
const fmtRelative = fmtAgoUnix;

/**
 * Trade history for a tracked wallet, newest-first by default. Reuses the
 * trade shape from data-api `/trades?user=…`. Notional in USDC is
 * `size * price`.
 *
 * The search + side filter run client-side over whatever the parent
 * passes; the `limit` truncates AFTER filtering so a search isn't hidden
 * by it.
 */
export function WalletTradesView({ trades, loading, error, limit }: Props) {
  const [query, setQuery] = useState("");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function setSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(
      next === "market" || next === "side" || next === "outcome" ? "asc" : "desc",
    );
  }

  const filteredAndSorted = useMemo(() => {
    if (!trades) return null;
    const q = query.trim().toLowerCase();
    const filtered = trades.filter((t) => {
      if (sideFilter === "buys" && t.side !== "BUY") return false;
      if (sideFilter === "sells" && t.side !== "SELL") return false;
      if (!q) return true;
      const title = (t.title ?? "").toLowerCase();
      const asset = (t.asset ?? "").toLowerCase();
      return title.includes(q) || asset.includes(q);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpNum = (a: number, b: number) => (a - b) * dir;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "when":
          return cmpNum(a.timestamp, b.timestamp);
        case "market":
          return (a.title ?? "").localeCompare(b.title ?? "") * dir;
        case "side":
          return a.side.localeCompare(b.side) * dir;
        case "outcome":
          return (a.outcome ?? "").localeCompare(b.outcome ?? "") * dir;
        case "shares":
          return cmpNum(a.size, b.size);
        case "price":
          return cmpNum(a.price, b.price);
        case "notional":
          return cmpNum(a.size * a.price, b.size * b.price);
        default:
          return 0;
      }
    });
  }, [trades, query, sideFilter, sortKey, sortDir]);

  if (error) {
    return (
      <EmptyState
        compact
        title="Couldn't load trades"
        body={error}
        tone="error"
      />
    );
  }
  if (trades == null) {
    return <LoadingState variant="panel" compact title="Loading trades…" />;
  }
  if (trades.length === 0) {
    return (
      <EmptyState
        compact
        title="No trades found"
        body="This wallet hasn't traded on Polymarket yet, or its history is older than our index window."
      />
    );
  }

  const all = filteredAndSorted ?? [];
  const filterActive = query.trim().length > 0 || sideFilter !== "all";
  const rows = limit ? all.slice(0, limit) : all;

  return (
    <div>
      {/* Controls only appear once there's enough volume to want them. */}
      {trades.length > 5 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
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
          {filterActive ? (
            <span className="ml-auto text-[10px] text-muted-2 tabular">
              {all.length.toLocaleString()} of {trades.length.toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {filterActive && rows.length === 0 ? (
        <section className="rounded-md border border-border bg-surface/40 px-6 py-8 text-center text-[12px] text-muted">
          No trades match your filter.{" "}
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
        </section>
      ) : (
        <>
        <MobileTradeList trades={rows} />
        <section className="hidden sm:block overflow-hidden rounded-md border border-border bg-surface/40">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-2/40 text-[10px] uppercase tracking-wider text-muted-2">
              <tr>
                <SortableTh sortKey="market" current={sortKey} dir={sortDir} onClick={setSort}>Market</SortableTh>
                <SortableTh sortKey="side" current={sortKey} dir={sortDir} onClick={setSort}>Side</SortableTh>
                <SortableTh sortKey="outcome" current={sortKey} dir={sortDir} onClick={setSort}>Outcome</SortableTh>
                <SortableTh sortKey="shares" current={sortKey} dir={sortDir} onClick={setSort} align="right">Shares</SortableTh>
                <SortableTh sortKey="price" current={sortKey} dir={sortDir} onClick={setSort} align="right">Price</SortableTh>
                <SortableTh sortKey="notional" current={sortKey} dir={sortDir} onClick={setSort} align="right">Notional</SortableTh>
                <SortableTh sortKey="when" current={sortKey} dir={sortDir} onClick={setSort} align="right">When</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={`${t.transactionHash}-${t.asset}-${t.timestamp}`}
                  className="border-t border-border/60 hover:bg-surface-2/30"
                >
                  <td className="max-w-[320px] truncate px-3 py-2 text-foreground">
                    {t.slug ? (
                      <a
                        href={`/markets/${t.slug}`}
                        className="inline-flex items-center gap-1 hover:underline"
                        title={t.title}
                      >
                        <span className="truncate">{t.title ?? "—"}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0 text-muted-2"
                          aria-hidden="true"
                        />
                      </a>
                    ) : (
                      <span className="truncate">{t.title ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        t.side === "BUY"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300",
                      )}
                    >
                      {t.side}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-muted">{t.outcome ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtShares(t.size)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">
                    {fmtCents(t.price)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtUSD(t.size * t.price)}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-2">
                    {fmtRelative(t.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
              Refreshing…
            </div>
          ) : null}
          {limit && all.length > limit ? (
            <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
              Showing {limit} of {all.length}
              {filterActive ? " filtered" : ""} trades.
            </div>
          ) : null}
        </section>
        </>
      )}
    </div>
  );
}

// SortableTh, fmtShares, fmtCents, fmtUSD, fmtRelative
// → all moved to lib/format.ts and components/ui/DataTable.tsx.
