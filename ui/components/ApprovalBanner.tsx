"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useClobSession } from "@/lib/useClobSession";
import { useBalanceAllowance, fmtCollateral } from "@/lib/useBalanceAllowance";
import { updateAllowance } from "@/lib/polymarket";
import { track } from "@/lib/track";
import { BridgeButton } from "./BridgeButton";

// Below this pUSD balance (in 6-decimal units = $1) we treat the account as
// effectively empty and surface the Bridge CTA instead of Approve. Approving
// spend on a $0 balance does nothing useful and confuses new users.
const FUND_THRESHOLD = BigInt(1_000_000);

/**
 * Action banner shown above the screener when the connected account isn't
 * ready to trade. State machine:
 *
 *   - balance < $1               → "Fund your account" with a Bridge CTA
 *                                    (sends to Jumper with the proxy pre-filled)
 *   - balance ≥ $1, allowance 0  → "Approve trading" with an inline Approve
 *                                    button (calls updateAllowance via the SDK)
 *   - both fine                  → banner hides entirely
 *
 * No external "approve on polymarket.com" link — both fixes happen in-app
 * so the user never has to leave auspex.to. This is the core funnel fix.
 */
export function ApprovalBanner() {
  const session = useClobSession();
  const allowance = useBalanceAllowance(session.client);
  const [approving, setApproving] = useState(false);

  if (session.status !== "ready") return null;
  if (allowance.loading || allowance.error) return null;
  if (allowance.hasAnyAllowance) return null;

  const hasFunds =
    allowance.balance != null && allowance.balance > FUND_THRESHOLD;

  async function approve() {
    if (!session.client) return;
    setApproving(true);
    const toastId = toast.loading("Approving pUSD for trading…");
    try {
      await updateAllowance(session.client);
      toast.success("pUSD approved — you can place orders now.", {
        id: toastId,
        duration: 5000,
      });
      track("allowance_approved", { from: "banner" });
      allowance.refresh();
    } catch (e) {
      const msg = (e as Error).message ?? "approval failed";
      toast.error(`Approval failed: ${msg}`, { id: toastId, duration: 8000 });
      track("allowance_failed", { from: "banner", reason: msg.slice(0, 80) });
    } finally {
      setApproving(false);
    }
  }

  if (!hasFunds) {
    return (
      <div className="border-b border-amber-400/30 bg-amber-500/10 text-amber-200">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-3 px-4 py-2 text-sm">
          <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Fund your account to start trading</span>
          <span className="text-amber-100/80">
            Balance{" "}
            <span className="tabular text-amber-50">
              {fmtCollateral(allowance.balance)}
            </span>
            . Bridge USDC in from any chain — Auspex never holds your funds.
          </span>
          <span className="ml-auto">
            <BridgeButton
              toAddress={session.funderAddress}
              variant="primary"
              label="Bridge USDC"
            />
          </span>
        </div>
      </div>
    );
  }

  // Funded but unapproved — inline Approve CTA.
  return (
    <div className="border-b border-amber-400/30 bg-amber-500/10 text-amber-200">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">One-time approval to enable trading</span>
        <span className="text-amber-100/80">
          Balance{" "}
          <span className="tabular text-amber-50">
            {fmtCollateral(allowance.balance)}
          </span>
          . Approve pUSD spend so orders can route through your account. Signed
          in your wallet — Auspex never moves funds.
        </span>
        <button
          type="button"
          onClick={approve}
          disabled={approving}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/40 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approving ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-3 w-3" aria-hidden="true" />
          )}
          {approving ? "Approving…" : "Approve"}
        </button>
      </div>
    </div>
  );
}
