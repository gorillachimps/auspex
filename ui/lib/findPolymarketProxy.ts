"use client";

/**
 * Client-side helper that calls /api/find-proxy to discover the user's
 * Polymarket DepositWallet from their connected EOA. Returns null on any
 * failure (no API key configured, no proxy found, network glitch); callers
 * should fall back to the manual paste flow.
 */
export async function findPolymarketProxy(
  eoa: string,
): Promise<{ proxy: `0x${string}` | null; count?: number }> {
  try {
    const r = await fetch(`/api/find-proxy?eoa=${encodeURIComponent(eoa)}`, {
      cache: "no-store",
    });
    if (!r.ok) return { proxy: null };
    const data = (await r.json()) as {
      proxy: string | null;
      count?: number;
    };
    if (!data.proxy) return { proxy: null };
    return {
      proxy: data.proxy as `0x${string}`,
      count: data.count,
    };
  } catch {
    return { proxy: null };
  }
}

/**
 * Reverse lookup: given a candidate Polymarket DepositWallet proxy address,
 * return the EOAs listed as initial owners on-chain. `available: false`
 * means we couldn't run the check (no API key configured, network glitch)
 * and the caller should fail open rather than block the user. Used by the
 * deposit-wallet dialog to catch the "wrong wallet connected, right proxy
 * pasted" failure mode — the bytecode check alone can't detect this.
 */
export async function findProxyOwners(
  proxy: string,
): Promise<{ owners: `0x${string}`[]; available: boolean }> {
  try {
    const r = await fetch(`/api/find-proxy?proxy=${encodeURIComponent(proxy)}`, {
      cache: "no-store",
    });
    if (r.status === 503) {
      return { owners: [], available: false };
    }
    if (!r.ok) return { owners: [], available: false };
    const data = (await r.json()) as { owners?: string[] };
    return {
      owners: (data.owners ?? []).map((a) => a as `0x${string}`),
      available: true,
    };
  } catch {
    return { owners: [], available: false };
  }
}
