import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Providers } from "./providers";
import { PlausibleScript } from "@/components/PlausibleScript";
import "./globals.css";

// next/font/google requires outbound network at build/dev time. globals.css
// already provides a system-font fallback chain via var(--font-geist-sans, …),
// so we omit the Google import here. To re-enable Geist on Vercel, swap this
// for `import { Geist, Geist_Mono } from "next/font/google"` and reinstate the
// className wiring.

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
    <html lang="en" className="h-full antialiased">
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
