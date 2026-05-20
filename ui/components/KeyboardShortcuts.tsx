"use client";

import { useEffect, useState } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

type Props = {
  onClearFilters?: () => void;
  hasFilters?: boolean;
};

/**
 * Page-scoped keyboard handler for the screener. Bound to:
 *   - "/"          focus the screener search input
 *   - Esc          blur input, or if idle + filters active, clear them
 *   - "g h"        go to home (screener)
 *   - "g w"        go to watchlists
 *
 * The "?" shortcut and the help modal live in `ShortcutsHelpButton` (mounted
 * in the TopNav) so the help is reachable from every page — keeping that
 * behaviour in one place avoids double-toggling when both components are
 * mounted.
 */
export function KeyboardShortcuts({ onClearFilters, hasFilters }: Props) {
  const [chord, setChord] = useState<string | null>(null);

  useEffect(() => {
    let chordTimeout: ReturnType<typeof setTimeout> | null = null;

    const onKey = (ev: KeyboardEvent) => {
      // Modifier-bearing presses are likely browser shortcuts; let them through.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

      const key = ev.key;
      const typing = isTypingTarget(ev.target);

      // Esc: blur input first; if nothing focused and we have active filters,
      // clear them. (Help-modal Esc is owned by ShortcutsHelpButton.)
      if (key === "Escape") {
        if (typing) {
          (ev.target as HTMLElement).blur();
          ev.preventDefault();
          return;
        }
        if (hasFilters && onClearFilters) {
          onClearFilters();
          ev.preventDefault();
        }
        return;
      }

      if (typing) return;

      if (key === "/") {
        const input =
          document.querySelector<HTMLInputElement>('input[type="search"]');
        if (input) {
          input.focus();
          input.select();
          ev.preventDefault();
        }
        return;
      }

      if (key === "g") {
        setChord("g");
        if (chordTimeout) clearTimeout(chordTimeout);
        chordTimeout = setTimeout(() => setChord(null), 800);
        ev.preventDefault();
        return;
      }

      if (chord === "g") {
        if (key === "h") {
          window.location.href = "/";
          ev.preventDefault();
        } else if (key === "w") {
          window.location.href = "/watchlists";
          ev.preventDefault();
        }
        setChord(null);
        if (chordTimeout) clearTimeout(chordTimeout);
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (chordTimeout) clearTimeout(chordTimeout);
    };
  }, [chord, hasFilters, onClearFilters]);

  if (!chord) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[12px] tabular text-foreground shadow-lg">
      <kbd className="font-mono">{chord}</kbd>
      <span className="ml-1 text-muted-2">…</span>
    </div>
  );
}
