// Scoped not-found for the /embed/* route segment. Rendered when an embed
// page calls notFound() (market slug not in the snapshot).
//
// CRITICAL: must NOT include TopNav, Footer, or anything that would surface
// the full site chrome — these pages live inside third-party iframes and
// rendering site chrome would visually break the host page. Stay bare.
export default function EmbedNotFound() {
  return (
    <main className="grid h-screen w-screen place-items-center bg-background p-3 text-center">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          Auspex
        </div>
        <p className="mt-2 text-[12px] font-medium text-foreground">
          This market is no longer indexed.
        </p>
        <a
          href="https://auspex.to"
          target="_top"
          rel="noopener"
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/25"
        >
          Browse all markets →
        </a>
      </div>
    </main>
  );
}
