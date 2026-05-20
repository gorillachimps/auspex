import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
  title: "Security — Auspex",
  description:
    "How Auspex protects you. No custody, no signing keys held server-side, your wallet authorizes every transaction directly.",
};

export default function SecurityPage() {
  return (
    <LegalPage title="Security" updated="May 2026">
      <p>
        Auspex is a non-custodial client. Every trade you place is signed by
        your wallet and submitted to the Polymarket CLOB; we never hold your
        funds and never hold the keys that authorize a transfer.
      </p>

      <h2>What this means in practice</h2>
      <ul>
        <li>
          <strong>You sign every order.</strong> Buy YES / Buy NO / cancel —
          each goes through your wallet&apos;s signature prompt (or, after
          you derive a CLOB API key, through a credential your wallet
          authorized once and stored locally).
        </li>
        <li>
          <strong>Your CLOB credentials live in memory.</strong> When you
          first place a trade, Auspex derives Polymarket API credentials
          from your wallet signature. Those credentials sit in browser
          memory for the session. They aren&apos;t persisted to{" "}
          <code>localStorage</code> and they aren&apos;t shipped to our
          servers.
        </li>
        <li>
          <strong>Funds stay on Polygon.</strong> Your USDC balance sits in
          your Polymarket proxy wallet (a smart contract you own). Auspex
          can read it via the public Polymarket API, but it can&apos;t move
          it without your signature.
        </li>
      </ul>

      <h2>Bridging USDC</h2>
      <p>
        The Bridge dialog uses{" "}
        <a
          href="https://across.to"
          target="_blank"
          rel="noopener noreferrer"
        >
          Across Protocol
        </a>{" "}
        to move USDC from any supported chain into Polygon USDC.e. Across
        is an audited, permissionless bridge with relayer-based settlement.
        You sign the source-chain transaction in your wallet; the funds
        land in your Polymarket proxy on Polygon a few minutes later.
        Auspex doesn&apos;t take a cut.
      </p>

      <h2>What can still go wrong</h2>
      <p>This is crypto. There are real failure modes worth knowing about:</p>
      <ul>
        <li>
          <strong>Smart-contract risk.</strong> Polymarket&apos;s CTF
          contracts, the Polymarket proxy contract, the Across spoke pool,
          and Polygon&apos;s USDC.e bridge are all third-party systems.
          They have been audited; they are not invincible.
        </li>
        <li>
          <strong>Phishing.</strong> The connect-wallet flow goes through
          Privy. If you see a popup from a different provider, that&apos;s
          a phishing site, not us.
        </li>
        <li>
          <strong>Market resolution.</strong> Markets resolve based on UMA
          (Polymarket&apos;s oracle). Disputed resolutions are rare but do
          happen. We don&apos;t control resolution and we don&apos;t
          back-stop bad outcomes.
        </li>
        <li>
          <strong>Bugs in Auspex.</strong> We test, but we&apos;re a small
          team. If you find an issue that puts user funds at risk, please
          email us before disclosing it publicly (contact in the docs).
        </li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        If you find a security issue that could affect users, please send a
        description to <code>security [at] auspex.to</code>. We&apos;ll
        respond within 48 hours and credit you (with your permission) in
        the changelog.
      </p>
    </LegalPage>
  );
}
