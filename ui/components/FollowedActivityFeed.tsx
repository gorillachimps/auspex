"use client";

import { useMemo } from "react";
import { Activity, Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  useFollowedActivityFeed,
  type ActivityTrade,
} from "@/lib/useFollowedActivityFeed";
import type { FollowedWallet } from "@/lib/useFollowedWallets";
import { shortAddress } from "@/lib/resolveWallet";
import { cn } from "@/lib/cn";
import { fmtAgoUnix, fmtUSDCompact } from "@/lib/format";

const fmtCompactUSD = fmtUSDCompact;
const fmtRelative = fmtAgoUnix;

type Props = {
  followed: FollowedWallet[];
};

/**
 * Merged trade feed across all followed wallets. Renders newest-first
 * with a wallet attribution chip on each row, so the user can see at a
 * glance "who just did what" without clicking into each wallet.
 *
 * Empty/loading/error states are surfaced inline. The component handles
 * the case where one followed wallet's /trades call fails (partial
 * success still renders).
 */
export function FollowedActivityFeed({ followed }: Props) {
  const addresses = useMemo(() => followed.map((w) => w.address), [followed]);
  const state = useFollowedActivityFeed(addresses);

  // Map address → label for the attribution chip. Falls back to short
  // address when the user hasn't named the wallet.
  const labelByAddress = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of followed) {
      m.set(w.address, w.label?.trim() || shortAddress(w.address, 6, 4));
    }
    return m;
  }, [followed]);

  if (followed.length === 0) return null;

  return (
    <section className="rounded-md border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          <Activity className="h-3 w-3" aria-hidden="true" />
          Recent activity from your follows
        </h2>
        {state.loading && state.trades.length > 0 ? (
          <Loader2
            className="h-3 w-3 animate-spin text-muted-2"
            aria-hidden="true"
          />
        ) : (
          <span className="text-[10px] text-muted-2">
            {state.trades.length > 0
              ? `${state.trades.length} recent`
              : "no fills yet"}
          </span>
        )}
      </div>

      {state.error && state.trades.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-rose-300">
          Couldn&apos;t load activity: {state.error}
        </div>
      ) : state.trades.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted-2">
          {state.loading
            ? "Loading…"
            : "No recent trades from your followed wallets yet. New fills will appear here as they print."}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {state.trades.map((t) => (
            <Row
              key={`${t.transactionHash}-${t.asset}-${t.timestamp}`}
              trade={t}
              label={labelByAddress.get(t.followedWallet) ?? ""}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ trade, label }: { trade: ActivityTrade; label: string }) {
  // Same color rule as WhaleFeedStream: bullish flow on YES → emerald.
  const bullish =
    (trade.side === "BUY" && trade.outcome?.toLowerCase() === "yes") ||
    (trade.side === "SELL" && trade.outcome?.toLowerCase() === "no");
  const tone = bullish ? "text-emerald-300" : "text-rose-300";
  const sideRing = bullish
    ? "bg-emerald-500/15 ring-emerald-400/40 text-emerald-200"
    : "bg-rose-500/15 ring-rose-400/40 text-rose-200";
  const notional = trade.size * trade.price;
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-[12px] hover:bg-surface-2/30">
      <a
        href={`/wallets/${trade.followedWallet}`}
        className="shrink-0 truncate rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent ring-1 ring-accent/30 hover:bg-accent/20"
        title={trade.followedWallet}
      >
        {label}
      </a>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider ring-1",
          sideRing,
        )}
      >
        {trade.side} {trade.outcome ?? "?"}
      </span>
      <span className={cn("shrink-0 tabular-nums font-semibold", tone)}>
        {fmtCompactUSD(notional)}
      </span>
      <span className="shrink-0 tabular-nums text-muted">
        @ {(trade.price * 100).toFixed(1)}¢
      </span>
      {trade.slug ? (
        <a
          href={`/markets/${trade.slug}`}
          className="min-w-0 flex-1 truncate text-foreground/85 hover:text-foreground hover:underline"
          title={trade.title}
        >
          {trade.title ?? "—"}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-foreground/85">
          {trade.title ?? "—"}
        </span>
      )}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-2">
        {fmtRelative(trade.timestamp)}
      </span>
      {trade.side === "BUY" && trade.slug && trade.outcome ? (
        <a
          href={`/markets/${trade.slug}?copy=${trade.outcome.toLowerCase()}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/20"
          title={`Open a Buy ${trade.outcome} ticket on this market`}
        >
          <Copy className="h-2.5 w-2.5" aria-hidden="true" />
          Copy
        </a>
      ) : null}
      {trade.transactionHash ? (
        <a
          href={`https://polygonscan.com/tx/${trade.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-2 hover:text-foreground"
          title="View on Polygonscan"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

