import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, fallback, http, type Address } from "viem";
import { polygon } from "viem/chains";
import { deriveCandidates } from "@/lib/polymarketDerive";

// Read-only Polygon client for deployment checks. eth_getCode is a basic RPC
// read, so we use public RPCs with fallback rather than the keyed Etherscan
// endpoint — whose shared 5/sec rate limit made a burst of getCode calls flaky
// (a rate-limited reply is an error STRING that a naive check misreads as
// "deployed"). viem returns the bytecode or undefined and throws on transport
// failure — it can never hand back an error string. `batch` groups the
// candidate lookups into one JSON-RPC request.
const codeClient = createPublicClient({
  chain: polygon,
  transport: fallback([
    http("https://1rpc.io/matic", { batch: true }),
    http("https://polygon-bor-rpc.publicnode.com", { batch: true }),
    http("https://rpc.ankr.com/polygon", { batch: true }),
  ]),
});

/**
 * find-proxy: resolve the Polymarket account (proxy) for a wallet.
 *
 * Forward (?eoa=…)
 * ---------------
 * A Polymarket account address is a *deterministic* CREATE2 function of the
 * signer EOA. The old version scanned for an `OwnershipTransferred(0x0, EOA)`
 * event, which silently missed Gnosis-Safe accounts (the type a MetaMask
 * signup produces) because Safes never emit that event — and could also match
 * unrelated contracts. Instead we now derive the candidate address(es) and
 * confirm each is actually deployed on-chain via eth_getCode. This mirrors what
 * Polymarket's own SDKs do; constants are verified against Polymarket's
 * official test vectors and a live MetaMask account.
 *
 *   MetaMask / browser wallet → 1-of-1 Gnosis Safe   (CLOB sig type 2)
 *   Magic / email login       → EIP-1167 proxy wallet (CLOB sig type 1)
 *
 * Reverse (?proxy=…)
 * ------------------
 * Still an OwnershipTransferred(0x0, owner) log scan — used only as a
 * best-effort ownership hint on the manual-paste path.
 *
 * Why server-side: the on-chain reads go through Etherscan's multichain API,
 * which needs a key. A server-only POLYGONSCAN_API_KEY keeps it unscrapeable.
 *
 * Failure modes: no key → 503; no deployed account derived → 200 {proxy:null};
 * upstream error → 500. The client treats 503/429/5xx as "couldn't check",
 * never as "no account".
 */

// Forward lookup (EOA → account) is deterministic CREATE2 derivation, in
// lib/polymarketDerive.ts (shared with the client). --- Reverse lookup
// (proxy → owners) still scans logs ----------------------
// keccak256("OwnershipTransferred(address,address)")
const OWNERSHIP_TRANSFERRED_TOPIC =
  "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";
const ZERO_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Polymarket launched in mid-2024 on Polygon; a generous lower bound keeps the
// log query fast.
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
// Bound the rate-limit table so a churn of distinct client IPs can't grow it
// without limit on a long-lived warm instance.
const RATE_MAX_KEYS = 5000;
const hits = new Map<string, { count: number; windowStart: number }>();

function pruneHits(now: number) {
  // Drop entries whose window has already expired …
  for (const [k, rec] of hits) {
    if (now - rec.windowStart > RATE_WINDOW_MS) hits.delete(k);
  }
  // … and if everything is still fresh, evict the oldest-inserted half.
  if (hits.size >= RATE_MAX_KEYS) {
    const drop = hits.size - Math.floor(RATE_MAX_KEYS / 2);
    let i = 0;
    for (const k of hits.keys()) {
      if (i++ >= drop) break;
      hits.delete(k);
    }
  }
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    if (hits.size >= RATE_MAX_KEYS) pruneHits(now);
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

/**
 * Best-effort client IP for rate-limiting. Prefer the platform-set x-real-ip
 * (Vercel populates it with the actual connecting address); fall back to the
 * LAST — closest-trusted — hop of X-Forwarded-For. Never the leftmost XFF
 * entry, which is fully client-controlled and was trivially spoofable to dodge
 * the limit. Per-instance and best-effort, same caveat as the cache above.
 */
function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.POLYGONSCAN_API_KEY;

  const ip = clientIp(req);
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
    // Forward (auto-detect) uses public RPCs — no Etherscan key needed.
    result = await forwardLookup(eoa);
  } else if (proxyParam) {
    // Reverse (owner check) still uses the keyed Etherscan log scan.
    result = apiKey
      ? await reverseLookup(proxyParam, apiKey)
      : {
          status: 503,
          body: { error: "Owner check not configured on this deployment." },
          ttlMs: 0,
        };
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

async function forwardLookup(eoa: string): Promise<Result> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(eoa)) {
    return { status: 400, body: { error: "Invalid EOA address." }, ttlMs: 0 };
  }

  // Normalize to lowercase: viem's address codecs throw on a mixed-case string
  // that fails EIP-55 checksum, and the CREATE2 salt is case-insensitive anyway.
  const candidates = deriveCandidates(eoa.toLowerCase() as Address);

  // Fetch every candidate's bytecode in parallel (one batched JSON-RPC call),
  // then return the first DEPLOYED one in Polymarket's classifyWalletType
  // priority order. allSettled so a single RPC hiccup on one candidate can't
  // hide a real account on another.
  const results = await Promise.allSettled(
    candidates.map((c) => codeClient.getCode({ address: c.address })),
  );

  let hadError = false;
  for (let i = 0; i < candidates.length; i++) {
    const res = results[i];
    if (res.status === "rejected") {
      hadError = true;
      continue;
    }
    const code = res.value; // bytecode hex, or undefined when there's no code
    if (code && code !== "0x") {
      const c = candidates[i];
      return {
        status: 200,
        body: {
          proxy: c.address,
          proxyType: c.type,
          // CLOB SignatureType: POLY_PROXY=1, POLY_GNOSIS_SAFE=2, POLY_1271=3.
          signatureType: c.signatureType,
        },
        ttlMs: TTL_FOUND,
      };
    }
  }

  if (hadError) {
    // We couldn't conclusively check every candidate — surface "couldn't check"
    // (the client treats this as unavailable), never a false "no account".
    return {
      status: 502,
      body: { error: "Upstream lookup error — please retry." },
      ttlMs: 0,
    };
  }
  // Every candidate checked cleanly and none is deployed — a brand-new wallet
  // with no Polymarket account yet. Caller offers create/paste.
  return { status: 200, body: { proxy: null }, ttlMs: TTL_MISS };
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
