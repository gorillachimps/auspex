"use client";

import { useEffect, useRef, useState } from "react";
import { useClobSession } from "./useClobSession";
import { addNotification } from "./useNotifications";

const POLL_MS = 30_000;
const HOST = "https://data-api.polymarket.com";
const STORAGE_KEY = "auspex:notify:enabled";
const SW_URL = "/sw.js";

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
 * account, diffs against trades we've already seen, and pops a browser
 * notification on each new fill. The first poll is a "bootstrap" — records
 * what's already there without notifying so existing trades from before the
 * page loaded don't all blow up the notification tray at once.
 *
 * Architecture, in two layers:
 *   1. **Page-side polling.** Works only while at least one Auspex tab is
 *      open. Triggers `ServiceWorkerRegistration.showNotification` (or falls
 *      back to `new Notification()` when no SW is registered). The SW
 *      handles click events so notifications survive a page reload.
 *   2. **Service worker** (public/sw.js). Registered on mount when the
 *      browser supports it. Required for iOS Safari notifications, and a
 *      foundation for real Web Push (server-sent pushes when the tab is
 *      closed) once we add the server-side subscription infrastructure.
 *
 * Enabling is opt-in. The user clicks the bell in the TopNav, the browser
 * shows its native permission prompt, and after granting we set a
 * localStorage flag so the polling resumes on subsequent visits without
 * re-prompting.
 */
export function useFillNotifications() {
  const session = useClobSession();
  const funder = session.funderAddress;
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const [enabled, setEnabled] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

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

    // Register the service worker on mount. Failures are silently
    // tolerated — the older `new Notification(...)` path remains as a
    // fallback for browsers without SW support or where registration is
    // blocked (private mode, dev with HTTP, etc.).
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(SW_URL, { scope: "/" })
        .then((reg) => {
          swRegistrationRef.current = reg;
        })
        .catch(() => {
          // ignore — fall back to the page-only Notification path
        });
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
          const title = `${sideLabel} ${outcomeLabel} @ $${price}`;
          const body = `${t.title ?? "Polymarket fill"} · $${usdc.toFixed(2)} filled`;
          const targetUrl = t.slug ? `/markets/${t.slug}` : "/activity";

          // Record in the in-app inbox so users can scroll back through
          // recent fills from the bell dropdown, even if they dismissed
          // the OS toast.
          addNotification({
            id,
            kind: "fill",
            title,
            body,
            url: targetUrl,
            ts: (t.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
          });

          // Prefer the service worker — required for iOS Safari, survives
          // page reloads, and gives us the click handler defined in sw.js
          // (focuses the existing Auspex tab and navigates it instead of
          // popping a new window). Falls back to the page-side Notification
          // constructor when no SW is registered.
          const reg = swRegistrationRef.current;
          if (reg && typeof reg.showNotification === "function") {
            try {
              await reg.showNotification(title, {
                body,
                tag: id,
                icon: "/logo.png",
                badge: "/icon.svg",
                data: { url: targetUrl },
              });
              continue;
            } catch {
              // Fall through to the legacy path
            }
          }
          try {
            const n = new Notification(title, {
              body,
              tag: id,
              icon: "/logo.png",
              badge: "/icon.svg",
            });
            if (t.slug) {
              n.onclick = () => {
                window.focus();
                window.location.href = targetUrl;
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
