"use client";

import { useEffect, useMemo } from "react";
import { usePolledResource } from "./usePolledResource";
import { useTriggerAlerts } from "./useTriggerAlerts";
import { addNotification } from "./useNotifications";
import type { TableRow } from "./types";

const MARKETS_URL = "/api/markets";
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
 * Coverage: the watcher fetches exactly the markets the user has armed (by id),
 * so an alert set from a market-detail page on a low-volume market is evaluated
 * the same as a top-of-screener one. The only markets it can't evaluate are
 * those the data pipeline has dropped from the current snapshot (resolved or
 * expired) — those simply don't fire.
 */
export function useTriggerAlertsWatcher() {
  const { alerts } = useTriggerAlerts();
  const enabled = alerts.length > 0;

  // Stable key over the armed market ids: re-fetches immediately when the user
  // arms or disarms an alert (not only on the 60s tick), and scopes the request
  // to just those markets instead of the whole top-of-volume slice.
  const idsKey = useMemo(
    () => [...new Set(alerts.map((a) => a.marketId))].sort().join(","),
    [alerts],
  );

  const { data } = usePolledResource<TableRow[]>(
    async () => {
      const ids = idsKey ? idsKey.split(",") : [];
      if (ids.length === 0) return [];
      const r = await fetch(
        `${MARKETS_URL}?ids=${encodeURIComponent(ids.join(","))}`,
        { cache: "no-store" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      return Array.isArray(json?.markets) ? (json.markets as TableRow[]) : [];
    },
    { intervalMs: POLL_MS, enabled, deps: [enabled, idsKey] },
  );

  useEffect(() => {
    const fired = readFired();
    let changed = false;

    // Reconcile first: drop fired flags for markets that are no longer armed,
    // so the persisted set stays bounded and a re-armed alert can fire again.
    const armedIds = new Set(alerts.map((a) => a.marketId));
    for (const key of [...fired]) {
      const marketId = key.replace(/:(hit|near)$/, "");
      if (!armedIds.has(marketId)) {
        fired.delete(key);
        changed = true;
      }
    }

    if (!data || alerts.length === 0) {
      if (changed) writeFired(fired);
      return;
    }
    const byId = new Map(data.map((r) => [r.id, r]));

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
