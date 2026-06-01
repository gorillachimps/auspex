import { NextResponse } from "next/server";

export const revalidate = 120;

const GAMMA = "https://gamma-api.polymarket.com";
const DATA = "https://data-api.polymarket.com";
const COND_RE = /^0x[0-9a-fA-F]{64}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/i;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HOLDERS_LIMIT = 12;

type Holder = { proxyWallet: string; name: string; amount: number };
type Group = { token: string; outcomeIndex: number; holders: Holder[] };

/**
 * Server-side Top Holders resolver. The Polymarket /holders endpoint keys on a
 * CTF conditionId, which our snapshot doesn't carry — so we resolve it from the
 * market slug via gamma-api, then fetch holders from data-api. Composed server-
 * side (one round-trip for the client, cacheable, no CORS hop).
 *
 * gamma-api occasionally returns unescaped control chars in description fields,
 * which breaks JSON.parse — so we regex-extract the conditionId from the raw
 * text rather than parsing the whole payload.
 */
async function resolveConditionId(slug: string): Promise<string | null> {
  const r = await fetch(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  const text = await r.text();
  const m = text.match(/"conditionId"\s*:\s*"(0x[0-9a-fA-F]{64})"/);
  return m ? m[1] : null;
}

function cleanGroups(value: unknown): Group[] {
  if (!Array.isArray(value)) return [];
  const groups: Group[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const token = typeof rec.token === "string" ? rec.token : "";
    const outcomeIndex =
      typeof rec.outcomeIndex === "number" ? rec.outcomeIndex : 0;
    const rawHolders = Array.isArray(rec.holders) ? rec.holders : [];
    const holders: Holder[] = [];
    for (const h of rawHolders) {
      if (!h || typeof h !== "object") continue;
      const hr = h as Record<string, unknown>;
      const proxyWallet =
        typeof hr.proxyWallet === "string" ? hr.proxyWallet : "";
      if (!ADDR_RE.test(proxyWallet)) continue;
      const amount =
        typeof hr.amount === "number" ? hr.amount : Number(hr.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const pseudonym = typeof hr.pseudonym === "string" ? hr.pseudonym : "";
      const name = typeof hr.name === "string" ? hr.name : "";
      holders.push({ proxyWallet, name: pseudonym || name || "", amount });
    }
    if (holders.length > 0) groups.push({ token, outcomeIndex, holders });
  }
  return groups;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const marketParam = url.searchParams.get("market");

  let conditionId: string | null = null;
  if (marketParam && COND_RE.test(marketParam)) {
    conditionId = marketParam;
  } else if (slug && SLUG_RE.test(slug)) {
    conditionId = await resolveConditionId(slug);
  } else {
    return NextResponse.json(
      { error: "expected ?slug=<market-slug> or ?market=<conditionId>" },
      { status: 400 },
    );
  }

  if (!conditionId) {
    return NextResponse.json(
      { conditionId: null, groups: [] },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
    );
  }

  let groups: Group[] = [];
  try {
    const hr = await fetch(
      `${DATA}/holders?market=${conditionId}&limit=${HOLDERS_LIMIT}`,
      { cache: "no-store" },
    );
    if (hr.ok) groups = cleanGroups(JSON.parse(await hr.text()));
  } catch {
    // upstream hiccup → empty result; the client shows an empty state
  }

  return NextResponse.json(
    { conditionId, groups },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
  );
}
