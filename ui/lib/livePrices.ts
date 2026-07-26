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
// Beyond this, a last-known-good price is too old to keep presenting as "live".
// Past the ceiling we return null so callers fall back to the snapshot's own
// (freshness-labeled) prices instead of pinning a green "Live" on hours-old spot.
const STALE_CEILING_MS = 10 * 60_000;

export type LivePrices = {
  prices: Record<string, number>; // "BTCUSDT" -> 62185.1
  fetchedAt: number; // epoch ms
};

let cache: LivePrices | null = null;
let inFlight: Promise<LivePrices | null> | null = null;

async function fetchAllTickers(): Promise<LivePrices | null> {
  for (const host of BINANCE_HOSTS) {
    try {
      // next.revalidate (NOT cache:"no-store"): a no-store fetch forces every
      // route that overlays live prices (home, market pages) into per-request
      // dynamic rendering, defeating their ISR and burning a lambda render per
      // crawler hit. This fetch's revalidate also becomes the EFFECTIVE ISR
      // TTL of those routes (Next takes the minimum), so it doubles as the
      // page-recompute throttle: 120 s keeps crawler-driven re-renders ~5×
      // rarer than the original 25 s (Fluid-CPU cap, 2026-07-26) while the
      // client's own polling repaints real users within seconds of mount.
      const r = await fetch(host, {
        next: { revalidate: 120 },
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
      // Serve last-known-good on a failed refresh, but NOT past the staleness
      // ceiling — an old spot must not keep reading as "live" indefinitely.
      if (cache && Date.now() - cache.fetchedAt <= STALE_CEILING_MS) return cache;
      return null;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
