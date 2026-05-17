# Auspex · UI

Next.js 16 app for the Auspex crypto-bet screener (Polymarket-backed under the
hood). Reads from the Phase 0 data pipeline at `../data/enriched-markets.json`
and surfaces it as a sortable table with Δ-to-trigger and Resolution
Confidence (RC) bars, expand-to-detail rows, per-market detail pages,
watchlists, an open-orders view, and an in-page trading ticket.

## Getting started

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_PRIVY_APP_ID for trading
npm install --legacy-peer-deps
npm run dev                  # http://localhost:3000
```

The screener works without a Privy app ID — trading-related UI gracefully
degrades. To exercise the order ticket end-to-end you need:

- A Privy app ID set in `.env.local`
- A wallet that's onboarded with polymarket.com (deposit-wallet proxy created)
- Some pUSD in that deposit wallet
- Your deposit-wallet address (paste it once via Connect → Set deposit wallet;
  cached in localStorage after that)

## Routes

| Path | Type | Notes |
|---|---|---|
| `/` | dynamic | Screener home with auto-refreshing snapshot. |
| `/markets/[slug]` | dynamic | Per-market detail page with rules, sparkline, position, OG image. |
| `/watchlists` | dynamic | Starred markets, lives in localStorage. |
| `/orders` | dynamic | Open orders for the connected wallet, with cancel + cancel-all. |
| `/docs` | static | Methodology, RC formula, families, sources. |
| `/changelog` | static | Release notes. |
| `/api/markets` | dynamic | Read-only JSON of the projected rows. Supports `?family=…&limit=…`. |
| `/api/health` | dynamic | Snapshot freshness check. 200 OK if &lt; 6h old, 503 if stale. |
| `/sitemap.xml`, `/robots.txt` | static | Auto-generated from the snapshot. |
| `/markets/-/opengraph-image`, `/opengraph-image`, `/watchlists/opengraph-image` | dynamic / static | OG cards generated via `next/og`. |

## Stack

- Next.js 16 + Turbopack + App Router
- TypeScript strict, Tailwind v4
- TanStack Table for the dense rows; nuqs for URL state
- `@polymarket/clob-client-v2` (npm 1.0.6) for V2 orders, signature type 3 (POLY_1271)
- Privy + wagmi + viem for wallet auth
- sonner for toasts

## Trading guard-rails

- Builder code is hardcoded in `lib/polymarket.ts`. Don't commit a different
  one — see project memory for the registered bytes32.
- Signature type is hardcoded to `POLY_1271` (deposit-wallet flow). If the
  user has a Gnosis Safe / Magic / pure-EOA setup, this won't work as-is.
- The L2 API key is derived once per (signer, funder) pair and cached in
  `sessionStorage`. Concurrent calls dedupe via an in-flight Promise lock so
  the user is never prompted to sign more than once per session.

## Deploying

Vercel is the path of least resistance:

```bash
vercel link
# In the dashboard, set:
#   NEXT_PUBLIC_PRIVY_APP_ID
#   NEXT_PUBLIC_SITE_URL=https://your-domain.tld
#   NEXT_PUBLIC_POLYGON_RPC_URL=...   # not the public RPC at scale
vercel --prod
```

Add the prod domain to the allowed list in the Privy dashboard.

## Data freshness

`/api/markets` reads `../data/enriched-markets.json` from disk — it does not
re-run the Python pipeline. Whoever runs production needs a cron that calls
`python enrich_state.py` (in the parent directory) on a cadence and triggers
a redeploy. `/api/health` returns 503 once the snapshot is older than six
hours, which is a reasonable input for an external status page.
