import type { Metadata } from "next";

// Both /wallets pages are client components, so the route title lives here —
// without it they'd inherit the root layout's screener title.
export const metadata: Metadata = {
  title: "Wallets · Auspex",
  description:
    "Look up any Polymarket account by wallet address or ENS and follow its trading activity.",
};

export default function WalletsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
