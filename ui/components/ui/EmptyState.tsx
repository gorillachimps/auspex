"use client";

import type { ReactNode } from "react";
import { AlertCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "error" | "info" | "success";

type Props = {
  /** Headline. One line, sentence-case. */
  title?: string;
  /** Optional one- or two-sentence explanation under the title. */
  body?: ReactNode;
  /** Icon shown above the title in a tone-tinted circle. If omitted, falls
   *  back to a wallet icon for `neutral` and an alert for `error`. */
  icon?: ReactNode;
  /** Visual tone — colors the icon halo and (subtly) the title. */
  tone?: Tone;
  /** Optional CTA — typically a button or link. Rendered below the body. */
  cta?: ReactNode;
  /** Optional supplementary content (e.g. a two-column "where to find X /
   *  what you'll see" explainer grid). Rendered below the CTA. */
  children?: ReactNode;
  /** Override the default padding/margin for tight contexts (e.g. inside
   *  an already-bordered card). */
  compact?: boolean;
};

/**
 * Unified empty-state component. Every "no data yet", "not connected",
 * "fetch failed", "filter excluded everything" surface across the app
 * should use this — visual consistency in negative states is the loudest
 * signal that an app is or isn't designed.
 */
export function EmptyState({
  title,
  body,
  icon,
  tone = "neutral",
  cta,
  children,
  compact = false,
}: Props) {
  const haloClass =
    tone === "error"
      ? "bg-neg-halo ring-neg-halo-ring"
      : tone === "info"
        ? "bg-info-halo ring-info-halo-ring"
        : tone === "success"
          ? "bg-pos-halo ring-pos-halo-ring"
          : "bg-zinc-700/40 ring-zinc-500/40";
  const defaultIcon =
    tone === "error" ? (
      <AlertCircle className="h-5 w-5 text-neg-strong" />
    ) : (
      <Wallet className="h-5 w-5 text-muted" />
    );
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface/40 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
      )}
    >
      <div
        className={cn(
          "mx-auto grid h-10 w-10 place-items-center rounded-full ring-1",
          haloClass,
        )}
      >
        {icon ?? defaultIcon}
      </div>
      {title ? (
        <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      ) : null}
      {body ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      ) : null}
      {cta ? <div className="mt-4 inline-flex">{cta}</div> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
