import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { ActivityView } from "@/components/ActivityView";
import { PortfolioTabs } from "@/components/PortfolioTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity · Auspex",
  description: "Your fill history across all markets, refreshed every minute.",
};

export default function ActivityPage() {
  return (
    <>
      <TopNav active="activity" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 py-6">
          <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
          <PortfolioTabs active="activity" />
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Every fill across every market for your connected account.
            Linked to the underlying market and the on-chain transaction.
          </p>
          <ActivityView />
        </div>
      </main>
      <Footer />
    </>
  );
}
