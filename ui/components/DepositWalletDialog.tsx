"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { usePublicClient } from "wagmi";
import { polygon } from "viem/chains";
import { writeFunderAddress } from "@/lib/polymarket";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { findPolymarketProxy, findProxyOwners } from "@/lib/findPolymarketProxy";
import { cn } from "@/lib/cn";
import { BridgeButton } from "./BridgeButton";

type Props = {
  open: boolean;
  eoa: `0x${string}` | undefined;
  currentFunder: `0x${string}` | null;
  onClose: () => void;
  onSaved: (funder: `0x${string}`) => void;
};

/**
 * "Last-step" dialog that links the connected wallet to the user's existing
 * Polymarket account (the smart-contract proxy that actually holds USDC).
 *
 * UX goals after a friend's feedback that the previous version felt
 * counter-intuitive:
 *   - Show the connected wallet at the top so the user doesn't think we're
 *     asking them to connect a second wallet.
 *   - One clear primary input with inline validation feedback (green check on
 *     valid, red on "that's your wallet, not your account").
 *   - One-click "Paste from clipboard" button so a user who just copied their
 *     address from Polymarket can finish in a single click.
 *   - Distinct call to the polymarket.com settings page where the address
 *     lives, AND a separate card for users who haven't created an account yet.
 *   - Bridge prompt only after the address is valid — avoids cluttering the
 *     primary call-to-action.
 */
export function DepositWalletDialog({
  open,
  eoa,
  currentFunder,
  onClose,
  onSaved,
}: Props) {
  const [value, setValue] = useState(currentFunder ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const publicClient = usePublicClient({ chainId: polygon.id });
  /** When the input was filled by our auto-detect rather than the user
   *  pasting or typing it. Drives a friendly "we found this for you" badge. */
  const [autoDetected, setAutoDetected] = useState(false);
  /** Per-EOA cache of detect results so reopening the dialog doesn't refetch. */
  const detectedFor = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef, 'input[type="text"]');

  useEffect(() => {
    if (!open) return;
    setValue(currentFunder ?? "");
    setError(null);
    setAutoDetected(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, currentFunder, onClose]);

  // Auto-detect the user's Polymarket proxy from their EOA. Only runs when:
  //   - dialog is open
  //   - we have an EOA
  //   - we haven't already detected for this EOA
  //   - the user hasn't already pasted something (keep their input)
  // Falls back silently to manual entry if no proxy is found or the API
  // route is unconfigured.
  useEffect(() => {
    if (!open) return;
    if (!eoa) return;
    if (detectedFor.current === eoa) return;
    if (currentFunder) return; // already have a saved address
    if (value.trim().length > 0) return;

    detectedFor.current = eoa;
    let cancelled = false;
    setDetecting(true);
    findPolymarketProxy(eoa)
      .then((res) => {
        if (cancelled) return;
        if (res.proxy) {
          setValue(res.proxy);
          setAutoDetected(true);
          setError(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, eoa, currentFunder, value]);

  // Defer portal mount until after hydration so SSR doesn't see a stub.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const trimmed = value.trim();
  const looksValid = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const sameAsWallet =
    looksValid && trimmed.toLowerCase() === (eoa ?? "").toLowerCase();
  const isValid = looksValid && !sameAsWallet;

  async function pasteFromClipboard() {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(cleaned)) {
        setValue(cleaned);
        setError(null);
      } else {
        setError(
          "Clipboard doesn't contain a valid Polygon address. Copy your address from Polymarket first.",
        );
      }
    } catch {
      setError(
        "Couldn't read your clipboard automatically. Paste with Cmd/Ctrl+V instead.",
      );
    } finally {
      setPasting(false);
    }
  }

  async function save() {
    if (sameAsWallet) {
      setError(
        "That's your wallet — we need your Polymarket account (proxy), which is a different address.",
      );
      return;
    }
    if (!looksValid) {
      setError("Address must look like 0x followed by 40 hex characters.");
      return;
    }
    if (!eoa) {
      setError("Connect a wallet first.");
      return;
    }

    // Catch the two silent-breakage failure modes before they become "balance
    // shows 0 and the user has no idea why":
    //
    //   1. Pasted an EOA, not a proxy. The Polymarket *account* is the smart
    //      contract that polymarket.com deploys for the user — it has bytecode
    //      on Polygon. An EOA doesn't. If we accept an EOA, every CLOB call
    //      silently returns zero balance / no positions.
    //
    //   2. Pasted a real proxy, but it doesn't belong to the connected wallet.
    //      The proxy's `owners` array on-chain tells us who can sign for it.
    //      If the connected EOA isn't in there, derived credentials work but
    //      the API returns nothing useful — same silent zero outcome.
    setVerifying(true);
    setError(null);
    try {
      // Step 1: bytecode check (purely client-side, always available).
      if (publicClient) {
        const code = await publicClient.getCode({
          address: trimmed as `0x${string}`,
        });
        const hasBytecode = !!code && code !== "0x";
        if (!hasBytecode) {
          setError(
            "That's a regular wallet, not your Polymarket account. Your account is a smart contract that polymarket.com creates for you — copy that address from polymarket.com → profile → builder settings.",
          );
          return;
        }
      }

      // Step 2: reverse-owner check (server-side, gated on POLYGONSCAN_API_KEY).
      // Fails open when the API key isn't configured on this deployment.
      const ownerLookup = await findProxyOwners(trimmed);
      if (ownerLookup.available && ownerLookup.owners.length > 0) {
        const eoaLc = eoa.toLowerCase();
        const isOwner = ownerLookup.owners.some(
          (o) => o.toLowerCase() === eoaLc,
        );
        if (!isOwner) {
          setError(
            "This Polymarket account doesn't belong to your connected wallet. Either switch to the wallet you sign Polymarket trades with, or paste the account that wallet owns.",
          );
          return;
        }
      }
    } catch {
      // Either check failed (flaky network / RPC). Better to let the user
      // save than to block them on infrastructure noise.
    } finally {
      setVerifying(false);
    }

    writeFunderAddress(eoa, trimmed as `0x${string}`);
    onSaved(trimmed as `0x${string}`);
  }

  // Portal to <body> to escape the TopNav <header>'s containing block —
  // its `backdrop-filter: blur(...)` scopes `position: fixed` to the header,
  // which would mash the dialog into the 49px sticky-nav strip.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-wallet-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border-strong bg-surface p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2
              id="deposit-wallet-title"
              className="text-base font-semibold tracking-tight"
            >
              Almost ready
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Auspex routes orders through your existing Polymarket account.
              Link it once — no funds move into Auspex.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Connected wallet status — reassures the user the wallet is already
            handled and that this isn't asking for a second wallet. */}
        {eoa ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[11px]">
            <Check className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="text-emerald-300">Wallet connected</span>
            <span className="ml-auto font-mono text-foreground/85">
              {eoa.slice(0, 6)}…{eoa.slice(-4)}
            </span>
          </div>
        ) : null}

        {/* Auto-detect success banner. Only shown when we filled the field
            via the on-chain lookup (not when the user pasted it themselves). */}
        {autoDetected && isValid ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px]">
            <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
            <span className="text-accent">
              Found your Polymarket account
            </span>
            <span className="ml-auto text-muted-2">on-chain lookup</span>
          </div>
        ) : null}

        {/* Step 1: paste the account address (or accept the auto-detected one) */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-2">
            <span>Polymarket account address</span>
            {detecting ? (
              <span className="inline-flex items-center gap-1 font-normal normal-case text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                <span>looking it up…</span>
              </span>
            ) : isValid ? (
              <span className="inline-flex items-center gap-1 font-normal normal-case text-emerald-300">
                <Check className="h-3 w-3" aria-hidden="true" />
                <span>looks good</span>
              </span>
            ) : null}
          </div>
          <div className="relative">
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
                setAutoDetected(false);
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder="0xa1b2c3…"
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2.5 pr-20 font-mono text-[12px] text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2",
                isValid
                  ? "border-emerald-400/40 focus:ring-emerald-400/40"
                  : sameAsWallet
                    ? "border-rose-400/40 focus:ring-rose-400/40"
                    : "border-border-strong focus:ring-accent/40",
              )}
            />
            <button
              type="button"
              onClick={pasteFromClipboard}
              disabled={pasting}
              className="absolute right-1 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="h-3 w-3" aria-hidden="true" />
              {pasting ? "Pasting…" : "Paste"}
            </button>
          </div>
          {sameAsWallet ? (
            <p className="mt-1.5 text-[11px] text-rose-300">
              That&apos;s your wallet — we need your Polymarket{" "}
              <em>account</em>, which is a different (smart-contract) address.
            </p>
          ) : error ? (
            <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>
          ) : null}

          <a
            href="https://polymarket.com/settings?tab=builder"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            Open Polymarket → grab my address
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        {/* Bridge prompt — only when we have a valid target so the bridge widget
            gets the right recipient pre-filled. */}
        {isValid ? (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2">
            <div className="text-[11px] text-muted">
              <div className="text-foreground">Need USDC in your account?</div>
              <div className="mt-0.5 text-muted-2">
                Bridge from any chain — Jumper sends USDC straight to your
                account on Polygon.
              </div>
            </div>
            <BridgeButton
              toAddress={trimmed as `0x${string}`}
              variant="secondary"
              label="Bridge"
            />
          </div>
        ) : null}

        {/* New-user lane — visually distinct, no input. */}
        <div className="mt-4 rounded-md border border-border bg-background/40 px-3 py-2.5 text-[12px]">
          <div className="font-medium text-foreground">
            No Polymarket account yet?
          </div>
          <div className="mt-0.5 text-muted-2">
            Free to create. ~60 seconds. Come back and finish here.
          </div>
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-accent hover:underline"
          >
            Create on Polymarket
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={verifying}
            className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!isValid || verifying}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : null}
            {verifying ? "Verifying…" : "Save & start trading"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
