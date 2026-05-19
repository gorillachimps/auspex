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

          <Section id="signal" title="What makes Auspex different">
            <p>
              Most prediction-market sites just show you the odds. Auspex
              also checks the actual data each market settles on:{" "}
              <strong className="text-foreground">
                the live Binance price, the on-chain treasury, the launch
                timestamp — whatever the market&apos;s rules point to
              </strong>{" "}
              — and shows you how close that data is to triggering YES.
            </p>
            <p className="mt-3">
              Example: &quot;Will Bitcoin hit $150k by June 30, 2026?&quot;
              resolves YES if Binance BTC/USDT ever closes at or above
              $150,000 before the deadline. Auspex reads the current BTC
              price, computes the gap to $150k, and shows that{" "}
              <em>distance</em> next to the market&apos;s implied odds. Your
              edge isn&apos;t our forecast — it&apos;s the gap between what
              the market thinks and what the data says.
            </p>
          </Section>

          <Section id="rc" title="Clarity score">
            <p>
              A 0–100 score of how clearly a market will resolve. Higher =
              cleaner read on YES or NO. We mix three things:
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>
                <strong className="text-foreground">Distance (55%)</strong> —
                how close the live value is to triggering. A market two
                percent from the line scores much higher than one that needs
                a 20% move.
              </li>
              <li>
                <strong className="text-foreground">Time pressure (30%)</strong>{" "}
                — how soon the market closes. Less than a day to deadline
                scores at the top; a year out scores at the bottom.
              </li>
              <li>
                <strong className="text-foreground">Volume (15%)</strong> —
                how active the market is. We penalise ghost-town markets
                where the odds aren&apos;t backed by real trading.
              </li>
            </ul>
            <p className="mt-3">
              Only scored for markets we can auto-check (currently Binance
              spot-price markets). Subjective markets that resolve via
              Polymarket&apos;s own judgment show <code>—</code> in the
              Clarity column.
            </p>
          </Section>

          <Section id="delta" title="Distance">
            <p>
              How far the live value is from the trigger that flips the market
              to YES. <span className="text-emerald-300">Positive</span> means
              already above the line;{" "}
              <span className="text-rose-300">negative</span> means below.
              Either way, smaller (in absolute value) = closer to triggering.
            </p>
            <p className="mt-3">
              The bar visualises both halves: green = how close we are, red =
              how far is still left. A ✓ <em>triggered</em> pill replaces the
              bar once the trigger has been crossed at any point in the
              market&apos;s history.
            </p>
            <p className="mt-3">
              Click the Distance column header to sort closest-first — a fast
              way to spot markets where the live data and the market odds
              disagree sharply.
            </p>
          </Section>

          <Section id="families" title="Market types">
            <p>
              Every market gets tagged with one of six types based on what its
              rules look like. The chip row above the table filters by type.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <Family
                label="Price"
                ratio="51% of crypto volume"
                desc="Crypto price hits a target by a date (e.g. BTC ≥ $150k). Auto-checked against Binance spot."
              />
              <Family
                label="Launch"
                ratio="21%"
                desc="A new token's value at launch — e.g. 'FDV above $500M one day after launch'. We can't auto-check these yet."
              />
              <Family
                label="Holdings"
                ratio="<1%"
                desc="Something a known entity holds changes — e.g. 'MicroStrategy sells any Bitcoin'. Currently checked manually."
              />
              <Family
                label="Sale"
                ratio="5%"
                desc="A public sale of a token reaches some milestone. Currently checked manually."
              />
              <Family
                label="Subjective"
                ratio="11%"
                desc="Polymarket's own judgment calls the outcome (editorial / political claims). No automated check possible — never scored."
              />
              <Family
                label="Other"
                ratio="rest"
                desc="Rules our parser couldn't structure. Shown for completeness; read the source rule carefully."
              />
            </dl>
            <p className="mt-3 text-xs text-muted">
              About 92% of crypto market volume falls into types we can
              auto-check.
            </p>
          </Section>

          <Section id="sources" title="Where the data comes from">
            <ul className="space-y-1 text-sm">
              <li>
                <strong className="text-foreground">Markets, odds, order books</strong>:
                Polymarket — pulled fresh every 15 minutes.
              </li>
              <li>
                <strong className="text-foreground">Crypto prices</strong>:
                Binance public price feeds (CryptoCompare as a backup).
              </li>
              <li>
                <strong className="text-foreground">Market rules</strong>:
                parsed from each Polymarket market&apos;s own rules text.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted">
              The screener data is also available as JSON at{" "}
              <a href="/api" className="text-accent hover:underline">/api</a>
              {" "}— same shape the table uses, free, no auth required.
            </p>
          </Section>

          <Section id="trading" title="Trading">
            <p>
              Each market row has Yes / No buttons that open an order form.
              Both limit and market orders are supported; market orders show
              the expected fill price based on the live order book. Trading
              fees are{" "}
              <strong className="text-foreground">0% / 0%</strong> — Auspex
              doesn&apos;t add anything on top.
            </p>
            <p className="mt-3">
              Your wallet signs every order, and your funds stay in your
              Polygon account the whole time. Auspex never holds money for
              you. You can disconnect any time and your account works exactly
              the same on polymarket.com.
            </p>
          </Section>

          <Section id="disclaimer" title="Heads-up">
            <p className="text-muted">
              Auspex is a presentation layer over public data, for
              informational purposes only. Nothing here is investment advice
              or a recommendation. Prediction markets involve real money and
              real risk; only place orders you understand and can afford to
              lose. We never hold your funds — every order is signed by your
              own wallet.
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
