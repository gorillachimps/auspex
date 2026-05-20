import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
  title: "Terms — Auspex",
  description:
    "Terms of use for Auspex. Short version: it's informational, prediction markets are speculative, you're responsible for your own jurisdiction's rules.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="May 2026">
      <p>
        Using Auspex means you agree to these terms. They&apos;re
        deliberately short — most of the surface area lives at Polymarket,
        not here.
      </p>

      <h2>What Auspex is</h2>
      <p>
        Auspex is a third-party screener and one-click trading client for
        Polymarket. We are not affiliated with Polymarket. We display data
        sourced from public Polymarket APIs, and we relay your signed orders
        to the Polymarket CLOB. We don&apos;t make markets, take custody, or
        guarantee outcomes.
      </p>

      <h2>You are responsible for your jurisdiction</h2>
      <p>
        Prediction markets are restricted or illegal in some jurisdictions
        (including the United States, in most cases). Whether you can lawfully
        use Polymarket — and therefore Auspex — depends on where you are and
        who you are. We don&apos;t check, and we don&apos;t advise. If
        you&apos;re unsure, talk to a lawyer in your jurisdiction.
      </p>

      <h2>Informational, not financial advice</h2>
      <p>
        Nothing on Auspex is investment advice, financial advice, legal
        advice, or a recommendation to buy or sell any market. The
        &quot;clarity score,&quot; &quot;distance to YES,&quot; sigils,
        and other indicators are heuristics we built to help you read the
        data faster — they are not predictions, and they can be wrong.
      </p>

      <h2>You are responsible for your trades</h2>
      <ul>
        <li>
          Every order you place is signed by your wallet. We can&apos;t
          undo it; the CLOB can&apos;t undo it.
        </li>
        <li>
          Prices move. Slippage can be large in thin markets. The screener
          shows liquidity to help you avoid surprises, but actual fills
          depend on the live book at the moment you trade.
        </li>
        <li>
          Markets can resolve in ways you didn&apos;t expect. UMA disputes
          are rare but real.
        </li>
      </ul>

      <h2>Service availability</h2>
      <p>
        We aim for high uptime but make no SLA. Vercel, Polymarket, Across,
        Privy, Polygon — any of them can go down, and when they do,
        Auspex degrades or stops working. We&apos;ll restore service as
        fast as we can.
      </p>

      <h2>Changes</h2>
      <p>
        We&apos;ll update these terms as the product evolves. Material
        changes get noted in the <a href="/changelog">changelog</a>.
        Continuing to use the site after a change means you accept the new
        terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions:{" "}
        <code>hello [at] auspex.to</code>. Security issues:{" "}
        <code>security [at] auspex.to</code>.
      </p>
    </LegalPage>
  );
}
