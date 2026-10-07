import { defineConfig } from "@playwright/test";

// A few end-to-end checks against a running app with the eval fixture loaded (see .github/workflows/ci.yml).
// Locally: `supabase start`, `pnpm dev`, then `pnpm e2e`.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts or *.test.ts: those belong to Vitest
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    browserName: (process.env.PW_BROWSER as "chromium" | "webkit" | "firefox" | undefined) ?? "chromium",
  },
  webServer: { command: "pnpm start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
});
