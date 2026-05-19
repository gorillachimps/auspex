"use client";

import { useEffect, useRef } from "react";
import { useClobSession } from "./useClobSession";

/**
 * Fire `session.ensureClient()` at most once per mount, when the session
 * is sitting at "linked" — i.e. wallet + funder are ready but the (now
 * lazy) CLOB credential derivation hasn't happened yet.
 *
 * Use this on pages where navigating to the page itself implies trading
 * intent — `/portfolio`, `/orders`. The user paid the cost of arriving
 * here; the wallet-signature prompt has obvious context. Don't use on
 * pages where the user might just be browsing (`/`, `/wallets`,
 * `/markets/[slug]`) — those should defer derivation until an explicit
 * action.
 *
 * Critically, fires at most ONCE per mount via the `fired` ref. Without
 * that guard, if ensureClient errors (user rejects the signature), status
 * flips to "error", session changes, effect re-runs, and we'd retrigger
 * the wallet prompt immediately — trapping the user in a loop. To retry
 * after rejection the user must navigate away and back to the page, which
 * remounts the component and resets the ref.
 */
export function useEnsureClientOnMount() {
  const session = useClobSession();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    if (session.status !== "linked" && session.status !== "error") return;
    fired.current = true;
    session.ensureClient().catch(() => {
      // errors are surfaced via session.error / status === "error"
    });
  }, [session]);
}
