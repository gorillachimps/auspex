"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Props = { snapshotAt: string };

// Poll cadence for /api/health. Matches the data-refresh cron's 15-minute
// max but checks four times more often so even mid-cycle freshness shows.
const POLL_MS = 60_000;

function relative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return iso;
  const ms = now - t;
  // Clock skew between server (which stamped `iso`) and client can flip the
  // sign by a few seconds. Clamp anything within a small margin to "just now".
  if (ms < 5_000) return "just now";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function SnapshotMeta({ snapshotAt }: Props) {
  // Avoid hydration mismatch from `Date.now()` and locale: anchor the SSR pass at
  // the snapshot time itself ("just now"), then update on the client after mount.
  const [now, setNow] = useState<number>(() => Date.parse(snapshotAt));
  const [liveSnapshotAt, setLiveSnapshotAt] = useState(snapshotAt);
  const [flash, setFlash] = useState(false);
  const lastSnapRef = useRef(snapshotAt);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Re-sync to the server-rendered prop whenever it changes (e.g. when Next
  // does a soft route update). Otherwise the polled value is canonical.
  useEffect(() => {
    setLiveSnapshotAt((prev) => {
      const pt = Date.parse(prev);
      const nt = Date.parse(snapshotAt);
      return isFinite(nt) && (!isFinite(pt) || nt > pt) ? snapshotAt : prev;
    });
  }, [snapshotAt]);

  // Poll /api/health on a slow interval so long-lived tabs don't show stale
  // "snapshot 11h ago" forever. Only updates state when the server reports
  // a snapshotAt strictly newer than what we have, so we don't trigger
  // flashes on every poll.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { snapshotAt?: string };
        if (cancelled) return;
        if (!data?.snapshotAt) return;
        const incoming = Date.parse(data.snapshotAt);
        if (!isFinite(incoming)) return;
        setLiveSnapshotAt((prev) => {
          const pt = Date.parse(prev);
          return isFinite(pt) && incoming > pt ? data.snapshotAt! : prev;
        });
      } catch {
        // Network blip — keep last known good value, try again next tick.
      }
    }
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Briefly highlight the pill whenever a fresh snapshot arrives — gives the
  // auto-refresh a moment of visual feedback without being shouty.
  useEffect(() => {
    if (lastSnapRef.current === liveSnapshotAt) return;
    lastSnapRef.current = liveSnapshotAt;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1100);
    return () => clearTimeout(t);
  }, [liveSnapshotAt]);

  return (
    <span
      title={liveSnapshotAt}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors duration-700",
        flash
          ? "bg-accent/20 text-accent ring-accent/40"
          : "bg-zinc-800/60 text-muted ring-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors duration-700",
          flash ? "bg-accent motion-safe:animate-pulse" : "bg-sky-400",
        )}
      />
      Snapshot {relative(liveSnapshotAt, now)}
    </span>
  );
}
