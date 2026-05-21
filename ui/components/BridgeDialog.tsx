"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ExternalLink,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { useBalance, useWalletClient } from "wagmi";
import { toast } from "sonner";
import { formatUnits, parseUnits } from "viem";
import {
  bridgeQuote,
  executeBridge,
  POLYGON_CHAIN_ID,
  POLYGON_USDC_E,
  SOURCE_CHAINS,
  USDC_BY_CHAIN,
  USDC_DECIMALS,
  type ExecutionProgress,
  type Quote,
  type SupportedSourceChainId,
} from "@/lib/acrossBridge";
import { BridgeButton } from "./BridgeButton";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  eoa: `0x${string}` | undefined;
  /** Destination on Polygon. Almost always the user's Polymarket proxy. When
   *  null we still render but disable submit and nudge the user to set their
   *  deposit wallet first. */
  toAddress: `0x${string}` | null;
  onClose: () => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "approving" } // approve tx pending (user signing or block confirming)
  | { kind: "approveDone" } // approve confirmed, waiting on SDK to prompt deposit
  | { kind: "depositing" }
  | { kind: "filling"; depositTxHash?: `0x${string}` }
  | { kind: "success"; fillTxHash?: `0x${string}` }
  | { kind: "error"; message: string };

function formatUSDC(amount: bigint): string {
  const whole = formatUnits(amount, USDC_DECIMALS);
  const n = Number(whole);
  if (n < 0.01) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function BridgeDialog({ open, eoa, toAddress, onClose }: Props) {
  const [fromChainId, setFromChainId] =
    useState<SupportedSourceChainId>(SOURCE_CHAINS[0].id);
  const [amountStr, setAmountStr] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef, 'input[inputmode="decimal"]');

  // Reset transient state whenever the dialog reopens.
  useEffect(() => {
    if (!open) return;
    setAmountStr("");
    setQuote(null);
    setQuoteError(null);
    setStatus({ kind: "idle" });
  }, [open]);

  // Esc closes the dialog — but never while a bridge is in flight, because
  // the wallet signatures are already in motion and unmounting would orphan
  // the progress UI. Lives in its own effect so the listener re-binds with a
  // fresh closure whenever the in-flight gate flips.
  const inFlightForEsc =
    status.kind === "approving" ||
    status.kind === "approveDone" ||
    status.kind === "depositing" ||
    status.kind === "filling";
  useEffect(() => {
    if (!open) return;
    if (inFlightForEsc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, inFlightForEsc, onClose]);

  // Reset the quote when the user changes chain or amount so we don't show
  // stale fees while a refetch is in flight.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
  }, [fromChainId, amountStr]);

  // Parse the amount once, used by both the quote-fetch effect and the
  // balance / submit gate.
  const amountUSDC = useMemo<bigint | null>(() => {
    const trimmed = amountStr.trim();
    if (!trimmed) return null;
    try {
      const parsed = parseUnits(trimmed, USDC_DECIMALS);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amountStr]);

  // Live balance of USDC on the selected source chain.
  const { data: balance } = useBalance({
    address: eoa,
    token: USDC_BY_CHAIN[fromChainId],
    chainId: fromChainId,
    query: { enabled: !!eoa && open },
  });

  // Debounced quote fetch.
  useEffect(() => {
    if (!open) return;
    if (!amountUSDC || !toAddress) return;
    setQuoting(true);
    setQuoteError(null);
    const ctrl = { cancelled: false };
    const timer = setTimeout(async () => {
      try {
        const q = await bridgeQuote({
          fromChainId,
          amountUSDC,
          recipient: toAddress,
        });
        if (ctrl.cancelled) return;
        setQuote(q);
      } catch (err) {
        if (ctrl.cancelled) return;
        setQuoteError(err instanceof Error ? err.message : "Quote failed");
        setQuote(null);
      } finally {
        if (!ctrl.cancelled) setQuoting(false);
      }
    }, 400);
    return () => {
      ctrl.cancelled = true;
      clearTimeout(timer);
    };
  }, [open, fromChainId, amountUSDC, toAddress]);

  const { data: walletClient } = useWalletClient();

  // Defer portal mounting until after hydration so SSR doesn't see a stub.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const insufficient =
    balance != null && amountUSDC != null && amountUSDC > balance.value;
  const belowMin = quote ? quote.isAmountTooLow : false;
  const aboveMax =
    quote && amountUSDC != null
      ? amountUSDC > quote.limits.maxDeposit
      : false;

  const submitDisabled =
    !walletClient ||
    !eoa ||
    !toAddress ||
    !quote ||
    quoting ||
    insufficient ||
    belowMin ||
    aboveMax ||
    status.kind === "approving" ||
    status.kind === "approveDone" ||
    status.kind === "depositing" ||
    status.kind === "filling";

  async function onSubmit() {
    if (!quote || !walletClient) return;
    setStatus({ kind: "approving" });
    try {
      const result = await executeBridge({
        quote,
        walletClient,
        onProgress: (progress: ExecutionProgress) => {
          if (progress.status === "simulationError" ||
              progress.status === "txError" ||
              progress.status === "error") {
            setStatus({
              kind: "error",
              message: progress.error?.message ?? "Bridge failed",
            });
            return;
          }
          if (progress.step === "approve") {
            // Distinguish "approve still pending" from "approve confirmed,
            // SDK about to prompt the deposit tx". Without this, the UI
            // claims "Approving…" indefinitely while we're actually waiting
            // for the user to sign the deposit prompt in their wallet —
            // which they often miss because the popup hides behind the
            // page.
            if (progress.status === "txSuccess") {
              setStatus({ kind: "approveDone" });
            } else {
              setStatus({ kind: "approving" });
            }
          } else if (progress.step === "deposit") {
            const next: Status =
              progress.status === "txPending"
                ? { kind: "depositing" }
                : progress.status === "txSuccess"
                  ? {
                      kind: "filling",
                      depositTxHash: progress.txReceipt.transactionHash,
                    }
                  : { kind: "depositing" };
            setStatus(next);
          } else if (progress.step === "fill") {
            if (progress.status === "txSuccess") {
              setStatus({
                kind: "success",
                fillTxHash: progress.txReceipt.transactionHash,
              });
            } else {
              setStatus((prev) =>
                prev.kind === "filling" ? prev : { kind: "filling" },
              );
            }
          }
        },
      });
      // executeQuote with throwOnError=undefined (default false) resolves with
      // an error object instead of throwing. Surface it.
      if (result.error) {
        setStatus({ kind: "error", message: result.error.message });
        return;
      }
      if (result.fillTxReceipt) {
        setStatus({
          kind: "success",
          fillTxHash: result.fillTxReceipt.transactionHash,
        });
        toast.success("Bridge complete — USDC arrived, ready to trade on Auspex");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bridge failed";
      setStatus({ kind: "error", message });
      toast.error(message.slice(0, 140));
    }
  }

  const inFlight = inFlightForEsc;

  // Portal to <body> so the dialog escapes the TopNav <header>'s containing
  // block — `backdrop-filter: blur(...)` on the header scopes `position: fixed`
  // to the header itself, which would otherwise mash the dialog into the 49px
  // sticky-nav strip.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bridge-dialog-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 px-4 py-6"
      onClick={inFlight ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border-strong bg-surface p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2
              id="bridge-dialog-title"
              className="text-base font-semibold tracking-tight"
            >
              Bridge funds to Auspex
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Sends USDC straight to your trading account on Polygon — usually
              fills in under a minute via Across.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={inFlight}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!toAddress ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              Link your trading account first — without it we don&apos;t know
              where to send the funds on Polygon.
            </span>
          </div>
        ) : null}

        {/* From section */}
        <div className="mt-4 rounded-md border border-border bg-background/40 px-3 py-3">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-2">
            <span>From</span>
            {balance ? (
              <button
                type="button"
                onClick={() => setAmountStr(balance.formatted)}
                className="font-normal normal-case text-accent hover:underline"
                title="Use full balance"
              >
                Balance: {Number(balance.formatted).toFixed(2)} USDC
              </button>
            ) : (
              <span className="font-normal normal-case text-muted-2">
                Balance: —
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={fromChainId}
              onChange={(e) =>
                setFromChainId(Number(e.target.value) as SupportedSourceChainId)
              }
              disabled={inFlight}
              className="rounded-md border border-border-strong bg-surface px-2 py-2 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {SOURCE_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              value={amountStr}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setAmountStr(v);
              }}
              disabled={inFlight}
              placeholder="0.00"
              className={cn(
                "flex-1 rounded-md border bg-background px-3 py-2 text-right text-[15px] font-semibold tabular-nums text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2",
                insufficient
                  ? "border-rose-400/40 focus:ring-rose-400/40"
                  : "border-border-strong focus:ring-accent/40",
              )}
            />
            <span className="text-[12px] font-medium text-muted">USDC</span>
          </div>
          {insufficient ? (
            <p className="mt-1.5 text-[11px] text-rose-300">
              Insufficient balance on{" "}
              {SOURCE_CHAINS.find((c) => c.id === fromChainId)?.name}.
            </p>
          ) : null}
        </div>

        <div className="my-2 flex justify-center" aria-hidden="true">
          <div className="rounded-full border border-border-strong bg-background p-1.5">
            <ArrowDown className="h-3 w-3 text-muted-2" />
          </div>
        </div>

        {/* To section — fixed destination */}
        <div className="rounded-md border border-border bg-background/40 px-3 py-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-2">
            To · Your trading account on Polygon
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[12px] text-foreground/85">
              {toAddress
                ? `${toAddress.slice(0, 8)}…${toAddress.slice(-6)}`
                : "—"}
            </span>
            <span className="text-[15px] font-semibold tabular-nums text-foreground">
              {quote
                ? formatUSDC(quote.deposit.outputAmount)
                : amountUSDC
                  ? "…"
                  : "0.00"}{" "}
              <span className="text-[12px] font-medium text-muted">USDC.e</span>
            </span>
          </div>
        </div>

        {/* Quote summary */}
        <div className="mt-3 min-h-[44px] rounded-md border border-border bg-surface-2/40 px-3 py-2 text-[11px]">
          {quoting ? (
            <div className="flex items-center gap-2 text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Fetching quote…
            </div>
          ) : quoteError ? (
            <span className="text-rose-300">{quoteError}</span>
          ) : quote ? (
            <div className="flex items-center justify-between gap-3 text-muted">
              <span>
                Fee{" "}
                <span className="text-foreground">
                  {formatUSDC(quote.fees.totalRelayFee.total)} USDC
                </span>
              </span>
              <span>
                ~
                <span className="text-foreground">
                  {Math.max(quote.estimatedFillTimeSec, 1)}s
                </span>{" "}
                to fill
              </span>
            </div>
          ) : amountUSDC && toAddress ? (
            <span className="text-muted-2">Quote will load once typed</span>
          ) : (
            <span className="text-muted-2">
              Enter an amount to see fees and ETA.
            </span>
          )}
          {belowMin && quote ? (
            <p className="mt-1 text-rose-300">
              Below the minimum bridge size for this route (min{" "}
              {formatUSDC(quote.limits.minDeposit)} USDC).
            </p>
          ) : null}
          {aboveMax && quote ? (
            <p className="mt-1 text-rose-300">
              Above the max for this route (max{" "}
              {formatUSDC(quote.limits.maxDeposit)} USDC).
            </p>
          ) : null}
        </div>

        {/* In-flight progress */}
        {inFlight ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-accent">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {status.kind === "approving"
              ? "Approving USDC for the Across spoke pool…"
              : status.kind === "approveDone"
                ? "Approval confirmed. Check your wallet to sign the deposit…"
                : status.kind === "depositing"
                  ? "Depositing on the source chain…"
                  : "Waiting for fill on Polygon…"}
          </div>
        ) : null}

        {/* Success */}
        {status.kind === "success" ? (
          <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-500/5 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] text-emerald-300">
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>USDC arrived. You can start trading on Auspex.</span>
            </div>
            {status.fillTxHash ? (
              <a
                href={`https://polygonscan.com/tx/${status.fillTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                View fill on Polygonscan
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}

        {/* Error */}
        {status.kind === "error" ? (
          <div className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-200">
            {status.message}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-2">
            Need BSC or another route?{" "}
            <BridgeButton
              toAddress={toAddress ?? undefined}
              variant="inline"
              label="Open Jumper"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={inFlight}
              className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status.kind === "success" ? "Done" : "Cancel"}
            </button>
            {status.kind !== "success" ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitDisabled}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inFlight ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                )}
                Bridge
              </button>
            ) : null}
          </div>
        </div>

        {/* Footer note — only on idle to avoid clutter mid-flight */}
        {!inFlight && status.kind !== "success" ? (
          <p className="mt-3 text-[10px] leading-relaxed text-muted-2">
            Routed via Across spoke pool {""}
            <span className="font-mono">
              {fromChainId} → {POLYGON_CHAIN_ID}
            </span>
            . Output token: USDC.e ({POLYGON_USDC_E.slice(0, 6)}…
            {POLYGON_USDC_E.slice(-4)}).
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
