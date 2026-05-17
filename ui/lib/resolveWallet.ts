"use client";

import { createPublicClient, http, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { findPolymarketProxy } from "./findPolymarketProxy";

// Use a public mainnet RPC for ENS lookups. ENS resolution is name → address,
// not chain-specific in terms of resolver location. Falls back to the chain's
// default RPC if no custom URL is set.
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export type ResolvedWallet = {
  /** The address we'll use to query /trades and /positions. Always a
   *  Polymarket proxy when one could be found, else the input itself. */
  proxy: `0x${string}`;
  /** The signer EOA we resolved through, if applicable. Useful for display
   *  ("Wallet 0xabc… → Polymarket account 0xdef…"). */
  eoa: `0x${string}` | null;
  /** The ENS name we resolved through, if applicable. */
  ens: string | null;
  /** Original input the user typed. */
  raw: string;
  /** Did the resolution find a known Polymarket proxy? When false, we're
   *  using the input as-is and queries may return empty. */
  resolvedProxy: boolean;
};

/**
 * Resolve a user-supplied wallet identifier to a Polymarket proxy address.
 *
 * Accepted inputs:
 *   - `0x…` EOA — we run /api/find-proxy to look up the Polymarket proxy
 *     this EOA owns. If found, return that. Else return the EOA as-is.
 *   - `0x…` proxy (a contract) — pass through. We could verify it's an
 *     OZ-deployed Polymarket proxy via reverse-lookup, but the cost of
 *     a false-positive is just "no trades found" — acceptable for v1.
 *   - `name.eth` ENS — resolve to EOA via mainnet ENS, then EOA → proxy.
 *
 * Returns null on unparseable input.
 */
export async function resolveWallet(
  input: string,
): Promise<ResolvedWallet | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ENS path
  if (trimmed.endsWith(".eth")) {
    let normalised: string;
    try {
      normalised = normalize(trimmed);
    } catch {
      return null;
    }
    let resolvedEoa: `0x${string}` | null = null;
    try {
      const r = await mainnetClient.getEnsAddress({ name: normalised });
      if (r) resolvedEoa = r;
    } catch {
      return null;
    }
    if (!resolvedEoa) return null;
    // Now run EOA → proxy lookup
    const lookup = await findPolymarketProxy(resolvedEoa);
    if (lookup.proxy) {
      return {
        proxy: lookup.proxy,
        eoa: resolvedEoa,
        ens: normalised,
        raw: trimmed,
        resolvedProxy: true,
      };
    }
    return {
      proxy: resolvedEoa, // fall back to using the EOA itself (queries may be empty)
      eoa: resolvedEoa,
      ens: normalised,
      raw: trimmed,
      resolvedProxy: false,
    };
  }

  // Address path
  if (!isAddress(trimmed)) return null;
  const addr = trimmed.toLowerCase() as `0x${string}`;

  // Try EOA → proxy. If the input IS already a proxy, find-proxy returns null
  // (since proxies aren't owners of other proxies in the same factory pattern)
  // — we fall back to using the input directly.
  const lookup = await findPolymarketProxy(addr);
  if (lookup.proxy) {
    return {
      proxy: lookup.proxy,
      eoa: addr,
      ens: null,
      raw: trimmed,
      resolvedProxy: true,
    };
  }
  return {
    proxy: addr,
    eoa: null,
    ens: null,
    raw: trimmed,
    resolvedProxy: false,
  };
}

/** Convenience: short-display form of an address (0xabcd…1234). */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length < head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
