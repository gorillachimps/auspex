"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Download,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useClobSession } from "@/lib/useClobSession";
import { useMarketLookup } from "@/lib/useMarketLookup";
import { useUserPositions, type Position } from "@/lib/useUserPositions";
import { openDepositDialog } from "@/lib/depositDialog";
import { placeMarketOrder, Side, tickToString } from "@/lib/polymarket";
import { cn } from "@/lib/cn";
import { csvFilename, downloadCsv, toCsv } from "@/lib/csv";
import {
  fmtAgoWithSuffix,
  fmtCloseIn,
  fmtPctSigned,
  fmtUSD,
  fmtUSDSigned,
  urgencyForEnd,
} from "@/lib/format";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";
import { SortableTh, Td, Th } from "./ui/DataTable";
import type { SortDir } from "./ui/DataTable";
import { MobilePositionList } from "./MobilePositionList";

// Polymarket's default tick size when the snapshot didn't capture one.
// Almost all binary markets are 0.01; the few thin-price markets use 0.001
// and would be present in the lookup if so.
const DEFAULT_TICK = 0.01;

type SortKey =
  | "market"
  | "side"
  | "shares"
  | "avgPrice"
  | "curPrice"
  | "value"
  | "pnl"
  | "endDate";

// Position type + the shared polling store live in lib/useUserPositions.

// All number/date formatting comes from lib/format. Aliases below map the
// in-file shorthand we use in JSX to the canonical names — saves clutter
// at call sites without forcing a rename of every old reference.
const fmtSignedUSD = fmtUSDSigned;
const fmtPct = fmtPctSigned;
const fmtDate = fmtCloseIn;
const fmtAgo = fmtAgoWithSuffix;

export function PortfolioView() {
  const session = useClobSession();
  const funder = session.funderAddress;
  // Positions come from the shared store (one poll per funder, fanned out to
  // every consumer). `state` is a thin shim so the existing `state.positions`
  // read sites don't need touching.
  const { positions, loading, error, fetchedAt, refresh } =
    useUserPositions(funder);
  const state = { positions, loading, error, fetchedAt };
  // Default sort: best winners on top — what most traders want first.
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // `closing` tracks per-position close-in-flight so the row buttons can
  // show a spinner and we can prevent double-submits. Keyed by asset id.
  const [closing, setClosing] = useState<Set<string>>(() => new Set());
  // `closeAllConfirm` gates the bulk-close action behind a confirmation
  // panel. null = closed; "review" = panel shown; "running" = in-flight.
  const [closeAllMode, setCloseAllMode] = useState<
    null | "review" | "running"
  >(null);
  // Live progress during a bulk close.
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    failed: number;
    total: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  // Tick once a second so the "Updated Xs ago" label stays fresh between
  // auto-refresh ticks. Cheap — one re-render per second, no network.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Toggle direction when clicking the same column; switch to that column
  // with a sensible default direction otherwise (descending for numeric,
  // ascending for text/date).
  function setSort(next: SortKey) {
    if (next === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "market" || next === "endDate" ? "asc" : "desc");
  }

  const summary = useMemo(() => {
    if (!state.positions) return null;
    let count = 0;
    let totalValue = 0;
    let totalPnl = 0;
    let redeemable = 0;
    for (const p of state.positions) {
      count++;
      if (isFinite(p.currentValue)) totalValue += p.currentValue;
      if (isFinite(p.cashPnl)) totalPnl += p.cashPnl;
      if (p.redeemable) redeemable++;
    }
    return { count, totalValue, totalPnl, redeemable };
  }, [state.positions]);

  const sortedPositions = useMemo(() => {
    if (!state.positions) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? state.positions.filter((p) => p.title.toLowerCase().includes(q))
      : state.positions;
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpNum = (a: number, b: number) => (a - b) * dir;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "market":
          return a.title.localeCompare(b.title) * dir;
        case "side":
          // Yes < No alphabetically — fine as a deterministic group sort.
          return a.outcome.localeCompare(b.outcome) * dir;
        case "shares":
          return cmpNum(a.size, b.size);
        case "avgPrice":
          return cmpNum(a.avgPrice, b.avgPrice);
        case "curPrice":
          return cmpNum(a.curPrice, b.curPrice);
        case "value":
          return cmpNum(a.currentValue, b.currentValue);
        case "pnl":
          return cmpNum(a.cashPnl, b.cashPnl);
        case "endDate": {
          // Missing endDate sorts to the very end regardless of direction —
          // those positions aren't bound by a closing date.
          const ta = a.endDate ? Date.parse(a.endDate) : Number.NaN;
          const tb = b.endDate ? Date.parse(b.endDate) : Number.NaN;
          if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
          if (Number.isNaN(ta)) return 1;
          if (Number.isNaN(tb)) return -1;
          return (ta - tb) * dir;
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [state.positions, sortKey, sortDir, query]);

  const totalLoaded = state.positions?.length ?? 0;
  const shownCount = sortedPositions?.length ?? 0;
  const filterActive = query.trim().length > 0;

  // Look up tickSize + negRisk for every position's token so we can submit
  // valid market sells. The hook batches into one /api/markets/by-token call
  // and caches across re-renders.
  const tokenIds = useMemo(
    () => (state.positions ?? []).map((p) => p.asset).filter(Boolean),
    [state.positions],
  );
  const tokenLookup = useMarketLookup(tokenIds);

  // Close ONE position with a Fill-and-Kill market sell. Pulls tickSize from
  // the lookup (defaults to 0.01 when the market isn't in our snapshot —
  // most binary markets use 0.01 and the SDK will reject if wrong, so we
  // surface that as a toast error). Builder code rides on every order via
  // placeMarketOrder.
  async function closeOne(p: Position): Promise<boolean> {
    if (!session.client) {
      toast.error("Sign in to close positions.");
      return false;
    }
    if (closing.has(p.asset)) return false;
    setClosing((s) => new Set(s).add(p.asset));
    const lookup = tokenLookup[p.asset];
    const tickSize = tickToString(lookup?.tickSize ?? DEFAULT_TICK);
    const negRisk = lookup?.negRisk ?? !!p.negativeRisk;
    const toastId = toast.loading(
      `Closing ${p.size.toFixed(2)} ${p.outcome.toUpperCase()} of ${p.title.slice(0, 60)}…`,
    );
    try {
      const resp = await placeMarketOrder({
        client: session.client,
        tokenID: p.asset,
        amount: p.size,
        side: Side.SELL,
        tickSize,
        negRisk,
      });
      if (resp && typeof resp === "object" && (resp as { success?: boolean }).success === false) {
        throw new Error(
          (resp as { errorMsg?: string }).errorMsg || "order rejected",
        );
      }
      toast.success(
        `Closed ${p.size.toFixed(2)} ${p.outcome.toUpperCase()} ≈ ${fmtUSD(p.currentValue)}`,
        { id: toastId, duration: 5000 },
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auspex:order-placed"));
      }
      return true;
    } catch (e) {
      const msg = (e as Error).message ?? "unknown error";
      toast.error(`Couldn't close: ${msg}`, { id: toastId, duration: 8000 });
      return false;
    } finally {
      setClosing((s) => {
        const next = new Set(s);
        next.delete(p.asset);
        return next;
      });
    }
  }

  // Sequentially market-sell every open position. Sequential (not parallel)
  // so we don't flood the CLOB with N concurrent FAK orders and risk rate
  // limits or partial-fill weirdness when the same trader sells across
  // multiple markets in one second. Reports running progress so the user
  // can see it actually working on large portfolios.
  async function closeAll() {
    const positions = state.positions ?? [];
    if (positions.length === 0) return;
    setCloseAllMode("running");
    setBulkProgress({ done: 0, failed: 0, total: positions.length });
    let done = 0;
    let failed = 0;
    for (const p of positions) {
      const ok = await closeOne(p);
      if (ok) done += 1;
      else failed += 1;
      setBulkProgress({ done, failed, total: positions.length });
    }
    setCloseAllMode(null);
    setBulkProgress(null);
    if (failed === 0) {
      toast.success(`Closed all ${done} positions.`, { duration: 5000 });
    } else {
      toast.warning(
        `Closed ${done} of ${positions.length} positions — ${failed} failed.`,
        { duration: 7000 },
      );
    }
  }

  if (session.status === "disabled") {
    return (
      <div className="mt-8">
        <EmptyState
          title="Trading isn't enabled on this deploy"
          body="The screener still works — head back to the home page to browse markets."
        />
      </div>
    );
  }
  if (session.status === "loading") {
    return (
      <div className="mt-8">
        <LoadingState
          variant="panel"
          title="Connecting…"
          body="Setting up the wallet connection."
        />
      </div>
    );
  }
  if (session.status === "unconnected") {
    return (
      <div className="mt-8">
        <EmptyState
          title="Connect your wallet to see positions"
          body="Use the Connect button in the top-right. Your wallet signs everything — Auspex never takes custody."
        />
      </div>
    );
  }
  if (session.status === "no-funder") {
    return (
      <div className="mt-8">
        <EmptyState
          title="One more step — link your Polymarket account"
          body="We'll auto-detect it from your connected wallet, or you can paste the address. Takes a few seconds."
          cta={
            <button
              type="button"
              onClick={openDepositDialog}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent/25"
            >
              Link account
            </button>
          }
        />
      </div>
    );
  }
  if (state.loading && !state.positions) {
    return (
      <div className="mt-8">
        <LoadingState
          variant="panel"
          title="Pulling your positions…"
          body="Fetching from Polymarket. This usually takes a second."
        />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="mt-8">
        <EmptyState
          title="Couldn't load your positions"
          body={state.error}
          tone="error"
        />
      </div>
    );
  }
  if (!state.positions || state.positions.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          title="No open positions yet"
          body="Place a YES or NO order from the screener and any filled shares will appear here. Closed-out positions (net zero) drop off — only outcomes you currently hold show up."
        />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2">
        {summary ? (
          <>
            <Stat
              label={filterActive ? "Shown" : "Positions"}
              value={
                filterActive
                  ? `${shownCount.toLocaleString()} / ${summary.count.toLocaleString()}`
                  : summary.count.toLocaleString()
              }
            />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat label="Mark value" value={fmtUSD(summary.totalValue)} />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat
              label="Unrealised P&L"
              value={fmtSignedUSD(summary.totalPnl).text}
              tone={
                summary.totalPnl > 0
                  ? "emerald"
                  : summary.totalPnl < 0
                    ? "rose"
                    : "neutral"
              }
            />
            {summary.redeemable > 0 ? (
              <>
                <span className="text-border-strong" aria-hidden="true">·</span>
                <a
                  href="https://polymarket.com/portfolio"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Polymarket to claim your settled markets"
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
                >
                  Redeem {summary.redeemable} on Polymarket
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </>
            ) : null}
          </>
        ) : null}
        {state.fetchedAt ? (
          <span
            className="text-[10px] text-muted-2 tabular"
            title={new Date(state.fetchedAt).toLocaleTimeString()}
          >
            Updated {fmtAgo(now - state.fetchedAt)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCloseAllMode("review")}
            disabled={
              !state.positions ||
              state.positions.length === 0 ||
              closeAllMode === "running" ||
              session.status !== "ready"
            }
            title={`Market-sell all ${state.positions?.length ?? 0} open positions in one go`}
            className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {closeAllMode === "running" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <XCircle className="h-3 w-3" aria-hidden="true" />
            )}
            {closeAllMode === "running" && bulkProgress
              ? `Closing ${bulkProgress.done + bulkProgress.failed} / ${bulkProgress.total}…`
              : "Close all"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!state.positions || state.positions.length === 0) return;
              const headers = [
                "market",
                "outcome",
                "shares",
                "avg_price",
                "current_price",
                "current_value_usdc",
                "cash_pnl_usdc",
                "percent_pnl",
                "redeemable",
                "end_date",
                "slug",
                "asset",
                "condition_id",
              ];
              const rows = state.positions.map((p) => [
                p.title,
                p.outcome,
                p.size,
                p.avgPrice,
                p.curPrice,
                p.currentValue,
                p.cashPnl,
                p.percentPnl,
                p.redeemable,
                p.endDate ?? "",
                p.slug,
                p.asset,
                p.conditionId,
              ]);
              downloadCsv(csvFilename("positions"), toCsv(headers, rows));
            }}
            disabled={!state.positions || state.positions.length === 0}
            title="Download positions as a CSV file"
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => refresh()}
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

      {closeAllMode === "review" && state.positions && state.positions.length > 0 ? (
        <div className="mb-4 rounded-md border border-rose-400/40 bg-rose-500/10 p-3">
          <div className="flex items-start gap-2">
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-rose-300"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-rose-200">
                Close all positions at market?
              </div>
              <p className="mt-1 text-[12px] text-rose-100/90">
                Auspex will market-sell each of your {state.positions.length}{" "}
                open positions, one at a time. Estimated total proceeds:{" "}
                <span className="font-semibold tabular">
                  {fmtUSD(
                    state.positions.reduce(
                      (s, p) => s + (isFinite(p.currentValue) ? p.currentValue : 0),
                      0,
                    ),
                  )}
                </span>
                . Actual fills depend on each market's live order book — thin
                books may fill at worse prices than the displayed mid.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCloseAllMode(null)}
                  className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={closeAll}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-400/60 bg-rose-500/20 px-3 py-1.5 text-[12px] font-semibold text-rose-100 hover:bg-rose-500/30"
                >
                  <XCircle className="h-3 w-3" aria-hidden="true" />
                  Confirm — close all
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {totalLoaded > 4 ? (
        <div className="mb-3">
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter positions by market…"
              aria-label="Filter positions by market"
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
        </div>
      ) : null}

      {filterActive && shownCount === 0 ? (
        <div className="rounded-md border border-border bg-surface/40 px-6 py-10 text-center">
          <p className="text-sm text-muted">
            No positions match your filter.{" "}
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-accent hover:underline"
            >
              Clear search
            </button>
          </p>
        </div>
      ) : (
      <>
      <MobilePositionList
        positions={sortedPositions ?? []}
        onClose={(asset) => {
          const pos = (sortedPositions ?? []).find((p) => p.asset === asset);
          if (pos) closeOne(pos);
        }}
        closing={closing}
        closeDisabled={closeAllMode === "running" || session.status !== "ready"}
      />
      <div className="hidden sm:block overflow-x-auto rounded-md border border-border bg-surface/20">
        <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <SortableTh sortKey="market" current={sortKey} dir={sortDir} onClick={setSort}>Market</SortableTh>
              <SortableTh sortKey="side" current={sortKey} dir={sortDir} onClick={setSort}>Side</SortableTh>
              <SortableTh sortKey="shares" current={sortKey} dir={sortDir} onClick={setSort}>Shares</SortableTh>
              <SortableTh sortKey="avgPrice" current={sortKey} dir={sortDir} onClick={setSort}>Avg</SortableTh>
              <SortableTh sortKey="curPrice" current={sortKey} dir={sortDir} onClick={setSort}>Current</SortableTh>
              <SortableTh sortKey="value" current={sortKey} dir={sortDir} onClick={setSort}>Value</SortableTh>
              <SortableTh sortKey="pnl" current={sortKey} dir={sortDir} onClick={setSort}>P&amp;L</SortableTh>
              <SortableTh sortKey="endDate" current={sortKey} dir={sortDir} onClick={setSort}>Closes</SortableTh>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(sortedPositions ?? []).map((p) => {
              const isYes = p.outcome.toLowerCase() === "yes";
              const pnl = fmtSignedUSD(p.cashPnl);
              return (
                <tr
                  key={`${p.conditionId}-${p.asset}`}
                  className="border-b border-border hover:bg-surface/40"
                >
                  <Td>
                    <a
                      href={`/markets/${p.slug}`}
                      className="block max-w-[26rem] truncate text-[12px] text-foreground hover:text-accent hover:underline"
                      title={p.title}
                    >
                      {p.title}
                    </a>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                        isYes
                          ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                          : "bg-rose-500/15 text-rose-200 ring-rose-400/30",
                      )}
                    >
                      {p.outcome}
                    </span>
                    {p.redeemable ? (
                      <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-200 ring-1 ring-amber-400/30">
                        redeem
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="tabular text-foreground">
                      {p.size.toFixed(2)}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular text-[12px] text-muted">
                      {p.avgPrice > 0 ? `$${p.avgPrice.toFixed(3)}` : "—"}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular text-foreground">
                      ${p.curPrice.toFixed(3)}
                    </span>
                  </Td>
                  <Td>
                    <span className="tabular text-foreground">
                      {fmtUSD(p.currentValue)}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-col leading-tight">
                      <span
                        className={cn(
                          "tabular text-[12px] font-medium",
                          pnl.sign > 0
                            ? "text-emerald-300"
                            : pnl.sign < 0
                              ? "text-rose-300"
                              : "text-muted",
                        )}
                      >
                        {pnl.sign > 0 ? "+" : ""}
                        {pnl.text}
                      </span>
                      <span className="tabular text-[10px] text-muted-2">
                        {fmtPct(p.percentPnl)}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {(() => {
                      const urgency = urgencyForEnd(p.endDate);
                      const tone =
                        urgency === "urgent"
                          ? "text-rose-300"
                          : urgency === "soon"
                            ? "text-amber-300"
                            : urgency === "ended"
                              ? "text-muted-2"
                              : "text-muted";
                      return (
                        <span
                          className={cn("tabular text-[12px]", tone)}
                          title={p.endDate ?? undefined}
                        >
                          {fmtDate(p.endDate)}
                        </span>
                      );
                    })()}
                  </Td>
                  <Td>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => closeOne(p)}
                        disabled={
                          closing.has(p.asset) ||
                          closeAllMode === "running" ||
                          session.status !== "ready"
                        }
                        title={`Market-sell all ${p.size.toFixed(2)} ${p.outcome} shares (~${fmtUSD(p.currentValue)})`}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {closing.has(p.asset) ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-2.5 w-2.5" aria-hidden="true" />
                        )}
                        Close
                      </button>
                      <a
                        href={`https://polymarket.com/event/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded text-[11px] text-muted hover:text-foreground"
                        title="Open on Polymarket"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}
      <p className="mt-3 text-[11px] text-muted-2">
        Data via{" "}
        <code className="font-mono">data-api.polymarket.com/positions</code>.
        Mark value uses the live mid price; actual sell proceeds depend on the
        order book.
      </p>
    </div>
  );
}

// Th, Td, SortableTh now live in components/ui/DataTable.tsx.
// EmptyState and LoadingState in components/ui/.

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "emerald" | "rose";
}) {
  const colour =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
        ? "text-rose-300"
        : "text-foreground";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className={cn("tabular text-[13px] font-semibold", colour)}>
        {value}
      </span>
      {hint ? (
        <span className="tabular text-[10px] text-muted-2">{hint}</span>
      ) : null}
    </div>
  );
}
