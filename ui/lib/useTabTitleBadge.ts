"use client";

import { useEffect } from "react";
import { useClobSession } from "./useClobSession";
import { useUserPositions } from "./useUserPositions";

// Strips a leading "(N) " badge so we don't compound badges across renders.
const BADGE_RE = /^\(\d+\)\s+/;

// Below this size we treat the position as dust (residual shares post-close).
const DUST_THRESHOLD = 0.001;

/**
 * Mounts a side-effect that prefixes `document.title` with "(N) " when the
 * user has N open positions, so the tab is easy to spot among many open
 * browser tabs.
 *
 * Survives client-side navigation: Next.js's per-page metadata rewrites the
 * <title> on every route change, so we install a MutationObserver and re-
 * apply the prefix whenever the title is overwritten from outside.
 */
export function useTabTitleBadge() {
  const session = useClobSession();
  const funder = session.funderAddress;
  const { positions } = useUserPositions(funder);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const count =
      positions?.filter((p) => Math.abs(p.size ?? 0) > DUST_THRESHOLD).length ??
      0;

    let applying = false;
    const apply = () => {
      // Guard against the MutationObserver firing in response to our own
      // assignment below — would otherwise loop forever.
      if (applying) return;
      const current = document.title;
      const stripped = current.replace(BADGE_RE, "");
      const next = count > 0 ? `(${count}) ${stripped}` : stripped;
      if (next !== current) {
        applying = true;
        document.title = next;
        // Release the guard on the next microtask after the observer
        // callback for our own write has had a chance to run.
        queueMicrotask(() => {
          applying = false;
        });
      }
    };

    apply();

    // Watch document.head with subtree, not the <title> element directly:
    // Next.js's App Router metadata system may *replace* the title element
    // on navigation (not just mutate its text), which would leave a
    // single-element observer stranded on a detached node. Observing the
    // head with subtree catches both shapes.
    const target = document.head;
    if (!target) return;
    const observer = new MutationObserver(() => {
      apply();
    });
    observer.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      // Leave the title clean on unmount in case the component ever gets
      // removed (e.g. SSR boundary swap during HMR).
      document.title = document.title.replace(BADGE_RE, "");
    };
  }, [positions]);
}
