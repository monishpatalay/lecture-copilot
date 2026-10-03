import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env at the repo root is shared with the worker. On Vercel the file is absent and vars come from the dashboard.
if (existsSync("../.env")) process.loadEnvFile("../.env");

const nextConfig: NextConfig = {};

export default nextConfig;
