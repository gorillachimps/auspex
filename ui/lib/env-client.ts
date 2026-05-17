// Client-side environment helpers. Centralised so we surface clear errors when
// a deploy is missing a required value rather than silently failing at runtime.

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const POLYGON_RPC_URL =
  process.env.NEXT_PUBLIC_POLYGON_RPC_URL ?? "https://polygon-rpc.com";

// Across credentials. Both optional — the SDK works without them; setting
// them credits Auspex for routed volume on across.to's integrator dashboard
// and authenticates against rate-limited endpoints. The API key is a Bearer
// token used client-side by the SDK, so it must be NEXT_PUBLIC_*. Issued by
// Across's integrator team after registering at docs.across.to/tools/integrator-id.
export const ACROSS_INTEGRATOR_ID =
  process.env.NEXT_PUBLIC_ACROSS_INTEGRATOR_ID ?? "";
export const ACROSS_API_KEY = process.env.NEXT_PUBLIC_ACROSS_API_KEY ?? "";

// Optional: drop a Plausible script tag in <head> when this is set. Default
// host is plausible.io's; override for self-hosted instances. No-op otherwise.
export const PLAUSIBLE_DOMAIN =
  process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
export const PLAUSIBLE_SCRIPT_SRC =
  process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC ??
  "https://plausible.io/js/script.js";

export const isPrivyConfigured = PRIVY_APP_ID.length > 0;
export const isPlausibleConfigured = PLAUSIBLE_DOMAIN.length > 0;
