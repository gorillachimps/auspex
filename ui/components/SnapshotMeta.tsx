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
  // When present, prices are being recomputed live (every ~minute) on top of
  // the snapshot's market definitions — the pill then reflects PRICE freshness,
  // not the committed-file age. Null = live overlay unavailable → show snapshot.
  const [pricesAt, setPricesAt] = useState<string | null>(null);
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
        // NB: /api/health returns 503 when the *snapshot* (market list) is >6h
        // stale — but prices may still be live. Parse the body regardless of
        // status so pricesAt keeps driving the pill even on a stale snapshot;
        // that resilience is the entire point of the live overlay.
        const data = (await r.json().catch(() => null)) as {
          snapshotAt?: string;
          pricesAt?: string | null;
        } | null;
        if (cancelled || !data) return;
        // Live-price freshness drives the pill when available.
        setPricesAt(
          data?.pricesAt && isFinite(Date.parse(data.pricesAt))
            ? data.pricesAt
            : null,
        );
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
    poll(); // once on mount so the pill flips to "Live" without a 60s wait
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

  const isLive = pricesAt != null;
  return (
    <span
      title={
        isLive
          ? `Prices ${relative(pricesAt!, now)} · market list ${relative(liveSnapshotAt, now)}`
          : liveSnapshotAt
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors duration-700",
        flash
          ? "bg-accent/20 text-accent ring-accent/40"
          : isLive
            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30"
            : "bg-zinc-800/60 text-muted ring-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors duration-700",
          flash
            ? "bg-accent motion-safe:animate-pulse"
            : isLive
              ? "bg-emerald-400 motion-safe:animate-pulse"
              : "bg-sky-400",
        )}
      />
      {isLive
        ? `Live · prices ${relative(pricesAt!, now)}`
        : `Snapshot ${relative(liveSnapshotAt, now)}`}
    </span>
  );
}
