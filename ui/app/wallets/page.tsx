"use client";

import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { WalletSearch } from "@/components/WalletSearch";
import { WalletCard } from "@/components/WalletCard";
import { FollowedActivityFeed } from "@/components/FollowedActivityFeed";
import { useFollowedWallets } from "@/lib/useFollowedWallets";

export default function WalletsPage() {
  const { list } = useFollowedWallets();

  // Sort followed list most-recently-followed first.
  const sorted = [...list].sort(
    (a, b) => Date.parse(b.followedAt) - Date.parse(a.followedAt),
  );

  return (
    <>
      <TopNav active="wallets" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 py-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Wallets</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Track other traders. Paste a Polygon address or ENS name to see
              their open positions, recent trades, and a FIFO-realized P&L
              curve. Follow a wallet to keep it on this page.
            </p>
          </div>

          <div className="mt-6 max-w-xl">
            <WalletSearch />
          </div>

          {sorted.length === 0 ? (
            <section className="mt-8 rounded-md border border-border bg-surface/40 p-6 text-[13px] text-muted">
              <p className="text-foreground/90 text-center">
                No followed wallets yet.
              </p>
              <p className="mt-1.5 text-center text-muted-2">
                Track any Polymarket trader to see what they&apos;re buying,
                their open positions, and their P&L over time.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/60 bg-background/40 p-3 text-[12px]">
                  <div className="font-medium text-foreground">
                    Where to find wallet addresses
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-2">
                    <li>
                      The{" "}
                      <a href="/" className="text-accent hover:underline">
                        Whale fills ticker
                      </a>{" "}
                      on the home page — each fill shows a wallet you can
                      click into.
                    </li>
                    <li>
                      Any trader&apos;s Polymarket profile URL
                      (polymarket.com/profile/0x…).
                    </li>
                    <li>
                      Crypto-Twitter — sharp Polymarket bettors often share
                      their wallet for receipts.
                    </li>
                  </ul>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-3 text-[12px]">
                  <div className="font-medium text-foreground">
                    What you&apos;ll see
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-2">
                    <li>Their open positions, valued live.</li>
                    <li>
                      FIFO-computed realized P&L over time (the chart
                      Coinbase / dYdX use).
                    </li>
                    <li>Win rate, 30-day P&L, recent trade history.</li>
                    <li>
                      Once you follow several, a unified feed of their
                      recent fills shows up on this page.
                    </li>
                  </ul>
                </div>
              </div>
              <p className="mt-5 text-center text-[11px] text-muted-2">
                Your follow list lives in your browser. No accounts, no
                server-side persistence, no tracking.
              </p>
            </section>
          ) : (
            <>
              <div className="mt-8">
                <FollowedActivityFeed followed={sorted} />
              </div>
              <section className="mt-8">
                <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                  Followed · {sorted.length}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sorted.map((w) => (
                    <WalletCard key={w.address} wallet={w} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
