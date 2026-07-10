import type { MetadataRoute } from "next";
import { getRawMarkets, getSnapshotMeta } from "@/lib/data";
import { SITE_URL } from "@/lib/env-client";

// Cap the per-market section so the sitemap stays under the 50k-URL guidance and
// only ranks markets with real liquidity / volume.
const MAX_MARKETS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [markets, snapshot] = await Promise.all([
    getRawMarkets(),
    getSnapshotMeta(),
  ]);
  const lastModified = new Date(snapshot.snapshotAt);

  const ranked = [...markets].sort(
    (a, b) => (b.volume_total ?? 0) - (a.volume_total ?? 0),
  );

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
      changeFrequency: "hourly",
      priority: 0.6,
    });
  }

  return pages;
}
