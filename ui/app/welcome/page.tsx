import type { Metadata } from "next";
import {
  ArrowRight,
  Bell,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { WelcomeStatsBanner } from "@/components/WelcomeStatsBanner";

export const metadata: Metadata = {
  title: "Welcome to Auspex — the prediction-market screener",
  description:
    "Auspex is a fast, no-account-required screener and one-click trading layer for Polymarket. Find sharp markets, place orders, get notified on fills.",
};

/**
 * First-time-user landing page. Pitches the product in 30 seconds, with
 * three CTAs — browse, connect, learn — and a static walkthrough of what
 * the app does. Linked from the footer ("New here? Start here →").
 *
 * Not the default landing route — that's the screener at `/`, which is
 * the product itself. This page exists for users who land cold and want
 * orientation before clicking around.
 */
export default function WelcomePage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent"
          />
          <div className="relative mx-auto max-w-[1100px] px-4 py-14 sm:py-20">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent ring-1 ring-accent/30">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Beta · No account required
            </div>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              The prediction-market screener that pros use to find sharp bets.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted">
              Auspex sits on top of Polymarket. Browse 500+ live markets in
              one sortable table, see who&apos;s buying what in real time,
              and place orders in one click — without ever leaving the
              screener.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent/90"
              >
                Browse the screener
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a
                href="/docs"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
              >
                Read the docs
              </a>
            </div>
            <p className="mt-4 text-[12px] text-muted-2">
              No signup, no email collection. Your wallet signs everything.
            </p>
            <WelcomeStatsBanner />
          </div>
        </section>

        {/* Three-step explainer */}
        <section className="mx-auto max-w-[1100px] px-4 py-12">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            How it works
          </h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <Step
              index={1}
              icon={<Search className="h-4 w-4 text-accent" aria-hidden="true" />}
              title="Browse markets"
              body="A unified table with implied odds, distance to YES, clarity scores, settlement source, and 24h volume. Sort and filter to surface the ones that match your edge."
            />
            <Step
              index={2}
              icon={<Wallet className="h-4 w-4 text-accent" aria-hidden="true" />}
              title="Connect your wallet"
              body="Privy handles the auth. Auspex auto-detects your Polymarket account from your EOA — no manual setup. Bridge USDC from any chain in one step via Across."
            />
            <Step
              index={3}
              icon={<Zap className="h-4 w-4 text-accent" aria-hidden="true" />}
              title="Trade in one click"
              body="Pick a market, hit Buy YES or Buy NO, set your size. Orders ride the Polymarket CLOB at zero added fees — Auspex doesn't take a cut."
            />
          </div>
        </section>

        {/* Feature highlights */}
        <section className="border-t border-border bg-surface/20">
          <div className="mx-auto max-w-[1100px] px-4 py-12">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
              What's in the box
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Feature
                icon={<Search className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="Pro-grade screener"
                body="Sort by volume, clarity, distance-to-trigger, or any column. Star markets, save filter combos as named views, share watchlists by URL."
              />
              <Feature
                icon={<Zap className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="Whale & follow feeds"
                body="See every &gt;$100 fill in real time. Track your favorite wallets and watch their fills land in a unified feed."
              />
              <Feature
                icon={<Bell className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="Free notifications"
                body="Get a browser push the moment one of your orders fills. iOS Safari supported. Notifications inbox in-app for review later."
              />
              <Feature
                icon={<KeyRound className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="Keyboard-first"
                body="/ to focus search, j/k to move rows, ? for the full shortcut list. Pro affordances all the way down."
              />
              <Feature
                icon={<ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="No custody, no accounts"
                body="Your wallet signs every order directly to the Polymarket CLOB. Auspex never holds funds, never holds keys, doesn't collect emails."
              />
              <Feature
                icon={<Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />}
                title="Mobile-friendly"
                body="Every table reflows to a card stack on phones. The screener, your portfolio, your activity — all readable on a 6&quot; screen."
              />
            </div>
          </div>
        </section>

        {/* CTA strip */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-[1100px] px-4 py-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Ready to look around?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              The screener is the product. Connect your wallet later — or
              never. Either way works.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent/90"
              >
                Browse the screener
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a
                href="/api"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
              >
                Or use the JSON API
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Step({
  index,
  icon,
  title,
  body,
}: {
  index: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/40 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-accent/30">
          {index}
        </span>
        {icon}
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-[13px] text-muted">{body}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-1 text-[12px] text-muted">{body}</p>
    </div>
  );
}
