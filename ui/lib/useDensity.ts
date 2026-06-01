"use client";

import { useEffect, useState } from "react";

const KEY = "auspex.density.v1";

export type Density = "compact" | "default";

/**
 * Screener row-density preference, persisted to localStorage. Per-tab reactive
 * is enough (no cross-tab sync needed) so this stays deliberately minimal —
 * not the full reactive-store scaffold the other prefs use.
 */
export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>("default");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "compact" || v === "default") setDensity(v);
    } catch {
      // ignore privacy-mode / quota errors
    }
  }, []);

  const set = (d: Density) => {
    setDensity(d);
    try {
      window.localStorage.setItem(KEY, d);
    } catch {
      // ignore
    }
  };

  return [density, set];
}
