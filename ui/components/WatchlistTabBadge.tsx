"use client";

import { useStarred } from "@/lib/useStarred";

/**
 * Small numeric chip rendered next to the "Watchlists" label in the top nav.
 * Returns null when the user has no stars (so unstarred users don't see a
 * "0" they can't act on) and lives in its own client component so TopNav can
 * stay a server component.
 */
export function WatchlistTabBadge() {
  const { starred } = useStarred();
  const count = starred.size;
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} starred markets`}
      className="ml-1.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold tabular text-amber-200 ring-1 ring-amber-400/30"
    >
      {count}
    </span>
  );
}
