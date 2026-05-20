"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "polycrypto.notifications.v1";
const CHANGE_EVENT = "auspex:notifications-changed";
const MAX_ITEMS = 50;

export type NotificationKind = "fill" | "settled" | "redeemable" | "info";

export type Notification = {
  /** Stable id used to dedupe across polls. Usually the tx hash for fills,
   *  or `conditionId:settled` for settlement events. */
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Deep-link to the relevant market / position page. */
  url?: string;
  /** Unix milliseconds. */
  ts: number;
  /** True until the user opens the dropdown OR clicks the item. */
  unread: boolean;
};

function readAll(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (n): n is Notification =>
        n &&
        typeof n === "object" &&
        typeof n.id === "string" &&
        typeof n.kind === "string" &&
        typeof n.title === "string" &&
        typeof n.ts === "number",
    );
  } catch {
    return [];
  }
}

function writeAll(items: Notification[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore quota / privacy errors
  }
}

/**
 * Add a notification to the user's inbox. Deduplicates by `id` (most recent
 * wins). Module-level export — usable from non-component code like
 * useFillNotifications.ts. Triggers a same-tab change event so the inbox
 * dropdown updates immediately.
 */
export function addNotification(n: Omit<Notification, "unread">) {
  if (typeof window === "undefined") return;
  const existing = readAll();
  const without = existing.filter((e) => e.id !== n.id);
  const next: Notification[] = [{ ...n, unread: true }, ...without].slice(
    0,
    MAX_ITEMS,
  );
  writeAll(next);
}

/**
 * Reactive view onto the notification inbox in localStorage. Syncs across
 * tabs via the native StorageEvent and within the tab via a custom event
 * (same convention as `useStarred`).
 */
export function useNotifications() {
  const [items, setItems] = useState<Notification[]>(() => []);

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

  const unreadCount = items.reduce((n, i) => (i.unread ? n + 1 : n), 0);

  const markAllRead = useCallback(() => {
    const next = readAll().map((i) => ({ ...i, unread: false }));
    writeAll(next);
    setItems(next);
  }, []);

  const markOneRead = useCallback((id: string) => {
    const next = readAll().map((i) =>
      i.id === id ? { ...i, unread: false } : i,
    );
    writeAll(next);
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    writeAll([]);
    setItems([]);
  }, []);

  return { items, unreadCount, markAllRead, markOneRead, clear };
}
