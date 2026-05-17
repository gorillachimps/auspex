"use client";

import { useEffect } from "react";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

type Props = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function ErrorBoundary({ error, unstable_retry }: Props) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[auspex] route error", error);
  }, [error]);

  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300 ring-1 ring-rose-400/30">
            Error
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted">
            We hit an unexpected error rendering this view. Try again — if it
            keeps happening, the underlying data may be missing or malformed.
          </p>
          {error.digest ? (
            <p className="font-mono text-[11px] text-muted-2">
              digest {error.digest}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/25"
            >
              <RotateCcw className="h-3 w-3" />
              Try again
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface-2"
            >
              <ChevronLeft className="h-3 w-3" />
              Back to screener
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
