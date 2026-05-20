"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

export type SortDir = "asc" | "desc";
export type Align = "left" | "right";

/**
 * Plain (non-sortable) table header cell. Used for columns that don't
 * sort (e.g. an icon-only "actions" column).
 */
export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-border bg-surface/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * Table cell. Use `align="right"` for numeric columns.
 */
export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-border/70 px-3 py-2 align-middle",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * Sortable table header. Generic over the SortKey enum the parent uses.
 * Manages its own visual state (active chevron, aria-sort, focus ring);
 * the parent only owns the (key, dir) state and a `onClick(key)` handler.
 */
export function SortableTh<K extends string>({
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
  children,
}: {
  sortKey: K;
  current: K;
  dir: SortDir;
  onClick: (k: K) => void;
  align?: Align;
  children: ReactNode;
}) {
  const active = current === sortKey;
  const ariaSort: "ascending" | "descending" | "none" = !active
    ? "none"
    : dir === "asc"
      ? "ascending"
      : "descending";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "border-b border-border bg-surface/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 -mx-1 -my-0.5 rounded px-1 py-0.5 hover:bg-surface-2",
          align === "right" ? "flex-row-reverse" : "",
          active ? "text-foreground" : "text-muted",
        )}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )
        ) : null}
      </button>
    </th>
  );
}

/**
 * Convenience wrapper for the table container styling used across all
 * data views. Adds the overflow-x scroll for narrow viewports, the
 * border, the surface background, and (if `loading`) a thin loading
 * footer.
 */
export function DataTableShell({
  children,
  loading = false,
  footer,
}: {
  children: ReactNode;
  loading?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface/20 scrollbar-thin">
      {children}
      {loading ? (
        <div className="border-t border-border/60 bg-surface-2/30 px-3 py-1.5 text-[10px] text-muted-2">
          Refreshing…
        </div>
      ) : null}
      {footer}
    </div>
  );
}
