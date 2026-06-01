"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import type { SortingState } from "@tanstack/react-table";
import { Activity, AlignJustify, BookmarkPlus, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { SubtypeFilter } from "./SubtypeFilter";
import { MarketTable } from "./MarketTable";
import { SearchBar } from "./SearchBar";
import { TickerChips } from "./TickerChips";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { OrderTicket } from "./OrderTicket";
import { SUBTYPE_CHIPS } from "@/lib/families";
import { cn } from "@/lib/cn";
import { useStarred } from "@/lib/useStarred";
import { useDensity } from "@/lib/useDensity";
import { useLiveMidMap } from "@/lib/useLiveMarket";
import { useSavedFilters } from "@/lib/useSavedFilters";
import type { Family, TableRow } from "@/lib/types";

// Maximum number of YES tokens to live-subscribe to via the Polymarket WS.
// Picked from the top of the *unfiltered* set by 24h volume so subscriptions
// are stable across filter/sort interactions. Anything beyond this still
// shows the 60s-snapshot mid — good enough for the long-tail markets the
// user isn't actively watching.
const LIVE_SUBSCRIBE_TOP_N = 50;

const FAMILY_VALUES = SUBTYPE_CHIPS.map((c) => c.family);
const familyParser = parseAsStringLiteral(FAMILY_VALUES).withDefault("all");
// Default sort: closes-soonest first. The screener's whole reason to exist
// is helping you find sharp short-dated bets — ranking by 24h volume hid
// today's daily/weekly strikes underneath month-out lifetime-volume
// leaders. Click the "24h volume" header once to swap back.
const sortParser = parseAsString.withDefault("days:asc");
const searchParser = parseAsString.withDefault("");
const tickerParser = parseAsString.withDefault("");
const starredParser = parseAsStringLiteral(["1"] as const);
const liveParser = parseAsStringLiteral(["1"] as const);

type Props = {
  rows: TableRow[];
};

const DEFAULT_SORT = "days:asc";

// One-tap "quick screens" — curated starter views built from the sorts the
// table already supports (column ids: delta, delta24h, depth, rc, volume24h,
// days). Lowers the cold-start cost of the screener for newcomers without
// adding any new query surface. `live` arms the existing "Live only" toggle.
const QUICK_SCREENS: { label: string; sort: string; live?: boolean; hint: string }[] = [
  { label: "Closing soon", sort: "days:asc", hint: "Ending soonest first — short-dated bets" },
  { label: "Near trigger", sort: "delta:asc", live: true, hint: "Closest to crossing their resolution line" },
  { label: "Biggest movers", sort: "delta24h:desc", hint: "Largest 24h odds shifts" },
  { label: "Deepest books", sort: "depth:desc", hint: "Most order-book liquidity to size into" },
  { label: "High clarity", sort: "rc:desc", live: true, hint: "Cleanest resolution path (Clarity score)" },
  { label: "Most traded", sort: "volume24h:desc", hint: "Busiest markets by 24h volume" },
  { label: "Most competitive", sort: "competitive", hint: "Closest to a 50/50 coin-flip" },
];

// Numeric MIN/MAX screener filters. Keys index the local filter state; all map
// to fields already on TableRow, so this is pure client-side filtering.
const FILTER_FIELDS = [
  { key: "minVol", label: "Min 24h vol ($)", ph: "e.g. 5000" },
  { key: "minDepth", label: "Min depth ($)", ph: "e.g. 1000" },
  { key: "maxDist", label: "Max distance (%)", ph: "e.g. 5" },
  { key: "minRc", label: "Min clarity", ph: "0–100" },
] as const;

function parseSort(s: string): SortingState {
  if (!s) return [];
  const idx = s.lastIndexOf(":");
  if (idx <= 0) return [{ id: s, desc: true }];
  const id = s.slice(0, idx);
  const dir = s.slice(idx + 1);
  if (!id) return [];
  return [{ id, desc: dir === "desc" }];
}

function serializeSort(sorting: SortingState): string | null {
  if (sorting.length === 0) return null;
  const s = sorting[0];
  const v = `${s.id}:${s.desc ? "desc" : "asc"}`;
  return v === DEFAULT_SORT ? null : v;
}

export function Screener({ rows }: Props) {
  const [active, setActive] = useQueryState("subtype", familyParser);
  const [sortParam, setSortParam] = useQueryState("sort", sortParser);
  const [search, setSearch] = useQueryState("q", searchParser);
  const [ticker, setTicker] = useQueryState("ticker", tickerParser);
  const [starredFlag, setStarredFlag] = useQueryState("starred", starredParser);
  const [liveFlag, setLiveFlag] = useQueryState("live", liveParser);

  const { starred } = useStarred();
  const [density, setDensity] = useDensity();
  const isStarredOn = starredFlag === "1";
  const isLiveOn = liveFlag === "1";

  const [showFilters, setShowFilters] = useState(false);
  const [numFilters, setNumFilters] = useState({
    minVol: "",
    minDepth: "",
    maxDist: "",
    minRc: "",
  });
  const nf = useMemo(
    () => ({
      minVol: parseFloat(numFilters.minVol),
      minDepth: parseFloat(numFilters.minDepth),
      maxDist: parseFloat(numFilters.maxDist),
      minRc: parseFloat(numFilters.minRc),
    }),
    [numFilters],
  );
  const numFilterCount = Object.values(numFilters).filter((v) => v.trim() !== "").length;

  const liveCount = useMemo(
    () => rows.filter((r) => r.liveState === "live").length,
    [rows],
  );

  // Subscribe to live mids for the top-volume YES tokens; merge them into
  // each row's `impliedYes` field. The downstream MarketTable / MobileList
  // stay oblivious — they see a regular TableRow with possibly-live values.
  const topTokenIds = useMemo(() => {
    return [...rows]
      .filter((r): r is TableRow & { tokenYes: string } => Boolean(r.tokenYes))
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      .slice(0, LIVE_SUBSCRIBE_TOP_N)
      .map((r) => r.tokenYes);
  }, [rows]);
  const liveMids = useLiveMidMap(topTokenIds);
  const rowsWithLive = useMemo(() => {
    if (liveMids.size === 0) return rows;
    return rows.map((r) => {
      if (!r.tokenYes) return r;
      const mid = liveMids.get(r.tokenYes);
      if (mid == null) return r;
      return { ...r, impliedYes: mid };
    });
  }, [rows, liveMids]);

  // "competitive" is an alternate sort that isn't a table column (closeness to
  // 50/50). In that mode we pre-sort the rows ourselves and hand the table an
  // empty SortingState — both the desktop table (react-table) and the mobile
  // list preserve input order when sorting is empty. Clicking any column header
  // sets a real sort and exits competitive mode naturally.
  const isCompetitive = sortParam === "competitive";
  const sorting = useMemo(
    () => (isCompetitive ? [] : parseSort(sortParam)),
    [sortParam, isCompetitive],
  );
  const setSorting = (next: SortingState) => {
    setSortParam(serializeSort(next), { shallow: true });
  };

  // When the marquee asks to focus a market, make sure no filter is hiding it.
  useEffect(() => {
    function onFocus(ev: Event) {
      const id = (ev as CustomEvent<string>).detail;
      const target = rowsWithLive.find((r) => r.id === id);
      if (!target) return;
      if (active !== "all" && target.family !== active) {
        setActive(null, { shallow: true });
      }
      if (search) setSearch(null, { shallow: true });
      if (ticker && target.symbol !== ticker) setTicker(null, { shallow: true });
      if (isStarredOn && !starred.has(id)) setStarredFlag(null, { shallow: true });
      if (isLiveOn && target.liveState !== "live") setLiveFlag(null, { shallow: true });
    }
    window.addEventListener("auspex:focus-market", onFocus);
    return () => window.removeEventListener("auspex:focus-market", onFocus);
  }, [rowsWithLive, active, search, ticker, isStarredOn, starred, isLiveOn, setActive, setSearch, setTicker, setStarredFlag, setLiveFlag]);

  const counts = useMemo(() => {
    const c: Partial<Record<Family | "all", number>> = { all: rowsWithLive.length };
    for (const r of rowsWithLive) {
      c[r.family] = (c[r.family] ?? 0) + 1;
    }
    return c;
  }, [rowsWithLive]);

  // Discover available tickers from binance_price markets so the chip row reflects
  // what actually exists rather than a hardcoded list.
  const tickerOptions = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of rowsWithLive) {
      if (r.family !== "binance_price") continue;
      const t = r.symbol;
      if (!t) continue;
      tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t, n]) => ({ ticker: t, count: n }));
  }, [rowsWithLive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rowsWithLive.filter((r) => {
      if (active !== "all" && r.family !== active) return false;
      if (ticker && r.symbol !== ticker) return false;
      if (isStarredOn && !starred.has(r.id)) return false;
      if (isLiveOn && r.liveState !== "live") return false;
      if (q && !r.question.toLowerCase().includes(q)) return false;
      // Numeric range filters (blank input parses to NaN = inactive).
      if (!Number.isNaN(nf.minVol) && r.volume24h < nf.minVol) return false;
      if (!Number.isNaN(nf.minDepth) && (r.liquidity ?? 0) < nf.minDepth) return false;
      if (!Number.isNaN(nf.maxDist)) {
        if (r.liveState !== "live" || r.distancePct == null) return false;
        if (Math.abs(r.distancePct * 100) > nf.maxDist) return false;
      }
      if (!Number.isNaN(nf.minRc) && (r.rc ?? -1) < nf.minRc) return false;
      return true;
    });
  }, [rowsWithLive, active, ticker, isStarredOn, starred, isLiveOn, search, nf]);

  // Apply the "competitive" (closeness-to-50/50) pre-sort when active; markets
  // with no implied price sink to the bottom.
  const displayRows = useMemo(() => {
    if (!isCompetitive) return filtered;
    const dist = (r: TableRow) =>
      r.impliedYes == null
        ? Number.POSITIVE_INFINITY
        : Math.abs(r.impliedYes - 0.5);
    return [...filtered].sort((a, b) => dist(a) - dist(b));
  }, [filtered, isCompetitive]);

  const showTickerRow = (active === "all" || active === "binance_price") && tickerOptions.length > 0;

  const filtersActive =
    active !== "all" ||
    ticker !== "" ||
    isStarredOn ||
    isLiveOn ||
    numFilterCount > 0 ||
    search.trim() !== "";

  const [ticket, setTicket] = useState<{
    market: TableRow;
    outcome: "yes" | "no";
  } | null>(null);

  useEffect(() => {
    function onOpen(ev: Event) {
      const detail = (ev as CustomEvent<{ id: string; outcome: "yes" | "no" }>).detail;
      const market = rowsWithLive.find((r) => r.id === detail.id);
      if (!market) return;
      setTicket({ market, outcome: detail.outcome });
    }
    window.addEventListener("auspex:open-ticket", onOpen);
    return () => window.removeEventListener("auspex:open-ticket", onOpen);
  }, [rowsWithLive]);

  const { save: saveFilter } = useSavedFilters();

  function onSaveView() {
    const suggested = [
      active !== "all" ? active : null,
      ticker || null,
      search.trim() ? `"${search.trim()}"` : null,
      isStarredOn ? "starred" : null,
      isLiveOn ? "live" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const name = window.prompt(
      "Name this view:",
      suggested || "Custom view",
    );
    if (!name || !name.trim()) return;
    saveFilter({
      name: name.trim(),
      subtype: active === "all" ? null : active,
      ticker: ticker || null,
      search: search.trim() || null,
      starred: isStarredOn,
      live: isLiveOn,
      sort: sortParam === DEFAULT_SORT ? null : sortParam,
    });
    toast.success(`Saved "${name.trim()}" to your watchlists.`);
  }

  const applyQuickScreen = useCallback(
    (p: (typeof QUICK_SCREENS)[number]) => {
      setSortParam(p.sort === DEFAULT_SORT ? null : p.sort, { shallow: true });
      setLiveFlag(p.live ? "1" : null, { shallow: true });
    },
    [setSortParam, setLiveFlag],
  );
  const activeQuickScreen = (p: (typeof QUICK_SCREENS)[number]) =>
    (sortParam || DEFAULT_SORT) === p.sort && !!p.live === isLiveOn;

  const resetAll = useCallback(() => {
    setActive(null, { shallow: true });
    setTicker(null, { shallow: true });
    setStarredFlag(null, { shallow: true });
    setLiveFlag(null, { shallow: true });
    setSearch(null, { shallow: true });
    setNumFilters({ minVol: "", minDepth: "", maxDist: "", minRc: "" });
  }, [setActive, setTicker, setStarredFlag, setLiveFlag, setSearch]);

  return (
    <section className="border-t border-border">
      <KeyboardShortcuts onClearFilters={resetAll} hasFilters={filtersActive} />
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              value={search}
              onChange={(v) => setSearch(v ? v : null, { shallow: true })}
            />
            {filtersActive ? (
              <>
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-1 text-[11px] font-medium text-muted ring-1 ring-border hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
                <button
                  type="button"
                  onClick={onSaveView}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/40 hover:bg-accent/25"
                  title="Save the current filter combination as a named view in /watchlists"
                >
                  <BookmarkPlus className="h-3 w-3" />
                  Save view
                </button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                aria-pressed={numFilterCount > 0}
                aria-expanded={showFilters}
                title="Filter by volume, depth, distance, clarity"
                className={
                  numFilterCount > 0
                    ? "inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-accent ring-1 ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    : "inline-flex items-center gap-1.5 rounded-full bg-zinc-700/40 px-2.5 py-1 text-[12px] font-medium text-zinc-200 ring-1 ring-zinc-500/40 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                }
              >
                <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                Filters
                {numFilterCount > 0 ? (
                  <span className="tabular text-[10px] opacity-80">{numFilterCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setDensity(density === "compact" ? "default" : "compact")}
                className={
                  density === "compact"
                    ? "inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-accent ring-1 ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    : "inline-flex items-center gap-1.5 rounded-full bg-zinc-700/40 px-2.5 py-1 text-[12px] font-medium text-zinc-200 ring-1 ring-zinc-500/40 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                }
                title="Compact row density — fit more rows on screen"
                aria-pressed={density === "compact"}
              >
                <AlignJustify className="h-3 w-3" aria-hidden="true" />
                Compact
              </button>
              <button
                type="button"
                onClick={() => setLiveFlag(isLiveOn ? null : "1", { shallow: true })}
                className={
                  isLiveOn
                    ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-medium text-emerald-200 ring-1 ring-emerald-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    : "inline-flex items-center gap-1.5 rounded-full bg-zinc-700/40 px-2.5 py-1 text-[12px] font-medium text-zinc-200 ring-1 ring-zinc-500/40 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                }
                title="Only markets with a machine-readable trigger we can score"
                aria-pressed={isLiveOn}
              >
                <Activity
                  className={
                    isLiveOn ? "h-3 w-3 text-emerald-300" : "h-3 w-3 text-zinc-400"
                  }
                  aria-hidden="true"
                />
                Live only
                <span className="tabular text-[10px] opacity-70">{liveCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setStarredFlag(isStarredOn ? null : "1", { shallow: true })}
                className={
                  isStarredOn
                    ? "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] font-medium text-amber-200 ring-1 ring-amber-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    : "inline-flex items-center gap-1.5 rounded-full bg-zinc-700/40 px-2.5 py-1 text-[12px] font-medium text-zinc-200 ring-1 ring-zinc-500/40 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                }
                title="Show only starred markets"
                aria-pressed={isStarredOn}
              >
                <span className={isStarredOn ? "text-amber-300" : "text-zinc-400"} aria-hidden="true">
                  ★
                </span>
                Starred
                <span className="tabular text-[10px] opacity-70">{starred.size}</span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
              Quick screens
            </span>
            {QUICK_SCREENS.map((p) => {
              const on = activeQuickScreen(p);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyQuickScreen(p)}
                  aria-pressed={on}
                  title={p.hint}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    on
                      ? "bg-accent/15 text-accent ring-accent/40"
                      : "bg-zinc-700/40 text-zinc-200 ring-zinc-500/40 hover:brightness-125",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <SubtypeFilter
            active={active}
            onChange={(next) =>
              setActive(next === "all" ? null : next, { shallow: true })
            }
            counts={counts}
          />
          {showTickerRow ? (
            <TickerChips
              options={tickerOptions}
              active={ticker}
              onChange={(next) => setTicker(next || null, { shallow: true })}
            />
          ) : null}
          {showFilters ? (
            <div className="rounded-md border border-border bg-surface/40 p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FILTER_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                      {f.label}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={numFilters[f.key]}
                      placeholder={f.ph}
                      onChange={(e) =>
                        setNumFilters((s) => ({ ...s, [f.key]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] tabular text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </label>
                ))}
              </div>
              {numFilterCount > 0 ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setNumFilters({ minVol: "", minDepth: "", maxDist: "", minRc: "" })
                    }
                    className="text-[11px] text-muted hover:text-foreground"
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <MarketTable
          rows={displayRows}
          sorting={sorting}
          onSortingChange={setSorting}
          onClearFilters={filtersActive ? resetAll : undefined}
          density={density}
        />
      </div>
      <OrderTicket
        open={ticket !== null}
        market={ticket?.market ?? null}
        initialOutcome={ticket?.outcome ?? "yes"}
        onClose={() => setTicket(null)}
      />
    </section>
  );
}
