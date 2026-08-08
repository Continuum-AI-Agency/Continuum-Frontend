import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Playwright E2E harness for the Continuum Frontend (Next.js on :3000).
// The dev server is auto-started via `bun run dev`; set PLAYWRIGHT_BASE_URL to
// point specs at an already-running deployment instead. Auth-mint prerequisites
// (SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL) are documented in
// e2e/README.md and are only required by specs that call e2e/support/auth.ts.

// Playwright runs its workers under node, so Bun's automatic .env loading never
// reaches them — auth-mint specs saw an empty process.env and failed on the
// first requireEnv. Load the same files Next itself loads, with Next's own
// precedence (.env.local over .env), so the app under test and the specs always
// resolve to the same Supabase project. Real shell env still wins over both.
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const webServerPort = new URL(baseURL).port;

// Only forward keys that are actually set, so an unset one falls through to the
// dev server's own .env resolution instead of being pinned to "undefined".
const supabaseTarget = Object.fromEntries(
  (
    [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ] as const
  )
    .map((key) => [key, process.env[key]])
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run dev',
    // Forward the resolved Supabase target to the app. Without this, overriding
    // NEXT_PUBLIC_SUPABASE_URL only redirects the spec: the dev server still
    // reads .env.local and stays on whatever project that names, so a session
    // minted against one project is handed to an app pointed at another and is
    // silently rejected. Spec and app must agree on the project.
    env: {
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH || 'tsconfig.json',
      PORT: webServerPort,
      ...supabaseTarget,
    },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
