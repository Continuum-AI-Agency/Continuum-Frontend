import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// Harness for `billing:settings:e2e:bench` — Settings → Billing end to end: the real panel,
// the locally served billing-api + stripe-billing-webhook edge functions, local Supabase and
// the Stripe SANDBOX (hosted Checkout + Customer Portal).
//
// Local only, on purpose. `.env.local` is FORCED over whatever the parent process carries:
// `bun run` from the monorepo root loads the root `.env` first and Bun never overrides a set
// var, so without this a root-forwarded run would point the app at production Supabase.
//
// The edge functions are NOT started here. billing-core owns that one process
// (`supabase functions serve --env-file supabase/functions/.env.billing.local --no-verify-jwt`
// from the repo root); a second serve would fight it for the edge-runtime container. The spec
// probes it and refuses to run if it is down.

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
    `[billing-settings] Refusing to run: NEXT_PUBLIC_SUPABASE_URL is "${supabaseUrl || '<unset>'}", ` +
      `expected "${LOCAL_SUPABASE_URL}". This bench creates users, brands and Stripe sandbox ` +
      'customers and must never touch production. Run `bun run supabase:env:local`.',
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[billing-settings] SUPABASE_SERVICE_ROLE_KEY is unset in .env.local.');
}

const PORT = process.env.BILLING_SETTINGS_E2E_PORT ?? '3124';
const baseURL = `http://127.0.0.1:${PORT}`;
// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  outputDir: '.playwright/billing-settings',
  testMatch: /billing-settings\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Stripe-hosted Checkout, a webhook replay and a bounded overview poll in one test.
  timeout: 360_000,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/billing-settings-e2e',
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
