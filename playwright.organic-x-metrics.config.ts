import { defineConfig, devices } from '@playwright/test';

import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Harness for `organic:x:metrics:e2e:bench` — hosted Supabase and the DEPLOYED edges.
//
// loadProdSupabaseEnv() runs here, before the webServer starts, so the Next server is born
// pointed at production (Next never overrides an env var that is already set; .env.local is
// the local stack). reuseExistingServer is off: a foreign server on the port may read local.
// The Metrics tab needs no Backend, so NEXT_PUBLIC_API_URL points at a dead port.

loadProdSupabaseEnv();

const PORT = process.env.ORGANIC_X_METRICS_E2E_PORT ?? '3137';
const baseURL = `http://127.0.0.1:${PORT}`;
// e2e/support/auth.ts scopes the minted session cookie to this host.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /organic-x-metrics\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run dev',
    env: {
      ...(process.env as Record<string, string>),
      NEXT_DIST_DIR: '.next/organic-x-metrics-e2e',
      PORT,
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4497',
      API_URL: 'http://127.0.0.1:4497',
    },
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
