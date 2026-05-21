import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // /embed/* is the public embed widget — must be iframable from any
      // origin (Twitter/X cards, Substack, blogs, Discord). CSP
      // frame-ancestors supersedes X-Frame-Options on modern browsers;
      // we set both so older clients and proxies behave too.
      {
        source: "/embed/:slug*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
