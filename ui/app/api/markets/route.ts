import { NextResponse } from "next/server";
import { getMarkets, getMarketsByIds } from "@/lib/data";

export const revalidate = 60;

// Cap how many ids a single ?ids= request may ask about — keeps the lookup
// bounded and the URL sane (the Trigger Radar watcher is the only caller and
// only ever asks about the user's handful of armed alerts).
const MAX_IDS = 200;

export async function GET(request: Request) {
  const url = new URL(request.url);

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
    const markets = ids.length > 0 ? await getMarketsByIds(ids) : [];
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
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

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      total: filtered.length,
      returned: slice.length,
      markets: slice,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
