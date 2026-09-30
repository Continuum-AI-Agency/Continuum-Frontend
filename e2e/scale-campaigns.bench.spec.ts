import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

// ---------------------------------------------------------------------------
// scale:campaigns:e2e:bench — the Scale page's Campaigns tab and its HITL Pause / Unpause.
//
// A real Chrome drives the real Frontend as a REAL member of a client brand, against
// PRODUCTION Supabase, the deployed reporting edge function, and a Backend this spec spawns
// from the working tree (the one that answers `operator_action`).
//
// What it proves, graded against rows and the DOM, never against prose:
//   1. LIST — the Campaigns tab lists the account's campaigns, and expanding them lists their
//      ad sets and ads, each row carrying its Meta status. PAUSED rows are required for the
//      Unpause hop; a campaign-level PAUSED row additionally needs the `statuses` param on
//      `fetch-meta-campaigns`, which is graded SKIP by name until that function is deployed.
//   2. PAUSE — Pause on an ACTIVE row opens the sheet; "Request approval" opens a real Jaina
//      gate with NO model turn (operator_action), and the card shows the before → after row
//      ACTIVE → PAUSED. The bench DENIES it: the gate row reads `denied`, and the row still
//      reads ACTIVE.
//   3. UNPAUSE — the same on a PAUSED row, PAUSED → ACTIVE, denied.
//
// ── MONEY SAFETY — this bench cannot write to an ad account ──
//   * Every gate is answered DENY. There is no approve anywhere in this file. A denied gate
//     never executes its tool, so nothing reaches Meta.
//   * The only Continuum writes are the gate rows and the conversation the actions are
//     recorded in. Both are found by the run's own user + start time + tool name AND id-diffed
//     against what existed before, then deleted by id — never by time window alone.
//   * The member's active-brand preference is captured and restored.
//
// Usage: cd Continuum-Frontend && bun run scale:campaigns:e2e:bench
// ---------------------------------------------------------------------------

test.use({ channel: 'chrome' });

const { serviceRoleKey } = loadProdSupabaseEnv();

/** BENCH_ACCOUNTS.easyfitVivo47 — a client brand with a live Meta account. Deny-only here. */
const CLIENT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const CLIENT_OWNER_EMAIL = 'mercadotecniavivo@gmail.com';

const BACKEND_PORT = Number(process.env.SCALE_CAMPAIGNS_BENCH_BACKEND_PORT ?? 4423);
const OPERATOR_TOOLS = ['pause_meta_entity', 'activate_meta_entity'];
/** How many campaigns to open looking for a PAUSED ad set / ad. Bounded: each is a Meta read. */
const EXPAND_LIMIT = 6;

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  serviceRoleKey,
  { auth: { persistSession: false } },
);
const brandProfiles = () => admin.schema('brand_profiles');

/* -- the Recorder envelope (same shape as the Backend `_bench` Recorder) -------- */

const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const notes: string[] = [];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
}

function skip(step: string, detail: string): void {
  graded.push({ step, grade: 'SKIP', detail });
}

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: 'scale:campaigns:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- rows this run creates ------------------------------------------------------ */

type GateRow = { id: string; tool_name: string; status: string; subject_id: string | null };

async function gatesSince(userId: string, since: string): Promise<GateRow[]> {
  const { data, error } = await brandProfiles()
    .from('jaina_tool_gate_approvals')
    .select('id,tool_name,status,subject_id')
    .eq('brand_id', CLIENT_BRAND_ID)
    .eq('created_by', userId)
    .in('tool_name', OPERATOR_TOOLS)
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[scale-bench] gate read: ${error.message}`);
  return (data ?? []) as GateRow[];
}

/**
 * The conversations THIS run's page created, captured off the create call's own response —
 * exact attribution. The brand is a real client's; a time-window guess could take a
 * conversation its owner started in the same minutes.
 */
const createdSessions = new Set<string>();

function captureCreatedSessions(page: Page): void {
  // What the stream answered, and anything the browser threw. A gate that never renders reads
  // the same on screen whether the POST 4xx'd, the stream stalled, or the card failed to parse.
  page.on('response', (response) => {
    if (response.url().includes('/api/agents/jaina/chat/stream')) {
      console.log(`[scale-bench] ${response.request().method()} stream → ${response.status()}`);
    }
  });
  page.on('pageerror', (error) => console.log(`[scale-bench] page error: ${error.message}`));
  page.on('response', async (response) => {
    if (
      response.request().method() !== 'POST' ||
      !response.url().endsWith('/api/agents/jaina/chat/conversations')
    ) {
      return;
    }
    const body = (await response.json().catch(() => null)) as { session_id?: unknown } | null;
    if (typeof body?.session_id === 'string') createdSessions.add(body.session_id);
  });
}

/** Each run in these sessions with its status and event count — where a stalled gate stalled. */
async function runsForSessions(
  sessionIds: string[],
): Promise<{ runId: string; status: string; events: number }[]> {
  if (sessionIds.length === 0) return [];
  const { data } = await admin
    .schema('jaina')
    .from('jaina_conversation_runs')
    .select('run_id,status')
    .in('session_id', sessionIds);
  const runs = (data ?? []) as { run_id: string; status: string }[];
  return Promise.all(
    runs.map(async (run) => {
      const { count } = await admin
        .schema('jaina')
        .from('jaina_conversation_run_events')
        .select('*', { count: 'exact', head: true })
        .eq('run_id', run.run_id);
      return { runId: run.run_id, status: run.status, events: count ?? 0 };
    }),
  );
}

/* -- brand + session ---------------------------------------------------------------- */

let previousBrand: string | null | undefined;

async function selectClientBrand(userId: string): Promise<void> {
  const { data } = await brandProfiles()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  previousBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
  const { error } = await brandProfiles()
    .from('user_brand_preferences')
    .upsert(
      { user_id: userId, active_brand_id: CLIENT_BRAND_ID, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[scale-bench] brand switch failed: ${error.message}`);
}

async function restoreBrand(userId: string): Promise<void> {
  if (!previousBrand) return;
  await brandProfiles()
    .from('user_brand_preferences')
    .upsert(
      { user_id: userId, active_brand_id: previousBrand, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

/* -- the card ---------------------------------------------------------------------- */

/** Every before → after row the approval card shows, read off the rendered table. */
async function previewRows(
  scope: Locator,
): Promise<{ field: string; before: string; after: string }[]> {
  return scope.locator('table tbody tr').evaluateAll((rows) =>
    rows.map((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map(
        (cell) => cell.textContent?.trim() ?? '',
      );
      return { field: cells[0] ?? '', before: cells[1] ?? '', after: cells[2] ?? '' };
    }),
  );
}

/**
 * One gated status change, driven the way a person drives it, answered DENY.
 * Returns the gate row it opened so the caller can grade the database.
 */
async function requestAndDeny(params: {
  page: Page;
  row: Locator;
  button: 'scale-row-pause' | 'scale-row-unpause';
  from: 'ACTIVE' | 'PAUSED';
  to: 'ACTIVE' | 'PAUSED';
  step: string;
  userId: string;
}): Promise<void> {
  const { page, row, button, from, to, step, userId } = params;
  const startedAt = new Date().toISOString();
  const entityId = (await row.getAttribute('data-entity-id')) ?? '';

  await row.getByTestId(button).click();
  const sheet = page.getByTestId('scale-status-sheet');
  await expect(sheet).toBeVisible();

  // Nothing is asked of Jaina until the person asks: the sheet opens on a review step.
  expect(await gatesSince(userId, startedAt)).toHaveLength(0);
  grade(`${step}.review-first`, true, 'the sheet opened with no gate row written');

  await sheet.getByRole('button', { name: 'Request approval' }).click();
  const deny = sheet.getByRole('button', { name: 'Deny' });
  const appeared = await deny
    .waitFor({ state: 'visible', timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    const runs = await runsForSessions([...createdSessions]);
    notes.push(
      `${step}: no approval card after 180s. Runs in this run's sessions: ${JSON.stringify(runs)}`,
    );
  }
  expect(appeared, `${step}: the approval card never rendered`).toBe(true);

  const rows = await previewRows(sheet);
  const flip = rows.find((entry) => entry.before.includes(from) && entry.after.includes(to));
  expect(flip, `no ${from} → ${to} row in ${JSON.stringify(rows)}`).toBeTruthy();
  grade(`${step}.preview`, true, `"${flip?.field}": ${flip?.before} → ${flip?.after}`);

  const opened = await gatesSince(userId, startedAt);
  expect(opened, 'the gate row was not written').toHaveLength(1);
  expect(opened[0]?.status).toBe('awaiting_approval');
  grade(
    `${step}.gate-row`,
    true,
    `${opened[0]?.tool_name} gate ${opened[0]?.id} awaiting approval`,
  );

  await expect(deny).toBeEnabled({ timeout: 120_000 });
  await deny.click();
  await expect(sheet.getByTestId('scale-status-denied')).toBeVisible({ timeout: 120_000 });

  await expect
    .poll(async () => (await gatesSince(userId, startedAt))[0]?.status, { timeout: 60_000 })
    .toBe('denied');
  grade(`${step}.denied`, true, 'the gate row reads denied; the tool never ran');

  // The row, re-read: still what it was. A denied pause that moved the pill would be a lie.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  const after = page.locator(`[data-entity-id="${entityId}"]`).first();
  await expect(after).toHaveAttribute('data-status', from);
  grade(`${step}.no-write`, true, `${entityId} still ${from} after the deny`);
}

/* -- the run ------------------------------------------------------------------------ */

test.describe.configure({ mode: 'serial' });

let backend: LocalBackend | null = null;
let context: BrowserContext | null = null;
let clientUserId: string | null = null;

test.describe('scale campaigns tab', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    backend = await startLocalBackend({
      port: BACKEND_PORT,
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3119',
      supabase: 'hosted',
      label: 'scale-bench',
      readyTimeoutMs: 180_000,
    });

    const { data: members, error } = await brandProfiles()
      .from('permissions')
      .select('user_id,email')
      .eq('brand_profile_id', CLIENT_BRAND_ID);
    if (error) throw new Error(`[scale-bench] permissions read: ${error.message}`);
    clientUserId =
      (members ?? [])
        .map((row) => row as { user_id: string; email: string | null })
        .find((row) => row.email?.toLowerCase() === CLIENT_OWNER_EMAIL)?.user_id ?? null;
    if (!clientUserId) throw new Error(`[scale-bench] ${CLIENT_OWNER_EMAIL} is not a member`);

    await selectClientBrand(clientUserId);
    context = await browser.newContext({
      storageState: await mintSessionForEmail(CLIENT_OWNER_EMAIL),
      viewport: { width: 1600, height: 1000 },
    });
  });

  // A failed assertion ends the test before its grade lands; the envelope must still say FAIL.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixtures argument.
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      grade('run', false, testInfo.error?.message?.split('\n')[0] ?? 'the test failed');
    }
  });

  test.afterAll(async () => {
    const userId = clientUserId;
    if (userId) {
      // Gate rows first (their subject is TEXT, nothing cascades to them), then the
      // conversations — through the app's own route, as the trash icon does.
      for (const gate of await gatesSince(userId, benchStartedAt).catch(() => [])) {
        const { error } = await brandProfiles()
          .from('jaina_tool_gate_approvals')
          .delete()
          .eq('id', gate.id);
        if (error) console.warn(`[scale-bench] cleanup gate ${gate.id}: ${error.message}`);
      }
      const page = await context?.newPage();
      for (const sessionId of createdSessions) {
        const response = await page?.request
          .delete(`/api/agents/jaina/chat/conversations/${encodeURIComponent(sessionId)}`)
          .catch(() => null);
        if (!response?.ok()) {
          console.warn(`[scale-bench] cleanup conversation ${sessionId}: ${response?.status()}`);
        }
      }
      await restoreBrand(userId);
    }
    await context?.close();
    await backend?.stop();
    printBenchEnvelope();
  });

  test('lists campaigns, ad sets and ads of every status; pause and unpause are gated and denied', async () => {
    const userId = clientUserId;
    expect(userId).toBeTruthy();
    if (!userId || !context) return;
    const page = await context.newPage();
    captureCreatedSessions(page);

    await page.goto('/scale?tab=campaigns', { waitUntil: 'domcontentloaded' });
    const table = page.getByTestId('scale-campaigns-table');
    await expect(table).toHaveAttribute('data-state', 'ready', { timeout: 240_000 });

    // ---- 1. LIST ------------------------------------------------------------------------
    const campaigns = page.getByTestId('scale-campaign-row');
    const campaignCount = await campaigns.count();
    expect(campaignCount, 'the account lists no campaigns').toBeGreaterThan(0);
    const campaignStatuses = await campaigns.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-status') ?? ''),
    );
    grade(
      'list.campaigns',
      true,
      `${campaignCount} campaign rows: ${[...new Set(campaignStatuses)].join(', ')}`,
    );
    if (campaignStatuses.includes('PAUSED')) {
      grade('list.campaigns-paused', true, 'paused campaigns are listed beside active ones');
    } else {
      skip(
        'list.campaigns-paused',
        'no PAUSED campaign row — the deployed fetch-meta-campaigns still filters ACTIVE; the `statuses` param ships with the edge deploy',
      );
      notes.push(
        'UN-EXERCISED: paused CAMPAIGN rows. The tab sends every status (CAMPAIGN_STATUSES); the prod ' +
          'edge function ignores it until the coordinator deploys fetch-meta-campaigns.',
      );
    }

    // Open campaigns until a PAUSED ad set or ad turns up (ad sets and ads are unfiltered).
    let expanded = 0;
    for (let index = 0; index < Math.min(campaignCount, EXPAND_LIMIT); index += 1) {
      const toggle = campaigns.nth(index).getByRole('button', { name: 'Show ad sets' });
      if (!(await toggle.isVisible().catch(() => false))) continue;
      await toggle.click();
      expanded += 1;
      await expect(page.getByTestId('scale-adset-row').first()).toBeVisible({ timeout: 120_000 });
      if ((await page.locator('[data-testid="scale-adset-row"][data-status="PAUSED"]').count()) > 0)
        break;
    }
    const adSets = page.getByTestId('scale-adset-row');
    const adSetStatuses = await adSets.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-status') ?? ''),
    );
    expect(adSetStatuses.length, 'no ad set rows under the opened campaigns').toBeGreaterThan(0);
    grade(
      'list.adsets',
      true,
      `${adSetStatuses.length} ad set rows under ${expanded} campaign(s): ${[...new Set(adSetStatuses)].join(', ')}`,
    );

    // Every opened ad set's ads — a PAUSED ad is the Unpause hop's only target until paused
    // campaigns list, so the search is as wide as the rows already on screen.
    const ads = page.getByTestId('scale-ad-row');
    const adSetCount = await adSets.count();
    for (let index = 0; index < adSetCount; index += 1) {
      const toggle = adSets.nth(index).getByRole('button', { name: 'Show ads' });
      if (!(await toggle.isVisible().catch(() => false))) continue;
      const before = await ads.count();
      await toggle.click();
      await expect.poll(async () => ads.count(), { timeout: 120_000 }).toBeGreaterThan(before);
      if ((await page.locator('[data-testid="scale-ad-row"][data-status="PAUSED"]').count()) > 0)
        break;
    }
    await expect(ads.first()).toBeVisible({ timeout: 120_000 });
    const adStatuses = await ads.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-status') ?? ''),
    );
    grade('list.ads', true, `${adStatuses.length} ad rows: ${[...new Set(adStatuses)].join(', ')}`);

    const cacheAge = page.getByTestId('scale-campaigns-cache-age');
    if (await cacheAge.isVisible().catch(() => false)) {
      grade('list.cache-age', true, `"${(await cacheAge.textContent())?.trim()}"`);
    } else {
      skip('list.cache-age', 'the deployed edge functions do not report cachedAt yet');
    }

    // ---- 2. PAUSE, denied ---------------------------------------------------------------
    // Campaign level when one is live: that is the level the tools newly cover.
    const activeRow = page
      .locator(
        '[data-testid="scale-campaign-row"][data-status="ACTIVE"], [data-testid="scale-adset-row"][data-status="ACTIVE"], [data-testid="scale-ad-row"][data-status="ACTIVE"]',
      )
      .first();
    if ((await activeRow.count()) === 0) {
      skip('pause', 'no ACTIVE row on this account to pause');
    } else {
      await requestAndDeny({
        page,
        row: activeRow,
        button: 'scale-row-pause',
        from: 'ACTIVE',
        to: 'PAUSED',
        step: 'pause',
        userId,
      });
    }

    // ---- 3. UNPAUSE, denied -------------------------------------------------------------
    const pausedRow = page
      .locator(
        '[data-testid="scale-campaign-row"][data-status="PAUSED"], [data-testid="scale-adset-row"][data-status="PAUSED"], [data-testid="scale-ad-row"][data-status="PAUSED"]',
      )
      .first();
    if ((await pausedRow.count()) === 0) {
      skip('unpause', `no PAUSED row in ${expanded} opened campaign(s)`);
      notes.push('UN-EXERCISED: the Unpause gate — no PAUSED row was reachable on this account.');
    } else {
      await requestAndDeny({
        page,
        row: pausedRow,
        button: 'scale-row-unpause',
        from: 'PAUSED',
        to: 'ACTIVE',
        step: 'unpause',
        userId,
      });
    }

    await page.close();
  });
});
