import { NextResponse } from "next/server";
import { getSnapshotMeta } from "@/lib/data";
import { getLivePrices } from "@/lib/livePrices";

export const dynamic = "force-dynamic";

// 12 h: the refresh cron runs every 4 h and GitHub's scheduler drifts/skips
// under load, so a 6 h alarm produced false positives. This threshold still
// catches a genuinely dead pipeline (3 consecutive misses).
const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function GET() {
  const startedAt = Date.now();
  try {
    const [snap, live] = await Promise.all([
      getSnapshotMeta(),
      getLivePrices(),
    ]);
    const ageMs = startedAt - Date.parse(snap.snapshotAt);
    const fresh = ageMs < STALE_AFTER_MS;
    // pricesAt drives the "Live · Xs ago" pill; the market definitions can be
    // hours old (snapshotAt) while prices stay live-to-the-minute.
    const pricesAt = live ? new Date(live.fetchedAt).toISOString() : null;
    return NextResponse.json(
      {
        status: fresh ? "ok" : "stale",
        snapshotAt: snap.snapshotAt,
        snapshotAgeSeconds: Math.round(ageMs / 1000),
        pricesAt,
        markets: snap.total,
        elapsedMs: Date.now() - startedAt,
      },
      {
        status: fresh ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        error: (e as Error).message,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
