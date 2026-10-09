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

const nextConfig: NextConfig = {
  async headers() {
    // The Content-Security-Policy is set per request in proxy.ts, because it carries a nonce.
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
