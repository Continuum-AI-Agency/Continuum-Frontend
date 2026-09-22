import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// Harness for the UI half of `billing:admin:e2e:bench` — the admin product grid and Contract
// override through the real /admin page, the locally served admin edge functions and local
// Supabase. The root bench (scripts/billing-admin-e2e-bench.ts) seeds the users and brands,
// spawns this run with their ids in the env, and cleans up by id afterwards.
//
// Local only: `.env.local` is FORCED over whatever the parent carries (a root `bun run` loads
// the root `.env`, and Bun never overrides a set var). The edge functions are not started
// here; the root bench probes them before it spawns this.

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

const localEnv = parseEnv(readFileSync(path.join(process.cwd(), '.env.local'), 'utf8'));
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  const value = localEnv[key];
  if (value) process.env[key] = value;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
if (supabaseUrl !== LOCAL_SUPABASE_URL) {
  throw new Error(
    `[billing-admin] Refusing to run: NEXT_PUBLIC_SUPABASE_URL is "${supabaseUrl || '<unset>'}", ` +
      `expected "${LOCAL_SUPABASE_URL}". Run \`bun run supabase:env:local\`.`,
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[billing-admin] SUPABASE_SERVICE_ROLE_KEY is unset in .env.local.');
}

const PORT = process.env.BILLING_ADMIN_E2E_PORT ?? '3127';
const baseURL = `http://127.0.0.1:${PORT}`;
// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  // Concurrent Playwright runs wipe each other's test-results/, so outputs live in tmp.
  outputDir: path.join(tmpdir(), 'continuum-playwright', 'billing-admin'),
  testMatch: /billing-admin\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // A cold /admin compile on a shared machine, then two confirmed writes.
  timeout: 360_000,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/billing-admin-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
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
