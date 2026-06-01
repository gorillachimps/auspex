"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { shortAddress } from "@/lib/resolveWallet";
import { cn } from "@/lib/cn";

type Holder = { proxyWallet: string; name: string; amount: number };
type Group = { token: string; outcomeIndex: number; holders: Holder[] };

function fmtShares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

/**
 * Top YES/NO holders for a market, via /api/holders (which resolves the CTF
 * conditionId from the slug server-side, then hits Polymarket's holders feed).
 * Each holder links into the wallet tracker — social proof + a path to follow
 * the biggest positions. Amounts are outcome-share counts, not USD.
 */
export function TopHolders({
  slug,
  tokenYes,
  tokenNo,
}: {
  slug: string;
  tokenYes: string | null;
  tokenNo: string | null;
}) {
  const [state, setState] = useState<{
    groups: Group[] | null;
    loading: boolean;
    error: string | null;
  }>({ groups: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ groups: null, loading: true, error: null });
    fetch(`/api/holders?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
      )
      .then((d) => {
        if (cancelled) return;
        setState({
          groups: Array.isArray(d?.groups) ? (d.groups as Group[]) : [],
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (!cancelled)
          setState({ groups: null, loading: false, error: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Label groups YES/NO. Reliable path: match the group's token to the market's
  // YES/NO clob token. Fallback (tokens missing/mismatched): array order —
  // Polymarket returns outcome 0 (YES) first. We deliberately do NOT trust the
  // response's per-group outcomeIndex (observed to read 0 for BOTH outcomes).
  const groups = state.groups ?? [];
  let yes: Group | undefined;
  let no: Group | undefined;
  for (const g of groups) {
    if (tokenYes && g.token === tokenYes) yes = g;
    else if (tokenNo && g.token === tokenNo) no = g;
  }
  const rest = groups.filter((g) => g !== yes && g !== no);
  if (!yes && rest.length) yes = rest.shift();
  if (!no && rest.length) no = rest.shift();
  const hasAny = (yes?.holders.length ?? 0) + (no?.holders.length ?? 0) > 0;

  return (
    <section className="rounded-md border border-border bg-surface/40 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        <Users className="h-3 w-3" aria-hidden="true" />
        Top holders
      </h2>
      {state.loading ? (
        <p className="text-[12px] text-muted-2">Loading holders…</p>
      ) : state.error ? (
        <p className="text-[12px] text-rose-300">
          Couldn&apos;t load holders: {state.error}
        </p>
      ) : !hasAny ? (
        <p className="text-[12px] text-muted-2">
          No holder data available for this market yet.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <HolderColumn side="YES" holders={yes?.holders ?? []} />
            <HolderColumn side="NO" holders={no?.holders ?? []} />
          </div>
          <p className="mt-3 text-[10px] text-muted-2">
            Position size in outcome shares, via Polymarket. Click a holder to
            track their wallet.
          </p>
        </>
      )}
    </section>
  );
}

function HolderColumn({
  side,
  holders,
}: {
  side: "YES" | "NO";
  holders: Holder[];
}) {
  const tone =
    side === "YES"
      ? "text-emerald-300 ring-emerald-400/40 bg-emerald-500/10"
      : "text-rose-300 ring-rose-400/40 bg-rose-500/10";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
            tone,
          )}
        >
          {side}
        </span>
        <span className="text-[10px] text-muted-2">
          {holders.length} {holders.length === 1 ? "holder" : "holders"}
        </span>
      </div>
      {holders.length === 0 ? (
        <p className="text-[12px] text-muted-2">—</p>
      ) : (
        <ol className="space-y-1">
          {holders.map((h, i) => (
            <li
              key={h.proxyWallet}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="w-4 shrink-0 text-right tabular text-[10px] text-muted-2">
                {i + 1}
              </span>
              <a
                href={`/wallets/${h.proxyWallet}`}
                className="min-w-0 flex-1 truncate text-foreground/85 hover:text-accent hover:underline"
                title={h.proxyWallet}
              >
                {h.name || shortAddress(h.proxyWallet, 6, 4)}
              </a>
              <span className="shrink-0 tabular text-muted">
                {fmtShares(h.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
