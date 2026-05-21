"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtUSDCompact, fmtUSDSignedText } from "@/lib/format";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";

/**
 * Polymarket exposes a public leaderboard at https://lb-api.polymarket.com.
 * Two endpoints we use:
 *   - /profit  → top realized P&L all-time
 *   - /volume  → top notional traded all-time
 * Both return an array of `{ proxyWallet, pseudonym, name, amount, … }`,
 * pre-sorted by amount descending. Wildcard CORS so we can fetch from the
 * browser; if Polymarket ever locks it down, switch this to a server-side
 * /api/leaderboard route.
 */

const LB_HOST = "https://lb-api.polymarket.com";

type LbEntry = {
  proxyWallet: string;
  amount: number;
  pseudonym?: string;
  name?: string;
  bio?: string;
  profileImage?: string;
};

type Mode = "profit" | "volume";

type State = {
  entries: LbEntry[] | null;
  loading: boolean;
  error: string | null;
};

const ZERO: State = { entries: null, loading: false, error: null };

export function LeaderboardView() {
  const [mode, setMode] = useState<Mode>("profit");
  const [state, setState] = useState<State>(ZERO);

  useEffect(() => {
    let cancelled = false;
    setState({ entries: null, loading: true, error: null });
    (async () => {
      try {
        const r = await fetch(`${LB_HOST}/${mode}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error("unexpected response shape");
        // Defensively filter to entries we can actually link to / display.
        const cleaned: LbEntry[] = data
          .filter(
            (e): e is LbEntry =>
              e &&
              typeof e === "object" &&
              typeof e.proxyWallet === "string" &&
              typeof e.amount === "number" &&
              Number.isFinite(e.amount),
          )
          .slice(0, 100);
        setState({ entries: cleaned, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          entries: null,
          loading: false,
          error: (e as Error).message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const sourceUrl = useMemo(() => `${LB_HOST}/${mode}`, [mode]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Leaderboard view"
          className="inline-flex items-center rounded-md border border-border-strong bg-surface text-[12px]"
        >
          <TabButton
            active={mode === "profit"}
            onClick={() => setMode("profit")}
          >
            Top profit
          </TabButton>
          <TabButton
            active={mode === "volume"}
            onClick={() => setMode("volume")}
          >
            Top volume
          </TabButton>
        </div>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
        >
          Source endpoint <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {state.loading && !state.entries ? (
        <LoadingState
          variant="panel"
          title={`Loading top ${mode}…`}
          body="Pulling live data from Polymarket's leaderboard API."
        />
      ) : null}

      {state.error && !state.entries ? (
        <EmptyState
          title="Couldn't load the leaderboard"
          body={state.error}
          tone="error"
        />
      ) : null}

      {state.entries && state.entries.length > 0 ? (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {state.entries.map((e, i) => (
            <li key={e.proxyWallet}>
              <LeaderboardCard entry={e} rank={i + 1} mode={mode} />
            </li>
          ))}
        </ol>
      ) : null}

      {state.entries && state.entries.length === 0 ? (
        <EmptyState
          title="No entries returned"
          body="Polymarket's leaderboard came back empty. Try the other tab or check back later."
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 font-medium first:rounded-l-md last:rounded-r-md",
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LeaderboardCard({
  entry,
  rank,
  mode,
}: {
  entry: LbEntry;
  rank: number;
  mode: Mode;
}) {
  const display = entry.pseudonym || entry.name || "Anonymous";
  const isPodium = rank <= 3;
  const rankTone =
    rank === 1
      ? "bg-amber-500/15 text-amber-200 ring-amber-400/40"
      : rank === 2
        ? "bg-zinc-400/15 text-zinc-200 ring-zinc-300/40"
        : rank === 3
          ? "bg-orange-500/15 text-orange-200 ring-orange-400/40"
          : "bg-surface-2 text-muted ring-border";
  return (
    <a
      href={`/wallets/${entry.proxyWallet}`}
      className="flex items-center gap-3 rounded-md border border-border bg-surface/40 p-3 transition-colors hover:bg-surface-2/40"
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular ring-1",
          rankTone,
        )}
      >
        {isPodium ? <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> : rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-foreground">
          {display}
        </div>
        <div className="font-mono text-[10px] text-muted-2">
          {entry.proxyWallet.slice(0, 6)}…{entry.proxyWallet.slice(-4)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn(
            "tabular text-[14px] font-semibold",
            mode === "profit"
              ? entry.amount > 0
                ? "text-emerald-300"
                : entry.amount < 0
                  ? "text-rose-300"
                  : "text-foreground"
              : "text-foreground",
          )}
        >
          {mode === "profit"
            ? fmtUSDSignedText(entry.amount)
            : fmtUSDCompact(entry.amount)}
        </div>
        <div className="text-[10px] text-muted-2">
          {mode === "profit" ? "Realized P&L" : "Volume traded"}
        </div>
      </div>
    </a>
  );
}
