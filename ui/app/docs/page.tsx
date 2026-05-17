import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Docs · Auspex",
  description:
    "How Auspex scores Polymarket crypto markets — Resolution Confidence, distance to trigger, families, and data sources.",
};

export default function DocsPage() {
  return (
    <>
      <TopNav active="docs" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
          <p className="mt-2 text-sm text-muted">
            How the screener computes its scores and where the data comes from.
            Fair warning: this is informational, not financial advice.
          </p>

          <Section id="signal" title="Resolution-source-as-signal">
            <p>
              Most prediction-market screeners stop at price feeds and order-book
              depth. Auspex looks one layer deeper:{" "}
              <strong className="text-foreground">
                we read the live state of each market&apos;s own stated resolution
                criterion
              </strong>{" "}
              and score it directly.
            </p>
            <p className="mt-3">
              For example, &quot;Will Bitcoin hit $150k by June 30, 2026?&quot;
              resolves YES if Binance BTC/USDT prints ≥ $150,000 at any point
              before the deadline. We read the current BTC price from Binance,
              compute the gap to the threshold, and surface that{" "}
              <em>distance to trigger</em> alongside the Polymarket implied
              probability — letting you compare what the book thinks against
              what the underlying says.
            </p>
          </Section>

          <Section id="rc" title="Resolution Confidence (RC)">
            <p>
              Composite 0–100 score that blends three signals about how legible a
              market&apos;s resolution path is. Higher is better.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-[12px] text-foreground/90">
{`rc = 0.55 × distance_score
   + 0.30 × time_pressure
   + 0.15 × log_volume_score`}
            </pre>
            <ul className="mt-4 space-y-1 text-sm">
              <li>
                <strong className="text-foreground">distance_score</strong> — 100
                if the threshold has already been crossed, otherwise{" "}
                <code>100 · exp(-2.5 · |distance|)</code>. Falls off fast as the
                gap grows.
              </li>
              <li>
                <strong className="text-foreground">time_pressure</strong> —
                100 if &lt; 1 day to deadline, then 90 / 70 / 50 / 30 as the
                horizon stretches out.
              </li>
              <li>
                <strong className="text-foreground">log_volume_score</strong> —
                bucketed by total Polymarket volume: 10 / 30 / 50 / 70 / 90.
                Penalises ghost-town markets with no liquidity.
              </li>
            </ul>
            <p className="mt-3">
              RC is only computed when{" "}
              <code className="text-foreground">live.state == &quot;live&quot;</code>{" "}
              — i.e. the resolution source is one we&apos;ve wired (currently
              Binance spot prices). Other markets show <code>—</code> in the RC
              column.
            </p>
          </Section>

          <Section id="delta" title="Δ to trigger">
            <p>
              Signed percentage from the current state of the underlying to the
              threshold the market resolves on. Positive means the underlying
              has to <em>fall</em> to trigger; negative means it has to{" "}
              <em>rise</em>.
            </p>
            <p className="mt-3">
              The bar visualises this two-tone: green = how close we are
              (closeness = 100 − |distance|), red = how far is left. A
              ✓ &quot;triggered&quot; pill replaces the bar once the threshold
              has been crossed at any point.
            </p>
            <p className="mt-3">
              The column sorts by absolute distance so the closest-to-trigger
              markets float to the top in ascending order — a quick way to find
              edge cases where the book disagrees sharply with the underlying.
            </p>
          </Section>

          <Section id="families" title="Market families">
            <p>
              Every market is bucketed into one of six families based on what
              its resolution rules look like. The chip row above the table
              filters by family.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <Family
                label="Price"
                ratio="51% of crypto-vertical volume"
                desc="Binance spot price thresholds. Live; we read the price every refresh."
              />
              <Family
                label="Launch"
                ratio="21%"
                desc="FDV (fully-diluted valuation) at or after launch reaches some target. Deferred until on-chain wiring."
              />
              <Family
                label="Holdings"
                ratio="<1%"
                desc="An entity's on-chain holdings move (e.g. MicroStrategy sells any Bitcoin). Deferred — needs Arkham/explorer wiring."
              />
              <Family
                label="Sale"
                ratio="5%"
                desc="A public sale of a token clears a target. Deferred."
              />
              <Family
                label="Subjective"
                ratio="11%"
                desc="UMA-arbitrated panel decides. No machine-readable trigger — flagged but never RC-scored."
              />
              <Family
                label="Other"
                ratio="rest"
                desc="Resolution rules our parser couldn't structure. Shown for completeness; treat with caution."
              />
            </dl>
            <p className="mt-3 text-xs text-muted">
              Coverage check: live-state families add up to ~92% of crypto-vertical
              volume on the snapshot.
            </p>
          </Section>

          <Section id="sources" title="Data sources">
            <ul className="space-y-1 text-sm">
              <li>
                <strong className="text-foreground">Markets, prices, books</strong>:
                Polymarket Gamma API and CLOB v2.
              </li>
              <li>
                <strong className="text-foreground">Binance spot prices</strong>:
                Binance public REST endpoints, refreshed on each pipeline run.
              </li>
              <li>
                <strong className="text-foreground">Resolution rules</strong>:
                parsed from the rules text on each Polymarket market.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted">
              The API at <a href="/api/markets" className="text-accent hover:underline">/api/markets</a>{" "}
              returns the same projection the table renders, so you can build on
              top of it. Free, rate-limited, no auth.
            </p>
          </Section>

          <Section id="trading" title="Trading">
            <p>
              The Yes / No buttons on each row open an inline order ticket.
              Limit and market orders are both supported; market orders show
              an estimated fill price and slippage computed against the live
              order book. Maker and taker fees are{" "}
              <strong className="text-foreground">0% / 0%</strong> — Auspex adds
              nothing on top of the underlying venue.
            </p>
            <p className="mt-3">
              Orders are signed by your connected wallet (EIP-712) once per
              session and posted through your existing account at the venue.
              Auspex never custodies funds and never moves anything outside an
              explicit signature from you.
            </p>
          </Section>

          <Section id="disclaimer" title="Disclaimer">
            <p className="text-muted">
              Auspex is a presentation layer over publicly available data,
              for informational purposes only. Nothing here is investment
              advice, a solicitation, or a recommendation. Prediction markets
              involve real money and real risk; only place orders you understand
              and can afford to lose. The screener does not custody funds — your
              wallet signs every order, your deposit wallet pays.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:text-accent">
          {title}
        </a>
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}

function Family({
  label,
  ratio,
  desc,
}: {
  label: string;
  ratio: string;
  desc: string;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 rounded-md border border-border/60 bg-surface/30 px-3 py-2">
      <div>
        <div className="text-foreground">{label}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-2">
          {ratio}
        </div>
      </div>
      <p className="text-muted">{desc}</p>
    </div>
  );
}
