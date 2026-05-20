"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy, ExternalLink, Loader2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { FollowButton } from "@/components/FollowButton";
import { WalletPositionsView } from "@/components/WalletPositionsView";
import { WalletTradesView } from "@/components/WalletTradesView";
import { WalletPnLChart } from "@/components/WalletPnLChart";
import { useUserPositions } from "@/lib/useUserPositions";
import { useWalletTrades } from "@/lib/useWalletTrades";
import { computeWalletPnl } from "@/lib/walletPnl";
import { shortAddress } from "@/lib/resolveWallet";
import { cn } from "@/lib/cn";

type Props = { params: Promise<{ address: string }> };

export default function WalletDetailPage({ params }: Props) {
  const { address } = use(params);
  const normalised = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalised)) notFound();
  const proxy = normalised as `0x${string}`;

  const positionsState = useUserPositions(proxy);
  const tradesState = useWalletTrades(proxy);

  const pnl = useMemo(() => {
    if (!tradesState.trades || !positionsState.positions) return null;
    return computeWalletPnl(tradesState.trades, positionsState.positions);
  }, [tradesState.trades, positionsState.positions]);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(proxy);
      setCopied(true);
    } catch {
      // ignore
    }
  }

  const loading =
    tradesState.trades == null || positionsState.positions == null;

  return (
    <>
      <TopNav active="wallets" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 py-6">
          <a
            href="/wallets"
            className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to wallets
          </a>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-mono text-xl font-semibold tracking-tight">
                {shortAddress(proxy, 10, 8)}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                  title="Copy full address"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  href={`https://polygonscan.com/address/${proxy}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                >
                  Polygonscan
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <a
                  href={`https://polymarket.com/profile/${proxy}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                >
                  Polymarket profile
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
            <FollowButton address={proxy} />
          </div>

          {/* P&L summary tiles */}
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="30d realized"
              value={loading ? "…" : fmtSignedUSD(pnl?.realized30d ?? 0)}
              tone={signTone(pnl?.realized30d ?? 0)}
              hint="FIFO matched within 30 days"
            />
            <Stat
              label="Unrealized"
              value={loading ? "…" : fmtSignedUSD(pnl?.unrealized ?? 0)}
              tone={signTone(pnl?.unrealized ?? 0)}
              hint="Mark-to-market on open"
            />
            <Stat
              label="Lifetime realized"
              value={loading ? "…" : fmtSignedUSD(pnl?.realizedTotal ?? 0)}
              tone={signTone(pnl?.realizedTotal ?? 0)}
              hint={`${pnl?.closedCount ?? 0} closed trades`}
            />
            <Stat
              label="Win rate"
              value={
                loading || !pnl || pnl.closedCount === 0
                  ? "—"
                  : `${Math.round((pnl.wonCount / pnl.closedCount) * 100)}%`
              }
              hint={
                pnl && pnl.closedCount > 0
                  ? `${pnl.wonCount} of ${pnl.closedCount}`
                  : "needs closing trades"
              }
            />
          </section>

          {/* P&L curve */}
          <section className="mt-6 rounded-md border border-border bg-surface/40 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="flex items-baseline gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                Cumulative realized P&L
                {pnl ? (
                  <span
                    className={cn(
                      "tabular-nums normal-case font-normal text-[13px] tracking-normal",
                      signTone(pnl.realizedTotal) === "pos"
                        ? "text-emerald-300"
                        : signTone(pnl.realizedTotal) === "neg"
                          ? "text-rose-300"
                          : "text-foreground",
                    )}
                  >
                    {fmtSignedUSD(pnl.realizedTotal)}
                  </span>
                ) : null}
              </h2>
              {loading ? (
                <Loader2
                  className="h-3 w-3 animate-spin text-muted-2"
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <WalletPnLChart curve={pnl?.curve ?? []} />
          </section>

          {/* Positions */}
          <section className="mt-6">
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
              Open positions ({positionsState.positions?.length ?? 0})
            </h2>
            <WalletPositionsView
              positions={positionsState.positions}
              loading={positionsState.loading}
              error={positionsState.error}
            />
          </section>

          {/* Trades */}
          <section className="mt-6">
            <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
              Recent trades
            </h2>
            <WalletTradesView
              trades={tradesState.trades}
              loading={tradesState.loading}
              error={tradesState.error}
              limit={100}
            />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums text-xl font-semibold",
          tone === "pos"
            ? "text-emerald-300"
            : tone === "neg"
              ? "text-rose-300"
              : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[10px] text-muted-2">{hint}</div>
      ) : null}
    </div>
  );
}

function signTone(n: number): "pos" | "neg" | "neutral" {
  if (n > 0.005) return "pos";
  if (n < -0.005) return "neg";
  return "neutral";
}

function fmtSignedUSD(n: number): string {
  if (!isFinite(n) || Math.abs(n) < 0.005) return "$0.00";
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : "−";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}
