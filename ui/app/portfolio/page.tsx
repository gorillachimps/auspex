import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { PortfolioView } from "@/components/PortfolioView";
import { TotalBalance } from "@/components/TotalBalance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio · Auspex",
  description:
    "Your current Polymarket positions — YES/NO shares, mark value, unrealised P&L.",
};

export default function PortfolioPage() {
  return (
    <>
      <TopNav active="portfolio" />
      <ApprovalBanner />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
            <a
              href="/orders"
              className="text-[12px] text-muted hover:text-foreground"
            >
              View open orders →
            </a>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Open positions for your deposit wallet, valued at the current mid
            price. Refreshed every 30 s.
          </p>
          <TotalBalance />
          <PortfolioView />
        </div>
      </main>
      <Footer />
    </>
  );
}
