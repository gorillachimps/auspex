"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "polycrypto.saved-filters.v1";
const CHANGE_EVENT = "auspex:saved-filters-changed";

/**
 * The set of screener-state slots that can be captured into a saved view.
 * Mirrors the URL query params used by the Screener component so apply()
 * is a 1:1 reconstruction.
 */
export type SavedFilter = {
  /** Stable id (generated on creation). */
  id: string;
  /** User-supplied display name. */
  name: string;
  /** Unix millis when saved — used to sort newest-first in the list. */
  createdAt: number;

  /** Optional screener-state fields. Absent = "no filter on this dimension". */
  subtype?: string | null;
  ticker?: string | null;
  search?: string | null;
  starred?: boolean;
  live?: boolean;
  /** Sort column id and direction, e.g. "volume24h:desc". */
  sort?: string | null;
};

function readAll(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (f): f is SavedFilter =>
        f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(items: SavedFilter[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

function makeId(): string {
  // Short random id — uniqueness across a single user's saved views
  // doesn't need cryptographic guarantees.
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Build a `/?…` URL that reconstructs the saved filter's screener state.
 * Used by both apply() (navigation) and the watchlists page rendering
 * (preview link).
 */
export function toScreenerUrl(f: SavedFilter): string {
  const params = new URLSearchParams();
  if (f.subtype && f.subtype !== "all") params.set("subtype", f.subtype);
  if (f.ticker) params.set("ticker", f.ticker);
  if (f.search) params.set("q", f.search);
  if (f.starred) params.set("starred", "1");
  if (f.live) params.set("live", "1");
  if (f.sort && f.sort !== "volume24h:desc") params.set("sort", f.sort);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/** Human description of the filter set for the watchlists list. */
export function describeSavedFilter(f: SavedFilter): string {
  const parts: string[] = [];
  if (f.subtype && f.subtype !== "all") parts.push(f.subtype);
  if (f.ticker) parts.push(f.ticker);
  if (f.search) parts.push(`"${f.search}"`);
  if (f.starred) parts.push("starred");
  if (f.live) parts.push("live");
  return parts.length === 0 ? "All markets" : parts.join(" · ");
}

/**
 * Reactive view onto the saved-filter list in localStorage. Same cross-tab
 * sync conventions as useStarred / useNotifications.
 */
export function useSavedFilters() {
  const [items, setItems] = useState<SavedFilter[]>(() => []);

  useEffect(() => {
    setItems(readAll());
    const refresh = () => setItems(readAll());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, []);

  const save = useCallback(
    (data: Omit<SavedFilter, "id" | "createdAt">): SavedFilter => {
      const created: SavedFilter = {
        ...data,
        id: makeId(),
        createdAt: Date.now(),
      };
      const next = [created, ...readAll()];
      writeAll(next);
      setItems(next);
      return created;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    const next = readAll().filter((f) => f.id !== id);
    writeAll(next);
    setItems(next);
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const next = readAll().map((f) => (f.id === id ? { ...f, name } : f));
    writeAll(next);
    setItems(next);
  }, []);

  return { items, save, remove, rename };
}
