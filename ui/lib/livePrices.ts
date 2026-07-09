// Live Binance spot prices with a short server-side cache, so the screener's
// "right now" price + distance-to-trigger reflect the market NOW rather than
// the last committed snapshot. GitHub throttles the data-refresh cron to hours,
// so the snapshot's prices go stale; this overlays fresh prices on top of the
// snapshot's (slow-changing) market definitions.
//
// Same source + fallback order as enrich_state.py: data-api.binance.vision is
// not geo-blocked from datacenters the way api.binance.com is.

const BINANCE_HOSTS = [
  "https://data-api.binance.vision/api/v3/ticker/price",
  "https://api.binance.com/api/v3/ticker/price",
];

// Cache TTL. The screener client polls /api/markets every 60s and the route is
// edge-cached ~60s, so a 30s origin TTL means Binance is hit at most a couple
// times a minute per warm instance.
const TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 6_000;

export type LivePrices = {
  prices: Record<string, number>; // "BTCUSDT" -> 62185.1
  fetchedAt: number; // epoch ms
};

let cache: LivePrices | null = null;
let inFlight: Promise<LivePrices | null> | null = null;

async function fetchAllTickers(): Promise<LivePrices | null> {
  for (const host of BINANCE_HOSTS) {
    try {
      const r = await fetch(host, {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const body: unknown = await r.json();
      if (!Array.isArray(body)) continue;
      const prices: Record<string, number> = {};
      for (const row of body) {
        if (
          row &&
          typeof row === "object" &&
          typeof (row as { symbol?: unknown }).symbol === "string"
        ) {
          const sym = (row as { symbol: string }).symbol;
          const p = Number((row as { price?: unknown }).price);
          if (Number.isFinite(p) && p > 0) prices[sym] = p;
        }
      }
      if (Object.keys(prices).length > 0) {
        return { prices, fetchedAt: Date.now() };
      }
    } catch {
      // try the next host
    }
  }
  return null;
}

/**
 * Fresh-or-cached live prices. Returns the last-known-good cache if a refresh
 * fails, and null only if we have never successfully fetched — callers then
 * fall back to the snapshot's own prices (i.e. current behavior, no regression).
 */
export async function getLivePrices(): Promise<LivePrices | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = fetchAllTickers()
    .then((fresh) => {
      if (fresh) cache = fresh;
      return cache; // last-known-good on failure
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
