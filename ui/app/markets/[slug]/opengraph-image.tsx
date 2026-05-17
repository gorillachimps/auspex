import { ImageResponse } from "next/og";
import { getMarketBySlug } from "@/lib/data";
import { familyMeta } from "@/lib/families";
import {
  fmtCompactUSD,
  fmtDaysLeft,
  fmtImpliedPct,
  fmtUSD,
} from "@/lib/format";
import { summarizeRules } from "@/lib/rules";

export const alt = "Auspex market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FAMILY_TONE_HEX: Record<string, { bg: string; fg: string }> = {
  violet: { bg: "rgba(167,139,250,0.18)", fg: "#c4b5fd" },
  sky: { bg: "rgba(56,189,248,0.18)", fg: "#bae6fd" },
  amber: { bg: "rgba(251,191,36,0.18)", fg: "#fde68a" },
  emerald: { bg: "rgba(52,211,153,0.18)", fg: "#a7f3d0" },
  rose: { bg: "rgba(248,113,113,0.18)", fg: "#fecaca" },
  zinc: { bg: "rgba(161,161,170,0.18)", fg: "#e4e4e7" },
  neutral: { bg: "rgba(244,244,245,0.10)", fg: "#fafafa" },
};

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getMarketBySlug(slug);

  if (!row) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#07080b",
            color: "#e6e8ee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            fontFamily: "sans-serif",
          }}
        >
          Market not found
        </div>
      ),
      size,
    );
  }

  const meta = familyMeta(row.family);
  const tone = FAMILY_TONE_HEX[meta.tone] ?? FAMILY_TONE_HEX.neutral;
  const implied = fmtImpliedPct(row.impliedYes);
  const summary = summarizeRules(row);
  const distancePct =
    row.liveState === "live" && row.distancePct != null
      ? row.distancePct * 100
      : null;
  const closeness =
    distancePct != null ? Math.max(0, Math.min(100, 100 - Math.abs(distancePct))) : 0;
  const triggered = row.alreadyTriggered === true;

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
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(167,139,250,0.18)",
              border: "1px solid rgba(167,139,250,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c4b5fd",
              fontWeight: 800,
              fontSize: 20,
            }}
          >
            H
          </div>
          <span style={{ display: "flex", fontWeight: 700, color: "#e6e8ee" }}>
            Auspex
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.fg}40`,
              fontSize: 18,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1.5,
            }}
          >
            {meta.label}
          </span>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          {row.question}
        </div>

        <div
          style={{
            marginTop: 32,
            fontSize: 24,
            color: "#bdc2cf",
            lineHeight: 1.4,
            display: "flex",
            maxWidth: "100%",
          }}
        >
          {summary.length > 220 ? summary.slice(0, 217) + "…" : summary}
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
          <Stat label="PM implied" value={implied} />
          <Stat
            label="Current state"
            value={
              row.liveState === "live" && row.currentValue != null
                ? fmtUSD(row.currentValue)
                : "—"
            }
          />
          <Stat label="Closes" value={fmtDaysLeft(row.endDate)} />
          <Stat label="Volume" value={fmtCompactUSD(row.volumeTotal)} />
        </div>

        <div
          style={{
            marginTop: 24,
            height: 28,
            width: "100%",
            borderRadius: 10,
            background: "rgba(63,63,70,0.5)",
            border: "1px solid rgba(63,63,70,0.7)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
          }}
        >
          {triggered ? (
            <div
              style={{
                width: "100%",
                background: "rgba(52,211,153,0.4)",
                color: "#a7f3d0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              ✓ TRIGGERED
            </div>
          ) : distancePct == null ? (
            <div
              style={{
                width: "100%",
                color: "#8a91a3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 18,
              }}
            >
              No live trigger
            </div>
          ) : (
            <>
              <div
                style={{
                  width: `${closeness}%`,
                  background:
                    distancePct >= 0
                      ? "rgba(52,211,153,0.45)"
                      : "rgba(248,113,113,0.45)",
                  display: "flex",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "#fafafa",
                }}
              >
                {distancePct >= 0 ? "+" : "−"}
                {Math.abs(distancePct).toFixed(distancePct > 100 ? 0 : 1)}% to trigger
              </div>
            </>
          )}
        </div>
      </div>
    ),
    size,
  );
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
          marginTop: 4,
          fontSize: 36,
          fontWeight: 700,
          color: "#e6e8ee",
        }}
      >
        {value}
      </span>
    </div>
  );
}
