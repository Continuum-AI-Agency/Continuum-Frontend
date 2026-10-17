import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Jaina's asked-for answer formats in the real chat (`jaina:answer-formats:e2e:bench`): the
// steps block and the two-sided comparison, asked in Spanish on Easy Fit, rendered by this
// Frontend against a Backend that is ALREADY RUNNING (default http://localhost:4002 — this
// config never starts or restarts one). Prod Supabase is pinned before the dev server spawns;
// port 3112 is in the Backend CORS allowlist (3113–3116 are taken by other benches; 3117 is not allowlisted).

loadProdSupabaseEnv();

const PORT = process.env.JAINA_ANSWER_FORMATS_E2E_PORT ?? '3112';
const API_URL = process.env.JAINA_ANSWER_FORMATS_API_URL ?? 'http://localhost:4002';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.JAINA_ANSWER_FORMATS_API_URL = API_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /jaina-answer-formats\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 40 * 60_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    actionTimeout: 30_000,
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/jaina-answer-formats-e2e',
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
