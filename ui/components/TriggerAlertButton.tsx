"use client";

import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_ALERT_PCT,
  useTriggerAlerts,
} from "@/lib/useTriggerAlerts";
import { cn } from "@/lib/cn";

type Props = {
  marketId: string;
  slug: string;
  question: string;
  /** Whether this market has a live, machine-readable trigger. Deferred
   *  markets (UMA / unwired on-chain) have no distance to watch, so the
   *  button is disabled with an explanatory tooltip. */
  live: boolean;
  thresholdPct?: number;
};

/**
 * Trigger Radar toggle. Arms/disarms a "near trigger" alert for one market.
 * When armed, the global watcher (useTriggerAlertsWatcher) notifies the user
 * once the market's distance-to-trigger enters the band or it resolves —
 * distance being the signal no competing screener computes.
 */
export function TriggerAlertButton({
  marketId,
  slug,
  question,
  live,
  thresholdPct = DEFAULT_ALERT_PCT,
}: Props) {
  const { has, add, remove } = useTriggerAlerts();
  const armed = has(marketId);

  if (!live) {
    return (
      <span
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-surface px-2 text-[11px] font-medium text-muted-2 opacity-60"
        title="This market has no live machine-readable trigger to watch (resolves via UMA or unwired on-chain queries)."
      >
        <Bell className="h-3 w-3" aria-hidden="true" />
        Alert
      </span>
    );
  }

  function toggle() {
    if (armed) {
      remove(marketId);
      toast.success("Trigger alert removed.", { duration: 3000 });
      return;
    }
    add({ marketId, slug, question, thresholdPct, createdAt: Date.now() });
    toast.success(
      `Alert set — we'll ping you when this gets within ${thresholdPct}% of triggering.`,
      { duration: 5000 },
    );
    // Best-effort: ask for browser-notification permission so the alert can
    // pop a system notification (the in-app inbox entry fires either way).
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={armed}
      title={
        armed
          ? "Remove trigger alert"
          : `Alert me when this market gets within ${thresholdPct}% of triggering`
      }
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium",
        armed
          ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {armed ? (
        <BellRing className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Bell className="h-3 w-3" aria-hidden="true" />
      )}
      {armed ? "Alerting" : "Alert"}
    </button>
  );
}
