export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/40 text-xs text-muted">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative grid h-2 w-2 place-items-center">
            <span
              aria-hidden="true"
              className="absolute h-2 w-2 rounded-full bg-emerald-400/40 motion-safe:animate-ping"
            />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Status: <span className="text-foreground">Operational</span>
        </span>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <a href="/welcome" className="hover:text-foreground">
          New here?
        </a>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <a href="/leaderboard" className="hover:text-foreground">
          Leaderboard
        </a>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <a href="/changelog" className="hover:text-foreground">
          Changelog v0.3
        </a>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <a href="/docs" className="hover:text-foreground">
          Docs
        </a>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <a href="/builder" className="hover:text-foreground">
          Builder
        </a>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <span>
          Markets sourced from{" "}
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Polymarket
          </a>
          . Informational only.
        </span>
        <span className="text-border-strong" aria-hidden="true">·</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-400/30">
          0% fees, ever
        </span>
        <span className="ml-auto flex items-center gap-3">
          <a href="/api" className="hover:text-foreground">
            API
          </a>
          <a href="/privacy" className="hover:text-foreground">
            Privacy
          </a>
          <a href="/security" className="hover:text-foreground">
            Security
          </a>
          <a href="/terms" className="hover:text-foreground">
            Terms
          </a>
        </span>
      </div>
    </footer>
  );
}
