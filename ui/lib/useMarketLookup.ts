"use client";

import { useEffect, useState } from "react";

export type MarketLookupEntry = {
  tokenId: string;
  marketId: string;
  question: string;
  slug: string;
  family: string;
  outcome: "yes" | "no";
  impliedYes: number | null;
  /** Polymarket tick size — needed to submit valid orders against this
   *  token. Most markets are 0.01, but some thin-price ones are 0.001.
   *  Null when unknown (caller should default to 0.01). */
  tickSize: number | null;
  /** "Negative risk" multi-leg flag. Affects how the SDK constructs the
   *  order — must be threaded through to placeMarketOrder. */
  negRisk: boolean;
};

const cache = new Map<string, MarketLookupEntry>();
const inFlight = new Map<string, Promise<MarketLookupEntry | undefined>>();

/** Batch a set of token IDs into a single /api/markets/by-token round-trip and
 *  cache the result. Returns `{tokenId: entry}` once resolved. Always returns
 *  some object (possibly empty) so consumers can stop showing spinners. */
export function useMarketLookup(tokenIds: string[]): Record<string, MarketLookupEntry> {
  const [result, setResult] = useState<Record<string, MarketLookupEntry>>(() => {
    // Warm hits from the module-level cache so we don't flash empty.
    const seed: Record<string, MarketLookupEntry> = {};
    for (const id of tokenIds) {
      const hit = cache.get(id);
      if (hit) seed[id] = hit;
    }
    return seed;
  });

  // Stable dep: join sorted unique IDs into one string. Avoids loop on every
  // render when the parent rebuilds the array identity.
  const depKey = [...new Set(tokenIds)].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const missing = [...new Set(tokenIds)].filter((id) => !cache.has(id));
    if (missing.length === 0) {
      // Still rebuild result from cache in case the dep changed
      const next: Record<string, MarketLookupEntry> = {};
      for (const id of tokenIds) {
        const hit = cache.get(id);
        if (hit) next[id] = hit;
      }
      setResult(next);
      return;
    }

    async function loadBatch(ids: string[]) {
      const key = ids.slice().sort().join(",");
      let promise = inFlight.get(key);
      if (!promise) {
        promise = (async () => {
          try {
            const r = await fetch(
              `/api/markets/by-token?ids=${encodeURIComponent(ids.join(","))}`,
              { cache: "no-store" },
            );
            if (!r.ok) return undefined;
            const data = await r.json();
            const lookup: Record<string, MarketLookupEntry> | undefined = data?.lookup;
            if (lookup) {
              for (const [k, v] of Object.entries(lookup)) cache.set(k, v);
            }
            // Cache misses too so we don't retry forever for unknown tokens.
            for (const id of ids) if (!cache.has(id)) cache.set(id, MISS_SENTINEL);
            return undefined;
          } catch {
            return undefined;
          } finally {
            inFlight.delete(key);
          }
        })();
        inFlight.set(key, promise);
      }
      await promise;
      if (cancelled) return;
      const next: Record<string, MarketLookupEntry> = {};
      for (const id of tokenIds) {
        const hit = cache.get(id);
        if (hit && hit !== MISS_SENTINEL) next[id] = hit;
      }
      setResult(next);
    }

    loadBatch(missing);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return result;
}

// Sentinel inserted into the cache for token IDs that came back unmapped so
// we don't keep re-requesting them every render.
const MISS_SENTINEL: MarketLookupEntry = {
  tokenId: "",
  marketId: "",
  question: "",
  slug: "",
  family: "",
  outcome: "yes",
  impliedYes: null,
  tickSize: null,
  negRisk: false,
};
