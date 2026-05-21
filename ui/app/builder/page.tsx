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
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent ring-1 ring-accent/30">
            Polymarket Builders program
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Auspex on Polymarket
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Every order placed through Auspex carries our builder code on the
            Polymarket V2 CLOB. The volume below is real, on-chain, and
            verifiable — pulled live from{" "}
            <a
              href="https://clob.polymarket.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              clob.polymarket.com
            </a>
            's <code className="font-mono text-[11px]">/builder/trades</code>{" "}
            endpoint, refreshed every 60 seconds.
          </p>
          <div className="mt-4 rounded-md border border-border bg-surface/40 px-3 py-2 text-[11px] text-muted-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-2">Builder code:</span>{" "}
              <code className="break-all font-mono text-foreground/80">
                {BUILDER_CODE}
              </code>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-2">Operator profile:</span>{" "}
              <a
                href="https://polymarket.com/profile/0xb4fb45069b3f0f7c69937ca114849f5a8380da04"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground/80 hover:text-accent hover:underline"
              >
                0xb4fb45069b3f0f7c69937ca114849f5a8380da04
              </a>
            </div>
          </div>
          <BuilderStatsView />
        </div>
      </main>
      <Footer />
    </>
  );
}
