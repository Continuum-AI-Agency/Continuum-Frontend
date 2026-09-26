import { spawnSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Harness for `forge:meta:live:bench` — the Forge Deliver step driven in a real Chrome against a
// REAL backend, so a render confirmed in the Forge with a Meta target runs the real flow into the
// Meta sandbox account. Modelled on playwright.forge-studio.config.ts (its LIVE mode).
//
// Two targets, chosen here because the backend URL is baked into the app when it starts:
//   - local (default): a Next dev server on 3115 (on the backend's CORS allowlist), production
//     Supabase (loadProdSupabaseEnv refuses anything else), and the backend at FORGE_LIVE_API_URL,
//     default http://localhost:4000. Never the Frontend .env's API_URL, which is production.
//   - FORGE_LIVE_BASE_URL=https://app.trycontinuum.ai: the deployed app, no web server. The minted
//     session's cookies are written for that host. The backend the spec reads through defaults to
//     https://api.trycontinuum.ai — the one the deployed app was built against.
//
// Inputs are checked here, and the backend is probed here, so a run that cannot work fails with a
// named reason BEFORE a dev server spends minutes compiling /forge.

const MODES = ['confirm', 'approve'] as const;
const mode = process.env.FORGE_LIVE_MODE?.trim() ?? '';
const deployedApp = process.env.FORGE_LIVE_BASE_URL?.trim().replace(/\/$/, '') || null;
// Read before loadProdSupabaseEnv(), which copies the Frontend .env's API_URL over process.env.
const apiURL = (
  process.env.FORGE_LIVE_API_URL?.trim() ||
  (deployedApp ? 'https://api.trycontinuum.ai' : 'http://localhost:4000')
).replace(/\/$/, '');

const fail = (reason: string): never => {
  throw new Error(`[forge-live config] ${reason}`);
};

if (!MODES.includes(mode as (typeof MODES)[number])) {
  fail(`FORGE_LIVE_MODE must be one of ${MODES.join(' | ')}, got "${mode}".`);
}
const required =
  mode === 'confirm'
    ? ['META_SANDBOX_CAMPAIGN_ID', 'META_SANDBOX_ADSET_ID', 'FORGE_LIVE_OUT']
    : ['FORGE_LIVE_APPROVE_JOB', 'FORGE_LIVE_OUT'];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) fail(`FORGE_LIVE_MODE=${mode} needs ${missing.join(', ')}.`);

// A child process, because a Playwright config is synchronous and this must settle before the
// dev server spawns. `process.execPath` is whichever runtime runs Playwright; both have fetch.
const probe = spawnSync(
  process.execPath,
  [
    '-e',
    `fetch(process.argv[1] + '/healthz', { signal: AbortSignal.timeout(5000) })
      .then((r) => { if (!r.ok) { console.error('HTTP ' + r.status); process.exit(1); } })
      .catch((e) => { console.error(e?.cause?.code ?? e?.message ?? String(e)); process.exit(1); });`,
    apiURL,
  ],
  { encoding: 'utf8', timeout: 15_000 },
);
if (probe.status !== 0) {
  fail(
    `backend unreachable at ${apiURL}/healthz (${(probe.stderr || probe.error?.message || 'no answer').trim()}). ` +
      (deployedApp
        ? 'Set FORGE_LIVE_API_URL to the backend the deployed app calls.'
        : 'Start the local backend (bun run dev:be) or point FORGE_LIVE_API_URL at one.'),
  );
}

loadProdSupabaseEnv();

const PORT = process.env.FORGE_LIVE_E2E_PORT ?? '3115';
const baseURL = deployedApp ?? `http://localhost:${PORT}`;

// mintSessionBundleForEmail derives the cookie domain from PLAYWRIGHT_BASE_URL; the spec reads the
// backend and the run id from here so every worker agrees on both.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.FORGE_LIVE_API_URL = apiURL;
process.env.FORGE_LIVE_RUN_ID ??= String(Date.now());
if (!deployedApp) {
  process.env.NEXT_PUBLIC_API_URL = apiURL;
  process.env.API_URL = apiURL;
}

export default defineConfig({
  testDir: './e2e',
  testMatch: /meta-sandbox\.forge-live\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // The first page pays the dev server's compile of /forge, and a confirm waits on real preflights.
  timeout: 600_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  ...(deployedApp
    ? {}
    : {
        webServer: {
          command: 'bun run dev',
          env: {
            NEXT_DIST_DIR: process.env.FORGE_LIVE_DIST_DIR ?? '.next/forge-live-e2e',
            NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
            PORT,
            NEXT_PUBLIC_API_URL: apiURL,
            API_URL: apiURL,
            // Explicit rather than inherited — the prod pinning is the point of this file.
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
              .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
          },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 240_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }),
});
