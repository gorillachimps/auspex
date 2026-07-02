# Auspex

**Crypto prediction markets, sorted by signal.** A screener + trading frontend
for [Polymarket](https://polymarket.com)'s crypto vertical — live at
**[auspex.to](https://auspex.to)**.

For every crypto market, Auspex checks the live state of the market's *own
resolution source* — e.g. Binance BTC/USDT spot vs. the market's threshold —
and surfaces:

- **Distance to trigger** — how far the live value is from flipping the market
- **Resolution Confidence** — a 0–100 composite of distance, time pressure, and volume
- **Trigger Radar** — browser alerts when a market you armed nears its trigger
- **Live microstructure** — order book, depth, whale fills, trade pressure
- **Trading built in** — limit + market orders via Polymarket's CLOB
  (builder-code attributed), portfolio, open orders, wallet P&L tracking

Zero added fees. Non-custodial — you trade through your own Polymarket
account; Auspex never holds funds.

## How it works

```
dump_crypto_events.py   gamma-api event dump (date-sharded pagination)
        │
parse_rules.py          rules text → structured families (price / FDV / …)
        │
enrich_state.py         live resolution-source state + distance + RC score
        │
data/enriched-markets.json  ──►  ui/  (Next.js 16 app — screener, market
                                  pages, order ticket, portfolio)
```

The pipeline runs on GitHub Actions (refresh every 15 min, full rebuild every
6 h) and commits snapshots; Vercel redeploys on push. See
[`ui/README.md`](ui/README.md) for app setup.

## Tools

- `alert_candidates.py` — prints tweet-ready near-trigger alert posts from the
  current snapshot (book-verified so it never links an untradeable market)
- `builder_stats.py` — attribution ledger from the public CLOB
  builder/trades endpoint (volume, trades, unique funders)

## Trading integration

Orders are signed client-side with the signature type matching the user's
Polymarket account (Safe / proxy / deposit wallet — detected by CREATE2
derivation from the connected wallet) and submitted to the CLOB with the
Auspex builder code. Money-path logic is covered by a vitest suite
(`cd ui && npm test`).
