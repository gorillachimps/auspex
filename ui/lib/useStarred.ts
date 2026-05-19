"use client";

import { useCallback, useEffect, useState } from "react";

// STORAGE_KEY is intentionally frozen at the pre-rebrand value so users who
// starred markets under the previous name don't lose their watchlists on
// upgrade. The user-facing event name is renamed.
const STORAGE_KEY = "polycrypto.watchlist.v1";
const CHANGE_EVENT = "auspex:starred-changed";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore quota / privacy errors
  }
}

/** Reactive view onto the starred-market set in localStorage. Syncs across tabs
 *  via the native StorageEvent and within the tab via a custom event. */
export function useStarred() {
  // Avoid SSR hydration mismatch: anchor at empty, populate after mount.
  const [starred, setStarred] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setStarred(readSet());
    const refresh = () => setStarred(readSet());
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

  const toggle = useCallback((id: string) => {
    const next = readSet();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeSet(next);
    setStarred(next);
  }, []);

  /** Additively merge a list of market IDs into the user's existing watchlist.
   *  Used by the share-import flow on /watchlists — accept doesn't clobber
   *  the user's pre-existing stars. Returns the number actually added (i.e.
   *  excluding IDs already in the set). */
  const mergeStarred = useCallback((ids: string[]): number => {
    const current = readSet();
    const before = current.size;
    for (const id of ids) {
      if (id && typeof id === "string") current.add(id);
    }
    writeSet(current);
    setStarred(current);
    return current.size - before;
  }, []);

  return { starred, toggle, mergeStarred };
}
