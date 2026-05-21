import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { LeaderboardView } from "@/components/LeaderboardView";

export const metadata: Metadata = {
  title: "Leaderboard · Auspex",
  description:
    "Top Polymarket traders by realized profit and notional volume. Live data from Polymarket's leaderboard API.",
};

export default function LeaderboardPage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 py-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent ring-1 ring-accent/30">
            Live from Polymarket
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Leaderboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            The top Polymarket traders by realized P&amp;L (all-time) and by
            cumulative notional volume. Each entry links into the Wallets
            tracker, where you can browse their open positions, recent fills,
            and a FIFO-realized P&amp;L curve over time.
          </p>
          <div className="mt-6">
            <LeaderboardView />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
