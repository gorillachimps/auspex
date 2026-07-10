import { NextResponse } from "next/server";
import { getMarkets, getMarketsByIds, getSnapshotMeta } from "@/lib/data";
import { getLivePrices } from "@/lib/livePrices";
import { applyLivePrices } from "@/lib/liveOverlay";
import type { TableRow } from "@/lib/types";

export const revalidate = 60;

// Overlay live Binance prices; returns the fresh rows + the price timestamp
// (null if we couldn't fetch, so callers fall back to snapshot prices).
async function withLivePrices(
  rows: TableRow[],
): Promise<{ rows: TableRow[]; pricesAt: string | null }> {
  const live = await getLivePrices();
  if (!live) return { rows, pricesAt: null };
  const { rows: overlaid } = applyLivePrices(rows, live.prices);
  return { rows: overlaid, pricesAt: new Date(live.fetchedAt).toISOString() };
}

// Cap how many ids a single ?ids= request may ask about — keeps the lookup
// bounded and the URL sane (the Trigger Radar watcher is the only caller and
// only ever asks about the user's handful of armed alerts).
const MAX_IDS = 200;

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Authoritative age of the committed market definitions. Distinct from
  // `generatedAt` (this response's build time) — a client that adopts
  // generatedAt as the snapshot age would show "just now" over a 10h-old file.
  const { snapshotAt } = await getSnapshotMeta();

  // By-id mode: return exactly these markets (full rows), regardless of volume
  // rank. Powers Trigger Radar so an alert armed on a low-volume market still
  // gets evaluated. Ranking/limit/family params are ignored in this mode.
  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 100)
      .slice(0, MAX_IDS);
    const base = ids.length > 0 ? await getMarketsByIds(ids) : [];
    const { rows: markets, pricesAt } = await withLivePrices(base);
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        snapshotAt,
        pricesAt,
        total: markets.length,
        returned: markets.length,
        markets,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  }

  const family = url.searchParams.get("family");
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? "500") || 500,
    5000,
  );

  const all = await getMarkets();
  const ranked = [...all].sort((a, b) => b.volumeTotal - a.volumeTotal);
  const filtered = family ? ranked.filter((r) => r.family === family) : ranked;
  const slice = filtered.slice(0, limit);
  // Overlay live prices on just the returned slice, not the full 5k set.
  const { rows: markets, pricesAt } = await withLivePrices(slice);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      snapshotAt,
      pricesAt,
      total: filtered.length,
      returned: markets.length,
      markets,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
