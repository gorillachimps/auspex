import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { ActivityView } from "@/components/ActivityView";

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">
                Every fill across every market for your connected account.
                Linked to the underlying market and the on-chain transaction.
              </p>
            </div>
            <a
              href="/portfolio"
              className="text-[12px] text-muted hover:text-foreground"
            >
              View portfolio →
            </a>
          </div>
          <ActivityView />
        </div>
      </main>
      <Footer />
    </>
  );
}
