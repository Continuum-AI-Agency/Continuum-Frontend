import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  API_RENDER_BATCH_PREFLIGHT_ROUTE,
  API_RENDER_BATCHES_ROUTE,
  API_RENDER_JOBS_ROUTE,
  API_RENDER_SETS_ROUTE,
  API_RENDER_TEMPLATES_ROUTE,
  type ApiRenderBatchPreflightRequest,
  type ApiRenderJob,
  type ApiRenderTemplateSummary,
  apiRenderBatchPreflightRequestSchema,
  apiRenderBatchSchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderTemplateListResponseSchema,
  type ForgeRenderSet,
  forgeRenderSetListResponseSchema,
  forgeRenderSetSchema,
  type PaidCanvasTarget,
  paidCanvasTargetSearchResponseSchema,
  type RenderApproval,
  renderApprovalDecisionResponseSchema,
  renderApprovalListResponseSchema,
  templateDisplayName,
} from '@continuum/contracts';
import {
  type Browser,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import { STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:meta:live:bench — a Forge render with Meta targets, confirmed through the real UI.
//
// No interception of our API: real Chrome, a real session for the StarCraft owner pinned to the
// StarCraft brand for THIS session only, the real backend (playwright.forge-live.config.ts picks
// it), production Supabase, and the Meta SANDBOX account. The Backend bench drives the two modes:
//
//   confirm — Render tab, template 133. Duplicates the set behind the newest finished 133 render
//     (the cheapest real way to start from values that already rendered), renames the copy
//     "Bench · Meta live <run>", and copies that render's row, so both rows are proven. Deliver:
//     row 1 replaces META_SANDBOX_AD_ID with the 1:1 comp; row 2 becomes a new paused ad in
//     META_SANDBOX_ADSET_ID; the approval room is #forge-render-testing alone. Confirm, Render.
//     Writes { setId, jobs: [{ jobId, action }] } to FORGE_LIVE_OUT. The copied set is NOT
//     deleted: its jobs still need approving — the caller deletes it by `setId` when done.
//   approve — waits until FORGE_LIVE_APPROVE_JOB's approval is pending, opens the Render ledger
//     and presses Approve on that job's own card (found by the rendered file it shows; the decision
//     request must name that approval). Writes { approved: true } to FORGE_LIVE_OUT.
//
// Every Meta read must answer for the sandbox account, and the signed pre-flight must name it,
// or the run stops before anything reaches an approval room.
//
// Usage (local backend on :4000):
//   FORGE_LIVE_MODE=confirm META_SANDBOX_CAMPAIGN_ID=… META_SANDBOX_ADSET_ID=… \
//     META_SANDBOX_AD_ID=… FORGE_LIVE_OUT=/tmp/confirm.json bun run forge:meta:live:bench
//   FORGE_LIVE_MODE=approve FORGE_LIVE_APPROVE_JOB=<job id> FORGE_LIVE_OUT=/tmp/approve.json \
//     bun run forge:meta:live:bench
//   Post-deploy: add FORGE_LIVE_BASE_URL=https://app.trycontinuum.ai (backend defaults to prod).
// ---------------------------------------------------------------------------

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const MODE = process.env.FORGE_LIVE_MODE === 'approve' ? 'approve' : 'confirm';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_LIVE_RUN_ID ?? String(Date.now());
/** Resolved and probed by the config. */
const API_URL = process.env.FORGE_LIVE_API_URL ?? 'http://localhost:4000';
const OUT = resolve(process.env.FORGE_LIVE_OUT ?? `forge-live-${RUN_ID}.json`);
/** StarCraft Promo (`forge_bench_starcraft`), matched with the binding of the set it starts from. */
const TEMPLATE_KEY = '133';
/** StarCraft's only Meta account: the sandbox. Anything else answering is a stop. */
const SANDBOX_ACCOUNT = 'act_1246951350890277';
const CAMPAIGN_ID = process.env.META_SANDBOX_CAMPAIGN_ID?.trim() ?? '';
const ADSET_ID = process.env.META_SANDBOX_ADSET_ID?.trim() ?? '';
const AD_ID = process.env.META_SANDBOX_AD_ID?.trim() ?? '';
const APPROVE_JOB = process.env.FORGE_LIVE_APPROVE_JOB?.trim() ?? '';
const APPROVAL_ROOM = { id: 'e1288b2b-398f-419a-8e71-b5cd3265ad2c', name: '#forge-render-testing' };
/** How long approve mode waits for the render to finish and park on its approval. */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;
/** Sets this bench made; never picked as a source, so copies never chain. */
const BENCH_SET_PREFIX = 'Bench · Meta live';
const PAID_TARGETS_PATH = '/api/ai-studio/publishing/paid/targets';
const APPROVALS_PATH = '/api/ai-studio/renders/approvals';
const brandQuery = `brandId=${encodeURIComponent(STARCRAFT_BRAND_ID)}`;

let session: MintedSession | null = null;
let outcome: { grade: 'PASS' | 'FAIL'; detail?: string } | null = null;

// --- session, backend reads, output ------------------------------------------------------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1] ?? '';
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[forge-live-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/** Pins THIS session to StarCraft through the same RLS the in-app switcher writes through. */
async function pinSessionToStarCraft(accessToken: string): Promise<void> {
  const { sub, session_id } = claimsOf(accessToken);
  const member = createClient(PROD_SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[forge-live-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[forge-live-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

/** A backend read as the minted member, parsed through the contract the app parses with. */
async function liveGet<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  if (!session) throw new Error('[forge-live-bench] no minted session');
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `[forge-live-bench] GET ${path} → ${response.status} ${(await response.text()).slice(0, 300)}`,
    );
  }
  return schema.parse(await response.json());
}

const writeOut = (result: Record<string, unknown>) =>
  writeFileSync(OUT, `${JSON.stringify({ mode: MODE, runId: RUN_ID, ...result }, null, 2)}\n`);

// --- page helpers ------------------------------------------------------------------------------

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pathOf = (response: Response) => new URL(response.url()).pathname;

async function openForge(browser: Browser): Promise<Page> {
  if (!session) throw new Error('[forge-live-bench] no minted session');
  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  // The first hit compiles /forge in the dev server.
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  return page;
}

/** A click on server-rendered markup before hydration does nothing, so retry until selected. */
async function openTab(page: Page, name: RegExp) {
  const tab = page.getByRole('tab', { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
}

/** A Render grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

/** The tray's one way forward: the last button in its footer, named for the step it takes. */
async function pressPrimary(tray: Locator, name: string | RegExp, timeout?: number) {
  const primary = tray.locator('footer').getByRole('button').last();
  await expect(primary).toHaveText(name, { timeout });
  await expect(primary).toBeEnabled({ timeout });
  await primary.click();
}

/** A Base UI Select: open the trigger, press the first matching option; returns its text. */
async function chooseOption(scope: Locator, combobox: string, option: RegExp): Promise<string> {
  await scope.getByRole('combobox', { name: combobox, exact: true }).click();
  const item = scope.page().getByRole('listbox').getByRole('option', { name: option }).first();
  const text = ((await item.textContent()) ?? '').trim();
  await item.click();
  return text;
}

/** One row of the Deliver step's Meta list, however its target button is named right now. */
const metaRow = (tray: Locator, name: string): Locator =>
  tray.getByRole('listitem').filter({
    has: tray.page().getByRole('button', {
      name: new RegExp(`^(Replace an ad|Change the ad) for ${escapeRegExp(name)}$`),
    }),
  });

/** The next page the Meta drill-down asks the paid-targets route for, at one level. */
const nextPaidPage = (page: Page, level: PaidCanvasTarget['level'], parentId?: string) =>
  page.waitForResponse(
    (response) => {
      if (response.request().method() !== 'GET' || pathOf(response) !== PAID_TARGETS_PATH)
        return false;
      const params = new URL(response.url()).searchParams;
      return (
        params.get('level') === level &&
        (params.get('parentId') ?? undefined) === parentId &&
        !params.get('query')
      );
    },
    { timeout: 90_000 },
  );

/**
 * Finds one Meta object by id in the drill-down's own answers — paging with "More" as a person
 * would — and returns a click on its row. The rows show names, never ids, so the id is matched in
 * the response and the name (with its position among equal names) is what gets clicked.
 */
async function findListed(
  drill: Locator,
  level: PaidCanvasTarget['level'],
  id: string,
  listed: Promise<Response>,
  parentId?: string,
): Promise<{ item: PaidCanvasTarget; click: () => Promise<void> }> {
  const noun = level === 'adset' ? 'ad set' : level;
  const items: PaidCanvasTarget[] = [];
  let response = await listed;
  for (;;) {
    expect(response.ok(), `the ${noun} list → ${response.status()}`).toBe(true);
    const body = paidCanvasTargetSearchResponseSchema.parse(await response.json());
    expect(body.adAccountId, 'Meta answered for an account that is not the sandbox').toBe(
      SANDBOX_ACCOUNT,
    );
    items.push(...body.items);
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      const name = item.name || item.id;
      const twins = items.filter((candidate) => (candidate.name || candidate.id) === name);
      const button = drill
        .getByRole('button')
        .filter({ has: drill.page().getByText(name, { exact: true }) })
        .nth(twins.indexOf(item));
      return { item, click: () => button.click() };
    }
    if (!body.nextCursor) {
      throw new Error(
        `[forge-live-bench] ${noun} ${id} is not among the ${items.length} paused or active ${noun}s listed${parentId ? ` under ${parentId}` : ''} in ${SANDBOX_ACCOUNT}`,
      );
    }
    const more = nextPaidPage(drill.page(), level, parentId);
    await drill.getByRole('button', { name: `More ${noun}s`, exact: true }).click();
    response = await more;
  }
}

/**
 * Opens a row's drill-down and walks it into the sandbox ad set. Each list is listened for
 * before the click that asks for it; the ad set's own ads come back as `ads`.
 */
async function drillIntoAdset(
  page: Page,
  tray: Locator,
  name: string,
): Promise<{
  drill: Locator;
  campaign: PaidCanvasTarget;
  adset: PaidCanvasTarget;
  ads: Promise<Response>;
}> {
  const drill = metaRow(tray, name);
  const campaigns = nextPaidPage(page, 'campaign');
  await drill.getByRole('button', { name: `Replace an ad for ${name}`, exact: true }).click();
  const campaign = await findListed(drill, 'campaign', CAMPAIGN_ID, campaigns);
  const adsets = nextPaidPage(page, 'adset', CAMPAIGN_ID);
  await campaign.click();
  const adset = await findListed(drill, 'adset', ADSET_ID, adsets, CAMPAIGN_ID);
  const ads = nextPaidPage(page, 'ad', ADSET_ID);
  await adset.click();
  return { drill, campaign: campaign.item, adset: adset.item, ads };
}

// --- confirm -----------------------------------------------------------------------------------

type Source = { set: ForgeRenderSet; rowLabel: string; template: ApiRenderTemplateSummary };

/**
 * The newest finished template-133 render whose set and ROOT row still exist, in a set this bench
 * did not make: its values are known to render, which no hand-typed row can promise.
 */
async function pickSource(): Promise<Source> {
  const [{ items: templates }, { items: sets }, { items: jobs }] = await Promise.all([
    liveGet(`${API_RENDER_TEMPLATES_ROUTE}?${brandQuery}`, apiRenderTemplateListResponseSchema),
    liveGet(
      `${API_RENDER_SETS_ROUTE}?${brandQuery}&templateKey=${encodeURIComponent(TEMPLATE_KEY)}`,
      forgeRenderSetListResponseSchema,
    ),
    liveGet(
      `${API_RENDER_JOBS_ROUTE}?${brandQuery}&templateKey=${encodeURIComponent(TEMPLATE_KEY)}&status=finished&limit=50`,
      apiRenderJobListResponseSchema,
    ),
  ]);
  for (const job of jobs) {
    const set = sets.find(
      (item) => item.id === job.renderSetId && !item.name.startsWith(BENCH_SET_PREFIX),
    );
    const row = set?.rows.find((item) => item.id === job.renderSetRowId && !item.parentId);
    const template = templates.find(
      (item) => item.key === TEMPLATE_KEY && item.bindingId === set?.bindingId,
    );
    if (!set || !row || !template) continue;
    const labels = set.rows.map((item) => item.label);
    const unique = (label: string) => labels.filter((item) => item === label).length;
    // The grid finds rows by name, so the row and its copy must each be the only one so named.
    if (unique(row.label) !== 1 || unique(`${row.label} copy`) !== 0) continue;
    if (sets.filter((item) => item.name === set.name).length !== 1) continue;
    return { set, rowLabel: row.label, template };
  }
  throw new Error(
    `[forge-live-bench] no finished template ${TEMPLATE_KEY} render has a root row in a uniquely named set (${jobs.length} finished renders, ${sets.length} sets)`,
  );
}

async function selectTemplate(page: Page, template: ApiRenderTemplateSummary): Promise<void> {
  const label = template.displayName ?? templateDisplayName(template.name);
  const picker = page.getByRole('button', { name: 'Template', exact: true });
  await expect(picker).toBeEnabled({ timeout: 120_000 });
  if (!(await picker.textContent())?.includes(label)) {
    await picker.click();
    await page
      .getByRole('menuitemradio', { name: new RegExp(`^${escapeRegExp(label)}`) })
      .first()
      .click();
  }
  await expect(picker).toContainText(label);
}

/** The rail's Duplicate, then Rename, on the copy it opens. Returns the copy. */
async function duplicateAndName(page: Page, source: ForgeRenderSet): Promise<ForgeRenderSet> {
  const show = page.getByRole('button', { name: 'Show render sets', exact: true });
  if (await show.isVisible()) await show.click();
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && pathOf(response) === API_RENDER_SETS_ROUTE,
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: `Actions for ${source.name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  const response = await created;
  expect(response.ok(), `duplicate → ${response.status()}`).toBe(true);
  const copy = forgeRenderSetSchema.parse(await response.json());

  const name = `${BENCH_SET_PREFIX} ${RUN_ID}`;
  const active = page
    .getByRole('list', { name: 'Render sets' })
    .getByRole('listitem')
    .filter({ has: page.locator('button[aria-current="true"]') });
  await active.getByRole('button', { name: `Actions for ${copy.name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename render set' });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open ${name}`, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 60_000 },
  );
  return { ...copy, name };
}

/** A copy of a proven row sits beside it: two rows, both known to render. */
async function twoProvenRows(page: Page, label: string): Promise<[string, string]> {
  const copyLabel = `${label} copy`;
  await expect(gridRow(page, label)).toHaveCount(1, { timeout: 120_000 });
  await page.getByRole('button', { name: `Row actions for ${label}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await expect(gridRow(page, copyLabel)).toHaveCount(1);
  for (const name of [label, copyLabel]) {
    await expect(
      gridRow(page, name).getByText(/^(Ready|AI check after render|Needs review)$/),
      `${name} passes the real preflight`,
    ).toBeVisible({ timeout: 180_000 });
    await gridRow(page, name).getByRole('checkbox', { name: 'Select row' }).click();
  }
  return [label, copyLabel];
}

/** One row that passes the real preflight, selected. */
async function oneProvenRow(page: Page, label: string): Promise<string> {
  await expect(gridRow(page, label)).toHaveCount(1, { timeout: 120_000 });
  await expect(
    gridRow(page, label).getByText(/^(Ready|AI check after render|Needs review)$/),
    `${label} passes the real preflight`,
  ).toBeVisible({ timeout: 180_000 });
  await gridRow(page, label).getByRole('checkbox', { name: 'Select row' }).click();
  return label;
}

/** Exactly the one bench room, whatever the brand's defaults pre-selected. */
async function onlyTheBenchRoom(tray: Locator): Promise<void> {
  const rooms = tray.getByRole('list', { name: 'Approval rooms' });
  const room = rooms.getByRole('checkbox', { name: APPROVAL_ROOM.name, exact: true });
  await expect(room, `${APPROVAL_ROOM.name} is one of StarCraft's approval rooms`).toBeVisible({
    timeout: 60_000,
  });
  for (const box of await rooms.getByRole('checkbox').all()) {
    const wanted = (await box.getAttribute('aria-label')) === APPROVAL_ROOM.name;
    if (wanted !== ((await box.getAttribute('aria-checked')) === 'true')) await box.click();
    await expect(box).toHaveAttribute('aria-checked', String(wanted));
  }
}

// --- approve -----------------------------------------------------------------------------------

/** The job's delivery parks on an approval once the render finishes; wait for it to be pending. */
async function pendingJob(jobId: string): Promise<ApiRenderJob> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let job: ApiRenderJob | null = null;
  while (Date.now() < deadline) {
    job = await liveGet(
      `${API_RENDER_JOBS_ROUTE}/${encodeURIComponent(jobId)}?${brandQuery}`,
      apiRenderJobSchema,
    );
    if (job.status === 'failed') {
      throw new Error(`[forge-live-bench] job ${jobId} failed: ${job.error ?? 'no reason'}`);
    }
    if (job.approval && job.approval.status !== 'pending') {
      throw new Error(
        `[forge-live-bench] job ${jobId}'s approval is already ${job.approval.status}`,
      );
    }
    if (job.approval?.status === 'pending' && job.taskUid) return job;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 10_000));
  }
  throw new Error(
    `[forge-live-bench] job ${jobId} has no pending approval after ${Math.round(APPROVAL_TIMEOUT_MS / 1000)}s (status ${job?.status ?? 'unread'}, approval ${job?.approval?.status ?? 'none'})`,
  );
}

// --- the run -----------------------------------------------------------------------------------

test.beforeAll(async () => {
  test.setTimeout(120_000);
  try {
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    await pinSessionToStarCraft(session.accessToken);
  } catch (error) {
    // No test runs after a failed beforeAll, so afterEach never grades it: afterAll does.
    outcome = { grade: 'FAIL', detail: error instanceof Error ? error.message : String(error) };
    writeOut({ ok: false, error: outcome.detail });
    throw error;
  }
});

// biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === 'skipped') return;
  const passed = testInfo.status === 'passed';
  outcome = passed
    ? { grade: 'PASS' }
    : { grade: 'FAIL', detail: testInfo.error?.message?.slice(0, 500) };
  if (!passed) writeOut({ ok: false, error: outcome.detail ?? testInfo.status });
});

test.afterAll(async () => {
  if (session) {
    // Revokes only this bench session; the FK cascade takes its session-brand pin with it.
    const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
    session = null;
  }
  // `scripts/factory/bench.mjs` reads the last stdout JSON line carrying `counts`.
  const fail = outcome?.grade === 'FAIL' ? 1 : 0;
  console.log(
    JSON.stringify({
      bench: 'forge:meta:live:bench',
      mode: MODE,
      target: process.env.PLAYWRIGHT_BASE_URL,
      backend: API_URL,
      results: outcome ? [{ step: MODE, ...outcome }] : [],
      notes: [
        MODE === 'confirm'
          ? 'Real Forge UI, real backend, Meta sandbox account; stops at the approval room — nothing is published until approve mode.'
          : 'Approves one job in the Forge; the publish itself is the backend plugin, read back by the caller.',
      ],
      counts: { pass: fail ? 0 : outcome ? 1 : 0, warn: 0, skip: outcome ? 0 : 1, fail },
      exitCode: fail,
    }),
  );
});

// META_SANDBOX_AD_ID names an ad to swap; without one (Meta's sandbox refuses every ad create
// without a payment method, so none can exist) the render is one new paused ad.
test('confirm · a Forge render into the sandbox ad set is held for approval', async ({
  browser,
}) => {
  test.skip(MODE !== 'confirm', 'FORGE_LIVE_MODE is not confirm');
  const source = await pickSource();
  console.log(
    `[forge-live-bench] source: set "${source.set.name}" row "${source.rowLabel}" (${source.template.environment})`,
  );
  const page = await openForge(browser);
  await openTab(page, /^Render$/);
  await selectTemplate(page, source.template);
  const copy = await duplicateAndName(page, source.set);
  const rows = AD_ID
    ? await twoProvenRows(page, source.rowLabel)
    : [await oneProvenRow(page, source.rowLabel)];
  const replacing = AD_ID ? (rows[0] ?? null) : null;
  const creating = rows.at(-1)!;
  const rowWord = rows.length === 1 ? '1 row' : `${rows.length} rows`;

  await page.getByRole('button', { name: new RegExp(`^Render ${rowWord} · \\d+ files?$`) }).click();
  const tray = page.getByRole('region', { name: 'Review and render' });
  await expect(tray.getByRole('heading', { name: `Render ${rowWord}` })).toBeVisible();
  await pressPrimary(tray, 'Next: delivery', 180_000);
  const change = tray.getByRole('button', { name: 'Change delivery', exact: true });
  if (await change.isVisible()) await change.click();
  await expect(
    tray.getByRole('button', { name: `Replace an ad for ${rows[0]}`, exact: true }),
    'StarCraft has a Meta ad account connected',
  ).toBeVisible({ timeout: 60_000 });

  // Row 1 (only with an ad to swap): campaign → ad set → the sandbox ad, then its one comp.
  let replaced: { name: string; comp: string } | null = null;
  if (replacing) {
    const first = await drillIntoAdset(page, tray, replacing);
    const ad = await findListed(first.drill, 'ad', AD_ID, first.ads, ADSET_ID);
    await ad.click();
    await expect(metaRow(tray, replacing)).toContainText(ad.item.name || ad.item.id);
    const square = await chooseOption(tray, `Format for ${replacing}`, /^1:1 · /);
    replaced = { name: ad.item.name || AD_ID, comp: square.replace(/^1:1 · /, '') };
  }

  // Row 2: campaign → the sandbox ad set, then a new paused ad in it.
  const second = await drillIntoAdset(page, tray, creating);
  expect((await second.ads).ok(), 'the ad set’s ads load').toBe(true);
  await second.drill.getByRole('button', { name: 'New paused ad in this ad set' }).click();
  await expect(metaRow(tray, creating)).toContainText(
    `New paused ad in ${second.campaign.name || CAMPAIGN_ID} › ${second.adset.name || ADSET_ID}`,
  );

  await onlyTheBenchRoom(tray);

  // A delivery pick is saved into the set; a save that moves its revision sends the tray back to
  // Review, which re-checks by itself — press on again once it has.
  await expect(async () => {
    const primary = tray.locator('footer').getByRole('button').last();
    if ((await primary.textContent())?.includes('Next: delivery') && (await primary.isEnabled()))
      await primary.click();
    await expect(primary).toHaveText('Next: confirm', { timeout: 2_000 });
    await expect(primary).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 180_000 });
  await pressPrimary(tray, 'Next: confirm');

  if (replaced) {
    await expect(tray.getByText(/1 ad replacement held for approval/).first()).toBeVisible();
    await expect(tray.getByText(`replaces ${replaced.name} · 1:1`)).toBeVisible();
  }
  await expect(tray.getByText(/1 new paused ad held for approval/).first()).toBeVisible();
  await expect(
    tray.getByText(`new paused ad in ${second.adset.name || ADSET_ID}`, { exact: true }),
  ).toBeVisible();
  await expect(
    tray.getByText(/Nothing changes in Ads Manager until someone approves/).first(),
  ).toBeVisible();

  const signed = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === API_RENDER_BATCH_PREFLIGHT_ROUTE &&
      Boolean(
        (request.postDataJSON() as ApiRenderBatchPreflightRequest | null)?.records.some(
          (record) => record.delivery,
        ),
      ),
    { timeout: 180_000 },
  );
  const fired = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && pathOf(response) === API_RENDER_BATCHES_ROUTE,
    { timeout: 180_000 },
  );
  await pressPrimary(tray, /^Render \d+ files?$/);

  // What the token signs: the sandbox account, the ad, the ad set, one comp, the one room.
  const request = apiRenderBatchPreflightRequestSchema.parse((await signed).postDataJSON());
  expect(request.approvalDestinationIds).toEqual([APPROVAL_ROOM.id]);
  expect(request.records).toHaveLength(rows.length);
  const replaceRecord = request.records.find((record) => record.delivery?.action === 'replace');
  const createRecord = request.records.find((record) => record.delivery?.action === 'create');
  if (replaced) {
    expect(replaceRecord?.delivery).toMatchObject({
      action: 'replace',
      adAccountId: SANDBOX_ACCOUNT,
      campaignId: CAMPAIGN_ID,
      adsetId: ADSET_ID,
      adId: AD_ID,
    });
    expect(replaceRecord?.outputIds).toEqual([replaced.comp]);
  } else {
    expect(replaceRecord).toBeUndefined();
  }
  expect(createRecord?.delivery).toMatchObject({
    action: 'create',
    adAccountId: SANDBOX_ACCOUNT,
    campaignId: CAMPAIGN_ID,
    adsetId: ADSET_ID,
    adStatus: 'PAUSED',
  });

  const response = await fired;
  expect(response.ok(), `createBatch → ${response.status()}`).toBe(true);
  const batch = apiRenderBatchSchema.parse(await response.json());
  const actionOfRow = new Map(
    request.records.map((record) => [record.renderSetRowId, record.delivery?.action]),
  );
  const jobs = batch.jobs.map((job) => ({
    jobId: job.id,
    action: job.deliveryTarget?.action ?? actionOfRow.get(job.renderSetRowId ?? undefined),
    rowLabel: job.label,
  }));
  expect(jobs.map((job) => job.action).sort()).toEqual(
    replaced ? ['create', 'replace'] : ['create'],
  );
  await expect(
    tray.getByRole('heading', {
      name: rows.length === 1 ? '1 render queued' : `${rows.length} renders queued`,
    }),
  ).toBeVisible();

  writeOut({
    ok: true,
    setId: copy.id,
    setName: copy.name,
    batchId: batch.batchId,
    jobs,
    adAccountId: SANDBOX_ACCOUNT,
    replaceFormat: replaced?.comp ?? null,
    approvalDestinationId: APPROVAL_ROOM.id,
  });
  console.log(`[forge-live-bench] confirmed batch ${batch.batchId}: ${JSON.stringify(jobs)}`);
});

test('approve · the job’s own card is approved in the Forge and starts publishing', async ({
  browser,
}) => {
  test.skip(MODE !== 'approve', 'FORGE_LIVE_MODE is not approve');
  test.setTimeout(APPROVAL_TIMEOUT_MS + 5 * 60_000);
  const job = await pendingJob(APPROVE_JOB);

  const page = await openForge(browser);
  // The list exactly as the page read it: the card shows a file URL, and that URL is the handle.
  let listed: RenderApproval[] = [];
  page.on('response', async (response) => {
    if (response.request().method() !== 'GET' || pathOf(response) !== APPROVALS_PATH) return;
    const parsed = renderApprovalListResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (parsed.success) listed = parsed.data.approvals;
  });
  await openTab(page, /^Render ledger/);
  await expect
    .poll(() => listed.find((item) => item.taskUid === job.taskUid)?.status, {
      message: `job ${job.id}'s approval appears in the Forge list`,
      timeout: 90_000,
    })
    .toBe('pending');
  const approval = listed.find((item) => item.taskUid === job.taskUid) as RenderApproval;
  const file = approval.files[0]?.url;
  if (!file) throw new Error(`[forge-live-bench] approval ${approval.id} shows no file`);

  const section = page.getByRole('button', { name: /^Pending approvals/ });
  if ((await section.getAttribute('aria-expanded')) === 'false') await section.click();
  // The nearest block around this job's picture that holds an Approve button is its card.
  const approve = page
    .locator(`[src="${file.replace(/["\\]/g, '\\$&')}"]`)
    .first()
    .locator('xpath=ancestor::div[.//button[normalize-space()="Approve and publish paused"]][1]')
    .getByRole('button', { name: 'Approve and publish paused' });
  const decided = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /^\/api\/ai-studio\/renders\/approvals\/[^/]+\/decision$/.test(pathOf(response)),
    { timeout: 120_000 },
  );
  await approve.click();
  const response = await decided;
  expect(pathOf(response), 'the pressed card decided this job’s approval').toBe(
    `${APPROVALS_PATH}/${approval.id}/decision`,
  );
  expect(response.ok(), `decision → ${response.status()}`).toBe(true);
  const decision = renderApprovalDecisionResponseSchema.parse(await response.json());
  expect(
    ['approved', 'published'],
    `approval ${decision.approval.status}: ${decision.deliveryReason ?? 'no reason'}`,
  ).toContain(decision.approval.status);
  await expect(
    page.getByText(/^(Approved\. Publishing now|Published as a paused ad\.)/).first(),
  ).toBeVisible();

  writeOut({
    ok: true,
    approved: true,
    jobId: job.id,
    approvalId: approval.id,
    status: decision.approval.status,
    deliveryStatus: decision.deliveryStatus,
  });
  console.log(
    `[forge-live-bench] approved ${approval.id} for job ${job.id}: ${decision.approval.status}`,
  );
});
