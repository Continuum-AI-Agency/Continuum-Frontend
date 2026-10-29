import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// `paid-widget-google:e2e:bench` — the dashboard's Paid Media Performance widget reading a Google
// account whose result basis is ambiguous, through the real dev server against PRODUCTION
// Supabase and the deployed paid-media-reporting edge. Prod Supabase is pinned (and verified)
// before the dev server spawns. The deployed Backend's CORS allowlist covers 3110–3115, so the
// port defaults to 3114 there; its own dist dir keeps it off every other bench's build.

loadProdSupabaseEnv();

const PORT = process.env.PAID_WIDGET_E2E_PORT ?? '3114';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.trycontinuum.ai';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
// mintSessionBundleForEmail derives the cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /paid-widget-google\.bench\.spec\.ts/,
  outputDir: process.env.PAID_WIDGET_E2E_OUT_DIR ?? 'test-results/paid-widget-google',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 900_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/paid-widget-google-e2e',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: API_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
