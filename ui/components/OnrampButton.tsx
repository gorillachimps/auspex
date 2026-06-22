"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/cn";

// Build-time gate: NEXT_PUBLIC_* is inlined, so the card button simply doesn't
// render until MoonPay keys are configured (a redeploy bakes them in). Shipping
// this dark is therefore a no-op until activation.
const ENABLED = Boolean(process.env.NEXT_PUBLIC_MOONPAY_PUBLISHABLE_KEY);

type Props = {
  toAddress: `0x${string}`;
  /** Optional suggested USD amount to prefill in the widget. */
  amount?: number;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
};

/**
 * "Pay with card" — opens a MoonPay buy widget (signed server-side so the
 * destination is the user's Polymarket account and can't be edited) in a new
 * tab, mirroring the BridgeButton hand-off. Renders nothing until MoonPay is
 * configured.
 */
export function OnrampButton({
  toAddress,
  amount,
  label = "Pay with card",
  variant = "primary",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  if (!ENABLED) return null;

  async function open() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ address: toAddress });
      if (amount && amount > 0) q.set("amount", String(amount));
      const r = await fetch(`/api/onramp?${q.toString()}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`onramp ${r.status}`);
      const { url } = (await r.json()) as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Fail quietly — the bridge option remains available alongside.
    } finally {
      setLoading(false);
    }
  }

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "border border-accent/40 bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25"
      : "px-2 py-1 text-accent hover:bg-accent/15";
  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className={cn(base, styles, className)}
    >
      <CreditCard className="h-3 w-3" aria-hidden="true" />
      {loading ? "Opening…" : label}
    </button>
  );
}
