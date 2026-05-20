"use client";

import { useEffect, useRef, useState } from "react";

/** What direction the most recent value change was — drives the flash color. */
export type FlashDir = "up" | "down" | null;

type Options = {
  /** Milliseconds to keep the flash class applied. Default 280ms — feels
   *  snappy without strobing on rapid ticks. */
  durationMs?: number;
  /** Minimum magnitude of change to fire a flash, in the same units as the
   *  value. Suppresses noisy redraws on micro-jitter (e.g. WS rebroadcasts
   *  with no real movement). Default 0 (every change). */
  minDelta?: number;
};

/**
 * Returns the direction of the most-recent change to `value` (up, down,
 * or null while idle / unchanged). Applies for `durationMs` then resets
 * to null. Use the return value to switch a CSS class on the rendered
 * cell so price updates briefly highlight green or red.
 *
 *   const flash = useFlashOnChange(impliedYes);
 *   <span className={flash === "up" ? "bg-emerald-400/15" : flash === "down" ? "bg-rose-400/15" : ""}>
 *
 * Skips the very first render (no flash on initial value) and ignores
 * null / undefined / NaN inputs (treats them as "no change").
 */
export function useFlashOnChange(
  value: number | null | undefined,
  options: Options = {},
): FlashDir {
  const { durationMs = 280, minDelta = 0 } = options;
  const prevRef = useRef<number | null>(null);
  const [dir, setDir] = useState<FlashDir>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    const prev = prevRef.current;
    if (prev == null) {
      // First non-null value — record but don't flash.
      prevRef.current = value;
      return;
    }
    const delta = value - prev;
    if (Math.abs(delta) <= minDelta) {
      // Update the baseline but don't fire — sub-threshold tick.
      prevRef.current = value;
      return;
    }
    prevRef.current = value;
    setDir(delta > 0 ? "up" : "down");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDir(null), durationMs);
  }, [value, durationMs, minDelta]);

  // Clean up any pending timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return dir;
}

/**
 * Convenience: returns Tailwind classes for the flash highlight. Pair with
 * a base class on the cell (e.g. `transition-colors duration-300`) so the
 * fade-out reads as a graceful decay rather than a hard switch.
 */
export function flashClass(dir: FlashDir): string {
  if (dir === "up") return "bg-emerald-400/15 text-emerald-100";
  if (dir === "down") return "bg-rose-400/15 text-rose-100";
  return "";
}
