// Home-screener skeleton. Lives in the (home) route group ON PURPOSE: a
// loading.tsx at app/ wraps every route in a Suspense boundary, which makes
// Next stream a 200 shell before the page runs. A page that then calls
// notFound() can no longer change the status (headers already sent), so dead
// market URLs returned 200 + "not found" and Google flagged ~4,000 of them as
// Soft 404 (GSC, 2026-10-07). Scoped here, /markets, /embed and the rest
// render without a boundary above them and get a real 404.
// See node_modules/next/dist/docs/.../loading.md "Status Codes".
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

const SKELETON_ROWS = 14;

export default function Loading() {
  return (
    <>
      <TopNav />
      <div className="border-b border-border bg-surface/60">
        <div className="mx-auto flex h-9 max-w-[1480px] items-center gap-3 px-4">
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted ring-1 ring-border">
            24h movers
          </span>
          <div className="h-3 w-1/2 rounded bg-surface-2 motion-safe:animate-pulse" />
        </div>
      </div>
      <main id="main" className="flex-1" aria-busy="true">
        <div className="mx-auto max-w-[1480px] px-4 pt-6 pb-2">
          <div className="space-y-2">
            <div className="h-6 w-72 rounded bg-surface motion-safe:animate-pulse" />
            <div className="h-3 w-[28rem] rounded bg-surface motion-safe:animate-pulse" />
          </div>
        </div>
        <section className="border-t border-border">
          <div className="mx-auto max-w-[1480px]">
            <div className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-72 rounded-md bg-surface motion-safe:animate-pulse" />
                <div className="ml-auto h-7 w-24 rounded-full bg-surface motion-safe:animate-pulse" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-7 w-20 rounded-full bg-surface motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                ))}
              </div>
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border bg-surface/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
                <span className="w-6" />
                <span className="w-6" />
                <span className="flex-1">Market</span>
                <span className="w-12">PM</span>
                <span className="w-24">Source</span>
                <span className="w-20">State</span>
                <span className="w-32">Δ to trigger</span>
                <span className="w-16">RC</span>
                <span className="w-12">Days</span>
                <span className="w-14">Δ24h</span>
                <span className="w-16">Vol 24h</span>
                <span className="w-20" />
              </div>
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5"
                  style={{ animationDelay: `${i * 25}ms` }}
                >
                  <span className="h-3.5 w-3.5 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-3.5 w-3.5 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 flex-1 rounded bg-surface motion-safe:animate-pulse" style={{ maxWidth: `${40 + ((i * 7) % 30)}%` }} />
                  <span className="h-4 w-12 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-24 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-20 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-5 w-32 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-5 w-16 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-12 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-14 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-16 rounded bg-surface motion-safe:animate-pulse" />
                  <span className="h-4 w-20 rounded bg-surface motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
