# Auspex architecture review — 2026-05-16

Five parallel review agents (Opus) audited the codebase across money-path
correctness, security, realtime/concurrency, architecture/simplification, and
competitive/product. This file is the canonical record: every finding, its
severity, and its status.

**Headline verdict: no fund-loss bugs.** The two highest-stakes paths — the
Across cross-chain bridge and the order/slippage math — were traced
end-to-end and are correct. Everything below is hardening, hygiene, and
growth.

Status legend: ✅ FIXED (commit) · 🟡 DEFERRED · ⚪ WON'T-FIX/ACCEPTED · ✔︎ VERIFIED-CLEAN

---

## 1. Money-path correctness

Verified clean (explicitly traced):
- ✔︎ All 4 Across spoke-pool addresses + USDC token addresses match canonical mainnet deployments.
- ✔︎ Market-order book-walk hits the correct side with the correct `length-1` inside-of-book convention; partial-fill + slippage math correct.
- ✔︎ Chain forced to Polygon before signing; bridge enforces source-chain match (`forceOriginChain`).
- ✔︎ No reachable `BigInt(NaN)`; no shares-vs-USDC unit confusion.

Findings:
- ✅ **M-1 Auth race (orphaned derivation)** — `useClobSession`. An in-flight credential derivation captured `funder` in its closure and could `setClient`/`setStatus("ready")` bound to a stale funder after a deposit-wallet switch → orders signed against the wrong account. Fixed with a generation token (`3ed08c5`).
- ✅ **M-2 Large-market confirm gate didn't re-arm** — `OrderTicket`. Editing size after arming the >$100 confirm turned the button straight to "Confirm"; a second click fired the enlarged order without review. Now resets on size/outcome/mode change (`3ed08c5`).
- ✅ **L-1 Sell-cap rounds up** — close/sell prefill used `toFixed(2)` (round), so a dust holding like `0.099999` → `"0.10"` exceeded balance and Polymarket rejected. Now floors to 2 decimals (`3ed08c5`).
- ✅ **L-2 `useBalanceAllowance` balance parse** — `BigInt(r.balance)` was unguarded (the allowance loop was guarded); a bad string would null the balance and break the order gate. Wrapped in try/catch (`3ed08c5`).

---

## 2. Security

0 Critical. 2 High, both addressed:

- ✅ **H-1 Clickjacking** — no `X-Frame-Options`/`frame-ancestors` on any route except `/embed` (which allows framing). Wallet-signing surfaces (order submit, close-all, bridge approve) were iframable for a clickjacking overlay. Fixed: global `SECURITY_HEADERS` (frame-ancestors 'self', X-Frame-Options SAMEORIGIN, nosniff, HSTS, Referrer-Policy) via a negative-lookahead source so `/embed` keeps `frame-ancestors *` without a conflicting double-CSP. Runtime-verified. (`0d4839f`)
- ✅/⚪ **H-2 Infinite approval + non-load-bearing spender** — the bridge approves max-uint256 to the Across spoke pool, and the audited `SPOKE_POOL_BY_CHAIN` map was only used for a UI label (the real approve tx is built inside the SDK). Fixed the dangerous half: `executeBridge` now asserts the SDK's resolved `quote.deposit.spokePoolAddress` equals the audited address before any signature (`3ed08c5`). Infinite-approval is **kept by design** (UX: no re-approve per bridge) now that the spender is provably correct. Optional future: a "revoke approval" affordance.
- ✅ **M-1 Unencoded params** — `findPolymarketProxy` interpolated `eoa`/`proxy` without `encodeURIComponent`. Server regex already gated it (no SSRF/injection), but added encoding as defense-in-depth (`3ed08c5`).
- ⚪ **M-2 `NEXT_PUBLIC_ACROSS_API_KEY` in client bundle** — accepted: per Across's integrator model this is a public attribution/rate-limit token, not a fund-control secret. The genuinely sensitive `POLYGONSCAN_API_KEY` is correctly server-only (verified).
- 🟡 **L-1 `/api/find-proxy` unauthenticated + uncached** — anonymous users can drive arbitrary lookups that each spend Etherscan quota. Not data exposure. Recommend per-IP rate-limit or short-TTL cache by address. Deferred.
- ✔︎ **Verified clean:** secret leakage (none), SSRF in find-proxy (host hardcoded, params encoded), Disqus XSS (config props, never HTML), WS prototype-pollution (opaque pass-through, no merge sink), `dangerouslySetInnerHTML` (zero), `rel=noopener` on all 25 external `target=_blank`, localStorage trust (parsed in try/catch + re-validated), wallet-tracker input (validated, public on-chain data only).

---

## 3. Realtime / concurrency

- ✅ **C-1 + H-1/H-2 Quadruple positions polling** — `useUserPositions` had no shared cache, so `TotalBalance`, `useTabTitleBadge`, `useSettlementNotifications`, and every `PositionCard` each ran an independent 30s `/positions` poll for the same wallet; `PortfolioView` re-implemented the loop inline a third time (+ a hacky Refresh-button fetch). One fill → thundering herd. Fixed: module-level store keyed by funder, one poll fanned out to all subscribers, single global `order-placed` handler. PortfolioView lost ~90 lines. (`296982d`)
- ✅ **H-3 Whale-feed re-subscribe churn** — `useWhaleFeed` had `tokenInfo` (a Map rebuilt every render) in its effect deps → tore down + rebuilt ~100 WS subscriptions on every screener refresh. Now reads `tokenInfo` via a ref; only the token *set* re-subscribes. (`e43d7e5`)
- ✅ **H-4 Missing unmount guards** — `useWhaleFeed`, `useTradePressure`, `useLiveMidMap` could `setState` after unmount. Added `cancelled` guards. (`e43d7e5`)
- ✅ **WS stale-socket** — a superseded socket's async `onclose` could stomp the new socket's status to "reconnecting" + schedule a redundant reconnect (route-flip churn). Handlers now gate on `this.ws === socket`; `close()` clears the pending subscribe batch. (`e43d7e5`)
- ✅ **Pressure-bar staleness** — `useTradePressure` only recomputed on new events, so a quiet market kept showing aged-out volume. Added a 5s prune tick. (`e43d7e5`)
- ✅ **`useLiveMid` redundant dep** — dropped the extra `book?.version` dep (book identity is already fresh per update). (`e43d7e5`)

---

## 4. Architecture / simplification

- ✅ **Order-book math extracted** — `estimateMarketFill` + `FillEstimate` moved out of the 1200-line `OrderTicket` into a pure, unit-testable `lib/orderBook.ts`. (`81642fe`)
- ✅ **Dead code removed** — `DataTableShell`, `fmtPctFromFraction`, `LiveState` type. (`81642fe`)
- ✅ **Shared poll layer (positions)** — done via the C-1 store. (`296982d`)
- 🟡 **Generic `usePolledResource<T>`** — 8 other hand-rolled `setTimeout(load, MS)` loops remain (`useWalletTrades`, `useFollowedActivityFeed`, `useFillNotifications`, `ActivityView`, `BuilderStatsView`, `useBalanceAllowance`, …). Pure simplification (no bug — they're single-consumer). Deferred.
- 🟡 **Shared `Modal` shell** — 6 dialogs re-implement overlay + Escape + click-outside + focus-trap (3 with focus-trap, 3 without — inconsistent a11y). Deferred: `OrderTicket` and `BridgeDialog` have bespoke "don't close mid-transaction" Escape logic; a mass migration needs UI verification before shipping.
- 🟡 **`closePosition`/`closeAll`/`cancelAll` extraction** — order-mutating logic still lives inside view JSX. Behavior-touching; deferred with UI verification.
- ⚪ **`data-api` host constant (5 files)** — cosmetic dedup of an unchanging string; skipped (poor risk/reward).
- ⚪ **`fmtCollateral` vs `formatUSDC`** — *not* true duplicates (different precision + `$`/" USDC" conventions); left as-is. The agent's premise was off here.
- ⚪ **`MarketTable` (599 lines)** — cohesive; splitting would hurt. Left alone.

---

## 5. Competitive / product (strategic)

- **Builder Program is now a revenue line, not just airdrop insurance.** Polymarket pays builders weekly USDC proportional to attributed volume, and Polymarket now charges taker fees — so Auspex's "0% fees" is a genuine differentiator. This reweights the roadmap toward *driving attributed fills*.

Ranked build list (from the competitive sweep):

| Build | Why | Effort |
|---|---|---|
| **Trigger Radar** — distance-to-trigger alerts | The one alert no competitor can compute; distance is already calc'd server-side; push plumbing exists | S–M |
| **Fix `no-funder` dead-end** (U-1) | Biggest conversion leak: new users hit "go elsewhere" mid-trade with no inline path | S |
| **One-click "copy this fill"** from the follow feed | Dominant competitor category; ~75% of substrate already built; drives attributed volume | M |
| **"Farm mode"** — reward-optimized maker placement | Makes Auspex the front-end for PM's liquidity-rewards program; on-brand | M |

---

## Deferred backlog (carried forward)

From this review:
1. Embedded-bridge polish: optional revoke-approval affordance (H-2 follow-up).
2. `/api/find-proxy` rate-limit / cache (security L-1).
3. Generic `usePolledResource<T>` for the 8 remaining single-consumer poll loops.
4. Shared `Modal` shell across 6 dialogs (UI-verify the in-flight Escape paths).
5. `closePosition`/`cancelAll` extraction to `lib/orderActions.ts`.

Pre-existing (from HANDOFF.md, still open):
6. C7 real Web Push (Service Worker + VAPID + backend).
7. B5 in-app account creation — **DO NOT SHIP** (rogue-proxy fund-loss risk).
8. Disqus shortname env var; GH Actions Node-20→24 bump.
9. HANDOFF.md is stale (still says "Hunch", lists shipped features as parked).

---

## Commits from this review

```
81642fe refactor: extract order-book math to lib/orderBook + remove dead code
e43d7e5 fix(realtime): WS stale-socket guard, whale-feed churn, unmount guards
3ed08c5 fix(correctness): auth-race guard, bridge spender assertion, sell-cap floor + 3 more
0d4839f security: global clickjacking protection (frame-ancestors 'self')
296982d perf(positions): shared store — one /positions poll per funder, not 4-5
```
