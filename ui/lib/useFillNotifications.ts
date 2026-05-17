"use client";

import { useEffect, useRef, useState } from "react";
import { useClobSession } from "./useClobSession";

const POLL_MS = 30_000;
const HOST = "https://data-api.polymarket.com";
const STORAGE_KEY = "auspex:notify:enabled";

type Trade = {
  side?: "BUY" | "SELL";
  asset?: string;
  outcome?: string;
  outcomeIndex?: number;
  price?: number;
  size?: number;
  sizeUsdc?: number;
  title?: string;
  slug?: string;
  transactionHash?: string;
  timestamp?: number;
};

export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

/**
 * Polls the data-api `/trades?user=…` endpoint every 30 s for the connected
 * account, diffs against the trades we've already seen, and pops a browser
 * Notification on each new fill. The first poll is a "bootstrap" — it just
 * records what's already there without notifying, so existing trades from
 * before the page loaded don't all blow up the notification tray at once.
 *
 * Not a "real" Web Push notification — those need a Service Worker + a
 * server to send pushes when the tab is closed. This works only while a
 * Auspex tab is open; useful for active traders, useless for someone who
 * walks away.
 *
 * Enabling is opt-in. The user clicks the bell in the TopNav (or wherever
 * `request()` is hooked up), the browser shows its native permission prompt,
 * and after granting we set a localStorage flag so the polling resumes on
 * subsequent visits without re-prompting.
 */
export function useFillNotifications() {
  const session = useClobSession();
  const funder = session.funderAddress;
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const [enabled, setEnabled] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as NotificationPermissionState);
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  async function request(): Promise<NotificationPermissionState> {
    if (typeof Notification === "undefined") return "unsupported";
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermissionState);
    if (result === "granted") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      setEnabled(true);
    }
    return result as NotificationPermissionState;
  }

  function disable() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "0");
    } catch {
      // ignore
    }
    setEnabled(false);
  }

  // Polling loop — only runs when permission is granted, user has enabled,
  // and we know the funder address.
  useEffect(() => {
    if (!funder) return;
    if (permission !== "granted") return;
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let bootstrapped = false;

    async function poll() {
      try {
        const url = `${HOST}/trades?user=${funder}&limit=25`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as Trade[];
        if (cancelled || !Array.isArray(data)) return;

        if (!bootstrapped) {
          for (const t of data) {
            const id = t.transactionHash;
            if (id) seenIdsRef.current.add(id);
          }
          bootstrapped = true;
          return;
        }

        // Sort oldest-first so notifications appear chronologically
        const sorted = [...data].sort(
          (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
        );
        for (const t of sorted) {
          const id = t.transactionHash;
          if (!id || seenIdsRef.current.has(id)) continue;
          seenIdsRef.current.add(id);

          const sideLabel = t.side ?? "Fill";
          const outcomeLabel =
            t.outcome ??
            (t.outcomeIndex === 0 ? "Yes" : t.outcomeIndex === 1 ? "No" : "");
          const price = (t.price ?? 0).toFixed(3);
          const usdc =
            t.sizeUsdc != null
              ? t.sizeUsdc
              : (t.size ?? 0) * (t.price ?? 0);
          try {
            const n = new Notification(
              `${sideLabel} ${outcomeLabel} @ $${price}`,
              {
                body: `${t.title ?? "Polymarket fill"} · $${usdc.toFixed(2)} filled`,
                tag: id,
                icon: "/logo.png",
                badge: "/icon.svg",
              },
            );
            // Clicking takes the user to the market detail page if we have a slug.
            if (t.slug) {
              n.onclick = () => {
                window.focus();
                window.location.href = `/markets/${t.slug}`;
                n.close();
              };
            }
          } catch {
            // Some browsers block Notification construction in odd contexts; swallow.
          }
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [funder, permission, enabled]);

  return {
    permission,
    enabled: enabled && permission === "granted",
    request,
    disable,
  };
}
