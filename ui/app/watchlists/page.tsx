import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { WatchlistsView } from "@/components/WatchlistsView";
import { getMarkets } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watchlists · Auspex",
  description: "Your starred crypto-vertical prediction markets.",
};

export default async function WatchlistsPage() {
  const all = await getMarkets();
  const ranked = [...all].sort((a, b) => b.volumeTotal - a.volumeTotal).slice(0, 500);

  return (
    <>
      <TopNav active="watchlists" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 py-6">
          <h1 className="text-xl font-semibold tracking-tight">Watchlists</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Markets you&apos;ve starred in the screener. Sortable, with the same
            split-bar Δ + RC progress bars.
          </p>
          <WatchlistsView rows={ranked} />
        </div>
      </main>
      <Footer />
    </>
  );
}
