"use client";

import { useCallback, useEffect, useState } from "react";

// Storage key follows the frozen-prefix convention (see useStarred / polymarket.ts).
// `v1` shape: array of { address, followedAt, label? }.
const STORAGE_KEY = "polycrypto.followed-wallets.v1";
const CHANGE_EVENT = "auspex:followed-wallets-changed";

export type FollowedWallet = {
  /** Lowercased 0x address. The Polymarket proxy (funder), not the signer EOA,
   *  because that's what /trades and /positions take as `user`. */
  address: `0x${string}`;
  /** ISO timestamp of when the user added this wallet to their follow list. */
  followedAt: string;
  /** Optional user-supplied label. */
  label?: string;
};

function readList(): FollowedWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is FollowedWallet =>
          x &&
          typeof x === "object" &&
          typeof x.address === "string" &&
          /^0x[0-9a-fA-F]{40}$/.test(x.address),
      )
      .map((x) => ({
        ...x,
        address: x.address.toLowerCase() as `0x${string}`,
      }));
  } catch {
    return [];
  }
}

function writeList(list: FollowedWallet[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore quota / privacy errors
  }
}

/**
 * Reactive view onto the followed-wallets list in localStorage. Syncs across
 * tabs via StorageEvent and within the tab via a custom event. Mirrors the
 * useStarred pattern.
 */
export function useFollowedWallets() {
  // Anchor at empty to avoid SSR hydration mismatch; populate after mount.
  const [list, setList] = useState<FollowedWallet[]>(() => []);

  useEffect(() => {
    setList(readList());
    const refresh = () => setList(readList());
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

  const toggle = useCallback((address: string, label?: string) => {
    const lower = address.toLowerCase() as `0x${string}`;
    const current = readList();
    const idx = current.findIndex((w) => w.address === lower);
    let next: FollowedWallet[];
    if (idx >= 0) {
      next = current.filter((_, i) => i !== idx);
    } else {
      next = [
        ...current,
        { address: lower, followedAt: new Date().toISOString(), label },
      ];
    }
    writeList(next);
    setList(next);
  }, []);

  const isFollowed = useCallback(
    (address: string) =>
      list.some((w) => w.address === address.toLowerCase()),
    [list],
  );

  const setLabel = useCallback((address: string, label: string | null) => {
    const lower = address.toLowerCase();
    const current = readList();
    const next = current.map((w) =>
      w.address === lower
        ? { ...w, label: label && label.trim() ? label.trim() : undefined }
        : w,
    );
    writeList(next);
    setList(next);
  }, []);

  return { list, toggle, isFollowed, setLabel };
}
