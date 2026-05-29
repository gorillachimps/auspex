"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "auspex.trigger-alerts.v1";
const CHANGE_EVENT = "auspex:trigger-alerts-changed";

/** Default "near trigger" band: alert when a market gets within 5 percentage
 *  points of the threshold that resolves it YES. */
export const DEFAULT_ALERT_PCT = 5;

export type TriggerAlert = {
  marketId: string;
  slug: string;
  question: string;
  /** Notify when |distance-to-trigger| (in %) drops to ≤ this, or on trigger. */
  thresholdPct: number;
  createdAt: number;
};

function readAlerts(): TriggerAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (a): a is TriggerAlert =>
        a &&
        typeof a === "object" &&
        typeof a.marketId === "string" &&
        typeof a.slug === "string" &&
        typeof a.thresholdPct === "number",
    );
  } catch {
    return [];
  }
}

function writeAlerts(alerts: TriggerAlert[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore quota / privacy errors
  }
}

/** Non-reactive snapshot for the watcher (which runs outside React render). */
export function getTriggerAlerts(): TriggerAlert[] {
  return readAlerts();
}

export function addTriggerAlert(alert: TriggerAlert) {
  const existing = readAlerts().filter((a) => a.marketId !== alert.marketId);
  writeAlerts([alert, ...existing]);
}

export function removeTriggerAlert(marketId: string) {
  writeAlerts(readAlerts().filter((a) => a.marketId !== marketId));
}

/**
 * Reactive view onto the user's Trigger Radar alerts. Syncs across tabs via
 * the native StorageEvent and within the tab via a custom event (same
 * convention as useStarred / useNotifications). The watcher
 * (useTriggerAlertsWatcher) consumes the same store and fires notifications.
 */
export function useTriggerAlerts() {
  const [alerts, setAlerts] = useState<TriggerAlert[]>(() => []);

  useEffect(() => {
    setAlerts(readAlerts());
    const refresh = () => setAlerts(readAlerts());
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

  const has = useCallback(
    (marketId: string) => alerts.some((a) => a.marketId === marketId),
    [alerts],
  );

  const add = useCallback((alert: TriggerAlert) => {
    addTriggerAlert(alert);
  }, []);

  const remove = useCallback((marketId: string) => {
    removeTriggerAlert(marketId);
  }, []);

  return { alerts, has, add, remove };
}
