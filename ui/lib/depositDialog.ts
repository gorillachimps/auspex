"use client";

/**
 * Cross-component trigger for the "Connect your trading account" dialog
 * (DepositWalletDialog), which is owned by ConnectButton in the top nav.
 *
 * Any no-funder surface — the portfolio empty state, the order-ticket blocker,
 * a screener nudge — can call openDepositDialog() to pop it inline instead of
 * telling the user to go hunt for the Connect menu themselves. ConnectButton
 * listens for the event and opens its dialog. Fixes the U-1 onboarding
 * dead-end from the architecture review.
 */
export const OPEN_DEPOSIT_DIALOG_EVENT = "auspex:open-deposit-dialog";

export function openDepositDialog() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_DEPOSIT_DIALOG_EVENT));
}
