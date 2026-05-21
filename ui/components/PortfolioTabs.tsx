import { cn } from "@/lib/cn";

type Tab = "positions" | "orders";

type Props = {
  active: Tab;
};

const TABS: Array<{ id: Tab; label: string; href: string }> = [
  { id: "positions", label: "Positions", href: "/portfolio" },
  { id: "orders", label: "Open orders", href: "/orders" },
];

/**
 * Sub-navigation for the Portfolio section. Renders inline tabs that link
 * to /portfolio (Positions) and /orders (Open orders) so each view stays
 * its own URL — back/forward + deep links work — while feeling like one
 * cohesive section under the TopNav's Portfolio tab.
 */
export function PortfolioTabs({ active }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Portfolio sub-section"
      className="mt-2 inline-flex items-center rounded-md border border-border-strong bg-surface text-[12px]"
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <a
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "px-3 py-1.5 font-medium first:rounded-l-md last:rounded-r-md",
              isActive
                ? "bg-surface-2 text-foreground"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
