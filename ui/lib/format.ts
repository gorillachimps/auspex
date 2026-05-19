const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numUSD = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function fmtCompactUSD(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  return compactUSD.format(n);
}

export function fmtUSD(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return numUSD.format(Math.round(n));
  return fullUSD.format(n);
}

export function fmtPctFromFraction(p: number | null | undefined, digits = 0) {
  if (p == null || !isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function fmtImpliedPct(p: number | null | undefined) {
  if (p == null || !isFinite(p)) return "—";
  const v = p * 100;
  if (v < 1) return "<1%";
  if (v > 99) return ">99%";
  return `${Math.round(v)}%`;
}

export function fmtSignedPP(p: number | null | undefined) {
  if (p == null || !isFinite(p)) return null;
  const pp = p * 100;
  if (Math.abs(pp) < 0.05) return { text: "0pp", sign: 0 as const };
  const sign = pp > 0 ? 1 : -1;
  return { text: `${Math.abs(pp).toFixed(pp >= 1 ? 0 : 1)}pp`, sign };
}

export function fmtDaysLeft(end: string | null) {
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

// Hand-tuned labels for sources where snake_case → Title Case isn't enough
// (FDV is an acronym, "t plus 24h" reads cleaner as "@ T+24h", etc.). Anything
// not listed falls through to the snake_case → Title Case helper below, which
// also lifts a known acronym set (FDV, USDC, BTC, …) to uppercase.
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
