// Single source of truth for number/date/time formatting across the app.
// Every formatter here returns a STRING (or a small object with a string
// inside, for cases that need a sign hint for coloring). They all share
// the same input shape — `number | null | undefined` — and return "—"
// for non-finite / null inputs.
//
// Conventions:
//   - Money has two forms: `fmtUSD` (full precision below $1k, no decimals
//     above) and `fmtUSDCompact` ("$1.2k" / "$1.2M" — for tight headers).
//   - Signed money has `fmtUSDSigned` returning {text, sign} for components
//     that color the text, and `fmtUSDSignedText` returning a single string
//     with a leading "+" or "−" for components that just print it.
//   - Share prices have two forms: `fmtPrice` ("$0.423", 3 decimals) for
//     places that show absolute dollar values, and `fmtCents` ("42.3¢") for
//     places that talk about the percentage-implied form.
//   - Quantities (shares, contract sizes) use `fmtShares` with the same
//     k/M abbreviations as `fmtUSDCompact`.
//   - Time relative-to-now has THREE input shapes: a millisecond delta
//     (`fmtAgo`), a unix-seconds timestamp (`fmtAgoUnix`), a unix-millis
//     timestamp (`fmtAgoUnixMs`), and an ISO string (`fmtAgoISO`). All
//     return the same compact "3s / 5m / 2h / 3d / Jun 5" shape.

// ----------------------------------------------------------------------
// Money
// ----------------------------------------------------------------------

const compactUSDIntl = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullUSDIntl = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const wholeUSDIntl = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Full-precision USD. "$1,234.56" for small values, "$1,234" above $1000.
 * Returns "$0.00" for near-zero values and "—" for non-finite / null.
 */
export function fmtUSD(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) < 0.005) return "$0.00";
  if (Math.abs(n) >= 1000) return wholeUSDIntl.format(Math.round(n));
  return fullUSDIntl.format(n);
}

/**
 * Compact USD for tight headers. "$1.2k", "$1.2M", "$123", "$1.23".
 * Negative values get a leading minus sign.
 */
export function fmtUSDCompact(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  if (abs < 0.005) return "$0";
  return `${sign}$${abs.toFixed(2)}`;
}

// Kept for back-compat with existing call sites that still import the
// old name. Prefer fmtUSDCompact in new code.
export const fmtCompactUSD = fmtUSDCompact;

/**
 * Signed USD as { text, sign }. Callers use `sign` to color the cell
 * (1 = positive/emerald, -1 = negative/rose, 0 = neutral/grey).
 * Near-zero values become { text: "$0.00", sign: 0 }.
 */
export function fmtUSDSigned(
  n: number | null | undefined,
): { text: string; sign: -1 | 0 | 1 } {
  if (n == null || !isFinite(n) || Math.abs(n) < 0.005) {
    return { text: "$0.00", sign: 0 };
  }
  return { text: fmtUSD(n), sign: n > 0 ? 1 : -1 };
}

/**
 * Signed USD as a single string with a leading "+" or "−" (real Unicode
 * minus, not hyphen). Useful where the caller doesn't need the sign
 * separately for coloring.
 */
export function fmtUSDSignedText(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || Math.abs(n) < 0.005) return "$0.00";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${fmtUSD(Math.abs(n))}`;
}

// ----------------------------------------------------------------------
// Share prices (0..1 outcome token prices)
// ----------------------------------------------------------------------

/**
 * Share price as dollars with 3 decimals. "$0.423". Use this for places
 * that show the absolute price (order ticket entry, position avg, etc.).
 */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toFixed(3)}`;
}

/**
 * Share price as cents. "42.3¢". Use this for compact rows where the
 * "share price = implied probability" framing is natural.
 */
export function fmtCents(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

// ----------------------------------------------------------------------
// Quantities (shares, sizes)
// ----------------------------------------------------------------------

/**
 * Share/quantity formatting. "1.2M", "1.2k", "123", "1.50".
 */
export function fmtShares(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(2)}`;
}

// ----------------------------------------------------------------------
// Percentages
// ----------------------------------------------------------------------

/**
 * Implied probability percent from a 0..1 share price. "42%", "<1%", ">99%".
 */
export function fmtImpliedPct(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "—";
  const v = p * 100;
  if (v < 1) return "<1%";
  if (v > 99) return ">99%";
  return `${Math.round(v)}%`;
}

/**
 * Signed percent with explicit sign for P&L. "+25.0%", "-3.2%". Returns
 * "—" if the magnitude is below 0.05% (drift below display granularity).
 */
export function fmtPctSigned(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || Math.abs(n) < 0.05) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * Plain percent — accepts a value already in percent units (e.g. 25 = 25%).
 */
export function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

/**
 * Implied-probability change, formatted with a "%" suffix for readability.
 *
 * Math note: the underlying value is a delta in implied probability — i.e.
 * percentage POINTS, not relative percent change. A market moving from
 * 40% → 41% emits 0.01 here and renders as "1%" (one percentage point of
 * implied movement). Strictly that's "1pp" in finance-speak, but "%"
 * reads better for the general audience this UI targets — and 95% of
 * users intuit "the market moved 1% in the YES direction" correctly.
 *
 * Returns {text, sign} so callers can color the cell green/red.
 * Near-zero shows "0%".
 */
export function fmtSignedPP(
  p: number | null | undefined,
): { text: string; sign: -1 | 0 | 1 } | null {
  if (p == null || !isFinite(p)) return null;
  const pp = p * 100;
  if (Math.abs(pp) < 0.05) return { text: "0%", sign: 0 };
  const sign = pp > 0 ? 1 : -1;
  return { text: `${Math.abs(pp).toFixed(pp >= 1 ? 0 : 1)}%`, sign };
}

// ----------------------------------------------------------------------
// Time / age
// ----------------------------------------------------------------------

/** Format a millisecond delta as "3s" / "5m" / "2h" / "3d". */
function ageShort(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/**
 * Compact relative time from a millisecond delta. Use this when you
 * already have a `Date.now() - …` style value. No "ago" suffix.
 */
export function fmtAgo(ms: number): string {
  return ageShort(ms);
}

/**
 * Compact relative time from a millisecond delta WITH "ago" suffix.
 * "3s ago", "5m ago". For very old values, falls back to "Jun 5".
 */
export function fmtAgoWithSuffix(ms: number): string {
  if (ms >= 30 * 86_400_000) {
    return new Date(Date.now() - ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return `${ageShort(ms)} ago`;
}

/**
 * Compact relative time from a unix-seconds timestamp. "3s" / "5m" / "2h"
 * / "3d" / "Jun 5".
 */
export function fmtAgoUnix(unixSec: number): string {
  const ms = Date.now() - unixSec * 1000;
  if (ms >= 30 * 86_400_000) {
    return new Date(unixSec * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return ageShort(ms);
}

/**
 * Compact relative time from a unix-seconds timestamp WITH "ago" suffix.
 * "3s ago" / "5m ago" / "2h ago" / "3d ago" / "Jun 5".
 */
export function fmtAgoUnixWithSuffix(unixSec: number): string {
  const ms = Date.now() - unixSec * 1000;
  if (ms >= 30 * 86_400_000) {
    return new Date(unixSec * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return `${ageShort(ms)} ago`;
}

/**
 * Compact relative time from a unix-millis timestamp.
 */
export function fmtAgoUnixMs(unixMs: number): string {
  return fmtAgoUnix(unixMs / 1000);
}

/** Same as fmtAgoUnixWithSuffix but takes an ISO string. */
export function fmtAgoISO(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!isFinite(t)) return "—";
  const ms = Date.now() - t;
  if (ms < 60_000) return "just now";
  if (ms >= 30 * 86_400_000) {
    return new Date(t).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return `${ageShort(ms)} ago`;
}

/**
 * Days-left until a market closes. Used on column "Closes" / "Closes in"
 * cells on /portfolio and the screener. "5d" / "<1d" / "ended" / "—".
 */
export function fmtCloseIn(end: string | null | undefined): string {
  if (!end) return "—";
  const t = Date.parse(end);
  if (!isFinite(t)) return "—";
  const ms = t - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86_400_000);
  if (d < 1) return "<1d";
  return `${d}d`;
}

/**
 * Time-left in mixed granularity for the screener's "Closes in" cell.
 * "5d" / "23h" / "45m" / "ended" / "—". Different from `fmtCloseIn`
 * because this one drops below a day to hours/minutes.
 */
export function fmtDaysLeft(end: string | null): string {
  if (!end) return "—";
  const t = Date.parse(end);
  if (!isFinite(t)) return "—";
  const ms = t - Date.now();
  if (ms <= 0) return "ended";
  const hours = ms / 3_600_000;
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days === 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

/** Urgency tier for a market's close date. Drives the color of the
 *  "Closes in" cell on the screener and the matching stat on /markets/[slug].
 *
 *    - `ended`   — already past the close date
 *    - `urgent`  — less than 24h to close (red)
 *    - `soon`    — less than 7d to close (amber)
 *    - `later`   — more than 7d out (normal muted)
 *    - `unknown` — no end date on the market record
 */
export function urgencyForEnd(
  end: string | null | undefined,
): "ended" | "urgent" | "soon" | "later" | "unknown" {
  if (!end) return "unknown";
  const t = Date.parse(end);
  if (!isFinite(t)) return "unknown";
  const ms = t - Date.now();
  if (ms <= 0) return "ended";
  const hours = ms / 3_600_000;
  if (hours < 24) return "urgent";
  if (hours < 24 * 7) return "soon";
  return "later";
}

// ----------------------------------------------------------------------
// Source labels (snake_case → Title Case with acronym preservation)
// ----------------------------------------------------------------------

// Hand-tuned labels for sources where snake_case → Title Case isn't enough
// (FDV is an acronym, "t plus 24h" reads cleaner as "@ T+24h", etc.).
const SOURCE_LABELS: Record<string, string> = {
  polymarket_team_judgment: "PM team",
  fdv_t_plus_24h: "FDV @ T+24h",
  arkham_intel_explorer: "Arkham Intel",
};

const ACRONYMS = new Set([
  "fdv",
  "pm",
  "uma",
  "btc",
  "eth",
  "sol",
  "usdc",
  "usdt",
  "ath",
  "atl",
  "api",
]);

function titleCaseSnake(s: string): string {
  return s
    .split("_")
    .map((part) => {
      if (!part) return "";
      if (ACRONYMS.has(part.toLowerCase())) return part.toUpperCase();
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function fmtSourceLabel(source: string | null, pair: string | null) {
  if (!source) return "—";
  if (source === "binance" && pair) return `Binance ${pair}`;
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return titleCaseSnake(source);
}
