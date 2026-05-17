# Auspex — session handoff

**Live:** https://auspex.to
**Repo:** https://github.com/gorillachimps/auspex (public)
**Last touched:** 2026-05-16

This doc is the single source of truth for state between sessions. Read top
to bottom on session start; update on session end.

---

## TL;DR

Auspex is a Polymarket-backed crypto-bet screener at auspex.to. Builder-code
attributed (SombreroStepover) for retro/airdrop farming, but the user-facing
brand stands independent — Polymarket is disclosed in the footer only.

Tonight's work covered Sprint A (activity / recent trades / close-position /
share), Sprint B6 + auto-detect (Polymarket account discovery on-chain),
fill notifications, a total-balance widget, and three failed attempts at an
embedded bridge that all hit structural blockers (covered below). The user's
friend tested the onboarding flow and exposed gaps that we patched live.

---

## State of production

### Working flows (verified)

- **Wallet connect** via Privy (Polygon-only supportedChains)
- **Auto-detect Polymarket account** in DepositWalletDialog — Etherscan V2
  query via `/api/find-proxy` against `OwnershipTransferred(0x0, eoa)` event
  topic. Verified end-to-end for the operator EOA → proxy mapping.
- **In-app pUSD allowance approval** via `client.updateBalanceAllowance` —
  no polymarket.com hop
- **Limit and Market orders** with live order-book slippage estimate
- **Sell + Close-position** (Close opens market mode with full holdings
  pre-filled)
- **Live order book** + recent trades widget (WS-driven, ref-counted)
- **Live price ticks** on top 50 markets by 24h volume in the screener
- **Whale fills ticker** on home page
- **Trade-pressure bar** + interactive price-history chart on market detail
- **TotalBalance widget** at top of /portfolio
- **Activity page** with fill history table
- **Fill notifications** (polling-based, tab-open only)
- **Bridge USDC** via external Jumper link from wallet dropdown, with
  destination address pre-filled — also in DepositWalletDialog, the
  OrderTicket low-balance card, and the ApprovalBanner

### Data pipeline (cron)

- `data-refresh.yml` every 15 min — Binance prices → CryptoCompare fallback
  (Binance returns HTTP 451 to GH Actions US runners)
- `data-rebuild.yml` every 6 h — full pipeline rebuild
- Snapshot age on `/api/health` typically < 15 min

### Operator surfaces

- `/builder` shows attribution stats from the public CLOB endpoint
- Builder code (bytes32) hardcoded in `ui/lib/polymarket.ts`
- No name "SombreroStepover" appears anywhere user-facing — only the bytes32
  on the operator dashboard

---

## What's NOT shipped, with reasons

### B5 — in-app Polymarket account creation (DO NOT SHIP)

The factory at `0xD3447596d282d62bc94240d17caee437efcfde62` deploys
DepositWallet proxies via `deploy(address[] _owners, bytes32[] _ids)`,
called by a Polymarket-controlled EOA with custom salts. If Auspex calls it
ourselves with a different salt, we deploy a "rogue" proxy that Polymarket's
own UI / backend won't recognize. User's funds land in a proxy invisible to
polymarket.com — silent failure mode worse than the current "go to
polymarket.com to onboard" friction.

**To unblock:** Polymarket would need to expose a permissionless factory
variant. Until then, send new users to polymarket.com once for account
creation. Auto-detect handles them when they return.

### C7-real — Web Push (deferred to dedicated session)

Browser-only notifications are live (polling `/trades`, tab-open only).
Real Push needs:
- Service Worker registration + lifecycle management
- VAPID key pair stored in env
- POST `/api/push/subscribe` endpoint persisting `user → subscription`
- Either server-side fill polling, or per-client polling that pushes back
- Subscription rotation + revocation

Roughly half a day of focused work. Worth it once weekly actives are
non-trivial.

### Embedded bridge — three structural blockers

Tonight attempted three paths, all blocked:

1. **`@lifi/widget` npm** — pulls in `@solana/wallet-adapter-base`,
   `@solana/web3.js`, `@mysten/sui`, `bitcoinjs-lib`, `@bigmi/core` at
   module-load time. Adding all those + bundle hit is structurally bad for
   a feature secondary to the screener.

2. **iframe Jumper** — `frame-ancestors` CSP hardcodes an allowlist
   (Strapi, Ember, Bluefin, Safe, base.app, Farcaster). Universal across
   bridge UIs as clickjacking protection.

3. **`@lifi/sdk` + custom UI** — viable but `executeRoute(route, options)`
   uses a provider-registration model
   (`createConfig({ providers: [EVM({ getWalletClient, switchChain })] })`),
   not a simple signer argument. Needs careful Privy/wagmi integration.

External Jumper link is the active flow. Real embedded bridge → **next
session, switch from LI.FI to Across** (see plan below).

---

## Next session plan

### Embedded bridge via Across + Onramper (~half day)

**Why Across over LI.FI:**
- EVM-only by design — no Cosmos/Solana/Sui peer-dep noise
- ~80 KB SDK vs LI.FI's 500 KB widget
- Single-hop architecture — quote/execute/status is simpler code
- Sub-minute fills (LI.FI is 1-30 min)
- Covers Ethereum / Arbitrum / Optimism / Base → Polygon (~95% of where
  users actually have USDC)
- Trade-off: no BSC. Keep external Jumper as fallback for non-Across routes.

**Concrete steps:**

1. `npm install @across-protocol/app-sdk --legacy-peer-deps` and verify the
   import graph is clean (no Cosmos/Solana/etc.)
2. New `ui/lib/acrossBridge.ts`:
   - `getQuote({ fromChainId, fromToken, toChainId: 137, toToken: USDC_E,
     amount, recipient })`
   - `executeBridge({ walletClient, quote, onStatus })` — uses the user's
     wagmi WalletClient directly, calls the Across spoke pool's
     `depositV3` after USDC approval
3. New `ui/components/BridgeDialog.tsx`:
   - Source chain dropdown (4 EVM chains)
   - USDC amount input, debounced quote fetch on change
   - Quote summary: "Receive ~X USDC.e · ~30s · $Y fee"
   - Approval step (USDC allowance to Across spoke pool) if needed
   - Submit → executeBridge → status updates via `onStatus`
   - Completion state with link to the destination tx
4. Onramper widget alongside for fiat-on-ramp (separate "Buy with card"
   button in the same dialog) — Onramper publishes CSPs designed for
   partner iframing, so this one actually embeds
5. Wire into the wallet dropdown's "Bridge USDC" entry (keep external
   Jumper link as a "More routes / BSC" fallback)
6. **Test with $5 USDC bridges from Base + Arbitrum before letting any
   real users near it.** Document the test in a checklist below.

**Test checklist before declaring the embedded bridge live:**
- [ ] $5 USDC from Base → Polygon completes successfully with funds
      arriving at the operator's proxy
- [ ] $5 USDC from Arbitrum → Polygon completes successfully
- [ ] Approval step fires correctly the first time and skips when allowance
      is already set
- [ ] Status display advances through Pending → Filled cleanly
- [ ] Error states render correctly for: rejected wallet sig, insufficient
      balance, no route available
- [ ] External Jumper link still works as fallback

### Other low-hanging items for the same session

- Register Disqus shortname at https://disqus.com/admin/create →
  `NEXT_PUBLIC_DISQUS_SHORTNAME` env var on Vercel → comments render
- GH Actions Node-20 → 24 bump: `actions/checkout@v4 → v5`,
  `setup-python@v5 → v6` in both workflow yml files. Forced migration
  June 2 2026, harmless now but cleaner to do early.
- Optional: embed snapshot timestamp inside `enriched-markets.json` itself
  in `enrich_state.py` (write `_meta.generatedAt = now()`) so the displayed
  snapshot age reflects pipeline-run time, not build time. ~10 min change.

---

## Key files

### Frontend
- `ui/app/page.tsx` — home (screener)
- `ui/app/markets/[slug]/page.tsx` — market detail
- `ui/app/portfolio/page.tsx`, `ui/app/activity/page.tsx`,
  `ui/app/orders/page.tsx`, `ui/app/builder/page.tsx`
- `ui/app/api/find-proxy/route.ts` — Etherscan V2 lookup
- `ui/components/OrderTicket.tsx` — limit/market, sell, allowance,
  slippage estimate (the most-touched file)
- `ui/components/DepositWalletDialog.tsx` — onboarding with auto-detect
- `ui/components/ApprovalBanner.tsx` — state-aware fund/approve CTA
- `ui/components/BridgeButton.tsx` — external Jumper hand-off
- `ui/components/ConnectButton.tsx` — wallet menu including Bridge entry
- `ui/components/TotalBalance.tsx`, `PositionCard.tsx`,
  `OrderBookView.tsx`, `RecentTradesView.tsx`, `PriceHistoryChart.tsx`,
  `TradePressureBar.tsx`, `WhaleFeedStream.tsx`, `LivePmImpliedStat.tsx`,
  `NotificationsToggle.tsx`, `ShareButtons.tsx`, `DisqusComments.tsx`

### Live data
- `ui/lib/polymarketWs.ts` — singleton WS client, ref-counted subs,
  reconnect with backoff
- `ui/lib/useLiveMarket.ts` — hooks: useLiveBook, useLiveMid, useLastTrade,
  useLiveMidMap, useWhaleFeed, useTradePressure, useWsStatus
- `ui/lib/polymarket.ts` — SDK wrapper: placeLimitOrder, placeMarketOrder,
  updateAllowance. BUILDER_CODE constant lives here.
- `ui/lib/useClobSession.tsx` — auth state machine
- `ui/lib/useUserPositions.ts` — data-api /positions wrapper
- `ui/lib/useFillNotifications.ts` — polling Notification API

### Data pipeline (Python)
- `dump_crypto_events.py` — Gamma API pagination
- `parse_rules.py` — rule structuring into families
- `enrich_state.py` — prices + RC. **CryptoCompare fallback when Binance
  returns 451** (GH Actions US runner geo-block).
- `.github/workflows/data-refresh.yml` — 15 min cron
- `.github/workflows/data-rebuild.yml` — 6 h cron

---

## Operational reference

### Production
- Domain: auspex.to (Porkbun, expires 2027-05-15, WHOIS-private)
- Host: Vercel Hobby, project `auspex` under "AC's projects"
- GitHub: gorillachimps/auspex (public, unlimited Actions minutes)
- Builder code: `0x1cc4300fca20eb0449c32d3c56d937d0a46e172d2707a62860b5f5311f2b608b`
- Operator proxy: `0xb4fB45069b3f0F7C69937CA114849f5A8380DA04`
- Operator EOA: `0xfEA773E782Bf72A3d1f7403bd243275221c24123` (for auto-detect
  smoke tests — calling `/api/find-proxy?eoa=…` with this returns the
  proxy above)

### Vercel env vars (Production)
- `NEXT_PUBLIC_PRIVY_APP_ID` — set
- `NEXT_PUBLIC_SITE_URL=https://auspex.to`
- `NEXT_PUBLIC_POLYGON_RPC_URL` — public RPC, swap for Alchemy/QuickNode
  at scale
- `POLYGONSCAN_API_KEY` — set (server-only, powers /api/find-proxy)
- `NEXT_PUBLIC_DISQUS_SHORTNAME` — **not yet set**, comments invisible
  until it is
- LI.FI / Across / Onramper integrator IDs — none yet, set in next
  session per their respective vendor pages

### Local dev
```bash
cd ui
npm install --legacy-peer-deps   # legacy-peer-deps because of recharts/react-19
npm run dev                       # http://localhost:3000
npm run build                     # includes prebuild that syncs ../data → ui/data
```

### Quick verification commands
```bash
# Auto-detect endpoint health
curl -s 'https://auspex.to/api/find-proxy?eoa=0xfEA773E782Bf72A3d1f7403bd243275221c24123' | python3 -m json.tool
# Expect: { "proxy": "0xb4fb45069b...", "count": 1, "factory": "0xd3447596..." }

# Snapshot freshness
curl -s 'https://auspex.to/api/health' | python3 -m json.tool
# Expect: status "ok", snapshotAgeSeconds < 900

# Workflow runs
gh run list --workflow=data-refresh.yml --limit 5 --repo gorillachimps/auspex
```

---

## Tonight's commit log (newest first)

```
33b4ea6 revert(bridge): roll back @lifi/sdk install — option C is multi-session
9c1c7be fix(bridge): revert to external new-tab hand-off (iframe blocked by CSP)
d771407 fix(connect-menu): add Bridge USDC entry — always reachable after connect
52f39c0 feat(bridge): in-page bridge dialog (iframe wrap of Jumper) [reverted]
155e8c3 fix(banner): state-aware CTA — Bridge USDC when funds=0, in-app Approve
ad2dcfa feat(funnel): external USDC bridge button + Disqus comments scaffold
2b60389 feat(retention): /activity, recent trades, close-position, share buttons
fb78a93 feat(trade): Market vs Limit orders + drop builder-code from UX surface
276dd3b feat(intel): whale feed, order-flow bar, avg-entry P&L, real chart, allowance
98f53c4 feat(onboarding+notifs): auto-detect Polymarket account + fill notifications
cd3ed43 feat(portfolio): TotalBalance widget
9651ace fix(find-proxy): switch to Etherscan V2 endpoint
10c3385 fix(pipeline): CryptoCompare fallback when Binance returns 451
b8713ae feat(brand): magic-wand logo
```

---

## How to start the next session

1. Read this file top to bottom (~3 min)
2. `git pull` to sync (cron will have pushed several `data:` commits)
3. Check production health via the verification commands above
4. Confirm with the user whether the priority is the **embedded bridge
   via Across** (the main entry on the next-session plan) or something
   else they've thought of in the interim
5. If picking up the bridge: start with installing
   `@across-protocol/app-sdk` and verifying its dep graph is clean before
   investing more
6. Update this file at session end with what shipped, what's parked, and
   anything that changed about the system shape
