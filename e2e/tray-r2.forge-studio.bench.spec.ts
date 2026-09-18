import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type ApiRenderBatchPreflightRequest,
  renderApprovalDestinationListResponseSchema,
} from '@continuum/contracts';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import {
  FORGE_FIXTURE,
  type ForgeFixtures,
  installForgeFixtures,
  STARCRAFT_BRAND_ID,
} from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:studio:e2e:bench — the Render tab's review tray, round 2, in a real Chrome.
//
// Same harness as render-grid.forge-studio.bench.spec.ts: a real minted StarCraft session, the
// server-rendered /forge page and brand context (which is where the person's brand role comes
// from), every /api/ai-studio/** call answered by contract-parsed fixtures, the backend a dead
// port. This file adds one approval room through `context.route`, the brand's usual one.
//
// It proves, at 1280×800 and 1920×1200: the toolbar Render is the only way into the tray; the
// tray is walked Review → Deliver → Render by pressing ONLY its one primary button at the bottom
// right; Deliver reads its defaults as one line; a Final render is asked for there and reaches the
// signed batch preflight's body (the review's preflight never carries it); no native <select> is
// anywhere in the tray. And in the grid: a blank required field reads "Needs input", never
// "Invalid", and "Continuum fills this" explains itself.
//
// It does NOT exercise the Fastify backend (its 403 on a Final for a non-admin), the fleet, Slack
// or Meta — the envelope says so.
//
// Usage:
//   cd Continuum-Frontend && FORGE_STUDIO_E2E_PORT=3413 \
//     FORGE_STUDIO_DIST_DIR=.next/forge-studio-e2e-s3 \
//     bun run forge:studio:e2e:bench -- e2e/tray-r2.forge-studio.bench.spec.ts

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const RUN_ID = process.env.FORGE_STUDIO_RUN_ID ?? String(Date.now());
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
// Shared with the other forge-studio specs: one run, one results file, one complete envelope.
const RESULTS_PATH = join(tmpdir(), `forge-studio-bench-${RUN_ID}.jsonl`);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1200 },
] as const;

const ROWS = FORGE_FIXTURE.set.rows;
const ROOM = {
  id: '5e6f7081-92a3-4b45-8c6d-7e8f90123456',
  platform: 'slack' as const,
  role: 'client',
  name: 'forge-render-testing',
  activeApprovers: 1,
  requestedApprovers: 0,
};

let session: MintedSession | null = null;
const opened: BrowserContext[] = [];
const activeFixtures: ForgeFixtures[] = [];

// --- session and envelope (the pattern of render-grid.forge-studio.bench.spec.ts) --------------

function claimsOf(accessToken: string): { sub: string; session_id: string } {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('[tray-r2-bench] access token has no payload');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    session_id?: string;
  };
  if (!claims.sub || !claims.session_id) {
    throw new Error('[tray-r2-bench] access token carries no sub or session_id claim');
  }
  return { sub: claims.sub, session_id: claims.session_id };
}

/** Pins THIS session to StarCraft through the member's own RLS, then reads the pin back. */
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
  if (error) throw new Error(`[tray-r2-bench] session brand pin failed: ${error.message}`);
  const { data, error: resolveError } = await member
    .schema('brand_profiles')
    .rpc('resolve_active_brand_for_session');
  if (resolveError || data !== STARCRAFT_BRAND_ID) {
    throw new Error(
      `[tray-r2-bench] the session resolves to ${String(data)} (${resolveError?.message ?? 'no error'}), not StarCraft`,
    );
  }
}

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

function recordGrade(testInfo: TestInfo, problem: unknown): void {
  const failed =
    problem !== null || (testInfo.status !== 'passed' && testInfo.status !== 'skipped');
  const grade: Grade = {
    step: testInfo.title,
    grade: failed ? 'FAIL' : testInfo.status === 'skipped' ? 'SKIP' : 'PASS',
    ...(failed
      ? {
          detail: (problem instanceof Error ? problem.message : testInfo.error?.message)?.slice(
            0,
            500,
          ),
        }
      : {}),
  };
  appendFileSync(RESULTS_PATH, `${JSON.stringify(grade)}\n`);
}

function printEnvelope(): void {
  const results: Grade[] = existsSync(RESULTS_PATH)
    ? readFileSync(RESULTS_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Grade)
    : [];
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of results) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  const startedMs = Number(RUN_ID);
  console.log(
    JSON.stringify({
      bench: 'forge:studio:e2e:bench',
      mode: LIVE ? 'live' : 'fixtures',
      startedAt: new Date(Number.isFinite(startedMs) ? startedMs : Date.now()).toISOString(),
      durationMs: Number.isFinite(startedMs) ? Date.now() - startedMs : 0,
      results,
      notes: [
        'FIXTURES: every /api/ai-studio/** call was answered in the browser by fixtures parsed through the real contracts, plus one approval room added by tray-r2.forge-studio.bench.spec.ts; the backend URL is a dead port.',
        'NOT exercised: the Fastify backend (including its owner/admin refusal of a Final), the render fleet, Slack and Meta. Real: Chrome, the minted StarCraft session, the server-rendered brand context and role, and every Render-tab component.',
      ],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

async function settle(testInfo: TestInfo, checks: () => void): Promise<void> {
  let problem: unknown = null;
  try {
    if (testInfo.status === 'passed') checks();
  } catch (error) {
    problem = error;
  } finally {
    await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
    activeFixtures.length = 0;
    recordGrade(testInfo, problem);
  }
  if (problem) throw problem;
}

// --- page helpers --------------------------------------------------------------------------

/** The brand's approval room, pre-selected the way the backend's `defaultDestinationIds` does. */
async function answerApprovalRooms(context: BrowserContext) {
  const body = renderApprovalDestinationListResponseSchema.parse({
    destinations: [ROOM],
    defaultDestinationIds: [ROOM.id],
  });
  await context.route(
    (url) => url.pathname === '/api/ai-studio/renders/approval-destinations',
    async (route) => {
      const origin = (await route.request().headerValue('origin')) ?? '*';
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type, Authorization, Accept',
        'access-control-allow-methods': 'GET, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  );
}

async function openRenderTab(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; fixtures: ForgeFixtures }> {
  if (!session) throw new Error('[tray-r2-bench] no minted session');
  const context = await browser.newContext({ storageState: session.state, viewport });
  opened.push(context);
  const fixtures = await installForgeFixtures(context);
  activeFixtures.push(fixtures);
  // Registered after the fixtures, so it answers first.
  await answerApprovalRooms(context);
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const tab = page.getByRole('tab', { name: 'Render', exact: true });
  // A click before hydration does nothing; retry until the tab really is selected.
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  return { page, fixtures };
}

/** A grid row, found by its drag handle — the one control named after the row. */
const gridRow = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${label}`, exact: true }) });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `tray-r2-${name}.png`) }).catch(() => undefined);
}

const stepNames = (tray: Locator) =>
  tray.getByRole('list', { name: 'Pre-flight steps' }).getByRole('listitem').allTextContents();

/**
 * The tray's one way forward: the last button in its footer. Checked to be the named, enabled,
 * full-size button at the bottom right, then pressed — the only click that moves the tray on.
 */
async function pressPrimary(tray: Locator, name: string): Promise<void> {
  const footer = tray.locator('footer');
  const primary = footer.getByRole('button').last();
  await expect(primary).toHaveText(name);
  await expect(primary).toBeEnabled();
  const [trayBox, box] = await Promise.all([tray.boundingBox(), primary.boundingBox()]);
  expect(trayBox && box, 'the tray and its primary button are laid out').toBeTruthy();
  if (trayBox && box) {
    expect(trayBox.x + trayBox.width - (box.x + box.width), 'at the right edge').toBeLessThan(40);
    expect(trayBox.y + trayBox.height - (box.y + box.height), 'at the bottom').toBeLessThan(24);
    // Default size (2rem), not the old `xs` (1.5rem). The root font steps with the viewport.
    const rem = await tray
      .page()
      .evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(box.height / rem).toBeGreaterThanOrEqual(1.95);
  }
  await primary.click();
}

// --- the run -------------------------------------------------------------------------------

test.beforeAll(async () => {
  test.setTimeout(120_000);
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  if (session) {
    const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
    session = null;
  }
  printEnvelope();
});

test.describe('Review tray, round 2 — fixtures', () => {
  test.skip(LIVE, 'the tray bench runs on fixtures only');

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    const fixtures = [...activeFixtures];
    await settle(testInfo, () => {
      for (const fixture of fixtures) {
        expect(fixture.violations, 'a body the real contract refuses').toEqual([]);
        expect([...fixture.brandIds], 'every Forge request is scoped to StarCraft').toEqual([
          STARCRAFT_BRAND_ID,
        ]);
      }
    });
  });

  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;

    test(`TRAY1 · ${size} · one primary button walks Review → Deliver → a Final render`, async ({
      browser,
    }) => {
      const { page, fixtures } = await openRenderTab(browser, viewport);
      const root = gridRow(page, ROWS.root);
      await expect(root.getByText('Ready', { exact: true })).toBeVisible();
      await root.getByRole('checkbox', { name: 'Select row' }).click();

      // One way in: the toolbar. The folded strip under the grid only reports.
      const readiness = page.getByRole('region', { name: 'Readiness' });
      await expect(readiness).toBeVisible();
      await expect(readiness.getByRole('button')).toHaveCount(0);
      await page.getByRole('button', { name: 'Render 1 row · 2 files', exact: true }).click();

      const tray = page.getByRole('region', { name: 'Review and render' });
      await expect(tray).toBeVisible();
      await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(0);
      await expect(tray.getByText('Ready · 1 of 1 row checked')).toBeVisible();
      // The header holds the title, the steps and ✕ — nothing that moves the tray on.
      await expect(tray.locator('header').getByRole('button')).toHaveCount(1);
      await expect(
        tray.locator('header').getByRole('button', { name: 'Close review' }),
      ).toBeVisible();
      await expect(tray.locator('select')).toHaveCount(0);
      await shoot(page, `${size}-review`);
      await pressPrimary(tray, 'Next: delivery');

      // Deliver: the defaults as one line, the brand's room already chosen. No Meta target, so
      // there is no Confirm step — Proof or Final and each row's output are read here.
      await expect.poll(() => stepNames(tray)).toEqual(['Review', 'Deliver', 'Running']);
      const line = tray.getByRole('button', { name: 'Change delivery' }).locator('xpath=..');
      await expect(line).toContainText(`Library · #${ROOM.name} approval · 1 approver`);
      await expect(tray.locator('select')).toHaveCount(0);
      const outputs = tray.getByRole('list', { name: 'Output per row' });
      await expect(outputs.getByRole('listitem')).toHaveCount(1);
      await expect(outputs).toContainText('Still image');
      const final = tray.getByRole('radio', { name: 'Final', exact: true });
      await expect(final, 'the StarCraft owner may render a Final').toBeEnabled();
      await expect(tray.getByRole('radio', { name: 'Proof', exact: true })).toBeChecked();
      await final.click();
      await expect(final).toBeChecked();
      await shoot(page, `${size}-deliver`);

      const reviews = fixtures.calls('POST', /\/renders\/batch-preflight$/).length;
      await pressPrimary(tray, 'Render 2 files');
      await expect.poll(() => fixtures.calls('POST', /\/renders\/batches$/).length).toBe(1);

      const preflights = fixtures.calls('POST', /\/renders\/batch-preflight$/);
      expect(preflights).toHaveLength(reviews + 1);
      const signed = preflights.at(-1)?.body as ApiRenderBatchPreflightRequest;
      expect(signed.final, 'Final is in the preflight the token is signed from').toBe(true);
      expect(signed.approvalDestinationIds).toEqual([ROOM.id]);
      expect(signed.records.map((record) => record.label)).toEqual([ROWS.root]);
      for (const review of preflights.slice(0, -1)) {
        expect((review.body as ApiRenderBatchPreflightRequest).final).toBeUndefined();
      }

      // Running follows the fired job, still on the Render tab.
      const fired = tray.getByRole('list', { name: 'Fired renders' });
      await expect(fired.getByRole('listitem')).toHaveCount(1);
      await expect(page.getByRole('tab', { name: 'Render', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await shoot(page, `${size}-running`);
    });
  }

  test('TRAY2 · 1280x800 · a blank required field reads Needs input; the logo slot explains itself', async ({
    browser,
  }) => {
    const { page } = await openRenderTab(browser, VIEWPORTS[0]);
    const root = gridRow(page, ROWS.root);
    await expect(root.getByText('Ready', { exact: true })).toBeVisible();

    const fills = root.getByRole('button', { name: 'Continuum fills this' });
    await fills.hover();
    await expect(
      page.getByText('The brand’s logo, filled in automatically at render time.'),
    ).toBeVisible();

    await root
      .getByRole('textbox', { name: FORGE_FIXTURE.variables.headline, exact: true })
      .fill('');
    const status = root.getByText('Needs input', { exact: true });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('title', 'Fill in Headline');
    await expect(root.getByText('Invalid', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Readiness' })).toContainText('1 needs input');
    await shoot(page, 'needs-input');
  });
});
