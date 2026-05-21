"use client";

import { useState } from "react";
import { Check, Code2, Link as LinkIcon, Share2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  /** The full text to seed the share intent with. Should be short, reads like a tweet. */
  text: string;
  /** Absolute URL the share embeds / links to. */
  url: string;
  /** When provided, enables a "Copy embed code" button that copies an
   *  iframe snippet pointing at /embed/[slug]. Pass the same slug used by
   *  the canonical market detail page. */
  slug?: string;
};

/**
 * Render share buttons for X (Twitter), Farcaster, and a copy-link affordance.
 * Lives on the market detail page next to the page title. The pre-filled text
 * comes from the parent so it can include market-specific stats (e.g. distance
 * to trigger, implied %).
 */
export function ShareButtons({ text, url, slug }: Props) {
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const farcasterHref = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    `${text} ${url}`,
  )}&embeds[]=${encodeURIComponent(url)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — some browsers block on insecure context
    }
  }

  async function copyEmbed() {
    if (!slug) return;
    // 320×180 = 16:9 at "card" size — the canonical embed dimension that
    // drops cleanly into Twitter/X cards and Substack post bodies.
    const embedSrc = `https://auspex.to/embed/${slug}`;
    const snippet = `<iframe src="${embedSrc}" width="320" height="180" frameborder="0" style="border-radius:8px;" title="Live odds on Auspex"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className="hidden text-[10px] uppercase tracking-wider text-muted-2 sm:inline-flex sm:items-center sm:gap-1">
        <Share2 className="h-3 w-3" aria-hidden="true" />
        Share
      </span>
      <a
        href={xHref}
        target="_blank"
        rel="noopener noreferrer"
        className={btnClass}
        title="Share on X"
      >
        <span aria-hidden="true" className="font-bold">X</span>
        <span className="sr-only">Share on X</span>
      </a>
      <a
        href={farcasterHref}
        target="_blank"
        rel="noopener noreferrer"
        className={btnClass}
        title="Share on Farcaster"
      >
        <span aria-hidden="true" className="font-bold">FC</span>
        <span className="sr-only">Share on Farcaster</span>
      </a>
      <button
        type="button"
        onClick={copy}
        className={btnClass}
        title={copied ? "Copied!" : "Copy link"}
      >
        {copied ? (
          <Check className="h-3 w-3" aria-hidden="true" />
        ) : (
          <LinkIcon className="h-3 w-3" aria-hidden="true" />
        )}
        <span className="sr-only">{copied ? "Copied" : "Copy link"}</span>
      </button>
      {slug ? (
        <button
          type="button"
          onClick={copyEmbed}
          className={btnClass}
          title={
            embedCopied
              ? "Embed code copied!"
              : "Copy iframe code — drop the live odds card into any blog, Substack, or HTML page"
          }
        >
          {embedCopied ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Code2 className="h-3 w-3" aria-hidden="true" />
          )}
          <span className="sr-only">
            {embedCopied ? "Embed copied" : "Copy embed code"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

const btnClass = cn(
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-surface text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground",
);
