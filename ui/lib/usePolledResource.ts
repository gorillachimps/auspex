"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Generic "fetch this on an interval" hook — the shared shape behind the
 * many hand-rolled `setTimeout(load, MS)` loops across the app (wallet
 * trades, activity feeds, builder stats, …). Handles: initial + interval
 * load, in-flight cancellation on unmount/dep-change, loading/error state,
 * keep-last-good-data on error, manual refresh, and optional refetch on
 * custom window events.
 *
 * Deliberately NOT used for:
 *  - useUserPositions — that needs a *shared* cross-consumer store, not a
 *    per-caller poll (see lib/useUserPositions).
 *  - useFillNotifications — bespoke seen-set diffing, not a resource fetch.
 *  - useBalanceAllowance — SDK call + allowance parsing, different shape.
 *
 * `data: null` means "still loading the first result" — distinguishes
 * loading from an empty/zero result.
 */
export type PolledResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => void;
};

export function usePolledResource<T>(
  // Receives a `cancelled()` probe so multi-step fetchers (pagination) can
  // bail early after an await once the effect has torn down.
  fetcher: (cancelled: () => boolean) => Promise<T>,
  opts: {
    intervalMs: number;
    /** When false, the hook resets to empty and does not poll. */
    enabled?: boolean;
    /** Effect re-runs (re-subscribes) when any of these change. The fetcher
     *  itself is read through a ref so its closure identity doesn't matter. */
    deps?: React.DependencyList;
    /** Keep the last successful data when a refetch errors (default true). */
    keepPreviousOnError?: boolean;
    /** Window event names that should trigger an immediate refetch. */
    refreshOn?: string[];
  },
): PolledResource<T> {
  const {
    intervalMs,
    enabled = true,
    deps = [],
    keepPreviousOnError = true,
    refreshOn,
  } = opts;

  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
  }>({ data: null, loading: false, error: null, fetchedAt: null });

  // Latest fetcher held in a ref so a fresh closure each render doesn't
  // re-trigger the effect — only `deps`/`enabled`/`intervalMs` do.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const refreshKey = refreshOn ? refreshOn.join(",") : "";

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null, fetchedAt: null });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const isCancelled = () => cancelled;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetcherRef.current(isCancelled);
        if (cancelled) return;
        setState({ data, loading: false, error: null, fetchedAt: Date.now() });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          data: keepPreviousOnError ? s.data : null,
          loading: false,
          error: (e as Error).message,
          fetchedAt: s.fetchedAt,
        }));
      } finally {
        if (!cancelled) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(load, intervalMs);
        }
      }
    }

    function onRefreshEvent() {
      if (timer) clearTimeout(timer);
      load();
    }

    load();
    const events = refreshKey ? refreshKey.split(",").filter(Boolean) : [];
    if (typeof window !== "undefined") {
      for (const ev of events) window.addEventListener(ev, onRefreshEvent);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        for (const ev of events) window.removeEventListener(ev, onRefreshEvent);
      }
    };
    // fetcher is intentionally read via ref, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, refreshNonce, refreshKey, ...deps]);

  return { ...state, refresh };
}
