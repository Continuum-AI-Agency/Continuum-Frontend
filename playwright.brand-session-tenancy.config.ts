import { defineConfig, devices } from '@playwright/test';

// Harness for `brands:session-tenancy:e2e:bench`. Mirrors playwright.brand-dedupe.config.ts
// — one worker, its own port and dist dir so it cannot collide with another agent's dev
// server — but pinned to the LOCAL stack rather than prod, because the migration this
// bench proves (brand_profiles.user_session_brands) is validated against local only.
//
// The inverse of e2e/support/prodEnv.ts, and for the same reason: a bench that silently
// ran against the wrong stack proves nothing. There it is "refuse to run unless this is
// prod"; here it is "refuse to run unless this is local", because pointing this at prod
// would both fail (the migration is not shipped there yet) and write brand rows into the
// real product.

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (supabaseUrl.replace(/\/$/, '') !== LOCAL_SUPABASE_URL) {
  throw new Error(
    `[brand-session-tenancy] Refusing to run: NEXT_PUBLIC_SUPABASE_URL is "${supabaseUrl || '<unset>'}", ` +
      `expected "${LOCAL_SUPABASE_URL}". This bench seeds and deletes brand rows and must never ` +
      'touch production. Start the local stack (`bun run supabase:start && bun run supabase:env:local`) ' +
      'and invoke through the package script, which sources .env.local.',
  );
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[brand-session-tenancy] SUPABASE_SERVICE_ROLE_KEY is unset — required to seed brands and to ' +
      'read back user_session_brands. Run `bun run supabase:env:local`.',
  );
}

const PORT = process.env.BRAND_SESSION_TENANCY_E2E_PORT ?? '3114';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /brand-session-tenancy\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 240_000,
  expect: { timeout: 60_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/brand-session-tenancy-e2e',
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
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
