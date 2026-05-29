import type { NextConfig } from "next";

// Headers shared by every non-embed route. frame-ancestors 'self' + the
// legacy X-Frame-Options stop any third-party origin from iframing the app
// to clickjack the wallet-signing surfaces (order submit, close-all, bridge
// approve). nosniff/HSTS/Referrer-Policy are baseline hardening.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Everything EXCEPT /embed/* gets strict frame protection. The negative
      // lookahead is essential: if /embed also matched this block it would
      // receive two conflicting CSP frame-ancestors headers, and browsers
      // enforce the intersection ('self' wins) — which would silently break
      // the public embed widget. So embed is carved out here and handled
      // by its own block below.
      {
        source: "/((?!embed/).*)",
        headers: SECURITY_HEADERS,
      },
      // /embed/* is the public embed widget — must be iframable from any
      // origin (X cards, Substack, blogs, Discord). Allow framing, but keep
      // the non-frame hardening headers.
      {
        source: "/embed/:slug*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
