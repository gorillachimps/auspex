// Thin wrapper around @across-protocol/app-sdk for bridging USDC from
// Ethereum / Optimism / Arbitrum / Base into Polygon USDC.e (the collateral
// token Polymarket accepts). Replaces our earlier dependence on LI.FI's
// widget — see HANDOFF.md "Embedded bridge — three structural blockers" for
// the reasoning. Across is EVM-only, ~80 KB tree-shaken, single-hop, and
// fills in under a minute. We do NOT support ETH→Polygon or BSC routes — for
// those, the wallet menu still exposes Jumper as a fallback.

import {
  createAcrossClient,
  type AcrossClient,
  type ExecutionProgress,
  type Quote,
} from "@across-protocol/app-sdk";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import type { Address, Hex } from "viem";
import type { ConfiguredWalletClient } from "@across-protocol/app-sdk";
import {
  ACROSS_API_KEY,
  ACROSS_INTEGRATOR_ID,
  POLYGON_RPC_URL,
} from "./env-client";

// Native USDC on each source chain. Across normalises across native/bridged
// variants on its side; passing the canonical native USDC is the safest input.
export const USDC_BY_CHAIN: Record<number, Address> = {
  [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Polymarket's collateral on Polygon is the *bridged* USDC.e, not native USDC.
// Across recognises this address as a valid destination output token.
export const POLYGON_USDC_E: Address =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

export const POLYGON_CHAIN_ID = polygon.id;

export type SupportedSourceChainId = 1 | 10 | 42161 | 8453;

export const SOURCE_CHAINS: ReadonlyArray<{
  id: SupportedSourceChainId;
  name: string;
}> = [
  { id: base.id as SupportedSourceChainId, name: "Base" },
  { id: arbitrum.id as SupportedSourceChainId, name: "Arbitrum" },
  { id: optimism.id as SupportedSourceChainId, name: "Optimism" },
  { id: mainnet.id as SupportedSourceChainId, name: "Ethereum" },
];

// USDC has 6 decimals on every supported source chain and on USDC.e Polygon.
export const USDC_DECIMALS = 6;

// AcrossClient.create() is documented as a singleton — call it once for the
// lifetime of the page. We use a module-scoped cache rather than React state
// so non-React callers can share the same instance.
let cached: AcrossClient | null = null;

function getClient(): AcrossClient {
  if (cached) return cached;
  cached = createAcrossClient({
    integratorId: ACROSS_INTEGRATOR_ID
      ? (ACROSS_INTEGRATOR_ID as Hex)
      : undefined,
    apiKey: ACROSS_API_KEY || undefined,
    chains: [mainnet, optimism, arbitrum, base, polygon],
    rpcUrls: { [polygon.id]: POLYGON_RPC_URL },
    logLevel: "ERROR",
  });
  return cached;
}

/**
 * Fetch a fresh quote for moving `amountUSDC` (in raw 6-decimal units) from
 * the source chain to USDC.e on Polygon, with the user's Polymarket proxy as
 * the recipient. The returned Quote carries fees, limits, and the deposit
 * blob that `executeBridge` later submits.
 */
export async function bridgeQuote(params: {
  fromChainId: SupportedSourceChainId;
  amountUSDC: bigint;
  recipient: Address;
}): Promise<Quote> {
  const inputToken = USDC_BY_CHAIN[params.fromChainId];
  if (!inputToken) {
    throw new Error(`USDC not configured for chain ${params.fromChainId}`);
  }
  const client = getClient();
  return client.getQuote({
    route: {
      originChainId: params.fromChainId,
      destinationChainId: POLYGON_CHAIN_ID,
      inputToken,
      outputToken: POLYGON_USDC_E,
    },
    inputAmount: params.amountUSDC,
    recipient: params.recipient,
  });
}

/**
 * Run the full approve → deposit → fill sequence for a previously-fetched
 * quote. `onProgress` is called with granular step transitions which the
 * dialog renders as a live status line. The wallet client must be on the
 * origin chain — we pass `forceOriginChain` so wagmi auto-switches if needed.
 */
export async function executeBridge(params: {
  quote: Quote;
  walletClient: ConfiguredWalletClient;
  onProgress?: (progress: ExecutionProgress) => void;
}) {
  const client = getClient();
  return client.executeQuote({
    deposit: params.quote.deposit,
    walletClient: params.walletClient,
    forceOriginChain: true,
    onProgress: params.onProgress,
  });
}

export type { ExecutionProgress, Quote };
