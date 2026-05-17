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

            <Section title="Resolution-source-as-signal">
              <p>
                Most prediction-market dashboards show implied % vs. an
                external opinion model. Auspex reads each market&apos;s{" "}
                <em>own stated resolution criterion</em> — the on-chain or
                exchange feed it actually settles against — and shows the live
                value next to the implied %. Your edge isn&apos;t our forecast;
                it&apos;s the gap between consensus and the source.
              </p>
            </Section>

            <Section title="Δ to trigger">
              <p>
                Signed % from the current state to the threshold that resolves
                YES. <span className="text-emerald-300">Positive</span> means
                the source is above the line,{" "}
                <span className="text-rose-300">negative</span> below. Sorted
                ascending by absolute distance, so the closest-to-trigger float
                to the top. <span className="text-emerald-300">✓ triggered</span>{" "}
                means the threshold has already been crossed.
              </p>
            </Section>

            <Section title="Resolution Confidence (RC)">
              <p>
                A composite score 0–100 of how legible the resolution path is.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground/80">
                <li>0.55 × distance-to-trigger (closer = higher)</li>
                <li>0.30 × time-pressure (sooner deadline = higher)</li>
                <li>0.15 × log-volume (more market action = higher)</li>
              </ul>
              <p className="mt-2">
                Only computed for live-state markets; deferred markets show
                <span className="font-mono">&nbsp;—&nbsp;</span>.
              </p>
            </Section>

            <Section title="Live vs. deferred">
              <p>
                <span className="text-emerald-300">Live</span> markets have a
                machine-readable trigger we can score against right now (e.g.
                Binance BTC/USDT spot price). <span className="text-muted">Deferred</span>{" "}
                markets resolve via on-chain queries we haven&apos;t wired yet
                (Arkham wallet activity, holdings events) or via UMA arbitration
                (subjective claims). The{" "}
                <span className="rounded bg-emerald-500/15 px-1 py-0 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                  Live only
                </span>{" "}
                toggle filters to the scoreable set.
              </p>
            </Section>

            <Section title="Fees & custody">
              <p>
                Maker/taker fee is{" "}
                <span className="rounded-full bg-emerald-500/10 px-1.5 py-0 text-emerald-300 ring-1 ring-emerald-400/30">
                  0% / 0%
                </span>{" "}
                — Auspex adds nothing on top of the underlying venue. Orders are
                signed by your connected wallet and routed through your existing
                account; Auspex never custodies funds.
              </p>
            </Section>

            <Section title="Limitations">
              <p>
                Snapshots refresh every minute on the home page; the underlying
                rules data is parsed offline and may be hours old. Δ24h
                histories are reconstructed from cumulative-change windows, not
                a tick log. This is informational tooling, not financial
                advice.
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
