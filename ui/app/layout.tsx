import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Providers } from "./providers";
import { PlausibleScript } from "@/components/PlausibleScript";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Geist is self-hosted via the `geist` package (local next/font assets) — no
// build-time network fetch, unlike next/font/google. The .variable classes set
// --font-geist-sans / --font-geist-mono, which globals.css already consumes;
// the system-ui chain in globals.css remains as a fallback.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Auspex — crypto bets, sorted by signal",
  description:
    "Crypto prediction markets scored by how close they are to triggering. Distance-to-trigger and Resolution Confidence at a glance.",
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
      </body>
    </html>
  );
}
