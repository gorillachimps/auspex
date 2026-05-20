"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function SearchBar({ value, onChange }: Props) {
  // Local state for snappy typing; debounce upward sync to nuqs.
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  // Hide the "/" affordance once the user types, focuses the input, or on
  // touch devices where there's no physical keyboard. The CSS-only
  // `peer-focus` / `peer-placeholder-shown` lets us avoid extra state.
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search markets…"
        className="peer w-full rounded-md border border-border-strong bg-surface py-1.5 pl-8 pr-9 text-[13px] text-foreground placeholder:text-muted-2 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
        autoComplete="off"
        spellCheck={false}
      />
      {local ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setLocal("")}
          className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-2 hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 hidden h-4 -translate-y-1/2 select-none items-center rounded border border-border-strong bg-background px-1 font-mono text-[10px] font-medium text-muted-2 peer-focus:opacity-0 sm:inline-flex"
        >
          /
        </kbd>
      )}
    </div>
  );
}
