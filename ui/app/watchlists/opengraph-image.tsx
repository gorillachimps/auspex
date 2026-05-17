import { ImageResponse } from "next/og";

export const alt = "Auspex · Watchlists";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #07080b 0%, #0d0f14 60%, #2a1f0a 100%)",
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
              background: "rgba(251,191,36,0.18)",
              color: "#fde68a",
              border: "1px solid rgba(251,191,36,0.4)",
              fontSize: 16,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginLeft: "auto",
            }}
          >
            Watchlists
          </span>
        </div>

        <div
          style={{
            marginTop: 64,
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Your starred</span>
          <span style={{ color: "#fde68a" }}>crypto bets.</span>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 26,
            color: "#bdc2cf",
            lineHeight: 1.4,
            display: "flex",
            maxWidth: 880,
          }}
        >
          Pin the markets you care about. Sortable Δ-to-trigger and Resolution
          Confidence bars. No account, no server — your watchlist lives in your
          browser.
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#bdc2cf",
            fontSize: 18,
          }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(167,139,250,0.15)",
              color: "#c4b5fd",
              border: "1px solid rgba(167,139,250,0.3)",
              fontSize: 14,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1.5,
            }}
          >
            auspex
          </span>
          <span>· crypto bets, sorted by signal</span>
        </div>
      </div>
    ),
    size,
  );
}
