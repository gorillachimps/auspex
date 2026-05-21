import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { EnrichedMarketSchema, projectToRow, type TableRow, type EnrichedMarket } from "./types";

// Look for the enriched snapshot in the in-repo copy first (the one Vercel
// deploys), then fall back to the parent pipeline dir for local-dev where the
// Python pipeline writes directly to ../data/. The `prebuild` script in
// package.json copies the parent file into ./data before `next build` so
// production always has a current snapshot.
const DATA_CANDIDATES = [
  path.resolve(process.cwd(), "data", "enriched-markets.json"),
  path.resolve(process.cwd(), "..", "data", "enriched-markets.json"),
];

// Sidecar file written by scripts/sync-data.mjs at build time. Carries the
// SOURCE snapshot's mtime through to runtime — necessary because Vercel's
// serverless packaging normalises file mtimes, so stat()-based freshness
// would always read as either epoch or build-time, never the real age.
const META_CANDIDATES = [
  path.resolve(process.cwd(), "data", "snapshot-meta.json"),
  path.resolve(process.cwd(), "..", "data", "snapshot-meta.json"),
];

async function resolveFirst(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await stat(p);
      return p;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function resolveDataPath(): Promise<string> {
  const p = await resolveFirst(DATA_CANDIDATES);
  if (p) return p;
  throw new Error(
    `enriched-markets.json not found in any of: ${DATA_CANDIDATES.join(", ")}`,
  );
}

type Loaded = {
  rows: TableRow[];
  raw: EnrichedMarket[];
  snapshotAt: string;
};

let cached: Loaded | null = null;

async function load(): Promise<Loaded> {
  if (cached) return cached;
  const DATA_PATH = await resolveDataPath();
  const [buf, info] = await Promise.all([
    readFile(DATA_PATH, "utf-8"),
    stat(DATA_PATH),
  ]);
  // Prefer the sidecar meta written at build time; fall back to file mtime
  // so local-dev (where the meta file may not exist yet) still works.
  let snapshotAt = info.mtime.toISOString();
  const metaPath = await resolveFirst(META_CANDIDATES);
  if (metaPath) {
    try {
      const metaBuf = await readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaBuf) as { snapshotAt?: string };
      if (meta.snapshotAt && !Number.isNaN(Date.parse(meta.snapshotAt))) {
        snapshotAt = meta.snapshotAt;
      }
    } catch {
      // ignore malformed meta; fall back to mtime
    }
  }
  const parsed: unknown = JSON.parse(buf);
  if (!Array.isArray(parsed)) {
    throw new Error("enriched-markets.json: expected top-level array");
  }
  const raw: EnrichedMarket[] = [];
  for (const r of parsed) {
    const result = EnrichedMarketSchema.safeParse(r);
    if (result.success) raw.push(result.data);
  }
  const rows = raw.map(projectToRow);
  cached = { rows, raw, snapshotAt };
  return cached;
}

export async function getMarkets(): Promise<TableRow[]> {
  const { rows } = await load();
  return rows;
}

export async function getRawMarkets(): Promise<EnrichedMarket[]> {
  const { raw } = await load();
  return raw;
}

export async function getSnapshotMeta(): Promise<{ snapshotAt: string; total: number }> {
  const { snapshotAt, rows } = await load();
  return { snapshotAt, total: rows.length };
}

export async function getMarketBySlug(slug: string): Promise<TableRow | null> {
  const { rows } = await load();
  return rows.find((r) => r.slug === slug) ?? null;
}

export type MarketLookupEntry = {
  /** Either `tokenYes` or `tokenNo` matched. */
  tokenId: string;
  marketId: string;
  question: string;
  slug: string;
  family: TableRow["family"];
  outcome: "yes" | "no";
  impliedYes: number | null;
  /** Polymarket tick size — needed to submit valid orders against this
   *  token. Null when the snapshot didn't capture one (defaults to 0.01
   *  on the caller side). */
  tickSize: number | null;
  /** "Negative risk" multi-leg flag. Threaded into placeMarketOrder. */
  negRisk: boolean;
};

/** Look up market info for a batch of conditional-token IDs (asset IDs). Used
 *  by /orders, /builder and /portfolio to display human-readable market names
 *  alongside opaque uint256 token hashes. */
export async function getMarketsByTokens(
  tokenIds: string[],
): Promise<Record<string, MarketLookupEntry>> {
  const { rows } = await load();
  const wanted = new Set(tokenIds.map((t) => String(t)));
  const out: Record<string, MarketLookupEntry> = {};
  for (const r of rows) {
    if (r.tokenYes && wanted.has(r.tokenYes)) {
      out[r.tokenYes] = {
        tokenId: r.tokenYes,
        marketId: r.id,
        question: r.question,
        slug: r.slug,
        family: r.family,
        outcome: "yes",
        impliedYes: r.impliedYes,
        tickSize: r.tickSize,
        negRisk: r.negRisk,
      };
    }
    if (r.tokenNo && wanted.has(r.tokenNo)) {
      out[r.tokenNo] = {
        tokenId: r.tokenNo,
        marketId: r.id,
        question: r.question,
        slug: r.slug,
        family: r.family,
        outcome: "no",
        impliedYes: r.impliedYes,
        tickSize: r.tickSize,
        negRisk: r.negRisk,
      };
    }
  }
  return out;
}
