"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import { Toaster } from "sonner";
import { useState } from "react";
import { isPrivyConfigured, PRIVY_APP_ID } from "@/lib/env-client";
import { wagmiConfig } from "@/lib/wagmi";
import { ClobSessionProvider } from "@/lib/useClobSession";
import { TabTitleBadge } from "@/components/TabTitleBadge";
import { SettlementNotifications } from "@/components/SettlementNotifications";
import { FirstVisitTour } from "@/components/FirstVisitTour";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // When Privy isn't configured, the screener still runs in read-only mode —
  // the trading-related components consult `isPrivyConfigured` and degrade
  // gracefully via the stubbed `useClobSession`.
  if (!isPrivyConfigured) {
    return (
      <QueryClientProvider client={queryClient}>
        <ClobSessionProvider>
          <TabTitleBadge />
          <SettlementNotifications />
          <FirstVisitTour />
          <PwaInstallPrompt />
          {children}
        </ClobSessionProvider>
        <Toaster theme="dark" position="bottom-right" richColors />
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        defaultChain: polygon,
        supportedChains: [polygon, mainnet, optimism, arbitrum, base],
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#a78bfa",
          showWalletLoginFirst: true,
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ClobSessionProvider>
            <TabTitleBadge />
            {children}
          </ClobSessionProvider>
          <Toaster theme="dark" position="bottom-right" richColors />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
