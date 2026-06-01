"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtUSDCompact, fmtUSDSignedText } from "@/lib/format";
import { EmptyState } from "./ui/EmptyState";
import { LoadingState } from "./ui/LoadingState";

/**
 * Polymarket's public leaderboard (https://lb-api.polymarket.com):
 *   - /profit  → top realized P&L all-time
 *   - /volume  → top notional traded all-time
 * Both return `{ proxyWallet, pseudonym, name, amount, … }` pre-sorted desc,
 * wildcard CORS. We fetch BOTH once and merge by wallet so each card can show
 * profit AND volume AND a return-on-volume efficiency read — a "who's worth
 * copying" surface rather than a single-metric list. The Profit/Volume tabs
 * just re-rank the already-fetched data client-side (no refetch).
 *
 * Win-rate per entry is intentionally NOT here: it needs each wallet's full
 * /trades history (100 wallets × paginated fetches), which belongs behind a
 * cached server-side precompute, not a per-render client fan-out.
 */

const LB_HOST = "https://lb-api.polymarket.com";

type LbEntry = {
  proxyWallet: string;
  amount: number;
  pseudonym?: string;
  name?: string;
};

type Mode = "profit" | "volume";

type Merged = {
  proxyWallet: string;
  profit: number | null;
  volume: number | null;
  pseudonym?: string;
  name?: string;
};

type State = {
  profit: LbEntry[] | null;
  volume: LbEntry[] | null;
  loading: boolean;
  error: string | null;
};

const ZERO: State = { profit: null, volume: null, loading: true, error: null };

function parseList(data: unknown): LbEntry[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (e): e is LbEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as LbEntry).proxyWallet === "string" &&
        typeof (e as LbEntry).amount === "number" &&
        Number.isFinite((e as LbEntry).amount),
    )
    .slice(0, 100);
}

/** Return on volume = realized profit ÷ notional traded. Coarse efficiency
 *  proxy (volume double-counts round trips) but a useful "edge per dollar
 *  traded" read. Null when either side is missing or volume is zero. */
function returnOnVolume(e: Merged): number | null {
  if (e.profit == null || e.volume == null || e.volume <= 0) return null;
  return e.profit / e.volume;
}

export function LeaderboardView() {
  const [mode, setMode] = useState<Mode>("profit");
  const [state, setState] = useState<State>(ZERO);

  useEffect(() => {
    let cancelled = false;
    setState(ZERO);
    (async () => {
      try {
        const [pr, vr] = await Promise.all([
          fetch(`${LB_HOST}/profit`, { cache: "no-store" }),
          fetch(`${LB_HOST}/volume`, { cache: "no-store" }),
        ]);
        if (!pr.ok || !vr.ok) {
          throw new Error(`HTTP ${pr.ok ? vr.status : pr.status}`);
        }
        const [pd, vd] = await Promise.all([pr.json(), vr.json()]);
        if (cancelled) return;
        setState({
          profit: parseList(pd),
          volume: parseList(vd),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (!cancelled) {
          setState({
            profit: null,
            volume: null,
            loading: false,
            error: (e as Error).message,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Merge the two leaderboards by wallet.
  const byWallet = useMemo(() => {
    const m = new Map<string, Merged>();
    for (const e of state.profit ?? []) {
      m.set(e.proxyWallet, {
        proxyWallet: e.proxyWallet,
        profit: e.amount,
        volume: null,
        pseudonym: e.pseudonym,
        name: e.name,
      });
    }
    for (const e of state.volume ?? []) {
      const cur = m.get(e.proxyWallet);
      if (cur) {
        cur.volume = e.amount;
        cur.pseudonym = cur.pseudonym || e.pseudonym;
        cur.name = cur.name || e.name;
      } else {
        m.set(e.proxyWallet, {
          proxyWallet: e.proxyWallet,
          profit: null,
          volume: e.amount,
          pseudonym: e.pseudonym,
          name: e.name,
        });
      }
    }
    return m;
  }, [state.profit, state.volume]);

  // Ranked list follows the active tab's ordering (already sorted desc).
  const ranked = useMemo(() => {
    const order = mode === "profit" ? state.profit : state.volume;
    if (!order) return [];
    return order
      .map((e) => byWallet.get(e.proxyWallet))
      .filter((m): m is Merged => !!m);
  }, [mode, state.profit, state.volume, byWallet]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Leaderboard ranking"
          className="inline-flex items-center rounded-md border border-border-strong bg-surface text-[12px]"
        >
          <TabButton active={mode === "profit"} onClick={() => setMode("profit")}>
            Top profit
          </TabButton>
          <TabButton active={mode === "volume"} onClick={() => setMode("volume")}>
            Top volume
          </TabButton>
        </div>
        <a
          href={`${LB_HOST}/${mode}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
        >
          Source endpoint <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {state.loading && !ranked.length ? (
        <LoadingState
          variant="panel"
          title="Loading the leaderboard…"
          body="Pulling top profit + volume from Polymarket's leaderboard API."
        />
      ) : null}

      {state.error && !ranked.length ? (
        <EmptyState
          title="Couldn't load the leaderboard"
          body={state.error}
          tone="error"
        />
      ) : null}

      {ranked.length > 0 ? (
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((e, i) => (
            <li key={e.proxyWallet}>
              <LeaderboardCard entry={e} rank={i + 1} mode={mode} />
            </li>
          ))}
        </ol>
      ) : null}

      {!state.loading && !state.error && ranked.length === 0 ? (
        <EmptyState
          title="No entries returned"
          body="Polymarket's leaderboard came back empty. Check back later."
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

const TAG_TONE: Record<string, string> = {
  whale: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
  edge: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
  grinder: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
  red: "bg-rose-500/15 text-rose-200 ring-rose-400/40",
};

function tagsFor(e: Merged): { label: string; tone: string; hint: string }[] {
  const tags: { label: string; tone: string; hint: string }[] = [];
  const rov = returnOnVolume(e);
  if ((e.volume ?? 0) >= 1_000_000) {
    tags.push({ label: "Whale", tone: "whale", hint: "≥ $1M traded all-time" });
  }
  if (rov != null && rov >= 0.1 && (e.profit ?? 0) > 0) {
    tags.push({
      label: "High edge",
      tone: "edge",
      hint: `${(rov * 100).toFixed(0)}% return on volume`,
    });
  }
  if ((e.volume ?? 0) >= 500_000 && rov != null && rov >= 0 && rov < 0.02) {
    tags.push({
      label: "Grinder",
      tone: "grinder",
      hint: "high volume, thin margin per dollar traded",
    });
  }
  if ((e.profit ?? 0) < 0) {
    tags.push({ label: "In the red", tone: "red", hint: "negative realized P&L" });
  }
  return tags;
}

function LeaderboardCard({
  entry,
  rank,
  mode,
}: {
  entry: Merged;
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
  const rov = returnOnVolume(entry);
  const tags = tagsFor(entry);
  return (
    <a
      href={`/wallets/${entry.proxyWallet}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface/40 p-3 transition-colors hover:bg-surface-2/40"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular ring-1",
            rankTone,
          )}
        >
          {isPodium ? (
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            rank
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-foreground">
            {display}
          </div>
          <div className="font-mono text-[10px] text-muted-2">
            {entry.proxyWallet.slice(0, 6)}…{entry.proxyWallet.slice(-4)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-right">
        <Metric
          label="Profit"
          highlight={mode === "profit"}
          value={
            entry.profit == null ? "—" : fmtUSDSignedText(entry.profit)
          }
          tone={
            entry.profit == null
              ? "neutral"
              : entry.profit > 0
                ? "pos"
                : entry.profit < 0
                  ? "neg"
                  : "neutral"
          }
        />
        <Metric
          label="Volume"
          highlight={mode === "volume"}
          value={entry.volume == null ? "—" : fmtUSDCompact(entry.volume)}
          tone="neutral"
        />
        <Metric
          label="Return"
          value={rov == null ? "—" : `${(rov * 100).toFixed(1)}%`}
          tone={rov == null ? "neutral" : rov > 0 ? "pos" : rov < 0 ? "neg" : "neutral"}
          hint="Realized profit ÷ volume traded"
        />
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t.label}
              title={t.hint}
              className={cn(
                "rounded-full px-1.5 py-0 text-[10px] font-semibold ring-1",
                TAG_TONE[t.tone],
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </a>
  );
}

function Metric({
  label,
  value,
  tone,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "neutral";
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div
        className={cn(
          "text-[9px] uppercase tracking-wider",
          highlight ? "text-foreground/70" : "text-muted-2",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "tabular text-[12px] font-semibold",
          tone === "pos"
            ? "text-emerald-300"
            : tone === "neg"
              ? "text-rose-300"
              : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
