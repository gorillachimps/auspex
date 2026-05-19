import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "API · Auspex",
  description:
    "Public JSON endpoints for the Auspex Polymarket-crypto screener — markets, lookup-by-token, health, and Polymarket-proxy resolution.",
};

export default function ApiDocsPage() {
  return (
    <>
      <TopNav active="api" />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl font-semibold tracking-tight">API</h1>
          <p className="mt-2 text-sm text-muted">
            The same data the screener uses, exposed as plain JSON. No auth, no
            rate limits beyond Vercel&apos;s defaults. Endpoints are served
            with a 60–300 s edge cache so repeated calls are cheap.
          </p>

          <Endpoint
            method="GET"
            path="/api/markets"
            description="All crypto-vertical Polymarket markets, sorted by 24-hour volume descending. Refreshed every 15 minutes by a cron pipeline and cached at the edge for 60 s."
            params={[
              {
                name: "family",
                kind: "string",
                desc: "Filter to a single market family — one of binance_price, holdings_event, fdv_after_launch, polymarket_team_judgment.",
              },
              {
                name: "limit",
                kind: "number",
                desc: "Max rows returned (1–5000, default 500).",
              },
            ]}
            curl={`curl -s 'https://auspex.to/api/markets?family=binance_price&limit=10' | python3 -m json.tool`}
            sample={`{
  "generatedAt": "2026-05-19T12:40:28.204Z",
  "total": 157,
  "returned": 10,
  "markets": [
    {
      "id": "573655",
      "question": "Will Bitcoin hit $150k by June 30, 2026?",
      "slug": "will-bitcoin-hit-150k-by-june-30-2026",
      "family": "binance_price",
      "source": "binance",
      "pair": "BTC/USDT",
      "tokenYes": "139156…",
      "tokenNo": "138269…",
      "tickSize": 0.001,
      "negRisk": false,
      "impliedYes": 0.0135,
      "bestBid": 0.013, "bestAsk": 0.014,
      "currentValue": 76749.49,
      "thresholdValue": 150000,
      "distancePct": 4.488336733,
      "alreadyTriggered": false,
      "liveState": "live",
      "rc": 44.7,
      "endDate": "2026-07-01T04:00:00Z",
      "volumeTotal": 15734008,
      "volume24h": 5821652,
      "liquidity": 19822.55
    },
    "…"
  ]
}`}
          />

          <Endpoint
            method="GET"
            path="/api/markets/by-token"
            description="Resolve one or more CLOB token IDs back to the market that owns them. Useful for clients that index trades on-chain by token-id and need to join back to the human question."
            params={[
              {
                name: "ids",
                kind: "string",
                desc: "Comma-separated list of CLOB token IDs (uint256 strings). Max 500 per request.",
              },
            ]}
            curl={`curl -s 'https://auspex.to/api/markets/by-token?ids=139156…,138269…' | python3 -m json.tool`}
            sample={`{
  "count": 2,
  "lookup": {
    "139156…": {
      "marketId": "573655",
      "question": "Will Bitcoin hit $150k by June 30, 2026?",
      "outcome": "yes",
      "slug": "will-bitcoin-hit-150k-by-june-30-2026"
    },
    "138269…": {
      "marketId": "573655",
      "question": "Will Bitcoin hit $150k by June 30, 2026?",
      "outcome": "no",
      "slug": "will-bitcoin-hit-150k-by-june-30-2026"
    }
  }
}`}
            extra={
              <p>
                Also accepts POST with body{" "}
                <code className="rounded bg-background/60 px-1 font-mono text-[12px]">
                  {"{ \"tokens\": [\"…\", \"…\"] }"}
                </code>{" "}
                — same response shape. Use POST when your token list exceeds
                the URL length limit (~8 KB on most CDN edges).
              </p>
            }
          />

          <Endpoint
            method="GET"
            path="/api/find-proxy"
            description="Resolve a Polygon address to or from its Polymarket DepositWallet proxy. Powered by Etherscan V2 log queries against the OZ OwnershipTransferred event emitted on proxy deployment. Requires POLYGONSCAN_API_KEY on the deployment; returns 503 otherwise."
            params={[
              {
                name: "eoa",
                kind: "0x-address",
                desc: "Forward lookup: given a wallet EOA, return the most-recently-deployed Polymarket proxy that EOA owns. Returns proxy: null when no proxy is found.",
              },
              {
                name: "proxy",
                kind: "0x-address",
                desc: "Reverse lookup: given a candidate proxy address, return the list of EOAs that appear in its initial-owners array. Use this to verify whether a wallet is authorised to sign for a given proxy.",
              },
            ]}
            curl={`curl -s 'https://auspex.to/api/find-proxy?eoa=0xfEA773E782Bf72A3d1f7403bd243275221c24123' | python3 -m json.tool`}
            sample={`{
  "proxy": "0xb4fB45069b3f0F7C69937CA114849f5A8380DA04",
  "count": 1,
  "factory": "0xd3447596d282d62bc94240d17caee437efcfde62"
}`}
            extra={
              <p>
                Auspex&apos;s onboarding flow uses both modes: the forward
                lookup auto-discovers a connecting wallet&apos;s Polymarket
                account; the reverse lookup validates that a pasted proxy is
                actually owned by the connecting wallet (catching the
                otherwise-silent &quot;balance reads 0&quot; failure mode).
              </p>
            }
          />

          <Endpoint
            method="GET"
            path="/api/health"
            description="Liveness probe. Reports whether the snapshot file is loadable and how stale it is. Anything over 900 s (15 min) of snapshotAgeSeconds indicates the cron pipeline has fallen behind."
            params={[]}
            curl={`curl -s 'https://auspex.to/api/health' | python3 -m json.tool`}
            sample={`{
  "status": "ok",
  "snapshotAt": "2026-05-19T12:40:28.204Z",
  "snapshotAgeSeconds": 352,
  "markets": 345,
  "elapsedMs": 22
}`}
          />

          <Section title="Caching + freshness">
            <p>
              Markets data is rebuilt server-side every 15 minutes by a GitHub
              Actions cron (see{" "}
              <code className="font-mono text-[12px]">
                .github/workflows/data-refresh.yml
              </code>
              ). The pipeline pulls fresh prices from Binance (CryptoCompare
              fallback for geo-blocked runners), recomputes resolution-
              confidence scores, and commits the new snapshot, which triggers
              a Vercel redeploy. Each API response carries an HTTP{" "}
              <code className="font-mono text-[12px]">Cache-Control</code>{" "}
              header so the edge holds it for the cache window even between
              snapshot pushes.
            </p>
          </Section>

          <Section title="Stability & attribution">
            <p>
              These endpoints are stable but not formally versioned — fields
              may be added; existing field names and types won&apos;t change
              without a deprecation note in{" "}
              <a href="/changelog" className="text-accent hover:underline">
                /changelog
              </a>
              .
            </p>
            <p>
              The data is a presentation layer over publicly available
              Polymarket Gamma + CLOB sources, plus market-resolution-source
              prices (Binance, CryptoCompare). Use it freely. If you ship
              something cool with it, a link back to{" "}
              <a href="https://auspex.to" className="text-accent hover:underline">
                auspex.to
              </a>{" "}
              is appreciated but not required.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}

type Param = { name: string; kind: string; desc: string };

function Endpoint({
  method,
  path,
  description,
  params,
  curl,
  sample,
  extra,
}: {
  method: "GET" | "POST";
  path: string;
  description: string;
  params: Param[];
  curl: string;
  sample: string;
  extra?: React.ReactNode;
}) {
  const liveUrl = path.includes("?") ? path : path;
  return (
    <section className="mt-10 scroll-mt-20 first:mt-12">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-2">
        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
          {method}
        </span>
        <code className="font-mono text-[14px] text-foreground">{path}</code>
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
        >
          Open live JSON
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      <p className="mt-3 text-sm text-foreground/85">{description}</p>

      {params.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            Query parameters
          </div>
          <div className="mt-2 space-y-2">
            {params.map((p) => (
              <div
                key={p.name}
                className="grid grid-cols-[140px_1fr] gap-3 rounded-md border border-border/60 bg-surface/30 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-mono text-[12px] text-foreground">
                    {p.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-2">
                    {p.kind}
                  </div>
                </div>
                <p className="text-muted">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {extra ? <div className="mt-3 text-sm text-foreground/85">{extra}</div> : null}

      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Example request
        </div>
        <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-[12px] text-foreground/90">
          {curl}
        </pre>
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          Example response
        </div>
        <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-[12px] text-foreground/90">
          {sample}
        </pre>
      </div>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}
