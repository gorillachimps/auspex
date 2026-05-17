import { ImageResponse } from "next/og";
import { getMarkets, getSnapshotMeta } from "@/lib/data";

export const alt = "Auspex — crypto bets sorted by signal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export default async function Image() {
  const [markets, snapshot] = await Promise.all([
    getMarkets(),
    getSnapshotMeta(),
  ]);
  const live = markets.filter((m) => m.liveState === "live").length;
  const total = markets.length;
  const totalVol24h = markets.reduce((s, m) => s + (m.volume24h ?? 0), 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #07080b 0%, #0d0f14 60%, #1a1230 100%)",
          color: "#e6e8ee",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(167,139,250,0.18)",
              border: "1px solid rgba(167,139,250,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 24,
              color: "#c4b5fd",
            }}
          >
            H
          </div>
          <span style={{ display: "flex", fontWeight: 700, fontSize: 32, color: "#e6e8ee" }}>
            Auspex
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(52,211,153,0.15)",
              color: "#a7f3d0",
              border: "1px solid rgba(52,211,153,0.3)",
              fontSize: 16,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginLeft: "auto",
            }}
          >
            0% fees, ever
          </span>
        </div>

        <div
          style={{
            marginTop: 56,
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Crypto markets,</span>
          <span style={{ color: "#a78bfa" }}>sorted by signal.</span>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 26,
            color: "#bdc2cf",
            lineHeight: 1.4,
            display: "flex",
            maxWidth: 920,
          }}
        >
          Read each market against the on-chain or exchange feed it actually
          settles on. Sortable by distance-to-trigger and Resolution Confidence —
          the closest-to-triggering bets float to the top.
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 32,
          }}
        >
          <Stat label="Markets tracked" value={total.toLocaleString()} />
          <Stat label="Live state" value={live.toLocaleString()} />
          <Stat label="24h volume" value={compactUSD.format(totalVol24h)} />
          <Stat
            label="Snapshot"
            value={fmtRelative(snapshot.snapshotAt)}
          />
        </div>
      </div>
    ),
    size,
  );
}

function fmtRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!isFinite(t)) return "—";
  const ms = Date.now() - t;
  if (ms < 5_000) return "just now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: 2,
          color: "#5d6478",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          marginTop: 6,
          fontSize: 40,
          fontWeight: 700,
          color: "#e6e8ee",
        }}
      >
        {value}
      </span>
    </div>
  );
}
