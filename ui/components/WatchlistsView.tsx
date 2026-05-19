"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SortingState } from "@tanstack/react-table";
import { Check, Copy, Link2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { MarketTable } from "./MarketTable";
import { useStarred } from "@/lib/useStarred";
import type { TableRow } from "@/lib/types";

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

  if (starred.size === 0) {
    return (
      <>
        {importBanner}
        <div className="mt-8 rounded-md border border-border bg-surface/40 px-6 py-12 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 ring-1 ring-amber-400/30">
            <Star className="h-5 w-5 text-amber-300" />
          </div>
          <h2 className="mt-4 text-base font-semibold">No starred markets yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Click the{" "}
            <Star className="inline h-3 w-3 align-text-top text-muted-2" /> on
            any market in the screener to pin it here. Watchlists live in your
            browser — there&apos;s no account required.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface-2"
          >
            Browse the screener
          </a>
        </div>
      </>
    );
  }

  if (watch.length === 0) {
    return (
      <>
        {importBanner}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] text-muted-2">
            {starred.size.toLocaleString()} starred
          </span>
          {shareCta}
        </div>
        <div className="mt-4 rounded-md border border-border bg-surface/40 px-6 py-12 text-center">
          <p className="text-sm text-muted">
            You have {starred.size.toLocaleString()} starred markets, but none
            of them are in the current top-500 server snapshot.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {importBanner}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-muted-2">
          {watch.length} shown · {starred.size.toLocaleString()} starred
        </span>
        {shareCta}
      </div>
      <MarketTable rows={watch} sorting={sorting} onSortingChange={setSorting} />
    </>
  );
}
