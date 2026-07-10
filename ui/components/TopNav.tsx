import { ConnectButton } from "./ConnectButton";
import { HowItWorks } from "./HowItWorks";
import { NotificationsInbox } from "./NotificationsInbox";
import { NotificationsToggle } from "./NotificationsToggle";
import { ShortcutsHelpButton } from "./ShortcutsHelpButton";
import { WatchlistTabBadge } from "./WatchlistTabBadge";

type ActiveTab =
  | "screener"
  | "watchlists"
  | "portfolio"
  | "activity"
  | "wallets"
  | "api"
  | "docs";

// `hideOn: "small"` drops low-priority tabs below md so the single-row layout
// never crowds the Connect button. Below sm the nav wraps to its own full-width
// scrollable row (see TopNav), so every primary tab stays reachable on phones.
const TABS: Array<{
  id: ActiveTab;
  label: string;
  href: string;
  hideOn?: "small";
}> = [
  { id: "screener", label: "Screener", href: "/" },
  { id: "watchlists", label: "Watchlists", href: "/watchlists" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio" },
  { id: "activity", label: "Activity", href: "/activity" },
  { id: "wallets", label: "Wallets", href: "/wallets" },
  { id: "api", label: "API", href: "/api", hideOn: "small" },
  { id: "docs", label: "Docs", href: "/docs", hideOn: "small" },
];

type Props = { active?: ActiveTab };

export function TopNav({ active = "screener" }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      {/* Below sm the nav wraps to its own full-width row (order-last) so the
          logo + controls row fits a 390px viewport without horizontal overflow. */}
      <div className="mx-auto flex min-h-12 max-w-[1480px] flex-wrap items-center gap-x-3 px-3 sm:h-12 sm:flex-nowrap sm:gap-6 sm:px-4">
        <a href="/" className="flex shrink-0 items-center gap-2 py-2 text-sm font-semibold tracking-tight sm:py-0">
          <img
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 select-none"
            draggable={false}
          />
          <span className="text-foreground">Auspex</span>
          <span className="ml-1 hidden rounded-full bg-zinc-800/80 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted ring-1 ring-border sm:inline-block">
            beta
          </span>
        </a>
        <nav className="order-last -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-0.5 overflow-x-auto whitespace-nowrap border-t border-border/60 px-3 py-1.5 text-[13px] sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:border-t-0 sm:p-0 sm:gap-1">
          {TABS.map((t) => {
            const isActive = active === t.id;
            const hideClass =
              t.hideOn === "small" ? "hidden md:inline-block" : "";
            return (
              <a
                key={t.id}
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={`${hideClass} ${
                  isActive
                    ? "rounded-md px-2 py-1 font-medium text-foreground bg-surface ring-1 ring-border sm:px-2.5"
                    : "rounded-md px-2 py-1 text-muted hover:text-foreground hover:bg-surface/60 sm:px-2.5"
                }`}
              >
                {t.label}
                {t.id === "watchlists" ? <WatchlistTabBadge /> : null}
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs sm:gap-2">
          <HowItWorks />
          <ShortcutsHelpButton />
          <NotificationsInbox />
          <NotificationsToggle />
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300 ring-1 ring-emerald-400/30 lg:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            0% fees, ever
          </span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
