"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtAgoUnixMs } from "@/lib/format";
import { useNotifications } from "@/lib/useNotifications";

/**
 * Bell-icon dropdown in the top nav. Shows up to 10 of the user's most-
 * recent events (fills, settlements, redeemable claims) sourced from
 * `useNotifications` (localStorage). Unread count badge. Click an entry
 * to navigate to its deep link AND mark it read.
 *
 * Dropdown closes on outside-click or Escape. Triggers `markAllRead`
 * when opened so the badge clears after a glance.
 */
export function NotificationsInbox() {
  const { items, unreadCount, markAllRead, markOneRead, clear } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Mark all read on open — same convention as iOS Mail / Linear.
    if (unreadCount > 0) markAllRead();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, unreadCount, markAllRead]);

  const recent = items.slice(0, 10);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        title="Recent activity"
        className="relative grid h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-background"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-40 w-80 rounded-md border border-border-strong bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Activity
            </h3>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-foreground"
                title="Clear all"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>
          {recent.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-muted-2">
              No recent activity. Fills, settlements, and redeemable claims
              will show up here.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border/70 overflow-y-auto">
              {recent.map((n) => {
                const tone =
                  n.kind === "fill"
                    ? "text-accent"
                    : n.kind === "settled"
                      ? "text-emerald-300"
                      : n.kind === "redeemable"
                        ? "text-amber-300"
                        : "text-foreground";
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "text-[12px] font-medium",
                          tone,
                          n.unread ? "" : "opacity-70",
                        )}
                      >
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[10px] tabular text-muted-2">
                        {fmtAgoUnixMs(n.ts)}
                      </span>
                    </div>
                    {n.body ? (
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] text-muted",
                          n.unread ? "" : "opacity-70",
                        )}
                      >
                        {n.body}
                      </p>
                    ) : null}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.url ? (
                      <a
                        href={n.url}
                        onClick={() => markOneRead(n.id)}
                        className="block px-3 py-2.5 hover:bg-surface-2/60"
                      >
                        {body}
                      </a>
                    ) : (
                      <div className="px-3 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
