"use client";

import { BookmarkPlus, BookmarkCheck } from "lucide-react";
import { useFollowedWallets } from "@/lib/useFollowedWallets";
import { cn } from "@/lib/cn";

type Props = {
  address: `0x${string}`;
  label?: string;
  variant?: "primary" | "ghost";
  className?: string;
};

/**
 * Toggle button to add/remove a wallet from the followed list in localStorage.
 * Renders different copy + icon depending on follow state. The label is
 * persisted alongside the address so users can annotate ("Polymarket whale",
 * "0x...8eF was right on Trump 47").
 */
export function FollowButton({
  address,
  label,
  variant = "primary",
  className,
}: Props) {
  const { isFollowed, toggle } = useFollowedWallets();
  const followed = isFollowed(address);

  const base =
    "inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors";
  const variants: Record<NonNullable<Props["variant"]>, string> = {
    primary: followed
      ? "border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 px-3 py-1.5"
      : "border border-border-strong bg-surface text-foreground hover:bg-surface-2 px-3 py-1.5",
    ghost: followed
      ? "text-accent hover:underline px-0 py-0"
      : "text-muted hover:text-foreground px-0 py-0",
  };

  return (
    <button
      type="button"
      onClick={() => toggle(address, label)}
      className={cn(base, variants[variant], className)}
      title={followed ? "Click to unfollow" : "Add to your followed wallets"}
    >
      {followed ? (
        <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {followed ? "Following" : "Follow"}
    </button>
  );
}
