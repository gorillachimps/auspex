"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { resolveWallet } from "@/lib/resolveWallet";
import { cn } from "@/lib/cn";

/**
 * Input field that takes a wallet identifier — 0x address (EOA or proxy) or
 * an ENS name — resolves it to a Polymarket proxy address, and navigates to
 * /wallets/<proxy>. Surfaces validation + resolution errors inline.
 */
export function WalletSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Paste a wallet address or ENS name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resolved = await resolveWallet(trimmed);
      if (!resolved) {
        setError(
          "Couldn't recognise that as a Polygon address or ENS name. Try `0x…` or `name.eth`.",
        );
        return;
      }
      router.push(`/wallets/${resolved.proxy}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="0xabc… or name.eth"
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
            className={cn(
              "w-full rounded-md border bg-background px-9 py-2.5 font-mono text-[12px] text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2",
              error
                ? "border-rose-400/40 focus:ring-rose-400/40"
                : "border-border-strong focus:ring-accent/40",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-3 py-2.5 text-[13px] font-semibold text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Look up
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-2">
          EOAs auto-resolve to their Polymarket account. ENS names supported.
        </p>
      )}
    </form>
  );
}
