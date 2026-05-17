import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { BuilderStatsView } from "@/components/BuilderStatsView";
import { BUILDER_CODE } from "@/lib/polymarket";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Builder · Auspex",
  description:
    "Live attribution data for the Auspex builder code on Polymarket V2.",
};

export default function BuilderPage() {
  return (
    <>
      <TopNav active="docs" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Builder attribution
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Operator dashboard for the Auspex builder code on Polymarket V2.
            This page reads the raw{" "}
            <code className="font-mono text-[11px]">/builder/trades</code>{" "}
            endpoint and shows attributed fills as they land — refreshed every
            60 s.
          </p>
          <div className="mt-4 rounded-md border border-border bg-surface/40 px-3 py-2 text-[11px] text-muted-2">
            <div>
              <span className="text-muted-2">Builder code:</span>{" "}
              <code className="break-all font-mono text-foreground/80">
                {BUILDER_CODE}
              </code>
            </div>
            <div className="mt-1">
              <span className="text-muted-2">Profile address (proxy):</span>{" "}
              <code className="font-mono text-foreground/80">
                0xb4fb45069b3f0f7c69937ca114849f5a8380da04
              </code>
            </div>
          </div>
          <BuilderStatsView />
        </div>
      </main>
      <Footer />
    </>
  );
}
