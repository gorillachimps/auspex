import { ConnectButton } from "./ConnectButton";
import { HowItWorks } from "./HowItWorks";
import { NotificationsToggle } from "./NotificationsToggle";

type ActiveTab =
  | "screener"
  | "watchlists"
  | "portfolio"
  | "activity"
  | "wallets"
  | "api"
  | "docs";

// `hideOn` lets us drop low-priority tabs on narrow viewports so the row never
// crowds the Connect button on phones.
const TABS: Array<{
  id: ActiveTab;
  label: string;
  href: string;
  hideOn?: "mobile" | "small";
}> = [
  { id: "screener", label: "Screener", href: "/" },
  { id: "watchlists", label: "Watchlists", href: "/watchlists" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio", hideOn: "mobile" },
  { id: "activity", label: "Activity", href: "/activity", hideOn: "mobile" },
  { id: "wallets", label: "Wallets", href: "/wallets", hideOn: "mobile" },
  { id: "api", label: "API", href: "/api/markets", hideOn: "small" },
  { id: "docs", label: "Docs", href: "/docs", hideOn: "small" },
];

type Props = { active?: ActiveTab };

export function TopNav({ active = "screener" }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-[1480px] items-center gap-3 px-3 sm:gap-6 sm:px-4">
        <a href="/" className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight">
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
        <nav className="flex items-center gap-0.5 text-[13px] sm:gap-1">
          {TABS.map((t) => {
            const isActive = active === t.id;
            const hideClass =
              t.hideOn === "mobile"
                ? "hidden sm:inline-block"
                : t.hideOn === "small"
                  ? "hidden md:inline-block"
                  : "";
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
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          <HowItWorks />
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
