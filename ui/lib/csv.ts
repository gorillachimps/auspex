// Tiny CSV writer for client-side exports. RFC-4180-ish:
//   - Fields containing comma, double-quote, CR, or LF are wrapped in
//     double quotes, with internal double-quotes doubled.
//   - Rows separated by CRLF (Excel/Numbers behave better than with LF-only).
//   - Numbers and booleans serialised via String(); null/undefined become
//     the empty string.
//
// Excel auto-detects UTF-8 if the file starts with a BOM (﻿), so we
// add one in `downloadCsv` below. That keeps non-ASCII market titles
// (e.g. é, →, …) intact when opened in Excel on Windows.

const NEEDS_QUOTING = /[",\r\n]/;

export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(v: CsvCell): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string from a header row and an array of rows. Header is a
 * list of column names; each row is an array of values in the same order.
 * Caller is responsible for ensuring rows are the same length as headers.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Trigger a browser download of the given CSV content with the given
 * filename. Prepends a UTF-8 BOM so Excel correctly decodes non-ASCII
 * characters. No-op in SSR.
 */
export function downloadCsv(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers ignore the download attribute unless the element is in
  // the document; safe to append/remove on the fly.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the blob URL once the click handler has fired.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Build a date-stamped filename like "auspex-positions-20260519.csv". */
export function csvFilename(slug: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `auspex-${slug}-${y}${m}${day}.csv`;
}
