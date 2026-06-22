import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";

/**
 * MoonPay fiat on-ramp: returns a signed buy-widget URL that funds a SPECIFIC
 * Polymarket account address with USDC on Polygon (card / Apple Pay → USDC,
 * provider-handled KYC). The destination address is signed into the URL so the
 * user can't redirect funds — the whole point of doing this server-side.
 *
 * Activation is env-gated and SANDBOX-first:
 *   - NEXT_PUBLIC_MOONPAY_PUBLISHABLE_KEY  (pk_… — also gates the client button)
 *   - MOONPAY_SECRET_KEY                   (sk_… — server only, never shipped)
 *   - MOONPAY_ENV=live                     (defaults to sandbox until set)
 * Until the keys are set this returns 503 and the UI hides the card option, so
 * shipping it dark is safe. MUST be sandbox-verified (address locked, funds land
 * at the proxy) before flipping MOONPAY_ENV=live.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pk = process.env.NEXT_PUBLIC_MOONPAY_PUBLISHABLE_KEY;
  const sk = process.env.MOONPAY_SECRET_KEY;
  if (!pk || !sk) {
    return NextResponse.json(
      { error: "Card on-ramp not configured on this deployment." },
      { status: 503 },
    );
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "A valid destination address is required." },
      { status: 400 },
    );
  }
  const amount = req.nextUrl.searchParams.get("amount");

  const live = process.env.MOONPAY_ENV === "live";
  const url = new URL(
    live ? "https://buy.moonpay.com" : "https://buy-sandbox.moonpay.com",
  );
  url.searchParams.set("apiKey", pk);
  // Native USDC on Polygon. Polymarket's Collateral Onramp wraps either USDC or
  // USDC.e into pUSD, so the variant doesn't matter for crediting.
  url.searchParams.set("currencyCode", "usdc_polygon");
  url.searchParams.set("walletAddress", address);
  // Show the destination read-only — signed below so it can't be edited.
  url.searchParams.set("showWalletAddressForm", "false");
  if (amount && /^[0-9]+(\.[0-9]+)?$/.test(amount)) {
    url.searchParams.set("baseCurrencyAmount", amount);
  }

  // MoonPay requires the query string signed with the secret key whenever
  // walletAddress is passed (this is what locks the destination). Compute the
  // HMAC over the query BEFORE appending the signature param.
  const signature = createHmac("sha256", sk).update(url.search).digest("base64");
  url.searchParams.set("signature", signature);

  return NextResponse.json({ url: url.toString() });
}
