import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { DeltaBar } from "@/components/DeltaBar";
import { RcBar } from "@/components/RcBar";
import { PositionCard } from "@/components/PositionCard";
import { OrderBookView } from "@/components/OrderBookView";
import { LivePmImpliedStat } from "@/components/LivePmImpliedStat";
import { TradePressureBar } from "@/components/TradePressureBar";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { RecentTradesView } from "@/components/RecentTradesView";
import { TradeSizeDistribution } from "@/components/TradeSizeDistribution";
import { ShareButtons } from "@/components/ShareButtons";
import { DisqusComments } from "@/components/DisqusComments";
import { cn } from "@/lib/cn";
import { getMarketBySlug } from "@/lib/data";
import {
  fmtCompactUSD,
  fmtDaysLeft,
  fmtImpliedPct,
  fmtSignedPP,
  fmtSourceLabel,
  fmtUSD,
} from "@/lib/format";
import { familyMeta, FAMILY_TONE_CLASSES } from "@/lib/families";
import { summarizeRules } from "@/lib/rules";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const row = await getMarketBySlug(slug);
  if (!row) return { title: "Market not found · Auspex" };
  return {
    title: `${row.question} · Auspex`,
    description: summarizeRules(row),
  };
}

export default async function MarketDetailPage({ params }: Props) {
  const { slug } = await params;
  const row = await getMarketBySlug(slug);
  if (!row) notFound();

  const meta = familyMeta(row.family);
  const tone = FAMILY_TONE_CLASSES[meta.tone];

  return (
    <>
      <TopNav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 py-6">
          <a
            href="/"
            className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to screener
          </a>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1",
                  tone,
                )}
              >
                {meta.label}
              </span>
              <span className="text-[12px] text-muted">
                {fmtSourceLabel(row.source, row.pair)}
              </span>
            </div>
            <ShareButtons
              text={buildShareText(row)}
              url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://auspex.to"}/markets/${row.slug}`}
            />
          </div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
            {row.question}
          </h1>

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <LivePmImpliedStat
              tokenYes={row.tokenYes ?? null}
              bestBid={row.bestBid ?? null}
              bestAsk={row.bestAsk ?? null}
              fallbackImpliedYes={row.impliedYes}
            />
            <BigStat
              label="Current state"
              value={
                row.liveState === "live" && row.currentValue != null
                  ? fmtUSD(row.currentValue)
                  : "—"
              }
              hint={row.liveState === "deferred" ? "deferred" : undefined}
            />
            <BigStat
              label="Volume"
              value={fmtCompactUSD(row.volumeTotal)}
              hint={`24h ${fmtCompactUSD(row.volume24h)}`}
            />
            <BigStat
              label="Closes in"
              value={fmtDaysLeft(row.endDate)}
              hint={
                row.endDate ? new Date(row.endDate).toUTCString() : undefined
              }
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card title="Δ to trigger">
              <DeltaBar
                distance={row.distancePct}
                alreadyTriggered={row.alreadyTriggered}
                deferred={row.liveState !== "live"}
              />
              {row.liveState === "live" && row.distancePct != null ? (
                <p className="mt-2 text-[12px] text-muted">
                  Threshold {row.thresholdValue != null ? fmtUSD(row.thresholdValue) : "—"} ·
                  {" "}
                  current {fmtUSD(row.currentValue)} ·
                  {" "}
                  {(row.distancePct * 100).toFixed(2)}% away
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-muted">
                  No live machine-readable trigger for this market.
                </p>
              )}
            </Card>
            <Card title="Resolution Confidence (RC)">
              <RcBar rc={row.rc} />
              <p className="mt-2 text-[12px] text-muted">
                Composite of distance ({"55%"}), time pressure ({"30%"}) and log-volume ({"15%"}). Higher
                means a more legible resolution path.
              </p>
            </Card>
          </div>

          <div className="mt-6">
            <PositionCard market={row} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <TradePressureBar tokenYes={row.tokenYes ?? null} />
            <TradeSizeDistribution
              tokenYes={row.tokenYes ?? null}
              tokenNo={row.tokenNo ?? null}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <OrderBookView
              tokenYes={row.tokenYes ?? null}
              tokenNo={row.tokenNo ?? null}
            />
            <RecentTradesView
              tokenYes={row.tokenYes ?? null}
              tokenNo={row.tokenNo ?? null}
            />
          </div>

          <Card className="mt-6" title="Rule">
            <p className="text-[13px] leading-relaxed text-foreground/90">
              {summarizeRules(row)}
              {row.liveState === "deferred" && row.liveReason ? (
                <span className="ml-2 text-muted">({row.liveReason})</span>
              ) : null}
            </p>
          </Card>

          <div className="mt-6">
            <PriceHistoryChart tokenId={row.tokenYes ?? null} />
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
              <ChangeStat label="1h" value={row.oneHourChange} />
              <ChangeStat label="24h" value={row.oneDayChange} />
              <ChangeStat label="7d" value={row.oneWeekChange} />
              <ChangeStat label="30d" value={row.oneMonthChange} />
            </div>
          </div>

          <div className="mt-6">
            <DisqusComments
              identifier={row.slug}
              title={row.question}
              url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://auspex.to"}/markets/${row.slug}`}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-[12px] text-muted">
            <a
              href={`https://polymarket.com/event/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-border-strong bg-surface px-3 py-1.5 text-foreground hover:bg-surface-2"
            >
              Open on Polymarket <ExternalLink className="h-3 w-3" />
            </a>
            <span className="font-mono text-muted-2">id {row.id}</span>
            <span className="font-mono text-muted-2">slug {row.slug}</span>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function BigStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div className="tabular text-lg font-semibold">{value}</div>
      {hint ? (
        <div className="tabular text-[11px] text-muted">{hint}</div>
      ) : null}
    </div>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-surface/40 p-4",
        className,
      )}
    >
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Build the pre-filled text for share-to-X / Farcaster. Includes the market
 *  question and a short factoid line so a casual viewer can grasp the bet
 *  without clicking through. */
function buildShareText(row: {
  question: string;
  impliedYes: number | null;
  liveState: string;
  distancePct: number | null;
  alreadyTriggered?: boolean | null;
  thresholdValue?: number | null;
  currentValue?: number | null;
}): string {
  const parts: string[] = [row.question];
  if (
    row.liveState === "live" &&
    row.distancePct != null &&
    !row.alreadyTriggered
  ) {
    const pct = (row.distancePct * 100).toFixed(1);
    parts.push(`Δ ${pct}% to trigger.`);
  } else if (row.alreadyTriggered) {
    parts.push("✓ triggered.");
  }
  if (row.impliedYes != null) {
    parts.push(`Implied YES ${(row.impliedYes * 100).toFixed(0)}%.`);
  }
  return parts.join(" ");
}

function ChangeStat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const v = fmtSignedPP(value);
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        Δ {label}
      </span>
      <span className="tabular font-medium">
        {v == null ? (
          <span className="text-muted-2">—</span>
        ) : v.sign === 0 ? (
          <span className="text-muted">0pp</span>
        ) : (
          <span className={v.sign > 0 ? "text-emerald-300" : "text-rose-300"}>
            {v.sign > 0 ? "▲" : "▼"} {v.text}
          </span>
        )}
      </span>
    </div>
  );
}
