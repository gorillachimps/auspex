"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";
import {
  ArrowRight,
  Bookmark,
  Check,
  Copy,
  Link2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MarketTable } from "./MarketTable";
import { useStarred } from "@/lib/useStarred";
import {
  describeSavedFilter,
  toScreenerUrl,
  useSavedFilters,
} from "@/lib/useSavedFilters";
import type { TableRow } from "@/lib/types";
import { EmptyState } from "./ui/EmptyState";

type Props = { rows: TableRow[] };

// Cap on how many IDs we'll accept in a single share URL. Polymarket
// market IDs are short numeric strings (~6-8 chars), so 100 IDs comfortably
// fits in a normal URL. Anything bigger is probably a copy-paste accident.
const MAX_SHARE_IDS = 100;

function parseShareIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,32}$/.test(s))
    .slice(0, MAX_SHARE_IDS);
}

export function WatchlistsView({ rows }: Props) {
  const { starred, mergeStarred } = useStarred();
  const { items: savedViews, remove: removeView } = useSavedFilters();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "volume24h", desc: true },
  ]);
  const [copied, setCopied] = useState(false);
  const [importDismissed, setImportDismissed] = useState(false);

  const incomingIds = useMemo(
    () => parseShareIds(searchParams.get("stars")),
    [searchParams],
  );
  // Only count IDs that aren't already in the user's set — otherwise the
  // "import N markets" banner would be misleading when most/all are dups.
  const newIncoming = useMemo(
    () => incomingIds.filter((id) => !starred.has(id)),
    [incomingIds, starred],
  );
  const showImportBanner =
    !importDismissed && incomingIds.length > 0 && newIncoming.length > 0;

  // Map incoming IDs to their market questions when available, so the import
  // banner gives the user a peek at what they'd be adding.
  const incomingPreview = useMemo(() => {
    if (!showImportBanner) return [];
    const byId = new Map(rows.map((r) => [r.id, r.question]));
    return newIncoming
      .map((id) => ({ id, question: byId.get(id) }))
      .slice(0, 3);
  }, [rows, newIncoming, showImportBanner]);

  function acceptImport() {
    const added = mergeStarred(newIncoming);
    setImportDismissed(true);
    toast.success(
      added === 1
        ? "Added 1 market to your watchlist."
        : `Added ${added} markets to your watchlist.`,
    );
    // Strip ?stars= from the URL so a refresh doesn't re-prompt.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("stars");
      window.history.replaceState({}, "", url.toString());
    }
  }

  async function copyShareLink() {
    if (typeof window === "undefined" || starred.size === 0) return;
    const ids = [...starred].slice(0, MAX_SHARE_IDS).join(",");
    const url = new URL("/watchlists", window.location.origin);
    url.searchParams.set("stars", ids);
    const href = url.toString();
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Share link copied — paste it anywhere.");
    } catch {
      toast.error(
        "Couldn't access the clipboard. Try Cmd/Ctrl+C from the URL bar.",
      );
    }
  }

  const watch = useMemo(
    () => rows.filter((r) => starred.has(r.id)),
    [rows, starred],
  );

  const shareCta =
    starred.size > 0 ? (
      <button
        type="button"
        onClick={copyShareLink}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
        title="Copy a URL that imports this watchlist into anyone else's browser"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-300" aria-hidden="true" />
        ) : (
          <Link2 className="h-3 w-3" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Share watchlist"}
      </button>
    ) : null;

  const importBanner = showImportBanner ? (
    <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            Someone shared a watchlist with you
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {newIncoming.length === incomingIds.length
              ? `Add ${newIncoming.length} ${newIncoming.length === 1 ? "market" : "markets"} to your list?`
              : `${incomingIds.length} markets in the link, ${newIncoming.length} new for you.`}
          </p>
          {incomingPreview.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-2">
              {incomingPreview.map((p) => (
                <li key={p.id} className="truncate">
                  · {p.question ?? `Market #${p.id}`}
                </li>
              ))}
              {newIncoming.length > incomingPreview.length ? (
                <li className="text-muted-2">
                  · and {newIncoming.length - incomingPreview.length} more…
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setImportDismissed(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1 text-[12px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Dismiss
          </button>
          <button
            type="button"
            onClick={acceptImport}
            className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent hover:bg-accent/25"
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            Add to my list
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const savedViewsBlock =
    savedViews.length > 0 ? (
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            Saved views · {savedViews.length}
          </h2>
          <a
            href="/"
            className="text-[11px] text-muted hover:text-foreground"
          >
            Add another from the screener →
          </a>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {savedViews.map((v) => (
            <li
              key={v.id}
              className="group rounded-md border border-border bg-surface/40 p-3 transition-colors hover:bg-surface-2/40"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={toScreenerUrl(v)}
                  className="min-w-0 flex-1"
                  title="Open this view in the screener"
                >
                  <div className="flex items-center gap-1.5">
                    <Bookmark className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                    <span className="truncate text-[13px] font-medium text-foreground group-hover:text-accent">
                      {v.name}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {describeSavedFilter(v)}
                  </div>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete saved view "${v.name}"? This can't be undone.`,
                      )
                    ) {
                      removeView(v.id);
                    }
                  }}
                  aria-label={`Delete saved view ${v.name}`}
                  className="shrink-0 rounded p-1 text-muted-2 hover:bg-rose-500/15 hover:text-rose-300 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <a
                href={toScreenerUrl(v)}
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline"
              >
                Open
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  if (starred.size === 0 && savedViews.length === 0) {
    return (
      <>
        {importBanner}
        <div className="mt-8">
          <EmptyState
            icon={<Star className="h-5 w-5 text-amber-300" aria-hidden="true" />}
            title="No starred markets yet"
            body={
              <>
                Click the{" "}
                <Star className="inline h-3 w-3 align-text-top text-muted-2" />{" "}
                on any market in the screener to pin it here. Watchlists live
                in your browser — there&apos;s no account required.
              </>
            }
            cta={
              <a
                href="/"
                className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface-2"
              >
                Browse the screener
              </a>
            }
          />
        </div>
      </>
    );
  }

  if (watch.length === 0) {
    return (
      <>
        {importBanner}
        {savedViewsBlock}
        {starred.size > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px] text-muted-2">
                {starred.size.toLocaleString()} starred
              </span>
              {shareCta}
            </div>
            <div className="mt-4">
              <EmptyState
                compact
                title="None of your starred markets are in the current snapshot"
                body={`You have ${starred.size.toLocaleString()} starred markets, but none of them are in the current top-500 server snapshot. They may have closed or dropped in volume — check Polymarket directly to confirm.`}
              />
            </div>
          </>
        ) : null}
      </>
    );
  }

  return (
    <>
      {importBanner}
      {savedViewsBlock}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Starred markets · {starred.size.toLocaleString()}
        </h2>
        {shareCta}
      </div>
      <div className="mt-2 text-[11px] text-muted-2">
        {watch.length} shown · {starred.size.toLocaleString()} starred
      </div>
      <MarketTable rows={watch} sorting={sorting} onSortingChange={setSorting} />
    </>
  );
}
