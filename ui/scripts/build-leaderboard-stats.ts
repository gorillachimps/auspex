/**
 * Precompute per-wallet stats for the leaderboard → ui/public/leaderboard-stats.json.
 *
 * Runs in CI (.github/workflows/leaderboard-stats.yml, every 6h). The public
 * leaderboard API only gives profit/volume per wallet; win-rate + sample size
 * need each wallet's full /trades history — a ~80-wallet fan-out that does NOT
 * belong in a per-render client fetch, so we batch it here on a schedule and
 * serve the result as a static file (redeployed on each commit, so no staleness).
 *
 * The FIFO realized-P&L math is the canonical computeWalletPnl from
 * lib/walletPnl.ts — imported, not reimplemented, so there's no drift between
 * this and the per-wallet scorecard on the wallet page.
 *
 * Run locally:  npx tsx scripts/build-leaderboard-stats.ts   (from ui/)
 */
import { readFile, writeFile } from "node:fs/promises";
import { computeWalletPnl, type Trade } from "../lib/walletPnl";

const LB = "https://lb-api.polymarket.com";
const DATA = "https://data-api.polymarket.com";
const UA = "auspex-leaderboard-stats/1.0 (+https://auspex.to)";
const PAGE_LIMIT = 500;
const MAX_PAGES = 5; // ≤2500 trades/wallet — matches lib/useWalletTrades
const BATCH = 6; // wallet fan-out concurrency — polite to the data API
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

type WalletStat = {
  winRate: number | null;
  closedCount: number;
  realized30d: number;
  realizedTotal: number;
};

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

/** Union of the top-profit and top-volume leaderboards (deduped, valid addrs). */
async function leaderboardWallets(): Promise<string[]> {
  const [profit, volume] = await Promise.all([
    getJson(`${LB}/profit`),
    getJson(`${LB}/volume`),
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [profit, volume]) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      const w = e && typeof e === "object" ? (e as { proxyWallet?: unknown }).proxyWallet : null;
      if (typeof w === "string" && ADDR_RE.test(w) && !seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
  }
  return out;
}

async function fetchTrades(wallet: string): Promise<Trade[]> {
  const acc: Trade[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const json = await getJson(
      // takerOnly defaults to true upstream — false so maker fills count too.
      `${DATA}/trades?user=${wallet}&limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}&takerOnly=false`,
    );
    if (!Array.isArray(json) || json.length === 0) break;
    for (const t of json) {
      if (!t || typeof t !== "object") continue;
      const r = t as Record<string, unknown>;
      acc.push({
        proxyWallet: String(r.proxyWallet ?? wallet),
        side: r.side === "SELL" ? "SELL" : "BUY",
        asset: String(r.asset ?? ""),
        conditionId: String(r.conditionId ?? ""),
        size: Number(r.size),
        price: Number(r.price),
        timestamp: Number(r.timestamp),
      });
    }
    if (json.length < PAGE_LIMIT) break;
  }
  return acc;
}

function statFor(trades: Trade[]): WalletStat {
  const pnl = computeWalletPnl(trades, []); // no positions → realized + counts only
  return {
    winRate: pnl.closedCount > 0 ? pnl.wonCount / pnl.closedCount : null,
    closedCount: pnl.closedCount,
    realized30d: Math.round(pnl.realized30d),
    realizedTotal: Math.round(pnl.realizedTotal),
  };
}

async function main() {
  const wallets = await leaderboardWallets();
  console.log(`Computing stats for ${wallets.length} leaderboard wallets…`);
  const stats: Record<string, WalletStat> = {};

  for (let i = 0; i < wallets.length; i += BATCH) {
    const batch = wallets.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (w) => [w, statFor(await fetchTrades(w))] as const),
    );
    for (const res of results) {
      if (res.status === "fulfilled") stats[res.value[0]] = res.value[1];
      // a wallet that errors is simply omitted — the card falls back to
      // profit/volume-only, never a broken render
    }
    console.log(`  …${Math.min(i + BATCH, wallets.length)}/${wallets.length}`);
  }

  const dest = new URL("../public/leaderboard-stats.json", import.meta.url);

  // Skip the write (→ no commit, no redeploy) when the stats are byte-identical
  // to what's already published. `generatedAt` is excluded from the compare so
  // a quiet 6h window doesn't churn a no-op commit every run.
  const serializedStats = JSON.stringify(stats);
  try {
    const prev = JSON.parse(await readFile(dest, "utf-8")) as { stats?: unknown };
    if (JSON.stringify(prev.stats ?? {}) === serializedStats) {
      console.log("Stats unchanged — leaving the file as-is.");
      return;
    }
  } catch {
    // no existing file (first run) → fall through and write
  }

  const out = {
    generatedAt: new Date().toISOString(),
    count: Object.keys(stats).length,
    stats,
  };
  await writeFile(dest, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.count} wallet stats → public/leaderboard-stats.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
