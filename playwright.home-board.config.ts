import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Harness for `home:board:e2e:bench`: production Supabase pinned before the dev server spawns
// (prodEnv refuses any other project), its own dist dir, one worker. The runner exports the prod
// Supabase values into its own environment first (this standalone checkout has no Backend .env);
// they outrank every .env file, in this process and in the dev server it spawns.
//
// Port 3112 (the superseded home-overview bench's): the deployed Backend's CORS allowlist admits
// localhost 3110–3115 only, and the Home's organic week and market radar read the Backend from
// the browser, so a port outside that range would turn both tiles into a CORS error.

loadProdSupabaseEnv();

const PORT = process.env.HOME_BOARD_E2E_PORT ?? '3112';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
// mintSessionBundleForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL, so it has
// to see the same origin the browser will.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /home-board\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Per brand: a first compile of /dashboard, every tile's live read (the Goal tile reads Meta and
  // Google month to date), each expanded sheet, and a first compile of /scale for the Ask bar.
  timeout: 600_000,
  expect: { timeout: 90_000 },
  // Every action is bounded: a click that never becomes actionable fails its step, not the run.
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    // A clean dist every run: Turbopack on this machine has kept serving pre-edit chunks from an
    // old dist, and a browser check against those says nothing about the code in the tree.
    command: 'rm -rf .next/home-board-e2e && bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/home-board-e2e',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY as string,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'https://api.trycontinuum.ai',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
