"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  /** Headline for the loading state. Defaults to "Loading…". */
  title?: string;
  /** Optional one-line subtitle. */
  body?: string;
  /** Use the panel layout (centered card, like EmptyState) instead of a
   *  thin inline indicator. */
  variant?: "inline" | "panel";
  /** Override default padding for the panel variant. */
  compact?: boolean;
};

/**
 * Unified loading indicator. Two variants:
 *   - `inline` (default) — small spinner + label, e.g. "Refreshing…", for
 *     in-context loaders inside a header or summary bar.
 *   - `panel` — centered card with halo and message, for whole-view loaders
 *     (e.g. /portfolio while the first fetch is in flight).
 */
export function LoadingState({
  title = "Loading…",
  body,
  variant = "inline",
  compact = false,
}: Props) {
  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-surface/40 text-center",
          compact ? "px-4 py-6" : "px-6 py-12",
        )}
      >
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/30">
          <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
        {body ? (
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
        ) : null}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      {title}
    </span>
  );
}
