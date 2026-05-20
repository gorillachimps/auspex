"use client";

import { useSettlementNotifications } from "@/lib/useSettlementNotifications";

/**
 * Invisible mount point for the settlement-notification watcher. Mounted
 * globally in Providers.tsx so the watcher runs on every page while a
 * user is connected (matches TabTitleBadge's pattern).
 */
export function SettlementNotifications() {
  useSettlementNotifications();
  return null;
}
