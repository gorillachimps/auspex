"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  createColumnHelper,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { familyMeta, FAMILY_TONE_CLASSES } from "@/lib/families";
import {
  fmtCompactUSD,
  fmtDaysLeft,
  fmtSignedPP,
  fmtSourceLabel,
  fmtUSD,
} from "@/lib/format";
import type { TableRow } from "@/lib/types";
import { DeltaBar } from "./DeltaBar";
import { RcBar } from "./RcBar";
import { PmBar } from "./PmBar";
import { StarToggle } from "./StarToggle";
import { ExpandedRow } from "./ExpandedRow";
import { MobileMarketList } from "./MobileMarketList";
import { Tooltip } from "./Tooltip";

type Props = {
  rows: TableRow[];
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  onClearFilters?: () => void;
};

const columnHelper = createColumnHelper<TableRow>();

export function MarketTable({ rows, sorting, onSortingChange, onClearFilters }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    function onFocus(ev: Event) {
      const id = (ev as CustomEvent<string>).detail;
      // Wait two frames so any filter change in Screener has been committed
      // and the row is in the DOM before we look it up.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const node = document.querySelector(
            `[data-row-id="${CSS.escape(id)}"]`,
          ) as HTMLElement | null;
          if (!node) return;
          node.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlight(id);
          setTimeout(() => {
            setHighlight((cur) => (cur === id ? null : cur));
          }, 1800);
        });
      });
    }
    window.addEventListener("auspex:focus-market", onFocus);
    return () => window.removeEventListener("auspex:focus-market", onFocus);
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "expander",
        header: () => null,
        cell: ({ row }) => {
          const isOpen = expanded.has(row.original.id);
          return (
            <button
              type="button"
              aria-label={isOpen ? "Collapse row" : "Expand row"}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleExpanded(row.original.id);
              }}
              className="grid h-6 w-6 place-items-center rounded text-muted-2 hover:bg-surface-2 hover:text-foreground"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          );
        },
        size: 28,
        enableSorting: false,
      }),
      columnHelper.display({
        id: "star",
        header: () => null,
        cell: ({ row }) => <StarToggle marketId={row.original.id} />,
        size: 32,
        enableSorting: false,
      }),
      columnHelper.accessor("question", {
        id: "market",
        header: "Market",
        cell: ({ row }) => {
          const r = row.original;
          const meta = familyMeta(r.family);
          const tone = FAMILY_TONE_CLASSES[meta.tone];
          return (
            <div className="flex min-w-0 flex-col gap-0.5 py-1">
              <a
                href={`/markets/${r.slug}`}
                onClick={(ev) => ev.stopPropagation()}
                className="truncate text-[13px] font-medium leading-snug text-foreground hover:text-accent hover:underline decoration-dotted underline-offset-2"
                title={r.question}
              >
                {r.question}
              </a>
              <span
                className={cn(
                  "inline-flex w-fit items-center rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ring-1",
                  tone,
                )}
              >
                {meta.short}
              </span>
            </div>
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("impliedYes", {
        id: "implied",
        header: () => (
          <Tooltip
            label="Odds"
            hint="What the market currently thinks the chance of YES is — drawn from the live order book. 50% = a coin flip; 90% = the market is confident it'll resolve YES."
          />
        ),
        cell: ({ getValue }) => <PmBar impliedYes={getValue() as number | null} />,
        sortingFn: numericNullsLast,
        size: 64,
      }),
      columnHelper.accessor((r) => fmtSourceLabel(r.source, r.pair), {
        id: "source",
        header: () => (
          <Tooltip
            label="Settles by"
            hint="The data feed we check to decide the outcome — e.g. Binance spot price, on-chain treasury activity, or Polymarket's own judgment for subjective markets."
          />
        ),
        cell: ({ getValue }) => (
          <span className="text-[12px] text-muted">
            {getValue() as string}
          </span>
        ),
        enableSorting: false,
        size: 110,
      }),
      columnHelper.accessor("currentValue", {
        id: "state",
        header: () => (
          <Tooltip
            label="Right now"
            hint="The live value from the settlement source — current price, treasury balance, etc. Shows — for markets where the outcome can't be auto-checked (subjective markets resolve manually)."
          />
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (r.liveState !== "live" || r.currentValue == null) {
            return <span className="text-[12px] text-muted-2">—</span>;
          }
          const unit = r.currentValueUnit ?? "USD";
          return (
            <span className="tabular text-[12px] text-foreground">
              {unit === "USD" ? fmtUSD(r.currentValue) : `${r.currentValue} ${unit}`}
            </span>
          );
        },
        sortingFn: numericNullsLast,
        size: 96,
      }),
      columnHelper.accessor("distancePct", {
        id: "delta",
        header: () => (
          <Tooltip
            label="Distance"
            hint="How far the live value is from triggering YES. 0% = right at the line, +5% = already above, −10% = needs to fall 10% more. Click to sort closest-to-trigger first."
          />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <DeltaBar
              distance={r.distancePct}
              alreadyTriggered={r.alreadyTriggered}
              deferred={r.liveState !== "live"}
            />
          );
        },
        sortingFn: (a, b) => {
          const av = absOrInfinity(a.original.distancePct);
          const bv = absOrInfinity(b.original.distancePct);
          return av - bv;
        },
        size: 140,
      }),
      columnHelper.accessor("rc", {
        id: "rc",
        header: () => (
          <Tooltip
            label="Clarity"
            hint="How clearly this market will resolve. Higher = cleaner path to YES or NO. Mixes how close we are to triggering, how soon it closes, and how much volume it's seen. Only scored for markets we can auto-check."
          />
        ),
        cell: ({ getValue }) => <RcBar rc={getValue() as number | null} />,
        sortingFn: numericNullsLast,
        size: 72,
      }),
      columnHelper.accessor("endDate", {
        id: "days",
        header: () => (
          <Tooltip
            label="Closes in"
            hint="Days until trading ends for this market. Click to sort by closing date — ending soonest first."
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular text-[12px] text-muted">
            {fmtDaysLeft(getValue() as string | null)}
          </span>
        ),
        sortingFn: (a, b) => {
          const at = Date.parse(a.original.endDate ?? "") || Number.POSITIVE_INFINITY;
          const bt = Date.parse(b.original.endDate ?? "") || Number.POSITIVE_INFINITY;
          return at - bt;
        },
        size: 80,
      }),
      columnHelper.accessor("oneDayChange", {
        id: "delta24h",
        header: () => (
          <Tooltip
            label="24h move"
            hint="How the odds shifted in the last 24 hours, in percentage points. ▲ 5pp = went up 5%; ▼ 2pp = went down 2%. Click to sort by biggest movers."
            align="end"
          />
        ),
        cell: ({ getValue }) => {
          const v = fmtSignedPP(getValue() as number | null);
          if (!v) return <span className="text-[12px] text-muted-2">—</span>;
          if (v.sign === 0) return <span className="tabular text-[12px] text-muted">0pp</span>;
          return (
            <span
              className={cn(
                "tabular text-[12px] font-medium",
                v.sign > 0 ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {v.sign > 0 ? "▲" : "▼"} {v.text}
            </span>
          );
        },
        sortingFn: (a, b) => {
          const av = a.original.oneDayChange ?? 0;
          const bv = b.original.oneDayChange ?? 0;
          return Math.abs(av) - Math.abs(bv);
        },
        size: 64,
      }),
      columnHelper.accessor("volume24h", {
        id: "volume24h",
        header: () => (
          <Tooltip
            label="24h volume"
            hint="Total dollar value traded on this market in the last 24 hours. Click to sort by busiest markets."
            align="end"
          />
        ),
        cell: ({ getValue }) => (
          <span className="tabular text-[12px] text-muted">
            {fmtCompactUSD(getValue() as number)}
          </span>
        ),
        size: 72,
      }),
      columnHelper.display({
        id: "trade",
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          const tradable = !!r.tokenYes && !!r.tokenNo;
          const open = (outcome: "yes" | "no") => {
            if (typeof window === "undefined" || !tradable) return;
            window.dispatchEvent(
              new CustomEvent("auspex:open-ticket", {
                detail: { id: r.id, outcome },
              }),
            );
          };
          return (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                disabled={!tradable}
                aria-label={`Buy YES ${r.question}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  open("yes");
                }}
                className="rounded-md border border-emerald-400/30 bg-emerald-500/5 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={!tradable}
                aria-label={`Buy NO ${r.question}`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  open("no");
                }}
                className="rounded-md border border-rose-400/30 bg-rose-500/5 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                No
              </button>
            </div>
          );
        },
        size: 96,
        enableSorting: false,
      }),
    ],
    [expanded],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalCols = table.getAllLeafColumns().length;

  return (
    <>
      <div className="md:hidden">
        <MobileMarketList
          rows={rows}
          sorting={sorting}
          onClearFilters={onClearFilters}
        />
      </div>
      <div
        ref={tableContainerRef}
        className="hidden overflow-x-auto scrollbar-thin md:block"
      >
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const isSortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const sortHandler = header.column.getToggleSortingHandler();
                const ariaSort =
                  sorted === "asc"
                    ? "ascending"
                    : sorted === "desc"
                      ? "descending"
                      : isSortable
                        ? "none"
                        : undefined;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={ariaSort}
                    style={{ width: header.getSize() }}
                    className={cn(
                      "border-b border-border bg-surface/40 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted",
                      isSortable && "cursor-pointer select-none hover:text-foreground",
                    )}
                    role={isSortable ? "button" : undefined}
                    tabIndex={isSortable ? 0 : undefined}
                    onClick={isSortable ? sortHandler : undefined}
                    onKeyDown={
                      isSortable
                        ? (ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              sortHandler?.(ev);
                            }
                          }
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {isSortable ? (
                          sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )
                        ) : null}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const id = row.original.id;
            const isOpen = expanded.has(id);
            const isHot = highlight === id;
            return (
              <Fragment key={row.id}>
                <tr
                  data-row-id={id}
                  className={cn(
                    "group border-b border-border transition-colors",
                    isHot ? "bg-accent/15" : "hover:bg-surface/50",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="border-b border-border/70 px-3 py-1.5 align-middle"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {isOpen ? (
                  <ExpandedRow row={row.original} colSpan={totalCols} />
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {table.getRowModel().rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted">
          <span>No markets match the current filter.</span>
          {onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-md border border-border-strong bg-surface px-3 py-1 text-[12px] font-medium text-foreground hover:bg-surface-2"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
      </div>
    </>
  );
}

function numericNullsLast(a: Row<TableRow>, b: Row<TableRow>, columnId: string) {
  const av = a.getValue(columnId) as number | null;
  const bv = b.getValue(columnId) as number | null;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function absOrInfinity(n: number | null) {
  if (n == null || !isFinite(n)) return Number.POSITIVE_INFINITY;
  return Math.abs(n);
}
