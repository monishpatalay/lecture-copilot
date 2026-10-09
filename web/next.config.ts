import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env at the repo root is shared with the worker. On Vercel the file is absent and vars come from the dashboard.
if (existsSync("../.env")) process.loadEnvFile("../.env");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * What the pages may load. Everything is same-origin except lecture media (the public R2 address) and the
 * browser's direct upload to R2's S3 endpoint. Scripts and styles allow inline because Next's hydration
 * data and font styles are inline; a nonce-based policy would be the next step up.
 * Returns null when the storage addresses aren't known at build time: no policy is better than one that
 * blocks the video.
 */
function contentSecurityPolicy(): string | null {
  const media = process.env.R2_PUBLIC_BASE_URL && new URL(process.env.R2_PUBLIC_BASE_URL).origin;
  const account = process.env.R2_ACCOUNT_ID;
  if (!media || !account) return null;
  const dev = process.env.NODE_ENV !== "production"; // the dev server's hot reload needs eval and a websocket
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // blob: lets the upload form read a chosen video's length before sending it
    `media-src 'self' blob: ${media}`,
    `connect-src 'self' https://${account}.r2.cloudflarestorage.com${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    const csp = contentSecurityPolicy();
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS, ...(csp ? [{ key: "Content-Security-Policy", value: csp }] : [])],
      },
    ];
  },
};

export default nextConfig;
