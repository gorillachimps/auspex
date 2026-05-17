"use client";

import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { useFillNotifications } from "@/lib/useFillNotifications";
import { cn } from "@/lib/cn";

/**
 * Small bell toggle for the TopNav. Click once to ask for browser notification
 * permission; once granted, every fill on the connected account pops a system
 * notification (while at least one Auspex tab is open). Click again to disable
 * — we just stop polling and pop a toast confirming.
 *
 * Hides entirely if the browser doesn't support Notification API.
 */
export function NotificationsToggle() {
  const { permission, enabled, request, disable } = useFillNotifications();

  if (permission === "unsupported") return null;

  async function onClick() {
    if (enabled) {
      disable();
      toast.success("Fill notifications turned off.", { duration: 3000 });
      return;
    }
    if (permission === "denied") {
      toast.error(
        "Notifications are blocked in your browser settings. Re-enable them there, then click the bell.",
        { duration: 8000 },
      );
      return;
    }
    const result = await request();
    if (result === "granted") {
      toast.success(
        "Fill notifications on. You'll get a popup whenever an order fills.",
        { duration: 5000 },
      );
    } else if (result === "denied") {
      toast.error("Permission denied. You can re-enable in browser settings.", {
        duration: 6000,
      });
    }
  }

  const label = enabled
    ? "Disable fill notifications"
    : "Enable fill notifications";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border text-[12px]",
        enabled
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
          : "border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {enabled ? (
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
