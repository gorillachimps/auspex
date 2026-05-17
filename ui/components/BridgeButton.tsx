"use client";

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

// USDC.e on Polygon — the canonical collateral token Polymarket accepts.
const POLYGON_USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

type Variant = "primary" | "secondary" | "inline";

type Props = {
  /** Address to bridge funds INTO. When provided, the recipient is pre-filled
   *  in the bridge widget so the user can't accidentally send to the wrong
   *  account. Usually the Polymarket proxy/funder address. */
  toAddress?: `0x${string}` | null;
  /** Visual style. `inline` is a small text-link; the others are buttons. */
  variant?: Variant;
  /** Override the default label. */
  label?: string;
  className?: string;
};

/**
 * Opens Jumper.exchange (LI.FI's hosted bridge UI) in a new tab with the
 * destination chain (Polygon), token (USDC.e), and recipient address
 * pre-selected in the URL. Auspex stays open in the original tab.
 *
 * Why a new-tab hand-off rather than an in-page iframe or the @lifi/widget
 * npm package:
 *   - All mainstream bridge UIs (Jumper, Squid, Across, Stargate) ship strict
 *     `frame-ancestors` CSPs that block third-party iframing — universal
 *     clickjacking protection. An iframe would load blank.
 *   - @lifi/widget v3 hard-imports Solana, Sui, and Bitcoin wallet stacks at
 *     module-load time, adding ~500 KB and dozens of peer-deps for a feature
 *     that's secondary to the screener.
 *   - The new-tab hand-off costs zero bundle, requires no setup, and lands
 *     the user on a familiar audited UI for the actual fund movement. The
 *     destination is pre-filled so a careless paste-and-forget can't send
 *     funds to the wrong account.
 *
 * If we ever want a truly embedded experience, the right path is option C
 * from the bridge spec: a Auspex-controlled UI built on top of LI.FI's SDK
 * (not the widget) — that's a half-day build that needs careful testing
 * with real funds across chains.
 */
export function BridgeButton({
  toAddress,
  variant = "primary",
  label,
  className,
}: Props) {
  const params = new URLSearchParams({
    toChain: "137",
    toToken: POLYGON_USDC_E,
  });
  if (toAddress) params.set("toAddress", toAddress);
  const href = `https://jumper.exchange/?${params.toString()}`;

  const base =
    "inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors";
  const stylesByVariant: Record<Variant, string> = {
    primary:
      "border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 px-3 py-1.5",
    secondary:
      "border border-border-strong bg-surface text-foreground hover:bg-surface-2 px-3 py-1.5",
    inline:
      "text-accent hover:underline text-[12px] font-medium px-0 py-0",
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, stylesByVariant[variant], className)}
      title="Opens Jumper.exchange in a new tab. Destination address pre-filled."
    >
      {label ?? "Bridge USDC"}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
