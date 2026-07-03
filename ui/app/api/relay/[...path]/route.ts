import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Authenticated pass-through to Polymarket's relayer (gasless on-chain ops).
 *
 * The browser runs @polymarket/builder-relayer-client pointed at THIS route
 * instead of relayer-v2 directly; we attach the builder's relayer credentials
 * server-side so the key never ships to the client. The client does all the
 * signing (Safe / proxy / deposit-wallet EIP-712) with the user's wallet —
 * this proxy only adds auth and forwards.
 *
 * Only the endpoints the RelayClient actually uses are allowed through.
 */
const RELAYER_HOST = "https://relayer-v2.polymarket.com";

const ALLOWED: Record<string, "GET" | "POST"> = {
  nonce: "GET",
  "relay-payload": "GET",
  transaction: "GET",
  transactions: "GET",
  deployed: "GET",
  submit: "POST",
};

async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const key = process.env.RELAYER_API_KEY;
  const address = process.env.RELAYER_API_KEY_ADDRESS;
  if (!key || !address) {
    return NextResponse.json(
      { error: "relayer not configured on this deploy" },
      { status: 503 },
    );
  }

  const { path } = await ctx.params;
  const endpoint = path?.length === 1 ? path[0] : null;

  // Local (non-forwarded) endpoint: which EOA this deploy's relayer key is
  // scoped to. The relayer only accepts submissions FROM the key's own signer
  // ("from X does not match auth Y" otherwise), so the UI uses this to show
  // in-app redemption only to that wallet. The address is public information.
  if (endpoint === "auth-address" && req.method === "GET") {
    return NextResponse.json({ address });
  }

  if (!endpoint || ALLOWED[endpoint] !== req.method) {
    return NextResponse.json({ error: "unsupported endpoint" }, { status: 404 });
  }

  const upstream = `${RELAYER_HOST}/${endpoint}${req.nextUrl.search}`;
  try {
    const resp = await fetch(upstream, {
      method: req.method,
      headers: {
        RELAYER_API_KEY: key,
        RELAYER_API_KEY_ADDRESS: address,
        "content-type": "application/json",
      },
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
    });
    const body = await resp.text();
    return new NextResponse(body, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "relayer unreachable" },
      { status: 502 },
    );
  }
}

export { forward as GET, forward as POST };
