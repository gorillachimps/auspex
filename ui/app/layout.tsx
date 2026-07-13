import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { PlausibleScript } from "@/components/PlausibleScript";
import { SITE_URL } from "@/lib/env-client";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Geist is self-hosted via the `geist` package (local next/font assets) — no
// build-time network fetch, unlike next/font/google. The .variable classes set
// --font-geist-sans / --font-geist-mono, which globals.css already consumes;
// the system-ui chain in globals.css remains as a fallback.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Auspex — crypto bets, sorted by signal",
  description:
    "Crypto prediction markets scored by how close they are to triggering. Distance-to-trigger and Clarity scores at a glance.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <PlausibleScript />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
        {/* Vercel Web Analytics — cookieless page-view counting. Dev/preview
            builds emit debug no-ops; only production deployments report. */}
        <Analytics />
      </body>
    </html>
  );
}
