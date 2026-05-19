"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";

export function HowItWorks() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="How does this work?"
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border-strong bg-surface px-2 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
        How it works
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border-strong bg-surface p-6 shadow-2xl scrollbar-thin"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="how-it-works-title"
                className="text-lg font-semibold tracking-tight"
              >
                How Auspex works
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Section title="What makes Auspex different">
              <p>
                Most prediction-market sites just show you the odds. Auspex
                also checks the actual data each market settles on — the
                Binance price, the on-chain treasury, the launch timestamp —
                and shows you how close it is to triggering YES. Your edge
                isn&apos;t our forecast; it&apos;s the gap between what the
                market thinks and what the live data says.
              </p>
            </Section>

            <Section title="Distance">
              <p>
                How far the live value is from triggering YES.{" "}
                <span className="text-emerald-300">Positive</span> means the
                live value is already above the line;{" "}
                <span className="text-rose-300">negative</span> means it
                needs to rise (or fall) more. The screener sorts by gap, so
                the closest-to-trigger markets float to the top.{" "}
                <span className="text-emerald-300">✓ triggered</span> means
                the line has already been crossed.
              </p>
            </Section>

            <Section title="Clarity score">
              <p>
                A 0–100 score of how clearly a market will resolve. Higher =
                cleaner read on YES or NO. We mix three things:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/80">
                <li>How close the live value is to triggering (55%)</li>
                <li>How soon the market closes (30%)</li>
                <li>How much volume it&apos;s seen (15%)</li>
              </ul>
              <p className="mt-2">
                Only scored for markets we can auto-check; subjective markets
                (e.g. &quot;Will the SEC do X?&quot;) show
                <span className="font-mono">&nbsp;—&nbsp;</span> because we
                can&apos;t programmatically read their outcome.
              </p>
            </Section>

            <Section title="Auto-checked vs. manual markets">
              <p>
                <span className="text-emerald-300">Auto-checked</span>{" "}
                markets settle on data we can read in real time — Binance
                prices, on-chain wallet activity, launch timestamps. We score
                these in full.{" "}
                <span className="text-muted">Manual</span> markets resolve
                via Polymarket&apos;s own judgment (subjective claims,
                editorial calls). Toggle{" "}
                <span className="rounded bg-emerald-500/15 px-1 py-0 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                  Live only
                </span>{" "}
                to hide the manual ones.
              </p>
            </Section>

            <Section title="Fees & custody">
              <p>
                Trading fees are{" "}
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0 text-emerald-300 ring-1 ring-emerald-400/30">
                  0% / 0%
                </span>{" "}
                — Auspex doesn&apos;t add anything on top. Your wallet signs
                orders directly; your funds stay in your account on Polygon.
                Auspex never holds money for you.
              </p>
            </Section>

            <Section title="Heads-up">
              <p>
                Prices refresh every minute. The underlying market list
                rebuilds every 6 hours, so a brand-new market might take a
                few hours to appear. 24-hour change numbers come from
                Polymarket&apos;s rolling stats, not a tick-by-tick log. This
                is informational — not financial advice.
              </p>
            </Section>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/25"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
        {title}
      </h3>
      <div className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}
