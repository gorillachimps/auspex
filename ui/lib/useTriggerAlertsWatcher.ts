"use client";

import { useEffect } from "react";
import { usePolledResource } from "./usePolledResource";
import { useTriggerAlerts } from "./useTriggerAlerts";
import { addNotification } from "./useNotifications";
import type { TableRow } from "./types";

const MARKETS_URL = "/api/markets?limit=500";
const POLL_MS = 60_000;
const FIRED_KEY = "auspex.trigger-alerts-fired.v1";

function readFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeFired(set: Set<string>) {
  try {
    window.localStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function fireBrowserNotification(title: string, body: string, slug: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: `trigger:${slug}`, icon: "/logo.png" });
    n.onclick = () => {
      window.focus();
      window.location.href = `/markets/${slug}`;
      n.close();
    };
  } catch {
    // some contexts block Notification construction; the inbox entry still lands
  }
}

/**
 * Trigger Radar watcher. For every armed alert, polls the markets projection
 * and fires when the market's distance-to-trigger enters the alert band
 * (≤ thresholdPct) or the market actually triggers. Distance-to-trigger is
 * the one signal no competitor computes — it's our differentiator, so this is
 * the flagship retention hook.
 *
 * Edge-triggered: each (market, kind) fires once. The "near" edge re-arms when
 * the market moves back out of the band, so a market that approaches, retreats,
 * and re-approaches alerts again. "Triggered" is terminal. Fired state persists
 * in localStorage so a page reload doesn't re-fire.
 *
 * Both an in-app inbox entry (always) and a browser Notification (if the user
 * granted permission via the nav bell) are emitted. Only polls while at least
 * one alert is armed.
 *
 * v1 limitation: matches alerts against the top-500-by-volume markets the API
 * returns. A market outside that set can't be evaluated; in practice users
 * alert on markets they found while browsing, which are in-set.
 */
export function useTriggerAlertsWatcher() {
  const { alerts } = useTriggerAlerts();
  const enabled = alerts.length > 0;

  const { data } = usePolledResource<TableRow[]>(
    async () => {
      const r = await fetch(MARKETS_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      return Array.isArray(json?.markets) ? (json.markets as TableRow[]) : [];
    },
    { intervalMs: POLL_MS, enabled, deps: [enabled] },
  );

  useEffect(() => {
    if (!data || alerts.length === 0) return;
    const byId = new Map(data.map((r) => [r.id, r]));
    const fired = readFired();
    let changed = false;

    for (const alert of alerts) {
      const row = byId.get(alert.marketId);
      if (!row || row.liveState !== "live") continue;

      const distPct =
        row.distancePct == null ? null : Math.abs(row.distancePct * 100);
      const triggered = row.alreadyTriggered === true;
      const near = distPct != null && distPct <= alert.thresholdPct;

      const hitKey = `${alert.marketId}:hit`;
      const nearKey = `${alert.marketId}:near`;

      if (triggered && !fired.has(hitKey)) {
        fired.add(hitKey);
        changed = true;
        addNotification({
          id: `trigger:${alert.marketId}:hit`,
          kind: "info",
          title: `✓ Triggered: ${row.question}`,
          body: "This market just crossed its resolution threshold.",
          url: `/markets/${alert.slug}`,
          ts: Date.now(),
        });
        fireBrowserNotification(
          `✓ Triggered: ${row.question}`,
          "This market just crossed its resolution threshold.",
          alert.slug,
        );
      } else if (!triggered && near && !fired.has(nearKey)) {
        fired.add(nearKey);
        changed = true;
        const body = `Now ${distPct!.toFixed(1)}% from triggering (alert set at ≤${alert.thresholdPct}%).`;
        addNotification({
          id: `trigger:${alert.marketId}:near`,
          kind: "info",
          title: `Near trigger: ${row.question}`,
          body,
          url: `/markets/${alert.slug}`,
          ts: Date.now(),
        });
        fireBrowserNotification(`Near trigger: ${row.question}`, body, alert.slug);
      } else if (!triggered && !near && fired.has(nearKey)) {
        // Moved back out of the band — re-arm the "near" edge.
        fired.delete(nearKey);
        changed = true;
      }
    }

    if (changed) writeFired(fired);
  }, [data, alerts]);
}
