"use client";

import { useEffect, useState } from "react";
import type { ClobClient } from "@polymarket/clob-client-v2";
import { getBalanceAllowance } from "./polymarket";

const DEFAULT_REFRESH_MS = 30_000;

export type BalanceAllowanceState = {
  balance: bigint | null;
  /** Map of spender (lowercased) → allowance bigint. */
  allowances: Record<string, bigint>;
  /** Convenience: at least one allowance is positive. */
  hasAnyAllowance: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const ZERO: BalanceAllowanceState = {
  balance: null,
  allowances: {},
  hasAnyAllowance: false,
  loading: false,
  error: null,
  refresh: () => {},
};

export function useBalanceAllowance(
  client: ClobClient | null,
  tokenId?: string,
): BalanceAllowanceState {
  const [state, setState] = useState<BalanceAllowanceState>(ZERO);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(load, DEFAULT_REFRESH_MS);
    }

    async function load() {
      if (!client) {
        setState(ZERO);
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const r = await getBalanceAllowance(client, tokenId);
        if (cancelled) return;
        const allowances: Record<string, bigint> = {};
        let hasAny = false;
        for (const [spender, raw] of Object.entries(r.allowances ?? {})) {
          try {
            const v = BigInt(raw);
            allowances[spender.toLowerCase()] = v;
            if (v > BigInt(0)) hasAny = true;
          } catch {
            allowances[spender.toLowerCase()] = BigInt(0);
          }
        }
        // Guard the balance parse the same way the per-allowance loop above
        // is guarded: a non-integer/empty balance string from the API would
        // otherwise throw inside load(), null the balance, and silently break
        // the order ticket's balance gate.
        let balance: bigint;
        try {
          balance = BigInt(r.balance ?? "0");
        } catch {
          balance = BigInt(0);
        }
        setState({
          balance,
          allowances,
          hasAnyAllowance: hasAny,
          loading: false,
          error: null,
          refresh: load,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          balance: null,
          allowances: {},
          hasAnyAllowance: false,
          loading: false,
          error: (e as Error).message,
          refresh: load,
        });
      } finally {
        schedule();
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, tokenId]);

  return state;
}

/** Format a 6-decimal pUSD/USDC bigint into a human "$1.23" string. */
export function fmtCollateral(v: bigint | null): string {
  if (v == null) return "—";
  const dollars = Number(v) / 1_000_000;
  if (!isFinite(dollars)) return "—";
  if (Math.abs(dollars) < 0.01) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(dollars);
}
