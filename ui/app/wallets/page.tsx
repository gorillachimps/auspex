"use client";

import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { WalletSearch } from "@/components/WalletSearch";
import { WalletCard } from "@/components/WalletCard";
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
            <section className="mt-8 rounded-md border border-border bg-surface/40 p-6 text-center text-[13px] text-muted">
              <p className="text-foreground/90">
                No followed wallets yet.
              </p>
              <p className="mt-1.5 text-muted-2">
                Look up any wallet above and click <em>Follow</em> on its detail
                page to start tracking it. The list lives in your browser; no
                accounts, no server-side persistence.
              </p>
            </section>
          ) : (
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
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
