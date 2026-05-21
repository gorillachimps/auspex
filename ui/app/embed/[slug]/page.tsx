import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { EmbedCard } from "@/components/EmbedCard";
import { getMarketBySlug } from "@/lib/data";

// Embed routes opt out of indexing — the canonical URL is the parent
// /markets/[slug] page. The embed view is just a thin compositional
// surface for iframes.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const row = await getMarketBySlug(slug);
  if (!row) return { title: "Market not found · Auspex" };
  return {
    title: `${row.question} · Auspex`,
    description: "Embeddable market widget.",
    robots: { index: false, follow: false },
  };
}

/**
 * Embeddable market widget. Designed to be loaded inside an <iframe> from
 * any third-party site (Twitter/X cards, Substack posts, Discord embeds,
 * blogs). 320×180 (16:9) is the canonical size; the layout reflows up to
 * 480×270 cleanly.
 *
 * What's IN the embed:
 *   - Market question (truncated to 2 lines)
 *   - Live YES / NO odds (subscribed to the Polymarket WS via the parent
 *     EmbedCard client component)
 *   - "Trade on Auspex" CTA — opens auspex.to/markets/[slug] in the
 *     parent frame (target="_top") so trading happens on the full site,
 *     not inside the iframe
 *   - Small Auspex brand mark
 *
 * What's NOT in the embed:
 *   - No order ticket (would be a sub-optimal UX inside a 320×180 iframe)
 *   - No wallet connect prompt (third-party origin can't pass through Privy)
 *   - No analytics tracking (respect the host page's privacy posture)
 *
 * This is the Polymarket Builders distribution mechanism: every embed in
 * the wild that gets clicked sends a user to a builder-attributed flow.
 */
export default async function EmbedPage({ params }: Props) {
  const { slug } = await params;
  const row = await getMarketBySlug(slug);
  if (!row) notFound();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <EmbedCard market={row} />
    </main>
  );
}
