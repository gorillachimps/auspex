"use client";

import { useEffect, useRef } from "react";
import { useClobSession } from "./useClobSession";
import { addNotification } from "./useNotifications";
import { useUserPositions } from "./useUserPositions";

/**
 * Watches the user's positions for state transitions worth a notification:
 *
 *   - A position becomes `redeemable` (`false → true`): the market resolved
 *     in the user's favor and they can claim winnings. Emit a
 *     `redeemable` notification with a link to /portfolio.
 *
 *   - A position disappears from the list (size dropped to zero): the user
 *     closed out fully. We don't emit on this — the underlying SELL fill
 *     already triggers a `fill` notification via useFillNotifications, and
 *     duplicating would be noisy.
 *
 * The first poll is a "bootstrap" — we record what's already there without
 * emitting, so the inbox doesn't fill with backdated events on first load.
 *
 * Persists "seen" redeemable conditionIds across page loads via localStorage
 * so the same market doesn't re-emit if the polls cross a refresh boundary.
 */

const SEEN_KEY = "polycrypto.redeemable-seen.v1";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(set: Set<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function useSettlementNotifications() {
  const session = useClobSession();
  const funder = session.funderAddress;
  const { positions } = useUserPositions(funder);
  // Keyed by funder address — when a user switches wallets, we need to
  // re-bootstrap so the NEW wallet's existing redeemables don't all get
  // emitted as fresh notifications. A shared boolean would let stale
  // bootstrap state leak across wallets.
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!positions || !funder) return;
    const seen = readSeen();

    if (bootstrappedFor.current !== funder) {
      // First poll for this funder — record what's already redeemable,
      // don't notify. Subsequent polls for the same funder go through
      // the diff path below.
      for (const p of positions) {
        if (p.redeemable) seen.add(p.conditionId);
      }
      writeSeen(seen);
      bootstrappedFor.current = funder;
      return;
    }

    // Subsequent polls — diff for new redeemables.
    let changed = false;
    for (const p of positions) {
      if (!p.redeemable) continue;
      if (seen.has(p.conditionId)) continue;
      seen.add(p.conditionId);
      changed = true;
      addNotification({
        id: `redeemable:${p.conditionId}`,
        kind: "redeemable",
        title: "Market resolved — ready to claim",
        body: `${p.title} · ${p.outcome} won. Open Polymarket to redeem your $${p.currentValue.toFixed(2)}.`,
        url: "/portfolio",
        ts: Date.now(),
      });
    }
    if (changed) writeSeen(seen);
  }, [positions, funder]);
}
