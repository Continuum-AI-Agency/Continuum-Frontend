import { spawnSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Harness for `forge:caliente:ui:bench` — the Caliente workbook through the Render tab in a real
// Chrome, as bench@trycontinuum.ai in StarCraft, against a REAL backend and production Supabase.
// Modelled on playwright.forge-live.config.ts:
//   - local (default): a Next dev server on 3117, the backend at FORGE_CALIENTE_API_URL
//     (default http://localhost:4000).
//   - FORGE_CALIENTE_BASE_URL=https://<beta host>: the deployed app, no web server; the backend
//     defaults to https://api.trycontinuum.ai.
// FORGE_CALIENTE_WEEK=1 clears the saved mappings first (a template seen for the first time);
// FORGE_CALIENTE_WEEK=2 keeps what week 1 saved. Nothing is rendered: the run stops at the tray.

const deployedApp = process.env.FORGE_CALIENTE_BASE_URL?.trim().replace(/\/$/, '') || null;
const apiURL = (
  process.env.FORGE_CALIENTE_API_URL?.trim() ||
  (deployedApp ? 'https://api.trycontinuum.ai' : 'http://localhost:4000')
).replace(/\/$/, '');
const week = process.env.FORGE_CALIENTE_WEEK?.trim() ?? '1';
if (week !== '1' && week !== '2')
  throw new Error(`[forge-caliente config] FORGE_CALIENTE_WEEK must be 1 or 2, got "${week}".`);

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
if (probe.status !== 0)
  throw new Error(
    `[forge-caliente config] backend unreachable at ${apiURL}/healthz (${(probe.stderr || 'no answer').trim()}).`,
  );

loadProdSupabaseEnv();

const PORT = process.env.FORGE_CALIENTE_E2E_PORT ?? '3117';
const baseURL = deployedApp ?? `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.FORGE_CALIENTE_API_URL = apiURL;
process.env.FORGE_CALIENTE_WEEK = week;
process.env.FORGE_CALIENTE_RUN_ID ??= String(Date.now());

export default defineConfig({
  testDir: './e2e',
  testMatch: /caliente-sheet\.forge-live\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 900_000,
  expect: { timeout: 30_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(deployedApp
    ? {}
    : {
        webServer: {
          command: 'bun run dev',
          env: {
            NEXT_DIST_DIR: process.env.FORGE_CALIENTE_DIST_DIR ?? '.next/forge-caliente-e2e',
            NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
            PORT,
            NEXT_PUBLIC_API_URL: apiURL,
            API_URL: apiURL,
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
              .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
          },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 300_000,
          stdout: 'pipe' as const,
          stderr: 'pipe' as const,
        },
      }),
});
