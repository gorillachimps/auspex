"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Sparkles,
  UserPlus,
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

const POLYMARKET_URL = "https://polymarket.com";

/**
 * Links the connected wallet to the user's Polymarket account (the
 * smart-contract proxy that holds USDC). Auspex can't safely create that
 * proxy itself — calling Polymarket's factory with our own salt would deploy
 * a wallet their backend doesn't recognise (lost-funds trap) — so this dialog
 * makes the *legitimate* path feel as close to in-app as possible:
 *
 *   1. On open we auto-detect the proxy from the EOA (on-chain log lookup).
 *      Returning Polymarket users see "Found your account → Start trading"
 *      with nothing to paste.
 *   2. New users get a single primary "Create your free account" button. After
 *      they create it on Polymarket and tab back, a background poll detects the
 *      brand-new proxy automatically and flips the dialog to the found state —
 *      they never copy or paste an address.
 *   3. Manual paste is a demoted fallback for the rare edge cases.
 *
 * The save path keeps two safety checks (bytecode = real proxy; reverse-owner
 * = belongs to this wallet) so a wrong address can't silently 0-balance them.
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
  /** True after the user clicks "Create account" — drives the background
   *  poll that detects their freshly-created proxy when they tab back. */
  const [awaitingCreate, setAwaitingCreate] = useState(false);
  const publicClient = usePublicClient({ chainId: polygon.id });
  /** Filled by auto-detect (vs typed/pasted) → drives the "we found it" copy. */
  const [autoDetected, setAutoDetected] = useState(false);
  /** Outcome of the one-shot auto-detect, so the not-found view can offer
   *  "paste it / create one" instead of falsely asserting "you have no
   *  account". "idle" until the lookup resolves without a proxy. */
  const [detectOutcome, setDetectOutcome] = useState<
    "idle" | "none" | "unavailable"
  >("idle");
  const detectedFor = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef, "button");

  // Validity (computed before effects so both can read it).
  const trimmed = value.trim();
  const looksValid = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const sameAsWallet =
    looksValid && trimmed.toLowerCase() === (eoa ?? "").toLowerCase();
  const isValid = looksValid && !sameAsWallet;

  useEffect(() => {
    if (!open) return;
    setValue(currentFunder ?? "");
    setError(null);
    setAutoDetected(false);
    setAwaitingCreate(false);
    setDetectOutcome("idle");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, currentFunder, onClose]);

  // One-shot auto-detect on open (returning users).
  useEffect(() => {
    if (!open || !eoa) return;
    if (detectedFor.current === eoa) return;
    if (currentFunder) return;
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
        } else {
          // Couldn't find one for this wallet (or couldn't check). Record which
          // so the not-found view shows the right, non-accusatory copy.
          setDetectOutcome(
            res.status === "unavailable" ? "unavailable" : "none",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, eoa, currentFunder, value]);

  // Background poll while waiting for the user to finish creating their
  // account on Polymarket. Polls every 5s AND immediately on window refocus
  // (the moment they tab back). Detecting their new proxy flips us to the
  // found state with nothing for them to copy.
  useEffect(() => {
    if (!open || !awaitingCreate || !eoa || isValid) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      const res = await findPolymarketProxy(eoa!);
      if (cancelled) return;
      if (res.proxy) {
        setValue(res.proxy);
        setAutoDetected(true);
        setAwaitingCreate(false);
        setError(null);
        return;
      }
      timer = setTimeout(poll, 5000);
    }
    function onFocus() {
      poll();
    }

    poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [open, awaitingCreate, eoa, isValid]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

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
    // shows 0 and the user has no idea why": (1) pasted an EOA not a proxy
    // (no bytecode); (2) a real proxy that the connected wallet doesn't own.
    setVerifying(true);
    setError(null);
    try {
      if (publicClient) {
        const code = await publicClient.getCode({
          address: trimmed as `0x${string}`,
        });
        const hasBytecode = !!code && code !== "0x";
        if (!hasBytecode) {
          setError(
            "That's a regular wallet, not your Polymarket account. Your account is a smart contract Polymarket creates for you — copy that address from polymarket.com → profile → builder settings.",
          );
          return;
        }
      }
      const ownerLookup = await findProxyOwners(trimmed);
      if (ownerLookup.available && ownerLookup.owners.length > 0) {
        const eoaLc = eoa.toLowerCase();
        const isOwner = ownerLookup.owners.some(
          (o) => o.toLowerCase() === eoaLc,
        );
        if (!isOwner) {
          setError(
            "This Polymarket account doesn't belong to your connected wallet. Switch to the wallet you sign Polymarket trades with, or paste the account that wallet owns.",
          );
          return;
        }
      }
    } catch {
      // Infra noise (flaky RPC / API) — let the user proceed rather than block.
    } finally {
      setVerifying(false);
    }

    writeFunderAddress(eoa, trimmed as `0x${string}`);
    onSaved(trimmed as `0x${string}`);
  }

  const walletChip = eoa ? `${eoa.slice(0, 6)}…${eoa.slice(-4)}` : "";

  // The input block is shared between the manual fallback (new-user lane) and
  // the "use a different account" affordance (found state).
  const addressInput = (
    <div>
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
          placeholder="0xa1b2c3… (your Polymarket account address)"
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2.5 pr-20 font-mono text-[12px] text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2",
            sameAsWallet
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
          That&apos;s your wallet — we need your Polymarket <em>account</em>,
          which is a different (smart-contract) address.
        </p>
      ) : error ? (
        <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>
      ) : null}
      <a
        href="https://polymarket.com/settings?tab=builder"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
      >
        Where do I find this?
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );

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
              {isValid ? "You're ready to trade" : "Connect your Polymarket account"}
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Auspex places your bets on Polymarket. You trade through your own
              Polymarket account — it holds your funds, Auspex never does.
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

        {/* Connected wallet ✓ */}
        {eoa ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[11px]">
            <Check className="h-3 w-3 shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="text-emerald-300">Wallet connected</span>
            <span className="ml-auto font-mono text-foreground/85">{walletChip}</span>
          </div>
        ) : null}

        {detecting && !isValid ? (
          /* ── Detecting ─────────────────────────────────────────────── */
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-3 text-[12px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            Checking for your Polymarket account…
          </div>
        ) : isValid ? (
          /* ── Found ─────────────────────────────────────────────────── */
          <>
            <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-3">
              <div className="flex items-center gap-2 text-[12px]">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="font-medium text-accent">
                  {autoDetected
                    ? "Found your Polymarket account"
                    : "Polymarket account"}
                </span>
                <span className="ml-auto font-mono text-[11px] text-foreground/85">
                  {trimmed.slice(0, 6)}…{trimmed.slice(-4)}
                </span>
              </div>
              {autoDetected ? (
                <p className="mt-1 text-[11px] text-muted-2">
                  Detected on-chain from your connected wallet — nothing to copy.
                </p>
              ) : null}
            </div>

            {/* Need USDC? Bridge straight into the detected account. */}
            <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2">
              <div className="text-[11px] text-muted">
                <div className="text-foreground">Need USDC to trade?</div>
                <div className="mt-0.5 text-muted-2">
                  Bridge from any chain straight into your account.
                </div>
              </div>
              <BridgeButton
                toAddress={trimmed as `0x${string}`}
                variant="secondary"
                label="Bridge"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setValue("");
                setAutoDetected(false);
              }}
              className="mt-2 text-[11px] text-muted-2 hover:text-foreground"
            >
              Not this account? Use a different one
            </button>
          </>
        ) : (
          /* ── Not auto-detected ─────────────────────────────────────────
             Never assert "you have no account": auto-detect can't see every
             Polymarket proxy type (e.g. MetaMask Safe accounts) and may have
             simply been unable to run. Lead with the existing-account paste
             path; offer create as a clearly secondary option. */
          <>
            <div className="mt-4 rounded-md border border-border bg-background/40 p-3">
              <div className="text-[13px] font-medium text-foreground">
                {detectOutcome === "unavailable"
                  ? "Couldn’t auto-detect your account"
                  : "Already have a Polymarket account?"}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-2">
                {detectOutcome === "unavailable"
                  ? "Auto-detect couldn’t run just now. Paste your Polymarket account address below — or create one if you’re new."
                  : "Paste its address below. It’s the 0x… account address Polymarket shows under your profile — the smart contract that holds your USDC, not your wallet address."}
              </div>
              <div className="mt-3">{addressInput}</div>
            </div>

            {/* New to Polymarket — secondary path. */}
            <div className="mt-3 rounded-md border border-border bg-background/40 p-3">
              <div className="text-[12px] text-muted-2">
                New to Polymarket? It’s free and takes about a minute — create
                it, then tab back and we’ll detect it automatically.
              </div>
              <button
                type="button"
                onClick={() => {
                  setAwaitingCreate(true);
                  window.open(POLYMARKET_URL, "_blank", "noopener,noreferrer");
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/25"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Create my free account
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>

              {awaitingCreate ? (
                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-accent">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Waiting for your new account — finish on Polymarket and tab
                  back here.
                </div>
              ) : null}
            </div>
          </>
        )}

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
            {verifying ? "Verifying…" : "Start trading"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
