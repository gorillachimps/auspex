import { Suspense } from "react";
import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { Footer } from "@/components/Footer";
import { HomeShell } from "@/components/HomeShell";
import { getMarkets, getSnapshotMeta } from "@/lib/data";
import { getLivePrices } from "@/lib/livePrices";
import { applyLivePrices } from "@/lib/liveOverlay";

// Resolved against metadataBase (root layout) to the canonical www origin.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

const MAX_ROWS = 500;

// ISR (60 s): a per-request render (force-dynamic) made every visit + crawler
// hit a full lambda render of ~500 rows, dominating Fluid CPU. The client
// (HomeShell) polls /api/markets right after mount, so an SSR snapshot up to
// 60 s old self-heals within seconds. Trade-off accepted: deadline-relative
// labels ("<1h left") can straddle a boundary between SSR and hydration —
// rare, cosmetic, and React patches it on hydrate.
export const revalidate = 60;

export default async function HomePage() {
  const [all, snapshot, live] = await Promise.all([
    getMarkets(),
    getSnapshotMeta(),
    getLivePrices(),
  ]);
  const ranked = [...all].sort((a, b) => b.volumeTotal - a.volumeTotal);
  // Overlay live prices on the SSR paint too, so first render matches the
  // "Live" pill instead of showing snapshot prices until the first client poll.
  const base = ranked.slice(0, MAX_ROWS);
  const topRows = live ? applyLivePrices(base, live.prices).rows : base;

  const liveCount = topRows.filter((r) => r.liveState === "live").length;
  const totalVolume24h = topRows.reduce((s, r) => s + (r.volume24h || 0), 0);

  return (
    <>
      <TopNav active="screener" />
      <ApprovalBanner />
      <Suspense fallback={null}>
        <HomeShell
          initialRows={topRows}
          initialSnapshotAt={snapshot.snapshotAt}
          liveCount={liveCount}
          totalVolume24h={totalVolume24h}
        />
      </Suspense>
      <Footer />
    </>
  );
}
