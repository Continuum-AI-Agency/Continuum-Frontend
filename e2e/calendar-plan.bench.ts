#!/usr/bin/env bun
/**
 * calendar-plan:e2e:bench — the calendar's Generate button PROPOSES a plan, a person approves
 * it, and only then does a generation run start.
 *
 * Driven through the REAL Frontend in Chromium, signed in as the bench login with its password,
 * against the running Backend and the hosted Supabase. Nothing is mocked. It asserts the four
 * things only a browser can prove:
 *
 *   1. Generate renders the bulk plan card (BulkPlanCard) under the calendar toolbar;
 *   2. Approve mounts the run panel (BulkRunPanel) for the run the Backend returned;
 *   3. the plan row is persisted `approved` and its run row exists — real rows, not the DOM;
 *   4. no request from the page ever reached the retired /api/organic/generate-grid or
 *      /api/organic/generate-calendar proxies.
 *
 * Cost control: one placeholder draft is seeded into the visible week first, so Generate
 * proposes exactly one placement (sketched placeholders win over the day×platform grid) and
 * approval mints ONE generation, not seven per platform.
 *
 * Cleanup is an ID DIFF: rows that appeared for the bench brand during the run are deleted,
 * nothing else. The approved run keeps generating after the browser closes; anything it writes
 * after the diff is swept by the Backend's `bun run bench:sweep`.
 *
 * Needs `bun run dev:fe` and `bun run dev:be` up. FRONTEND_BASE_URL / PLAYWRIGHT_BASE_URL
 * override http://localhost:3000. Run from the Frontend with `bun run calendar-plan:e2e:bench`
 * — the script loads ../Continuum-Backend/.env for the Supabase keys and the bench login.
 */
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page, type Request } from 'playwright';
import { mintSessionWithPassword } from './support/auth';

const BENCH = 'calendar-plan:e2e:bench';
const DEFAULT_BENCH_BRAND_ID = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const LEGACY_PROXY = /\/api\/organic\/generate-(grid|calendar)/;
const PLAN_CARD_TIMEOUT_MS = 60_000;
const RUN_PANEL_TIMEOUT_MS = 30_000;
const ROW_POLL_MS = 20_000;

type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const GLYPH: Record<Grade, string> = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' };
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

const record = (step: string, grade: Grade, detail?: string) => {
  results.push({ step, grade, detail });
  console.log(`${GLYPH[grade]} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
};
const check = (step: string, ok: boolean, detail?: string) =>
  record(step, ok ? 'PASS' : 'FAIL', detail);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

function finish(): never {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const r of results) counts[r.grade.toLowerCase() as keyof typeof counts] += 1;
  const exitCode = counts.fail > 0 ? 1 : 0;
  const durationMs = Date.now() - startedMs;
  if (process.env.BENCH_JSON === '1') {
    console.log(
      JSON.stringify({ bench: BENCH, startedAt, durationMs, results, notes, counts, exitCode }),
    );
  } else {
    console.log(
      `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — ${BENCH}: ${counts.pass} pass, ${counts.warn} warn, ` +
        `${counts.skip} skip, ${counts.fail} fail (${(durationMs / 1000).toFixed(1)}s)`,
    );
  }
  process.exit(exitCode);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`[${BENCH}] Missing ${name} — run via \`bun run calendar-plan:e2e:bench\``);
  return value;
}

// The Frontend's auth helper reads the app's NEXT_PUBLIC_* names; the Backend .env this bench
// loads carries the same values under the Backend names.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= process.env.SUPABASE_ANON_KEY;
const BASE_URL = (
  process.env.FRONTEND_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');
process.env.PLAYWRIGHT_BASE_URL = BASE_URL;

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
const OWNER_EMAIL = requireEnv('CONTINUUM_BENCH_OWNER_EMAIL');
const OWNER_PASSWORD = requireEnv('CONTINUUM_BENCH_OWNER_PASSWORD');
const BRAND_ID = process.env.CONTINUUM_TEST_BRAND_ID?.trim() || DEFAULT_BENCH_BRAND_ID;
const RUN_TAG = `bench:calendar-plan-${crypto.randomUUID().slice(0, 8)}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const organic = () => admin.schema('organic');

// Deleted in this order so no row is orphaned by a foreign key on the way out.
const DIFFED_TABLES = [
  ['organic_agent_runs', 'run_id'],
  ['post_generation_jobs', 'job_id'],
  ['organic_calendar_drafts', 'id'],
  ['organic_agent_plans', 'plan_id'],
] as const;
type DiffedTable = (typeof DIFFED_TABLES)[number][0];

async function snapshotIds(): Promise<Map<DiffedTable, Set<string>>> {
  const snapshot = new Map<DiffedTable, Set<string>>();
  for (const [table, pk] of DIFFED_TABLES) {
    const { data, error } = await organic().from(table).select(pk).eq('brand_id', BRAND_ID);
    if (error) throw new Error(`snapshot ${table}: ${error.message}`);
    snapshot.set(table, new Set((data as Record<string, string>[]).map((row) => String(row[pk]))));
  }
  return snapshot;
}

function localDayId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Wednesday of the current local week — inside the week the planner opens on by default. */
function placeholderDay(): { weekStart: string; dayId: string } {
  const now = new Date();
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const wednesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2);
  return { weekStart: localDayId(monday), dayId: localDayId(wednesday) };
}

async function seedPlaceholder(userId: string): Promise<{ id: string; dayId: string }> {
  const { weekStart, dayId } = placeholderDay();
  const id = crypto.randomUUID();
  const { error } = await organic()
    .from('organic_calendar_drafts')
    .insert({
      id,
      brand_id: BRAND_ID,
      user_id: userId,
      client_key: RUN_TAG,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'placeholder',
      scheduled_date: new Date(`${dayId}T10:00:00`).toISOString(),
      slot_data: { weekStart, dayId, platform: 'instagram', timeLabel: '10:00 AM' },
    });
  if (error) throw new Error(`seed placeholder: ${error.message}`);
  note(`seeded one placeholder on ${dayId} (week of ${weekStart})`);
  return { id, dayId };
}

async function pollRows(
  planId: string,
  runId: string,
): Promise<{ planStatus: string | null; runFound: boolean }> {
  const deadline = Date.now() + ROW_POLL_MS;
  let planStatus: string | null = null;
  let runFound = false;
  while (Date.now() < deadline) {
    const [plan, run] = await Promise.all([
      organic().from('organic_agent_plans').select('status').eq('plan_id', planId).maybeSingle(),
      organic().from('organic_agent_runs').select('run_id').eq('run_id', runId).maybeSingle(),
    ]);
    planStatus = (plan.data as { status?: string } | null)?.status ?? null;
    runFound = Boolean(run.data);
    if (planStatus === 'approved' && runFound) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return { planStatus, runFound };
}

async function screenshot(page: Page, name: string): Promise<void> {
  try {
    const path = `${process.env.TMPDIR ?? '/tmp'}/calendar-plan-bench-${name}-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    note(`screenshot: ${path}`);
  } catch {
    // A screenshot failure must never mask the assertion that asked for it.
  }
}

async function main(): Promise<void> {
  try {
    const probe = await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) });
    check('the Frontend is up', probe.status < 500, `${BASE_URL} → ${probe.status}`);
  } catch (err) {
    record(
      'the Frontend is up',
      'FAIL',
      `${BASE_URL}: ${err instanceof Error ? err.message : err} — is \`bun run dev:fe\` running?`,
    );
    return;
  }

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await anon.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  if (signedIn.error || !signedIn.data.user) {
    record('signs in as the bench login', 'FAIL', signedIn.error?.message ?? 'no user');
    return;
  }
  const ownerUserId = signedIn.data.user.id;
  record('signs in as the bench login', 'PASS', OWNER_EMAIL);

  // The app resolves the brand server-side from the account's preference row; there is no ?brand=.
  const pref = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: ownerUserId, active_brand_id: BRAND_ID }, { onConflict: 'user_id' });
  if (pref.error) {
    record('bench login active brand', 'FAIL', pref.error.message);
    return;
  }
  record('bench login active brand', 'PASS', BRAND_ID);

  const before = await snapshotIds();
  const legacyHits: string[] = [];
  let planId: string | null = null;
  let proposedCount = 0;
  let runId: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const seeded = await seedPlaceholder(ownerUserId);

    const storageState = await mintSessionWithPassword(OWNER_EMAIL, OWNER_PASSWORD);
    browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    page.on('request', (request: Request) => {
      if (LEGACY_PROXY.test(request.url())) legacyHits.push(`${request.method()} ${request.url()}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') note(`FE console error: ${msg.text().slice(0, 200)}`);
    });

    // Generate reads the store's visible week, so the click must wait for the drafts fetch —
    // before it, the seeded placeholder is not in the store and Generate would propose the grid.
    const draftsLoaded = page.waitForResponse(
      (response) => response.url().includes('/api/organic/calendar/drafts') && response.ok(),
      { timeout: PLAN_CARD_TIMEOUT_MS },
    );
    await page.goto(`${BASE_URL}/organic?tab=planner&view=week`, { waitUntil: 'domcontentloaded' });
    const generate = page.getByRole('button', { name: 'Generate plan' });
    try {
      await generate.waitFor({ state: 'visible', timeout: PLAN_CARD_TIMEOUT_MS });
      const draftsResponse = await draftsLoaded;
      const fetched = (await draftsResponse.json().catch(() => null)) as {
        drafts?: Array<{ id: string; status: string | null; scheduled_date: string | null }>;
      } | null;
      const placeholders = (fetched?.drafts ?? []).filter((row) => row.status === 'placeholder');
      note(
        `drafts fetch returned ${fetched?.drafts?.length ?? 0} row(s); placeholders: ${
          placeholders.map((row) => `${row.id.slice(0, 8)}@${row.scheduled_date}`).join(', ') ||
          'none'
        }`,
      );
      // What a person does: see the sketched slot on its day, then click Generate.
      await page
        .locator(
          `[data-planner-cell="planner-cell::${seeded.dayId}::instagram"] button[aria-pressed]`,
        )
        .first()
        .waitFor({ state: 'visible', timeout: PLAN_CARD_TIMEOUT_MS });
    } catch (err) {
      record(
        'the calendar toolbar shows Generate',
        'FAIL',
        err instanceof Error ? err.message : String(err),
      );
      await screenshot(page, 'no-generate');
      return;
    }
    record(
      'the calendar toolbar shows Generate',
      'PASS',
      `button "Generate plan", placeholder visible on ${seeded.dayId}`,
    );

    const proposed = page.waitForResponse(
      (response) => response.url().endsWith('/api/organic/agent/plans/from-placements'),
      { timeout: PLAN_CARD_TIMEOUT_MS },
    );
    await generate.click();
    const proposeResponse = await proposed;
    const sent = proposeResponse.request().postDataJSON() as {
      placements?: Array<{ dayId?: string; platform?: string; format?: string }>;
    } | null;
    note(
      `proposed slots: ${
        (sent?.placements ?? [])
          .map((p) => `${p.dayId}:${p.platform}:${p.format ?? 'post'}`)
          .join(', ') || 'none'
      }`,
    );
    const proposeBody = (await proposeResponse.json().catch(() => null)) as {
      planId?: string;
      placements?: unknown[];
      error?: string;
    } | null;
    planId = proposeBody?.planId ?? null;
    proposedCount = proposeBody?.placements?.length ?? 0;
    check(
      'Generate proposes a plan through POST /api/organic/agent/plans/from-placements',
      proposeResponse.ok() && Boolean(planId),
      `${proposeResponse.status()} planId=${planId ?? 'none'}${proposeBody?.error ? ` error=${proposeBody.error}` : ''}`,
    );
    check(
      'the proposal covers exactly the sketched placeholder',
      proposedCount === 1,
      `${proposedCount} placement(s)`,
    );

    const card = page.getByTestId('calendar-plan-card');
    let cardShown = false;
    try {
      await card.waitFor({ state: 'visible', timeout: PLAN_CARD_TIMEOUT_MS });
      cardShown = (await card.getByTestId('bulk-plan-card').count()) > 0;
    } catch {
      cardShown = false;
    }
    check('the plan card (BulkPlanCard) renders under the toolbar', cardShown);
    if (!cardShown) {
      await screenshot(page, 'no-plan-card');
      return;
    }

    const approved = page.waitForResponse(
      (response) => /\/api\/organic\/agent\/plans\/[^/]+\/approve$/.test(response.url()),
      { timeout: RUN_PANEL_TIMEOUT_MS },
    );
    await card.getByTestId('bulk-plan-approve').click();
    const approveResponse = await approved;
    const approveBody = (await approveResponse.json().catch(() => null)) as {
      runId?: string;
      status?: string;
      error?: string;
    } | null;
    runId = approveBody?.runId ?? null;
    check(
      'Approve posts the decision and gets a run id back',
      approveResponse.ok() && Boolean(runId),
      `${approveResponse.status()} status=${approveBody?.status ?? '?'} runId=${runId ?? 'none'}${approveBody?.error ? ` error=${approveBody.error}` : ''}`,
    );

    let runPanel = false;
    try {
      await card
        .getByTestId('bulk-run-panel')
        .waitFor({ state: 'visible', timeout: RUN_PANEL_TIMEOUT_MS });
      runPanel = true;
    } catch {
      runPanel = false;
    }
    check('the run panel (BulkRunPanel) mounts after approving', runPanel);
    if (!runPanel) await screenshot(page, 'no-run-panel');

    if (planId && runId) {
      const rows = await pollRows(planId, runId);
      check(
        'the plan row is approved and its run row exists',
        rows.planStatus === 'approved' && rows.runFound,
        `organic_agent_plans.status=${rows.planStatus ?? 'missing'}, organic_agent_runs ${rows.runFound ? 'present' : 'missing'}`,
      );
    } else {
      record(
        'the plan row is approved and its run row exists',
        'SKIP',
        'no plan/run id to look up',
      );
    }

    check(
      'nothing hit the retired generate-grid / generate-calendar proxies',
      legacyHits.length === 0,
      legacyHits.length === 0 ? 'zero matching requests' : legacyHits.join(', '),
    );
  } catch (err) {
    record('bench crashed', 'FAIL', err instanceof Error ? err.message : String(err));
  } finally {
    await browser?.close().catch(() => undefined);
    await cleanup(before);
  }
}

async function cleanup(before: Map<DiffedTable, Set<string>>): Promise<void> {
  try {
    const after = await snapshotIds();
    const fresh = (table: DiffedTable) =>
      [...(after.get(table) ?? new Set<string>())].filter(
        (id) => !(before.get(table) ?? new Set<string>()).has(id),
      );
    const deleted: string[] = [];
    // Run events hang off the runs and carry no brand column.
    const newRunIds = fresh('organic_agent_runs');
    if (newRunIds.length > 0) {
      const { error } = await organic()
        .from('organic_agent_run_events')
        .delete()
        .in('run_id', newRunIds);
      if (error) throw new Error(`cleanup organic_agent_run_events: ${error.message}`);
    }
    for (const [table, pk] of DIFFED_TABLES) {
      const ids = fresh(table);
      if (ids.length === 0) continue;
      const { error } = await organic().from(table).delete().in(pk, ids);
      if (error) throw new Error(`cleanup ${table}: ${error.message}`);
      deleted.push(`${table}=${ids.length}`);
    }
    record(
      'id-diff cleanup removed what the run created',
      'PASS',
      deleted.join(', ') || 'nothing appeared',
    );
  } catch (err) {
    record(
      'id-diff cleanup removed what the run created',
      'FAIL',
      err instanceof Error ? err.message : String(err),
    );
  }
}

await main();
finish();
