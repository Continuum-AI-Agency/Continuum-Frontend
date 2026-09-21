import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// Harness for `billing:gates:fe:bench` — product gates + the onboarding pay step, end to end:
// the real app, local Supabase (billing exposed ⇒ live), the locally served billing-api +
// stripe-billing-webhook edge functions and the Stripe SANDBOX (hosted Checkout).
//
// Local only, on purpose. `.env.local` is FORCED over whatever the parent process carries:
// `bun run` from the monorepo root loads the root `.env` first and Bun never overrides a set
// var, so without this a root-forwarded run would point the app at production Supabase.
//
// The edge functions are NOT started here (one `supabase functions serve` owns the edge-runtime
// container); the spec probes billing-api and refuses to run if it is down.

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
    `[billing-gates] Refusing to run: NEXT_PUBLIC_SUPABASE_URL is "${supabaseUrl || '<unset>'}", ` +
      `expected "${LOCAL_SUPABASE_URL}". This bench creates users, brands and Stripe sandbox ` +
      'customers and must never touch production. Run `bun run supabase:env:local`.',
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[billing-gates] SUPABASE_SERVICE_ROLE_KEY is unset in .env.local.');
}

const PORT = process.env.BILLING_GATES_E2E_PORT ?? '3126';
const baseURL = `http://127.0.0.1:${PORT}`;
// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  // Outside the repo: concurrent Playwright runs wipe each other's test-results/.
  outputDir: path.join(tmpdir(), 'continuum-billing-gates-playwright'),
  testMatch: /billing-gates\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Two onboardings (one through Stripe-hosted Checkout + webhook replay) and a gate sweep.
  timeout: 480_000,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/billing-gates-e2e',
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
