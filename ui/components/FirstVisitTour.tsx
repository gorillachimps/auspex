"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bell,
  Check,
  Search,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

const SEEN_KEY = "polycrypto.welcome-tour-seen.v1";

type Slide = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: "Welcome to Auspex",
    body: "The screener that pros use to find sharp bets on Polymarket. No account, no signup — your wallet does all the heavy lifting.",
  },
  {
    icon: <Search className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: "Browse 500+ live markets",
    body: "Sort by volume, distance to YES, clarity, or any column. Star markets you want to follow, save filter combos as named views.",
  },
  {
    icon: <Wallet className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: "Connect to trade in one click",
    body: "Hit Buy YES or Buy NO on any market — your wallet signs, the order rides straight to Polymarket. We never take custody, never take a cut.",
  },
  {
    icon: <Bell className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: "Get notified on fills",
    body: "Free browser notifications when your orders fill, plus an in-app inbox in the top nav. Markets resolved in your favor land there too.",
  },
];

/**
 * Welcome tour overlay that shows on a user's first visit. Localstorage
 * flag suppresses on subsequent loads. Skip button (top-right), Next /
 * Done buttons, backdrop click dismisses. Mounted globally in Providers
 * — the body renders only when the unread flag is true.
 *
 * Portals to document.body to escape any backdrop-filter containing
 * blocks that would scope `position: fixed` to a smaller region.
 */
export function FirstVisitTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check the flag AFTER mount to avoid SSR hydration mismatch.
    try {
      const seen = window.localStorage.getItem(SEEN_KEY);
      if (seen === "1") return;
      // Suppress on deep-link arrivals — if a user lands directly on a
      // market detail page (typically via a shared link), they came for
      // the market, not the welcome tour. Same for /wallets/[address],
      // /embed/[slug], and other content-first destinations. The tour
      // still fires on the home page and on landing pages like /welcome
      // where orientation is the goal.
      const path = window.location.pathname;
      const isDeepLink =
        path.startsWith("/markets/") ||
        path.startsWith("/wallets/") ||
        path.startsWith("/embed/");
      if (isDeepLink) {
        // Mark as seen so they don't get hit by it on a later navigation
        // to the home page either — they've already had a session start
        // with intent.
        window.localStorage.setItem(SEEN_KEY, "1");
        return;
      }
      setOpen(true);
    } catch {
      // ignore privacy-mode errors
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }

  // Esc dismisses.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted || !open) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
      onClick={dismiss}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-lg border border-border-strong bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Skip tour"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/30">
          {slide.icon}
        </div>
        <h2
          id="welcome-tour-title"
          className="mt-3 text-xl font-semibold tracking-tight text-foreground"
        >
          {slide.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {slide.body}
        </p>

        {/* Dot indicators */}
        <div className="mt-5 flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i === index ? "bg-accent" : "bg-border-strong",
              )}
              aria-hidden="true"
            />
          ))}
          <span className="ml-auto text-[11px] tabular text-muted-2">
            {index + 1} of {SLIDES.length}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-[12px] text-muted hover:text-foreground"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) dismiss();
              else setIndex((i) => i + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[13px] font-semibold text-background hover:bg-accent/90"
          >
            {isLast ? (
              <>
                Get started
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
