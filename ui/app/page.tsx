import { Suspense } from "react";
import { TopNav } from "@/components/TopNav";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { Footer } from "@/components/Footer";
import { HomeShell } from "@/components/HomeShell";
import { getMarkets, getSnapshotMeta } from "@/lib/data";
import { getLivePrices } from "@/lib/livePrices";
import { applyLivePrices } from "@/lib/liveOverlay";

const MAX_ROWS = 500;

// Deadline-relative formatting in the table calls Date.now() at render time;
// keep SSR and client-hydration close together to avoid mismatches at the
// "<1h" / "ended" boundary.
export const dynamic = "force-dynamic";

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
