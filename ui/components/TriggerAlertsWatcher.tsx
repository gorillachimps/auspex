"use client";

import { useTriggerAlertsWatcher } from "@/lib/useTriggerAlertsWatcher";

/** Render-null global mount for the Trigger Radar watcher. Sits in the
 *  providers tree (next to SettlementNotifications) so alerts fire on any
 *  page while a tab is open, not only on the screener. */
export function TriggerAlertsWatcher() {
  useTriggerAlertsWatcher();
  return null;
}
