import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  mintAccessTokenForEmail,
  mintSessionForEmail,
  type PlaywrightStorageState,
} from './support/auth';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// optimizer:rebalance:e2e:bench — the grouped rebalance, end to end.
//
// A real Chrome, driving the real Frontend as a real authenticated member, against
// PRODUCTION Supabase and the real optimizer read path. No mock, no fixture, no
// synthetic payload: the numbers asserted below are read out of optimizer.cycle_items
// FIRST, then asserted against the RENDERED DOM. If the engine rescored the portfolio
// overnight, the expectation moves with it — the bench reads the live run.
//
// What it proves:
//   1. A conserved cycle renders as ONE grouped decision naming the transfer, not as N
//      unrelated rows. This is the whole point of the change.
//   2. Every member ad set is still individually selectable (a subset approval is a
//      legitimate operator choice; grouping must not take it away).
//   3. Selecting a strict subset surfaces the net daily-spend change it would cause.
//   4. A single move explains itself from the diagnostics already on the row.
//
// It is READ-ONLY on the ad platform: it never approves, never executes, never touches
// Meta. The one write is the bench user's active-brand preference row, restored in
// afterAll — the same contract optimizer-experience.spec.ts uses.
//
// Separate file and config from optimizer-experience.spec.ts on purpose: that suite runs
// `mode: 'serial'`, so its (currently drifted) first fixture would skip everything after
// it. This bench must be able to go green on its own.
// ---------------------------------------------------------------------------

loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const AGENCY_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const ACCOUNT_ID = '521903353286118';
const PORTFOLIO_NAME = 'Reporte Agosto - Citas y Mensajes';
const SHOTS_DIR = resolve(process.cwd(), 'e2e/.artifacts/optimizer-rebalance');

const admin = createClient(PROD_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: { persistSession: false },
});

type LiveMove = { adsetId: string; name: string | null; changeAbs: number };
type LiveRebalance = { donors: LiveMove[]; recipients: LiveMove[]; moved: number; net: number };

let storageState: PlaywrightStorageState;
let benchUserId: string;
let originalActiveBrandId: string | null = null;
let live: LiveRebalance;

function subjectOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub as string;
}

async function selectBrand(brandId: string): Promise<void> {
  const { error } = await admin
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: benchUserId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[rebalance-bench] brand switch failed: ${error.message}`);
}

/** The live allocation vector, read through the SAME public RPCs the UI reads. The
 *  `optimizer` schema is not in PostgREST's exposed-schema allowlist, so the tables are
 *  unreachable over supabase-js — and going through the real read path is the better bench
 *  anyway: if the RPC stops returning the vector, this fails for the right reason. */
async function readLiveRebalance(): Promise<LiveRebalance> {
  const { data: portfolios, error: pErr } = await admin.rpc('optimizer_list_portfolios', {
    p_brand_id: AGENCY_BRAND_ID,
  });
  if (pErr) throw new Error(`[rebalance-bench] optimizer_list_portfolios failed: ${pErr.message}`);
  const portfolio = (portfolios as { id: string; name: string; status: string }[] | null)?.find(
    (row) => row.name === PORTFOLIO_NAME && row.status === 'active',
  );
  if (!portfolio) throw new Error(`[rebalance-bench] portfolio "${PORTFOLIO_NAME}" not found`);

  const { data: report, error: rErr } = await admin.rpc('optimizer_get_portfolio_performance', {
    p_portfolio_id: portfolio.id,
  });
  if (rErr) throw new Error(`[rebalance-bench] performance read failed: ${rErr.message}`);

  const items =
    (
      report as {
        latest_items?: {
          adset_id: string;
          adset_name: string | null;
          change_abs: number | null;
          diagnostics: { freezeReason?: string } | null;
        }[];
      } | null
    )?.latest_items ?? [];
  if (items.length === 0) throw new Error('[rebalance-bench] the latest cycle scored no items');

  const moves: LiveMove[] = items
    .filter((row) => !row.diagnostics?.freezeReason && Math.abs(row.change_abs ?? 0) >= 1)
    .map((row) => ({
      adsetId: row.adset_id,
      // The performance RPC joins the enrolled name onto the row — the same field the UI
      // resolves through resolveAdsetName, so bench and DOM cannot disagree about naming.
      name: row.adset_name?.trim() || null,
      changeAbs: row.change_abs ?? 0,
    }));

  const donors = moves.filter((m) => m.changeAbs < 0).sort((a, b) => a.changeAbs - b.changeAbs);
  const recipients = moves.filter((m) => m.changeAbs > 0).sort((a, b) => b.changeAbs - a.changeAbs);
  const raised = recipients.reduce((sum, m) => sum + m.changeAbs, 0);
  const cut = donors.reduce((sum, m) => sum - m.changeAbs, 0);
  return { donors, recipients, moved: Math.min(raised, cut), net: raised - cut };
}

async function openActionsTab(page: Page): Promise<void> {
  await page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
  const accountPicker = page.getByRole('combobox').first();
  await expect(accountPicker).toBeEnabled({ timeout: 180_000 });
  await accountPicker.click();
  await page.getByPlaceholder('Search ad accounts...').fill(ACCOUNT_ID);
  await page.getByRole('option').filter({ hasText: ACCOUNT_ID }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading optimizer' })).toHaveCount(0, {
    timeout: 120_000,
  });
  await page.getByRole('tab', { name: /^Actions/ }).click();
  // The heading carries a count badge, so its accessible name is not the bare portfolio
  // name — match the text node instead.
  await expect(page.getByText(PORTFOLIO_NAME).first()).toBeVisible({ timeout: 120_000 });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: 'serial' });

test.describe('Optimizer — a conserved rebalance reads as one decision', () => {
  test.beforeAll(async () => {
    const memberToken = await mintAccessTokenForEmail(OWNER_EMAIL);
    benchUserId = subjectOf(memberToken);
    storageState = await mintSessionForEmail(OWNER_EMAIL);

    const { data: pref } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', benchUserId)
      .maybeSingle();
    originalActiveBrandId = (pref as { active_brand_id: string } | null)?.active_brand_id ?? null;
    await selectBrand(AGENCY_BRAND_ID);

    live = await readLiveRebalance();
    console.log(
      `[rebalance-bench] live run: ${live.donors.length} donors fund ${live.recipients.length} recipients, ` +
        `$${live.moved.toFixed(2)} moved, net $${live.net.toFixed(2)}`,
    );
    expect(
      live.donors.length,
      'the live cycle must contain at least one CUT for a rebalance to exist',
    ).toBeGreaterThan(0);
    expect(
      live.recipients.length,
      'the live cycle must contain at least one RAISE for a rebalance to exist',
    ).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    if (originalActiveBrandId) await selectBrand(originalActiveBrandId);
  });

  test('the group header names the real transfer and its real conservation', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await openActionsTab(page);
    await shoot(page, 'actions-grouped');

    const pair = live.donors.length === 1 && live.recipients.length === 1;
    const header = page.getByText(pair ? /Moving/ : /Reallocating/).first();
    await expect(header).toBeVisible({ timeout: 60_000 });

    const headerText = (await header.textContent()) ?? '';
    // The dollar figure is read from the DB, not hardcoded — a rescore moves both together.
    expect(headerText).toContain(Math.round(live.moved).toLocaleString('en-US'));
    if (!pair) {
      expect(headerText).toContain(`${live.donors.length} ad sets fund ${live.recipients.length}`);
    }

    // A perfectly conserved vector must SAY that total spend does not move.
    if (Math.abs(live.net) < 1) {
      await expect(page.getByText('Total daily spend unchanged').first()).toBeVisible();
    }

    await context.close();
  });

  test('every member ad set is still individually selectable', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await openActionsTab(page);

    for (const move of [...live.donors, ...live.recipients]) {
      if (!move.name) continue;
      await expect(
        page.getByLabel(`Select budget move for ${move.name}`),
        `${move.name} lost its own checkbox to the group`,
      ).toBeVisible();
    }
    await expect(page.getByLabel('Select all budget moves in this cycle')).toBeVisible();

    await context.close();
  });

  test('selecting only the raises says what it does to total spend', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await openActionsTab(page);

    const named = live.recipients.filter((m) => m.name);
    test.skip(named.length === 0, 'no named recipient in the live run to select');

    for (const move of named) await page.getByLabel(`Select budget move for ${move.name}`).click();
    const expected = named.reduce((sum, m) => sum + m.changeAbs, 0);
    await expect(page.getByText(/Net \+/).first()).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Net \\+\\$${Math.round(expected).toLocaleString('en-US')}`)),
    ).toBeVisible();
    await shoot(page, 'partial-selection-net-delta');

    // Adding the donors back must bring it to flat on a conserved run.
    if (Math.abs(live.net) < 1) {
      for (const move of live.donors.filter((m) => m.name)) {
        await page.getByLabel(`Select budget move for ${move.name}`).click();
      }
      await expect(page.getByText('Spend stays flat')).toBeVisible();
      await shoot(page, 'full-selection-flat');
    }

    await context.close();
  });

  test('one move explains itself from the diagnostics already on the row', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await openActionsTab(page);

    await page.getByLabel('Show detail').first().click();
    await expect(page.getByText(/share of the pool/).first()).toBeVisible({ timeout: 30_000 });
    await shoot(page, 'per-move-why');

    await context.close();
  });
});
