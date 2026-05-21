"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "polycrypto.pwa-install-dismissed.v1";

// The beforeinstallprompt event isn't in stock TypeScript types — augment
// minimally with the bits we use.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Small toast-style install prompt for browsers that support
 * `beforeinstallprompt` (mostly Chrome / Edge on desktop + Android). iOS
 * Safari doesn't fire the event — it requires manual "Add to Home Screen"
 * via the share menu, so we don't show anything there.
 *
 * Once the user dismisses or installs, we set a localStorage flag and
 * don't re-show. Same convention as FirstVisitTour.
 */
export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // If the user already dismissed/installed, don't even listen.
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // ignore
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setEvent(null);
      try {
        window.localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // ignore
      }
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setEvent(null);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    if (choice.outcome === "accepted") {
      // "appinstalled" will also fire and set the flag, but set it here
      // proactively so we never re-prompt even if the install runner is
      // slow.
      try {
        window.localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // ignore
      }
    }
  }

  if (!event) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs rounded-lg border border-border-strong bg-surface p-3 shadow-2xl">
      <div className="flex items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/30">
          <Download className="h-4 w-4 text-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-foreground">
            Install Auspex
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            Add the screener to your home screen for one-tap access. No app
            store, no install size.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={install}
              className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-background hover:bg-accent/90"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
