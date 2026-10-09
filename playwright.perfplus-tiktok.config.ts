import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// The Performance+ campaign's TikTok honesty lane on the screen (`perfplus:tiktok:honesty:ui:bench`,
// docs/perfplus-campaign/04-visual-and-platforms.md#tiktok-ads, P2.7): while TikTok Ads is
// unbuilt, every surface that names TikTok must say "not connected" or mean organic — never a
// figure, never an action that implies ads data. Same harness as playwright.perfplus.config.ts —
// prod Supabase pinned before the dev server spawns, one headless browser, its own port and dist
// dir — on port 3111 (in the Backend CORS allowlist; 3110 and 3113 belong to other lanes).
//
// The Recorder envelope is printed by the spec itself; the `list` reporter prints after it, and
// the factory runner scans stdout upward for the last `{...counts...}` line.

loadProdSupabaseEnv();

const PORT = process.env.PERFPLUS_TIKTOK_E2E_PORT ?? '3111';
// `localhost`, not 127.0.0.1: the Backend CORS allowlist (Continuum-Backend/App/cors.ts) names
// http://localhost:3111, and the session cookie domain is derived from this value.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /perfplus-tiktok-honesty\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // The dev server compiles each route on its first hit and the surfaces read live data through
  // the edge functions. Bounded: a hang is a failure, not a wait.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    actionTimeout: 30_000,
    // Off: the lane is ONE long test; the evidence that matters — a screenshot per surface and
    // the Recorder envelope with every TikTok sentence the UI produced — is written by the spec.
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/perfplus-tiktok-e2e',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.e2e.json',
      PORT,
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
