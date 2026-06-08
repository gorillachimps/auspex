import {
  AssetType,
  Chain,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
  type ApiKeyCreds,
  type BalanceAllowanceResponse,
  type TickSize,
} from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";
import type { ProxyType } from "./polymarketDerive";

/** Map a derived Polymarket account kind to the CLOB signature type its orders
 *  must be signed with. Unknown/missing → POLY_1271 (the deposit-wallet flow),
 *  which is the historical default, so existing links keep working. */
function sigTypeFor(proxyType?: ProxyType): SignatureTypeV2 {
  switch (proxyType) {
    case "proxy":
      return SignatureTypeV2.POLY_PROXY;
    case "safe":
      return SignatureTypeV2.POLY_GNOSIS_SAFE;
    case "deposit":
    default:
      return SignatureTypeV2.POLY_1271;
  }
}

/** Auspex builder code (bytes32). Registered 2026-05-06.
 *  Operator wallet (proxy): 0xb4fb45069b3f0f7c69937ca114849f5a8380da04 */
export const BUILDER_CODE =
  "0x1cc4300fca20eb0449c32d3c56d937d0a46e172d2707a62860b5f5311f2b608b";

export const CLOB_HOST = "https://clob.polymarket.com";
export const POLYMARKET_CHAIN: Chain = Chain.POLYGON;

// Storage prefixes are intentionally frozen at the pre-rebrand value: users
// who saved a deposit wallet or derived L2 creds under the old brand should
// not have to redo onboarding on upgrade. The user-facing event name is
// renamed to the new brand namespace.
const CREDS_STORAGE_PREFIX = "polycrypto.creds.v1.";
const FUNDER_STORAGE_PREFIX = "polycrypto.funder.v1.";
const FUNDER_CHANGE_EVENT = "auspex:funder-changed";

/** ClobClient cannot be constructed in a Server Component / SSR pass — guard it. */
function ensureClient() {
  if (typeof window === "undefined") {
    throw new Error("ClobClient is browser-only");
  }
}

export type ClobSetup = {
  walletClient: WalletClient;
  signerAddress: `0x${string}`;
  funderAddress: `0x${string}`;
  creds: ApiKeyCreds;
};

/** Build a ClobClient configured for V2 + builder code, signing orders with the
 *  signature type that matches the user's account kind (`proxyType`): Safe →
 *  POLY_GNOSIS_SAFE, Magic proxy → POLY_PROXY, Deposit Wallet → POLY_1271.
 *  Defaults to POLY_1271 when the kind is unknown. */
export function buildClobClient({
  walletClient,
  funderAddress,
  creds,
  proxyType,
}: Pick<ClobSetup, "walletClient" | "funderAddress" | "creds"> & {
  proxyType?: ProxyType;
}): ClobClient {
  ensureClient();
  // Defence in depth: the funder must be the smart-contract account proxy, NOT
  // the signing EOA — for every account type the maker is the proxy and the
  // signer is the EOA. A signer==funder pair posts orders the API rejects with
  // "the order signer address has to be the address of the API KEY".
  const signerAddress = walletClient.account?.address;
  if (
    signerAddress &&
    signerAddress.toLowerCase() === funderAddress.toLowerCase()
  ) {
    throw new Error(
      "Funder must be the Polymarket account proxy, not the signing EOA — refusing to construct a ClobClient that would post broken orders.",
    );
  }
  return new ClobClient({
    host: CLOB_HOST,
    chain: POLYMARKET_CHAIN,
    signer: walletClient,
    creds,
    signatureType: sigTypeFor(proxyType),
    funderAddress,
    builderConfig: { builderCode: BUILDER_CODE },
    throwOnError: true,
  });
}

/** Caches creds per (signer, funder) so we only force the user to sign the
 *  L1 derivation message once per session. */
function credsKey(signer: string, funder: string) {
  return `${CREDS_STORAGE_PREFIX}${signer.toLowerCase()}.${funder.toLowerCase()}`;
}

export function readCachedCreds(
  signer: string,
  funder: string,
): ApiKeyCreds | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(credsKey(signer, funder));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.key === "string" &&
      typeof parsed.secret === "string" &&
      typeof parsed.passphrase === "string"
    ) {
      return parsed as ApiKeyCreds;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedCreds(
  signer: string,
  funder: string,
  creds: ApiKeyCreds,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      credsKey(signer, funder),
      JSON.stringify(creds),
    );
  } catch {
    // sessionStorage might be blocked (privacy mode); fail open
  }
}

// Dedupe concurrent derivations across components: every call for the same
// (signer, funder) pair shares one underlying `createOrDeriveApiKey` request
// so the user only ever sees one wallet-sign prompt per session.
const inFlightDerivations = new Map<string, Promise<ApiKeyCreds>>();

/** First-time auth: derive (or re-use) the L2 API key bound to the funder. */
export async function ensureCreds(
  walletClient: WalletClient,
  signerAddress: `0x${string}`,
  funderAddress: `0x${string}`,
  proxyType?: ProxyType,
): Promise<ApiKeyCreds> {
  const cached = readCachedCreds(signerAddress, funderAddress);
  if (cached) return cached;

  const key = `${signerAddress.toLowerCase()}.${funderAddress.toLowerCase()}`;
  const existing = inFlightDerivations.get(key);
  if (existing) return existing;

  const promise = (async () => {
    // IMPORTANT: bootstrap MUST NOT use throwOnError. createOrDeriveApiKey
    // calls createApiKey first; if the user already has a key, the server
    // returns a non-error response with .key empty and the SDK falls back to
    // deriveApiKey. With throwOnError on, a 400 from create throws before the
    // fallback runs and derivation fails for any returning user.
    const bootstrap = new ClobClient({
      host: CLOB_HOST,
      chain: POLYMARKET_CHAIN,
      signer: walletClient,
      signatureType: sigTypeFor(proxyType),
      funderAddress,
    });
    try {
      const creds = await bootstrap.createOrDeriveApiKey();
      if (!creds?.key || !creds?.secret || !creds?.passphrase) {
        throw new Error(
          "Polymarket auth returned empty credentials. Check that your deposit-wallet address is correct and that you've completed onboarding at polymarket.com.",
        );
      }
      writeCachedCreds(signerAddress, funderAddress, creds);
      return creds;
    } finally {
      // release the lock once the derivation settles (success or failure)
      inFlightDerivations.delete(key);
    }
  })();
  inFlightDerivations.set(key, promise);
  return promise;
}

/** Persist the user's deposit-wallet address per-EOA. The address comes from
 *  polymarket.com → settings → Builder Codes → Address (or the proxy created
 *  during MetaMask onboarding). */
export function readFunderAddress(signerAddress: string): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(
      `${FUNDER_STORAGE_PREFIX}${signerAddress.toLowerCase()}`,
    );
    if (!v) return null;
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) return v as `0x${string}`;
    return null;
  } catch {
    return null;
  }
}

export function writeFunderAddress(
  signerAddress: string,
  funder: `0x${string}`,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${FUNDER_STORAGE_PREFIX}${signerAddress.toLowerCase()}`,
      funder,
    );
    // Broadcast so every useClobSession instance picks up the new funder
    // immediately, without waiting for a page reload or wallet change.
    window.dispatchEvent(
      new CustomEvent(FUNDER_CHANGE_EVENT, {
        detail: { signer: signerAddress.toLowerCase(), funder },
      }),
    );
  } catch {
    // ignore
  }
}

export const FUNDER_CHANGED_EVENT = FUNDER_CHANGE_EVENT;

export async function getBalanceAllowance(
  client: ClobClient,
  tokenId?: string,
): Promise<BalanceAllowanceResponse> {
  return client.getBalanceAllowance({
    asset_type: tokenId ? AssetType.CONDITIONAL : AssetType.COLLATERAL,
    token_id: tokenId,
  });
}

/** Approve the Polymarket exchange to pull collateral (or, with `tokenId`,
 *  the named conditional token) from the user's deposit wallet. Sends an
 *  on-chain transaction via the SDK; resolves after confirmation.
 *
 *  Use this in onboarding ("Activate trading") and as an inline recovery
 *  when an order is blocked by zero allowance. The SDK picks a near-max
 *  allowance amount internally. */
export async function updateAllowance(
  client: ClobClient,
  tokenId?: string,
): Promise<void> {
  await client.updateBalanceAllowance({
    asset_type: tokenId ? AssetType.CONDITIONAL : AssetType.COLLATERAL,
    token_id: tokenId,
  });
}

export type PlaceOrderInput = {
  client: ClobClient;
  tokenID: string;
  price: number;
  size: number;
  side: Side;
  tickSize: TickSize;
  negRisk: boolean;
  expirationSeconds?: number;
};

export async function placeLimitOrder({
  client,
  tokenID,
  price,
  size,
  side,
  tickSize,
  negRisk,
  expirationSeconds,
}: PlaceOrderInput) {
  return client.createAndPostOrder(
    {
      tokenID,
      price,
      size,
      side,
      builderCode: BUILDER_CODE,
      ...(expirationSeconds ? { expiration: expirationSeconds } : {}),
    },
    { tickSize, negRisk },
    OrderType.GTC,
  );
}

export type PlaceMarketOrderInput = {
  client: ClobClient;
  tokenID: string;
  /** BUY: USD amount to spend. SELL: shares to sell. */
  amount: number;
  side: Side;
  tickSize: TickSize;
  negRisk: boolean;
};

/** Submit a Fill-and-Kill market order: take whatever the book offers up to
 *  `amount`, cancel the rest. Builder-code-attributed like limit orders. */
export async function placeMarketOrder({
  client,
  tokenID,
  amount,
  side,
  tickSize,
  negRisk,
}: PlaceMarketOrderInput) {
  return client.createAndPostMarketOrder(
    {
      tokenID,
      amount,
      side,
      builderCode: BUILDER_CODE,
    },
    { tickSize, negRisk },
    OrderType.FAK,
  );
}

export { Side, OrderType };

// Set of valid Polymarket tick sizes — the SDK's TickSize type is a string
// union. Re-exported here so order-placing callers can normalize their own
// numeric tickSize (e.g. from the snapshot) into the right string form.
export const TICK_SIZES = ["0.0001", "0.001", "0.01", "0.1"] as const;
export type TickStr = (typeof TICK_SIZES)[number];

/** Normalize a numeric tick size (or null) into the SDK's string form.
 *  Falls back to "0.01" when input is missing or doesn't match a known
 *  tick — almost every Polymarket binary market uses 0.01 anyway. */
export function tickToString(t: number | null | undefined): TickStr {
  if (t == null) return "0.01";
  const s = t.toString();
  return (TICK_SIZES.includes(s as TickStr) ? s : "0.01") as TickStr;
}
