import type { MetadataRoute } from "next";
import { getRawMarkets, getSnapshotMeta } from "@/lib/data";
import { SITE_URL } from "@/lib/env-client";

// Cap the per-market section so the sitemap stays under the 50k-URL guidance and
// only ranks markets with real liquidity / volume.
// Top-N by volume. History: 5000 → 1000 during the Jul-13 Fluid-CPU crisis
// (per-request rendering made every crawl a lambda render). Week-1 analytics
// then showed organic search is the working acquisition channel (a single
// "will-ethereum-reach-2000" market page pulled ~73 visitors from Google), and
// ISR now serves crawls from cache — so widen to 2500 to grow the ranked query
// surface. Not back to 5000 yet: the rolling 30-day CPU window is still ~75%
// consumed until the launch-week burn ages out (~mid-Aug); revisit then.
const MAX_MARKETS = 2500;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [markets, snapshot] = await Promise.all([
    getRawMarkets(),
    getSnapshotMeta(),
  ]);
  const lastModified = new Date(snapshot.snapshotAt);

  // GSC week-1 evidence (2026-07-24 export): the queries we RANK for are
  // due-diligence searches — "will <token> launch a token…" hit position 1.5,
  // "<token>" DD queries and fdv/public-sale pages rank 4–10 — and the winning
  // markets often have near-ZERO volume ($0–$40), so a pure top-N-by-volume
  // sitemap silently drops the exact pages search rewards. Guarantee the DD
  // families first; fill the rest by volume up to the cap.
  const isDD = (m: (typeof markets)[number]) =>
    m.family === "fdv_after_launch" ||
    m.family === "public_sale" ||
    (m.slug ?? "").includes("launch-a-token");
  const byVolume = (a: (typeof markets)[number], b: (typeof markets)[number]) =>
    (b.volume_total ?? 0) - (a.volume_total ?? 0);
  const guaranteed = markets.filter(isDD).sort(byVolume);
  const rest = markets.filter((m) => !isDD(m)).sort(byVolume);
  const ranked = [...guaranteed, ...rest];

  const pages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/watchlists`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/changelog`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/builder`,
      lastModified,
      changeFrequency: "hourly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/portfolio`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/orders`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.3,
    },
  ];

  for (const m of ranked.slice(0, MAX_MARKETS)) {
    pages.push({
      url: `${SITE_URL}/markets/${m.slug}`,
      lastModified,
      // "daily", not "hourly": the page content crawlers see is ISR-cached and
      // the odds themselves aren't why these pages rank. Hourly hints invited
      // constant re-crawls of 1k dynamic URLs.
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return pages;
}
