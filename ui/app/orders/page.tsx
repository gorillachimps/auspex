import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { OrdersView } from "@/components/OrdersView";
import { PortfolioTabs } from "@/components/PortfolioTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders · Auspex",
  description: "Your open Polymarket orders, attributed to the Auspex builder code.",
};

export default function OrdersPage() {
  return (
    <>
      <TopNav active="portfolio" />
      <ApprovalBanner />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1480px] px-4 py-6">
          <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
          <PortfolioTabs active="orders" />
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Active limit orders for your connected wallet. Click to cancel
            individually, or wipe the whole book with one button.
          </p>
          <OrdersView />
        </div>
      </main>
      <Footer />
    </>
  );
}
