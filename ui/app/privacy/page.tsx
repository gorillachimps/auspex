import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
  title: "Privacy — Auspex",
  description:
    "How Auspex handles your data. Short version: your wallet signs everything, your watchlists live in your browser, we don't run accounts.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="May 2026">
      <p>
        Auspex is a thin client over Polymarket. We were built with the
        assumption that we should hold as little of your data as possible —
        ideally none. This page explains where the lines actually fall.
      </p>

      <h2>What we don't collect</h2>
      <ul>
        <li>
          <strong>No email addresses, no passwords, no accounts.</strong> The
          site has no signup form. Connecting a wallet via Privy doesn&apos;t
          create an account in any Auspex database.
        </li>
        <li>
          <strong>No KYC, no off-chain identity.</strong> Polymarket itself
          may enforce its own restrictions; we don&apos;t add any.
        </li>
        <li>
          <strong>No private keys, no signing keys, no recovery phrases.</strong>{" "}
          Every order is signed in your wallet and sent directly to the
          Polymarket CLOB.
        </li>
      </ul>

      <h2>What lives in your browser</h2>
      <ul>
        <li>
          Your <strong>starred markets</strong> and <strong>saved filter views</strong>{" "}
          are stored in <code>localStorage</code>. They survive page reloads
          and follow your browser; they aren&apos;t synced to our servers.
        </li>
        <li>
          Your <strong>followed wallets</strong> list (other traders you want
          to track) lives in <code>localStorage</code>.
        </li>
        <li>
          Your <strong>notification preferences</strong> (whether browser push
          is enabled) and your <strong>activity inbox</strong> live in{" "}
          <code>localStorage</code>.
        </li>
        <li>
          Clearing your site data wipes all of the above. There&apos;s no
          server copy to recover.
        </li>
      </ul>

      <h2>What our servers see</h2>
      <ul>
        <li>
          <strong>Anonymous request logs.</strong> Vercel records IP + URL
          for the standard reasons (rate limiting, debugging). We don&apos;t
          attach those logs to wallet addresses, and we don&apos;t share
          them.
        </li>
        <li>
          <strong>Aggregate analytics.</strong> We use Plausible (no cookies,
          no fingerprinting, no individual tracking) to count page views per
          route. The dashboard is{" "}
          <a
            href="https://plausible.io/auspex.to"
            target="_blank"
            rel="noopener noreferrer"
          >
            public
          </a>
          .
        </li>
        <li>
          Our <code>/api/markets</code> snapshot endpoint is queried by
          everyone on the screener; we don&apos;t log individual queries
          beyond the standard Vercel access log.
        </li>
      </ul>

      <h2>Third parties</h2>
      <p>
        Loading the app makes requests to these services, which have their
        own privacy policies:
      </p>
      <ul>
        <li>
          <strong>Polymarket</strong> (data-api, CLOB) — markets, prices,
          your fills.
        </li>
        <li>
          <strong>Privy</strong> — wallet connect flow.
        </li>
        <li>
          <strong>Across Protocol</strong> — USDC bridging quotes (only when
          you open the Bridge dialog).
        </li>
        <li>
          <strong>Etherscan / Polygonscan</strong> — proxy address lookups.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If we ever change how we handle data, we&apos;ll bump the date at
        the top of this page and note it in{" "}
        <a href="/changelog">the changelog</a>.
      </p>
    </LegalPage>
  );
}
