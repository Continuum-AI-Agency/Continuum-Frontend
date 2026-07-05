import { defineConfig, devices } from "@playwright/test";

// Playwright E2E harness for the Continuum Frontend (Next.js on :3000).
// The dev server is auto-started via `bun run dev`; set PLAYWRIGHT_BASE_URL to
// point specs at an already-running deployment instead. Auth-mint prerequisites
// (SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL) are documented in
// e2e/README.md and are only required by specs that call e2e/support/auth.ts.

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
