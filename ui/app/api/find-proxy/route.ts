import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side lookup: given an EOA, find the Polymarket V2 DepositWallet
 * proxy (if any) that the EOA owns.
 *
 * How it works
 * ------------
 * Every Polymarket DepositWallet proxy (implementation
 * 0x58ca52ebe0dadfdf531cde7062e76746de4db1eb) emits the standard OZ
 * `OwnershipTransferred(address indexed previousOwner, address indexed
 * newOwner)` event when it's initialised. The previousOwner on initialise
 * is the zero address; the newOwner is the user's EOA.
 *
 * We query Polygonscan's eth_getLogs equivalent for any event matching:
 *   topic0 = keccak256("OwnershipTransferred(address,address)")
 *   topic1 = 0x000…0 (previousOwner)
 *   topic2 = padded EOA (newOwner)
 *
 * Each matching log's `address` field is the proxy contract itself. We pick
 * the most-recent one (highest block number) and return it.
 *
 * Why a server-side route (not a direct client fetch)
 * ---------------------------------------------------
 * Polygonscan requires an API key. Exposing it client-side as
 * NEXT_PUBLIC_POLYGONSCAN_API_KEY means anyone can scrape and abuse it.
 * This route uses a server-only POLYGONSCAN_API_KEY env var.
 *
 * Failure modes
 * -------------
 * - No API key configured → 503; client falls back to manual entry.
 * - Polygonscan returns no logs → 200 with `{proxy: null}`; same fallback.
 * - Polygonscan returns multiple proxies → pick the most recent (most
 *   common case: zero or one; in rare cases a user may have multiple).
 */

const FACTORY = "0xD3447596d282d62bc94240d17caee437efcfde62".toLowerCase();
// keccak256("OwnershipTransferred(address,address)")
const OWNERSHIP_TRANSFERRED_TOPIC =
  "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";
const ZERO_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Polymarket V2 launched in mid-2024 on Polygon; setting a generous lower
// bound keeps the query fast.
const FROM_BLOCK = "60000000";

export const dynamic = "force-dynamic";

type Log = {
  address: string;
  topics: string[];
  blockNumber: string;
};

/** Plain result the GET wrapper turns into a NextResponse and (maybe) caches. */
type Result = { status: number; body: unknown; ttlMs: number };

// In-memory response cache. Proxy ownership is immutable once a deposit wallet
// is deployed, so a found result is safe to cache for a long time; a "not found
// yet" is cached briefly in case the user is mid-onboarding. NOTE: on Vercel
// serverless this Map is per-warm-instance and ephemeral — that's fine, it
// still collapses the repeated lookups a single onboarding session makes and
// blunts a scraper hitting one instance. Bounded to CACHE_MAX entries.
const cache = new Map<string, { result: Result; expires: number }>();
const CACHE_MAX = 1000;

function cacheGet(key: string): Result | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function cacheSet(key: string, result: Result) {
  if (result.ttlMs <= 0) return;
  if (cache.size >= CACHE_MAX) {
    // Map preserves insertion order; drop the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { result, expires: Date.now() + result.ttlMs });
}

// Best-effort per-IP fixed-window rate limit. Same serverless caveat as the
// cache: per-instance, but enough to stop a single client from hammering the
// shared Etherscan quota.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.POLYGONSCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Auto-detect not configured on this deployment." },
      { status: 503 },
    );
  }

  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded — try again in a minute." },
      { status: 429 },
    );
  }

  const eoa = req.nextUrl.searchParams.get("eoa");
  // Reverse mode: given a candidate proxy address, return the EOAs it lists
  // as initial owners (one OwnershipTransferred(0x0, owner) event per owner
  // when the multi-owner proxy is deployed). The dialog uses this to confirm
  // that the connected wallet is actually authorised on the pasted proxy.
  const proxyParam = req.nextUrl.searchParams.get("proxy");

  const cacheKey = eoa
    ? `f:${eoa.toLowerCase()}`
    : proxyParam
      ? `r:${proxyParam.toLowerCase()}`
      : null;

  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  let result: Result;
  if (eoa) {
    result = await forwardLookup(eoa, apiKey);
  } else if (proxyParam) {
    result = await reverseLookup(proxyParam, apiKey);
  } else {
    result = {
      status: 400,
      body: { error: "Pass either ?eoa=… (forward) or ?proxy=… (reverse)." },
      ttlMs: 0,
    };
  }

  if (cacheKey) cacheSet(cacheKey, result);
  return NextResponse.json(result.body, { status: result.status });
}

// TTLs: found mappings are immutable → cache long; misses → short (user may be
// onboarding); validation/upstream errors → never cache.
const TTL_FOUND = 60 * 60 * 1000; // 1 h
const TTL_MISS = 60 * 1000; // 1 min

function buildEtherscanUrl(apiKey: string): URL {
  // Etherscan V2 multi-chain endpoint. Polygonscan's V1 endpoint
  // (api.polygonscan.com/api) is deprecated as of 2024 — Etherscan unified
  // every chain under api.etherscan.io/v2 with a `chainid` parameter. The
  // same API key works for every chain in their network.
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "137"); // Polygon mainnet
  url.searchParams.set("module", "logs");
  url.searchParams.set("action", "getLogs");
  url.searchParams.set("fromBlock", FROM_BLOCK);
  url.searchParams.set("toBlock", "latest");
  url.searchParams.set("topic0", OWNERSHIP_TRANSFERRED_TOPIC);
  url.searchParams.set("topic1", ZERO_TOPIC);
  url.searchParams.set("apikey", apiKey);
  return url;
}

async function forwardLookup(eoa: string, apiKey: string): Promise<Result> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(eoa)) {
    return { status: 400, body: { error: "Invalid EOA address." }, ttlMs: 0 };
  }

  const eoaTopic = `0x${eoa.slice(2).toLowerCase().padStart(64, "0")}`;
  const url = buildEtherscanUrl(apiKey);
  url.searchParams.set("topic2", eoaTopic);
  url.searchParams.set("topic0_1_opr", "and");
  url.searchParams.set("topic0_2_opr", "and");
  url.searchParams.set("topic1_2_opr", "and");

  try {
    const logs = await fetchLogs(url);
    if (logs == null || logs.length === 0) {
      return { status: 200, body: { proxy: null }, ttlMs: TTL_MISS };
    }

    // Sort by block number descending so we return the most recently-deployed
    // proxy if the EOA has more than one. Block numbers come back as hex strings.
    logs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));

    const proxy = logs[0].address;
    if (!proxy || !/^0x[0-9a-fA-F]{40}$/.test(proxy)) {
      return { status: 200, body: { proxy: null }, ttlMs: TTL_MISS };
    }

    return {
      status: 200,
      body: {
        proxy,
        count: logs.length,
        // Marker so the client knows which factory the proxy belongs to
        // (helps if we ever support multiple deposit-wallet versions).
        factory: FACTORY,
      },
      ttlMs: TTL_FOUND,
    };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message }, ttlMs: 0 };
  }
}

async function reverseLookup(proxy: string, apiKey: string): Promise<Result> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(proxy)) {
    return { status: 400, body: { error: "Invalid proxy address." }, ttlMs: 0 };
  }

  const url = buildEtherscanUrl(apiKey);
  url.searchParams.set("address", proxy);
  url.searchParams.set("topic0_1_opr", "and");

  try {
    const logs = await fetchLogs(url);
    if (logs == null || logs.length === 0) {
      return { status: 200, body: { owners: [] }, ttlMs: TTL_MISS };
    }

    // Each OwnershipTransferred(0x0, newOwner) event lists one owner in
    // topic2. The multi-owner proxy's `deploy(address[], bytes32[])` emits
    // one event per owner. Collect and dedupe.
    const owners = new Set<string>();
    for (const log of logs) {
      const ownerTopic = log.topics?.[2];
      if (!ownerTopic) continue;
      const addr = `0x${ownerTopic.slice(-40)}`.toLowerCase();
      if (/^0x[0-9a-f]{40}$/.test(addr) && addr !== "0x" + "0".repeat(40)) {
        owners.add(addr);
      }
    }

    return {
      status: 200,
      body: { owners: Array.from(owners), count: owners.size },
      ttlMs: TTL_FOUND,
    };
  } catch (e) {
    return { status: 500, body: { error: (e as Error).message }, ttlMs: 0 };
  }
}

async function fetchLogs(url: URL): Promise<Log[] | null> {
  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Polygonscan HTTP ${r.status}`);
  }
  const body = (await r.json()) as {
    status: string;
    message?: string;
    result?: Log[] | string;
  };
  // Polygonscan returns status "0" for "no result" (with message "No
  // records found") AND for actual errors. Distinguish by inspecting
  // `result`: array on success, string on error.
  if (body.status !== "1") {
    if (Array.isArray(body.result)) return [];
    if (body.message === "No records found") return [];
    throw new Error(body.message ?? "Polygonscan error");
  }
  const logs = (body.result ?? []) as Log[];
  return Array.isArray(logs) ? logs : null;
}
