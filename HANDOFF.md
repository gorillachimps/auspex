# Auspex — session handoff

**Live:** https://auspex.to
**Repo:** https://github.com/gorillachimps/auspex (public)
**Last updated:** 2026-05-16 (architecture-review session)

Single source of truth between sessions. Read top to bottom on start; update
on end. For the full architecture audit see **REVIEW.md**.

---

## TL;DR

Auspex is a Polymarket-backed crypto-bet screener + trading surface at
auspex.to. Builder-code attributed for retro/volume rewards (the friendly
profile name is kept out of all user-facing copy — only the bytes32 shows on
the operator `/builder` dashboard). Brand stands independent; Polymarket is
disclosed in the footer + onboarding only.

The product is well past MVP: screener with live prices, market detail with a
live order book / recent trades / depth chart / order-flow bar / interactive
price history, full trading (limit + market + sell + one-click close),
portfolio + activity + open orders, wallet tracker + leaderboard + social
follows, embeds, an **embedded Across bridge**, on-chain account auto-detect,
in-app allowance approval, a notifications inbox (fills + settlement +
**Trigger Radar** alerts), and legal pages.

Most recent work: a 5-agent architecture review (REVIEW.md) → shipped fixes +
follow-ups (see "2026-05-16 review" below).

---

## State of production — working flows

- **Wallet connect** via Privy (Polygon default; Across needs the other EVM
  source chains in `supportedChains`).
- **Onboarding**: auto-detects the user's Polymarket proxy from their EOA via
  `/api/find-proxy` (Etherscan V2 `OwnershipTransferred` log query, server-side
  key, now cached + rate-limited). Manual paste fallback. No-funder surfaces
  now have an inline "Link account" CTA (no dead-end).
- **Funding**: embedded **Across bridge** (`BridgeDialog` + `lib/acrossBridge`)
  — USDC from Base/Arbitrum/Optimism/Ethereum → Polygon USDC.e, approve →
  deposit → fill with live status. Spender is asserted against the audited
  `SPOKE_POOL_BY_CHAIN` before signing.
- **Trading**: limit + market orders with live order-book slippage estimate;
  sell + one-click close (single + close-all); in-app allowance approval (no
  polymarket.com hop). Builder code rides every order.
- **Live market data**: singleton WS (`polymarketWs`) → live order book,
  recent-trades ticker, live mid, top-50 live prices on the screener, whale-fill
  ticker, order-flow pressure bar.
- **Portfolio**: positions (shared store — one poll per funder), avg-entry +
  P&L, TotalBalance widget, CSV export. **Activity**: fill history.
  **Orders**: open orders + cancel/cancel-all.
- **Wallet tracker** (`/wallets/[address]`) + **leaderboard** + **follow feed**.
- **Notifications**: inbox (`useNotifications`) + browser notifications for
  fills, settlement/redeemable, and **Trigger Radar** (distance-to-trigger
  alerts — the flagship differentiator).
- **Embeds** (`/embed/[slug]`), legal pages, PWA install, first-visit tour.

### Data pipeline (cron)
- `data-refresh.yml` every 15 min — prices (Binance → CryptoCompare fallback;
  Binance 451s from GH US runners).
- `data-rebuild.yml` every 6 h — full pipeline.
- `/api/health` snapshot age typically < 15 min. Workflows on `checkout@v5` +
  `setup-python@v6`.

---

## 2026-05-16 architecture review (see REVIEW.md for full detail)

Five parallel agents audited correctness / security / realtime / architecture
/ product. **No fund-loss bugs.** Shipped this session:

Review fixes:
- Shared positions store — one `/positions` poll per funder, not 4–5 (`296982d`)
- Global clickjacking headers, `frame-ancestors 'self'` (`0d4839f`)
- Auth-race guard, bridge spender assertion, sell-cap floor, large-market
  re-arm, defensive parses (`3ed08c5`)
- Realtime hygiene: WS stale-socket guard, whale-feed churn, unmount guards,
  pressure-bar prune (`e43d7e5`)
- Extract `lib/orderBook` (pure fill math) + dead-code removal (`81642fe`)

Follow-ups (this session):
- `/api/find-proxy` in-memory cache + per-IP rate limit
- Generic `lib/usePolledResource` (adopted in `useWalletTrades`; others can
  adopt incrementally)
- No-funder dead-end → inline "Link account" CTA (`lib/depositDialog`)
- **Trigger Radar** — distance-to-trigger alerts (flagship)
- Fixed providers bug: SettlementNotifications/FirstVisitTour/PwaInstallPrompt
  were mounted only in the non-Privy branch → never ran in production. Now a
  shared `GlobalChrome` in both branches.

---

## Deferred backlog (carried forward)

Refactors (behavior-touching — want UI verification):
1. **Shared `Modal` shell** across 6 dialogs. `OrderTicket` + `BridgeDialog`
   have bespoke "don't close mid-transaction" Escape logic — verify by hand.
2. **`closePosition`/`cancelAll` extraction** to `lib/orderActions.ts`.
3. **Adopt `usePolledResource`** in the remaining single-consumer loops
   (`useFollowedActivityFeed`, `ActivityView`, `BuilderStatsView`). NOT
   `useFillNotifications` (bespoke diffing) / `useBalanceAllowance` (SDK shape).

Features / infra:
4. **Full Web Push** (Service Worker + VAPID + backend) — current notifications
   are tab-open only.
5. **Disqus**: set `NEXT_PUBLIC_DISQUS_SHORTNAME` on Vercel to light up comments.
6. **Snapshot timestamp** in `enrich_state.py` (`_meta.generatedAt`) so the
   age reflects pipeline-run time, not build time.
7. **Bridge**: optional revoke-approval affordance (infinite approval is on).
8. **Onramper** fiat on-ramp widget (embeds cleanly, unlike bridge UIs).

Product (higher leverage — Builder Program now pays weekly USDC by attributed
volume, so driving fills = revenue):
9. **One-click "copy this fill"** from the follow feed.
10. **Farm mode** — reward-optimized maker placement.

**DO NOT SHIP — B5 in-app account creation.** The factory
`0xD3447596…` deploys proxies via `deploy(address[],bytes32[])` from a
Polymarket-controlled EOA with custom salts. Calling it ourselves makes a
"rogue" proxy invisible to polymarket.com → silent fund loss. Auto-detect
handles returning users; send new users to polymarket.com once.

---

## Key files

### Frontend
- `app/page.tsx` (screener), `app/markets/[slug]/page.tsx` (detail)
- `app/{portfolio,activity,orders,builder,leaderboard,wallets/[address]}/page.tsx`
- `app/embed/[slug]/page.tsx`, `app/providers.tsx` (GlobalChrome mounts)
- `app/api/find-proxy/route.ts` (Etherscan V2 lookup, cached + rate-limited)
- `components/OrderTicket.tsx` — limit/market/sell/approve (fill math now in
  `lib/orderBook`). Most-touched file.
- `components/BridgeDialog.tsx` + `lib/acrossBridge.ts` — embedded Across bridge
- `components/DepositWalletDialog.tsx` — onboarding + auto-detect
- `components/{ApprovalBanner,ConnectButton,PositionCard,TotalBalance}.tsx`
- `components/Trigger{AlertButton,AlertsWatcher}.tsx` — Trigger Radar UI/mount

### Lib
- `lib/polymarketWs.ts` — singleton WS, ref-counted, stale-socket-guarded
- `lib/useLiveMarket.ts` — useLiveBook/Mid/LastTrade/MidMap/WhaleFeed/TradePressure
- `lib/orderBook.ts` — pure `estimateMarketFill`
- `lib/polymarket.ts` — SDK wrapper (placeLimitOrder/placeMarketOrder/
  updateAllowance); BUILDER_CODE here
- `lib/useClobSession.tsx` — auth state machine (gen-token guarded)
- `lib/useUserPositions.ts` — **shared** positions store (one poll/funder)
- `lib/usePolledResource.ts` — generic poll hook
- `lib/useTriggerAlerts.ts` + `lib/useTriggerAlertsWatcher.ts` — alerts
- `lib/useNotifications.ts` — inbox; `lib/depositDialog.ts` — open-dialog trigger

### Data pipeline (Python, repo root)
- `dump_crypto_events.py` → `parse_rules.py` → `enrich_state.py`
  (CryptoCompare fallback for Binance 451) → `.github/workflows/*.yml`

---

## Operational reference

### Production
- Domain: auspex.to (Porkbun, expires 2027-05-15, WHOIS-private)
- Host: Vercel Hobby, project `auspex` under "AC's projects"
- GitHub: gorillachimps/auspex (public)
- Builder code: `0x1cc4300fca20eb0449c32d3c56d937d0a46e172d2707a62860b5f5311f2b608b`
- Operator proxy: `0xb4fB45069b3f0F7C69937CA114849f5A8380DA04`
- Operator EOA: `0xfEA773E782Bf72A3d1f7403bd243275221c24123` (auto-detect smoke test)

### Vercel env vars (Production)
- `NEXT_PUBLIC_PRIVY_APP_ID` — set
- `NEXT_PUBLIC_SITE_URL=https://auspex.to`
- `NEXT_PUBLIC_POLYGON_RPC_URL` — public RPC; swap for Alchemy/QuickNode at scale
- `POLYGONSCAN_API_KEY` — set (server-only; powers /api/find-proxy)
- `NEXT_PUBLIC_ACROSS_API_KEY` / `NEXT_PUBLIC_ACROSS_INTEGRATOR_ID` — bridge
  attribution (public by Across's integrator model)
- `NEXT_PUBLIC_DISQUS_SHORTNAME` — **not set**; comments hidden until it is

### Local dev
```bash
cd ui
npm install --legacy-peer-deps   # recharts/react-19 peer ranges
npm run dev                       # http://localhost:3000
npm run build                     # prebuild syncs ../data → ui/data
```

### Quick verification
```bash
curl -s 'https://auspex.to/api/find-proxy?eoa=0xfEA773E782Bf72A3d1f7403bd243275221c24123' | python3 -m json.tool
#   → { "proxy": "0xb4fb45069b...", "count": 1, "factory": "0xd3447596..." }
curl -s 'https://auspex.to/api/health' | python3 -m json.tool
#   → status "ok", snapshotAgeSeconds < 900
gh run list --workflow=data-refresh.yml --limit 5 --repo gorillachimps/auspex
```

---

## How to start the next session

1. Read this file + skim REVIEW.md (~5 min).
2. `git pull` (cron pushes frequent `data:` commits).
3. Health-check via the verification commands above.
4. Ask the user which track: **product** (copy-trade / farm mode — revenue via
   the Builder Program) or **remaining refactors** (Modal shell needs them at
   the keyboard; the rest are safe).
5. Update this file + REVIEW.md at session end.
