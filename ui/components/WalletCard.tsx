"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useUserPositions } from "@/lib/useUserPositions";
import { useWalletTrades } from "@/lib/useWalletTrades";
import { computeWalletPnl } from "@/lib/walletPnl";
import { shortAddress } from "@/lib/resolveWallet";
import type { FollowedWallet } from "@/lib/useFollowedWallets";
import { cn } from "@/lib/cn";
import { FollowButton } from "./FollowButton";

type Props = {
  wallet: FollowedWallet;
};

/**
 * Compact card for the /wallets list page. Fetches positions + trades for
 * the given wallet, computes 30d realized + unrealized via the FIFO walker,
 * and surfaces the key headline numbers. Click anywhere on the card to open
 * the full wallet detail page.
 */
export function WalletCard({ wallet }: Props) {
  const positionsState = useUserPositions(wallet.address);
  const tradesState = useWalletTrades(wallet.address);

  const pnl = useMemo(() => {
    if (!tradesState.trades || !positionsState.positions) return null;
    return computeWalletPnl(tradesState.trades, positionsState.positions);
  }, [tradesState.trades, positionsState.positions]);

  const loading =
    tradesState.trades == null || positionsState.positions == null;

  return (
    <a
      href={`/wallets/${wallet.address}`}
      className="block rounded-md border border-border bg-surface/40 p-4 transition-colors hover:bg-surface-2/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {wallet.label ? (
            <div className="truncate text-[14px] font-semibold text-foreground">
              {wallet.label}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <span>{shortAddress(wallet.address, 8, 6)}</span>
            <ExternalLink className="h-3 w-3 text-muted-2" aria-hidden="true" />
          </div>
          <div className="mt-0.5 text-[10px] text-muted-2">
            Followed {fmtRelativeISO(wallet.followedAt)}
          </div>
        </div>
        <FollowButton
          address={wallet.address}
          label={wallet.label}
          variant="ghost"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
        <Stat
          label="30d realized"
          value={loading ? "…" : fmtSignedUSD(pnl?.realized30d ?? 0)}
          tone={signTone(pnl?.realized30d ?? 0)}
        />
        <Stat
          label="Unrealized"
          value={loading ? "…" : fmtSignedUSD(pnl?.unrealized ?? 0)}
          tone={signTone(pnl?.unrealized ?? 0)}
        />
        <Stat
          label="Open"
          value={
            loading
              ? "…"
              : `${positionsState.positions?.length ?? 0}`
          }
          hint={
            !loading && pnl && pnl.closedCount > 0
              ? `${Math.round((pnl.wonCount / pnl.closedCount) * 100)}% win on ${pnl.closedCount}`
              : undefined
          }
        />
      </div>
    </a>
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
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums font-semibold",
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
        <div className="text-[9px] text-muted-2">{hint}</div>
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
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtRelativeISO(iso: string): string {
  const ts = Date.parse(iso);
  if (!isFinite(ts)) return "—";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 30 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
