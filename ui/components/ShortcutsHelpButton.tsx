"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

// The single source of truth for the global shortcut list. KeyboardShortcuts
// in Screener.tsx mirrors these — when adding shortcuts there, also add the
// row here so users can see what they can press.
const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["/"], label: "Focus search" },
  { keys: ["Esc"], label: "Clear filters / blur input" },
  { keys: ["g", "h"], label: "Go to screener home" },
  { keys: ["g", "w"], label: "Go to watchlists" },
  { keys: ["?"], label: "Show / hide this help" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Renders a "?" icon button in the top nav. Clicking it (or pressing the `?`
 * key from anywhere outside an input) opens a modal listing the available
 * keyboard shortcuts. Owns the modal so the help is reachable from every
 * page, not only the screener.
 *
 * The per-page KeyboardShortcuts component (currently on the screener)
 * handles the other shortcuts — focus search, clear filters, chord nav.
 * It does NOT handle `?`; that's owned here to avoid double-toggling.
 */
export function ShortcutsHelpButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "Escape" && open) {
        setOpen(false);
        ev.preventDefault();
        // Stop other Esc listeners (e.g. the screener's clear-filters) from
        // firing on the same press — closing the modal is the user's intent.
        ev.stopImmediatePropagation();
        return;
      }
      if (ev.key === "?" && !isTypingTarget(ev.target)) {
        setOpen((v) => !v);
        ev.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (press ?)"
        className="hidden h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-foreground sm:grid"
      >
        <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border-strong bg-surface p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="shortcuts-title" className="text-sm font-semibold tracking-tight">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid h-6 w-6 place-items-center rounded text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1.5 text-[12px]">
              {SHORTCUTS.map((s) => (
                <li key={s.keys.join("+")} className="flex items-center justify-between">
                  <span className="text-foreground/80">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="rounded border border-border-strong bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-muted-2">
              Press{" "}
              <kbd className="rounded border border-border-strong bg-background px-1 font-mono">
                Esc
              </kbd>{" "}
              to close.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
