import { NextRequest, NextResponse } from "next/server";
import { type Address } from "viem";
import { deriveCandidates } from "@/lib/polymarketDerive";

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
  // that the connected wallet is actually authorized on the pasted proxy.
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
    result = apiKey
      ? await forwardLookup(eoa, apiKey)
      : {
          status: 503,
          body: { error: "Auto-detect not configured on this deployment." },
          ttlMs: 0,
        };
  } else if (proxyParam) {
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

/** True iff `address` has non-empty bytecode on Polygon. Uses the keyed
 *  Etherscan endpoint, which (unlike free public RPCs) is reliable from
 *  serverless/datacenter IPs. Only a real 0x-hex reply is authoritative; a
 *  rate-limit/error reply (a non-hex string) is retried with backoff, then
 *  throws — it is NEVER read as "deployed". */
async function isDeployed(
  address: string,
  apiKey: string,
  attempt = 0,
): Promise<boolean> {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "137");
  url.searchParams.set("module", "proxy");
  url.searchParams.set("action", "eth_getCode");
  url.searchParams.set("address", address);
  url.searchParams.set("tag", "latest");
  url.searchParams.set("apikey", apiKey);

  let result: unknown;
  let message: string | undefined;
  try {
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (r.ok) {
      const body = (await r.json()) as { result?: unknown; message?: string };
      result = body.result;
      message = body.message;
      if (typeof result === "string" && /^0x[0-9a-fA-F]*$/.test(result)) {
        return result.length > 2; // "0x" → not deployed; longer hex → deployed
      }
    }
  } catch {
    // network blip — fall through to retry/throw
  }
  // Non-hex result (rate limit / NOTOK / transient). Back off and retry before
  // giving up — clears the occasional throttle so a no-account lookup (which
  // must check all candidates) doesn't spuriously fail.
  if (attempt < 2) {
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    return isDeployed(address, apiKey, attempt + 1);
  }
  throw new Error(
    `Etherscan getCode error: ${message ?? String(result).slice(0, 60)}`,
  );
}

// Polymarket collateral on Polygon. Two eras both count as "funds": USDC.e
// (legacy, pre-2026-04) and pUSD (CLOB v2). A wallet migrated to v2 can hold
// only pUSD, so a tiebreak that looks at USDC.e alone would rank it as empty.
const USDC_E = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";

/** Balance (base units) of one token for an address, via Etherscan. Returns
 *  `null` when the balance could NOT be determined (rate limit / error / bad
 *  shape) — the caller must treat null as "couldn't check", never as zero, so a
 *  throttled tiebreak can't silently rank a funded account as empty. */
async function tokenBalance(
  token: string,
  address: string,
  apiKey: string,
): Promise<bigint | null> {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "137");
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokenbalance");
  url.searchParams.set("contractaddress", token);
  url.searchParams.set("address", address);
  url.searchParams.set("tag", "latest");
  url.searchParams.set("apikey", apiKey);
  try {
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    const body = (await r.json()) as { status?: string; result?: unknown };
    // status "1" + numeric result is authoritative (result "0" = genuine zero).
    if (
      body.status === "1" &&
      typeof body.result === "string" &&
      /^[0-9]+$/.test(body.result)
    ) {
      return BigInt(body.result);
    }
    return null; // NOTOK / throttle / unexpected shape → couldn't check
  } catch {
    return null;
  }
}

/** Combined tradeable-collateral balance (USDC.e + pUSD). Returns null if
 *  EITHER token lookup couldn't be determined, so the caller falls back to
 *  "unavailable" rather than guessing which account is funded. */
async function collateralBalance(
  address: string,
  apiKey: string,
): Promise<bigint | null> {
  const [usdce, pusd] = await Promise.all([
    tokenBalance(USDC_E, address, apiKey),
    tokenBalance(PUSD, address, apiKey),
  ]);
  if (usdce === null || pusd === null) return null;
  return usdce + pusd;
}

async function forwardLookup(eoa: string, apiKey: string): Promise<Result> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(eoa)) {
    return { status: 400, body: { error: "Invalid EOA address." }, ttlMs: 0 };
  }

  // Normalize to lowercase: viem's address codecs throw on a mixed-case string
  // that fails EIP-55 checksum, and the CREATE2 salt is case-insensitive anyway.
  const candidates = deriveCandidates(eoa.toLowerCase() as Address);

  // Find ALL deployed candidates (sequential — keeps us under the shared key's
  // burst limit; a per-candidate error is tolerated so one flaky call can't hide
  // a real account on another type). We deliberately do NOT early-exit: a wallet
  // can have more than one deployed account (e.g. a legacy Safe AND a newer
  // deposit wallet), and we must bind the one that actually holds funds — not
  // just the first by priority order, which could be empty.
  const deployed: typeof candidates = [];
  // Candidates whose deployment check FAILED (not "checked and undeployed") —
  // each is a possible hiding place for the user's real account, so the binding
  // logic below must rule them out by balance before committing to another.
  const unchecked: typeof candidates = [];
  for (const c of candidates) {
    try {
      if (await isDeployed(c.address, apiKey)) deployed.push(c);
    } catch {
      unchecked.push(c);
    }
  }
  const hadError = unchecked.length > 0;

  const UNAVAILABLE: Result = {
    // "Couldn't check" (client treats this as unavailable) — never a false
    // "no account" or a definitively-wrong account. Not cached.
    status: 502,
    body: { error: "Upstream lookup error — please retry." },
    ttlMs: 0,
  };

  if (deployed.length === 0) {
    if (hadError) return UNAVAILABLE;
    // Brand-new wallet with no Polymarket account yet. Caller offers create.
    return { status: 200, body: { proxy: null }, ttlMs: TTL_MISS };
  }

  const found = (c: (typeof deployed)[number]): Result => ({
    status: 200,
    body: {
      proxy: c.address,
      proxyType: c.type,
      // CLOB SignatureType: POLY_PROXY=1, POLY_GNOSIS_SAFE=2, POLY_1271=3.
      signatureType: c.signatureType,
    },
    ttlMs: TTL_FOUND,
  });

  // Fast path: exactly one account, checked cleanly — no balance call needed.
  if (deployed.length === 1 && !hadError) return found(deployed[0]);

  // Otherwise we must inspect balances: either to break a tie between multiple
  // deployed accounts, or to confirm the single account is actually funded when
  // a sibling candidate's deployment check failed (a funded account could hide
  // behind that failure). Combined collateral = USDC.e + pUSD.
  const balances = await Promise.all(
    deployed.map((c) => collateralBalance(c.address, apiKey)),
  );
  // Any undeterminable balance → we can't reliably pick the funded account
  // (invariant #4). Don't guess; tell the client to retry.
  if (balances.some((b) => b === null)) return UNAVAILABLE;
  const bal = balances as bigint[];

  // Prefer the highest-priority account (index 0), overriding only when another
  // deployed account holds strictly more collateral.
  let chosenIdx = 0;
  for (let i = 1; i < deployed.length; i++) {
    if (bal[i] > bal[chosenIdx]) chosenIdx = i;
  }
  if (chosenIdx !== 0 && !(bal[chosenIdx] > bal[0])) chosenIdx = 0;

  // Rule out every candidate whose DEPLOYMENT check failed before binding
  // another account: the user's real funds may sit behind that failure, and a
  // token-balance read works regardless of deployment state. Only bind the
  // chosen account when each unchecked candidate holds STRICTLY LESS collateral
  // than it. Reject (retry) on an equal balance too: `collateralBalance` counts
  // only cash (USDC.e + pUSD), not open positions, so two accounts reading the
  // same cash — most commonly both zero — are genuinely ambiguous (the
  // unchecked one could hold positions we can't see). Any unreadable balance is
  // likewise unrankable. Fail closed rather than guess.
  if (unchecked.length > 0) {
    const uncheckedBalances = await Promise.all(
      unchecked.map((c) => collateralBalance(c.address, apiKey)),
    );
    for (const ub of uncheckedBalances) {
      if (ub === null || ub >= bal[chosenIdx]) return UNAVAILABLE;
    }
  }

  return found(deployed[chosenIdx]);
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
