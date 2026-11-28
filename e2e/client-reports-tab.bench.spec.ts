import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WeeklyClientReport } from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  type MintedSession,
  mintSessionBundleForEmail,
  pinSessionBrand,
  restoreBrandPreference,
  revokeBenchSession,
} from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// client-report:tab:e2e:bench
//
// WHAT IT PROVES: Performance → Reports works for staff in a real browser, end to end:
//   1. "Generate this week" reads the brand's live ad platforms and renders a draft whose table
//      shows the figures of the row it persisted (brand_profiles.client_reports);
//   2. "Mark reviewed" persists the review and who made it;
//   3. "Copy share link" returns a link that opens;
//   4. generating again over the reviewed week is refused with the reason, and the link survives;
//   5. "Withdraw" returns the week to draft and the link stops opening;
//   6. a reload shows the same week and state (the history comes from the table, not memory).
//
// REAL: hosted Postgres + GoTrue, a bench-owned Fastify Backend on hosted reading the brand's
// real Meta/Google accounts, the Next app, real Chrome, the staff account the Backend bench
// uses (CANVAS_BENCH_OWNER_EMAIL) on a brand it belongs to.
//
// WRITES: one client_reports row for the current week, deleted at the end. The run refuses to
// start when the brand already has a report for this week, so it never touches a real one. The
// session is pinned per session (not the account preference) and revoked at the end.
//
// UN-EXERCISED, STATED: the client's view (reviewed-only) and targets are covered over HTTP by
// client-report:weekly:e2e:bench; Export PDF opens the print dialog, which headless Chrome
// cannot assert.
//
// Run: bun run client-report:tab:e2e:bench

const BENCH = 'client-report:tab:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.CLIENT_REPORTS_APP_PORT ?? 3141);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4431);
process.env.PLAYWRIGHT_BASE_URL = APP;

const STAFF_EMAIL = readBackendEnv('CANVAS_BENCH_OWNER_EMAIL') ?? 'duane@continuumai.agency';
/** A paid-media brand with live Meta spend that the staff account belongs to. */
const BRAND_ID = process.env.CLIENT_REPORTS_BRAND_ID ?? '46f0deba-013f-4bd9-a70e-2526677a831d';

const TEXT = {
  generate: 'Generate this week',
  draft: 'Draft · staff review',
  reviewed: 'Reviewed',
  review: 'Mark reviewed',
  share: 'Copy share link',
  withdraw: 'Withdraw',
  linkCopied: 'Share link copied',
  refused: 'This week is reviewed and may be shared. Withdraw it before regenerating.',
  withdrawn: 'Withdrawn: its share links no longer open.',
};

/* -- the Recorder envelope (same shape session-content.bench.spec.ts prints) ---------- */
type Grade = { step: string; grade: 'PASS' | 'FAIL'; detail?: string };
const graded: Grade[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const RUN_ID = `${Date.now()}`;
const SHOT_DIR =
  process.env.CLIENT_REPORTS_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'client-reports-tab-bench');
let currentPage: Page | null = null;

function grade(name: string, ok: boolean, detail?: string): void {
  graded.push({ step: name, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  console.log(`[${BENCH}] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(name: string): Promise<string | null> {
  if (!currentPage) return null;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${RUN_ID}-${name.replace(/\W+/g, '-').slice(0, 50)}.png`);
  await currentPage.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

async function step(name: string, run: () => Promise<string | undefined>): Promise<boolean> {
  try {
    grade(name, true, await run());
    return true;
  } catch (error) {
    const file = await shot(name);
    if (file) notes.push(`screenshot: ${file}`);
    const message = error instanceof Error ? error.message : String(error);
    grade(
      name,
      false,
      message
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .slice(0, 12)
        .join(' ')
        .slice(0, 600),
    );
    return false;
  }
}

function printEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else counts.fail += 1;
  }
  for (const note of notes) console.log(`· ${note}`);
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- hosted reads + residue ---------------------------------------------------------- */

const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const reports = () => db.schema('brand_profiles').from('client_reports');

type ReportRow = {
  id: string;
  status: 'draft' | 'reviewed';
  reviewed_by: string | null;
  week_end: string;
  report: WeeklyClientReport;
};

async function reportRow(id: string): Promise<ReportRow> {
  const { data, error } = await reports()
    .select('id, status, reviewed_by, week_end, report')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`report ${id} not readable: ${error?.message}`);
  return data as ReportRow;
}

const residue = {
  reportId: null as string | null,
  session: null as MintedSession | null,
  /** The browser's latest cookies: it refreshes the session as it goes. */
  latestState: null as MintedSession['state'] | null,
  preferenceBefore: null as string | null,
};

async function preferenceOf(userId: string): Promise<string | null> {
  const { data } = await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
}

/** Every client-report call carries the brand as a query, so calls are matched by path. */
const pathOf = (url: string) => new URL(url).pathname;

/** The share link outside the browser: the read-only page a client opens. */
async function linkStatus(url: string): Promise<number> {
  return (await fetch(url, { signal: AbortSignal.timeout(30_000) })).status;
}

/* -- the app (same lifecycle as session-content.bench.spec.ts) ----------------------- */

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function killGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), name);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const quit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!quit) signal('SIGKILL');
}

async function startHostedApp(backendUrl: string): Promise<{ stop: () => Promise<void> }> {
  if (await answers(APP)) {
    throw new Error(
      `${APP} already answers; this bench needs its own hosted-targeted Next server.`,
    );
  }
  const child: ChildProcess = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/client-reports-e2e',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 30) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const stop = () => killGroup(child);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (await answers(`${APP}/login`)) return { stop };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await stop();
  throw new Error(`hosted Next app never came up on ${APP}\n${tail.join('')}`);
}

/* -- the run ------------------------------------------------------------------------- */

const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

let backend: LocalBackend | null = null;
let app: { stop: () => Promise<void> } | null = null;
let reachedTheEnd = false;

test.beforeAll(async () => {
  test.setTimeout(900_000);
  // A Backend on hosted from a laptop must not act on prod's queues, posts or Monday reports.
  Object.assign(process.env, {
    MCP_JOB_WORKER_ENABLED: 'false',
    BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    ORGANIC_SCHEDULED_PUBLISH_INTERVAL_MS: '2147483647',
    ORGANIC_REALIZE_DRIVER_INTERVAL_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_KICKOFF_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_INTERVAL_MS: '2147483647',
  });
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
  app = await startHostedApp(backend.url);
});

test.afterAll(async () => {
  if (residue.reportId) {
    const { error } = await reports().delete().eq('id', residue.reportId);
    grade(`cleanup: bench report ${residue.reportId} removed`, !error, error?.message);
  }
  const session = residue.session;
  if (session) {
    const after = await preferenceOf(session.userId);
    if (after !== residue.preferenceBefore) {
      await restoreBrandPreference(session.userId, residue.preferenceBefore);
    }
    grade(
      'cleanup: the account brand preference is unchanged',
      (await preferenceOf(session.userId)) === residue.preferenceBefore,
      `before ${residue.preferenceBefore}, during ${after}`,
    );
    const revoke = await revokeBenchSession(
      residue.latestState ?? session.state,
      session.accessToken,
    );
    grade(
      'cleanup: the bench session is revoked with its brand pin',
      revoke.revoked && revoke.pinsLeft === 0,
      `${revoke.sessionId} · ${revoke.detail}`,
    );
  }
  await app?.stop();
  await backend?.stop();
  if (!reachedTheEnd) grade('the run reached its last step', false, 'aborted — see the test error');
  printEnvelope();
});

test('Performance → Reports: generate, review, share, refuse, withdraw', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  currentPage = page;
  page.on('console', (message) => {
    if (message.type() === 'error' && notes.length < 40)
      notes.push(`console: ${message.text().slice(0, 200)}`);
  });

  const session = await mintSessionBundleForEmail(STAFF_EMAIL);
  residue.session = session;
  residue.preferenceBefore = await preferenceOf(session.userId);
  await context.clearCookies();
  await context.addCookies([
    ...session.state.cookies,
    { name: 'NEXT_LOCALE', value: 'en', domain: '127.0.0.1', path: '/' },
  ]);
  await pinSessionBrand(session.accessToken, BRAND_ID);

  const { data: existing, error: existingError } = await reports()
    .select('id, week_end')
    .eq('brand_id', BRAND_ID)
    .gte('week_end', new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  expect(existingError, 'client_reports is readable').toBeNull();
  expect(
    existing ?? [],
    'the brand has no report for this week yet (the bench writes only its own)',
  ).toEqual([]);

  const generated = page.waitForResponse(
    (response) =>
      pathOf(response.url()) === '/api/client-reports/generate' &&
      response.request().method() === 'POST',
    { timeout: 300_000 },
  );
  let id = '';
  const drafted = await step('generate: a draft renders the figures it persisted', async () => {
    await page.goto(`${APP}/scale?tab=reports`, NAV);
    await page.getByRole('button', { name: TEXT.generate }).first().click();
    const response = await generated;
    expect(response.status(), await response.text().catch(() => '')).toBe(200);
    id = ((await response.json()) as { summary: { id: string } }).summary.id;
    residue.reportId = id;
    await expect(page.getByText(TEXT.draft, { exact: true })).toBeVisible();
    const row = await reportRow(id);
    const table = page.getByRole('table');
    const shown: string[] = [];
    for (const metric of row.report.metrics) {
      if (metric.week.value === null || metric.unit === 'ratio' || metric.cadence !== 'daily')
        continue;
      const formatted = new Intl.NumberFormat('en', {
        maximumFractionDigits: metric.unit === 'money' && Math.abs(metric.week.value) < 100 ? 2 : 0,
        ...(metric.unit === 'money'
          ? { style: 'currency', currency: row.report.brand.currency }
          : {}),
      }).format(metric.week.value);
      await expect(table).toContainText(formatted);
      shown.push(`${metric.key} ${formatted}`);
    }
    expect(shown.length, 'at least one weekly figure to compare').toBeGreaterThan(0);
    return `${row.report.brand.name} · ${row.status} · ${shown.join(' · ')}`;
  });
  if (!drafted) return;

  await step('review: Mark reviewed persists the review and the reviewer', async () => {
    await page.getByRole('button', { name: TEXT.review }).click();
    await expect(page.getByText(TEXT.reviewed, { exact: true })).toBeVisible();
    const row = await reportRow(id);
    expect(row.status).toBe('reviewed');
    expect(row.reviewed_by).toBe(session.userId);
    return `status ${row.status} · by ${row.reviewed_by}`;
  });

  let link = '';
  await step('share: Copy share link returns a link that opens', async () => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
    const shared = page.waitForResponse(
      (response) => pathOf(response.url()) === `/api/client-reports/${id}/share`,
    );
    await page.getByRole('button', { name: TEXT.share }).click();
    const response = await shared;
    expect(response.status()).toBe(200);
    await expect(page.getByText(TEXT.linkCopied)).toBeVisible();
    link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain((await response.json()).path);
    const status = await linkStatus(link);
    expect(status).toBe(200);
    return `clipboard holds the link · it opens ${status}`;
  });

  await step('refuse: generating over the reviewed week says why and keeps the link', async () => {
    await page.getByRole('button', { name: TEXT.generate }).click();
    await expect(page.getByText(TEXT.refused)).toBeVisible();
    const row = await reportRow(id);
    expect(row.status).toBe('reviewed');
    const status = await linkStatus(link);
    expect(status).toBe(200);
    return `toast shown · still ${row.status} · link ${status}`;
  });

  await step('withdraw: back to draft, and the link stops opening', async () => {
    await page.getByRole('button', { name: TEXT.withdraw }).click();
    await expect(page.getByText(TEXT.withdrawn)).toBeVisible();
    await expect(page.getByText(TEXT.draft, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: TEXT.withdraw })).toHaveCount(0);
    const row = await reportRow(id);
    expect(row.status).toBe('draft');
    expect(row.reviewed_by).toBeNull();
    const status = await linkStatus(link);
    expect(status).toBe(404);
    return `status ${row.status} · link ${status}`;
  });

  await step('reload: the week and its state come back from the table', async () => {
    await page.reload(NAV);
    await expect(page.getByText(TEXT.draft, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: TEXT.review })).toBeVisible();
    const file = await shot('final');
    return file ? `screenshot: ${file}` : undefined;
  });

  residue.latestState = await context.storageState();
  reachedTheEnd = true;
  expect(graded.filter((entry) => entry.grade === 'FAIL')).toEqual([]);
});
