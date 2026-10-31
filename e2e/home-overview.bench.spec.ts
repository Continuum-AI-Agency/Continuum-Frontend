import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  HOME_MODULE_LABELS,
  type HomeBrandReading,
  readBrand,
} from '../packages/contracts/src/home/brandReading';
import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  homeProfileRowSchema,
  inferHomeObjectives,
} from '../packages/contracts/src/home/objectives';
import { formatCount } from '../src/components/dashboard/overview/format';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from '../src/lib/home/brandSignals';
import { lastCompleteDays } from '../src/lib/paid-media/reportingWindow';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// home:overview:e2e:bench — the Home overview, end to end, on Easy Fit.
//
// A real Chrome drives the real Frontend as a real member of Easy Fit (magic link → verifyOtp
// → the @supabase/ssr cookie the app writes), against production Supabase and the deployed
// paid-media-reporting edge, reading Easy Fit's live Meta account. Every assertion is on
// RENDERED DOM, checked against figures this bench reads independently from the same edge.
//
// What it proves:
//   1. /dashboard opens on the Overview, not on the old Organic view.
//   2. The goal tiles are the ones the profile names (Easy Fit asked for "Tours booked" and
//      "Conversations started") or, before brand_profiles.home_profiles exists in production,
//      the ones inferred from the account's results — and each prints the same count the edge
//      returns for the seven complete days ending yesterday, the window the Home asks for.
//   3. Performance +, Organic + and Creative + all render without an error state.
//   4. The edit control opens on a goal tile.
//   5. The reading strip says how the Home reads Easy Fit — the mode, the goal, the module it
//      opens with — and the modules follow the reading's order. The expected reading is built
//      from this bench's own member-scoped reads (portfolios, accounts, Brand Book), so the
//      rendered strip is checked against the data, not against the page's own state.
//
// It reads only. The single write is the bench user's active-brand preference, restored at the
// end. It never saves a goal, so Easy Fit's real profile row is never touched; the save path is
// reported as un-exercised by name.
// ---------------------------------------------------------------------------

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
const MEMBER_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const EASYFIT_AD_ACCOUNT = 'act_521903353286118';

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('home:overview:e2e:bench', notes);

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberToken}` } },
  });
}

function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[home-bench] access token carries no sub claim');
  return decoded.sub;
}

async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[home-bench] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

type EdgeTotals = Record<string, number | undefined>;

async function readEdgeTotals(): Promise<EdgeTotals> {
  const { data, error } = await memberClient().functions.invoke('paid-media-reporting/metrics', {
    method: 'POST',
    body: {
      platform: 'meta',
      brandId: EASYFIT_BRAND_ID,
      adAccountId: EASYFIT_AD_ACCOUNT,
      scope: 'account_overview',
      // The window the Home asks for (useHomeOverviewData's homeRange): the seven complete days
      // ending yesterday. The edge's own last_7d also counts today's half-written day.
      range: lastCompleteDays(7),
    },
  });
  if (error) throw new Error(`[home-bench] edge account_overview failed: ${error.message}`);
  return ((data as { metrics?: EdgeTotals } | null)?.metrics ?? {}) as EdgeTotals;
}

async function readSavedObjectives(): Promise<{
  tableLive: boolean;
  objectives: HomeObjective[] | null;
}> {
  const { data, error } = await admin
    .schema('brand_profiles')
    .from('home_profiles')
    .select('brand_id, scope, objectives, source, updated_at')
    .eq('brand_id', EASYFIT_BRAND_ID)
    .eq('scope', 'brand')
    .maybeSingle();
  if (error) return { tableLive: false, objectives: null };
  const parsed = data ? homeProfileRowSchema.safeParse(data) : null;
  return { tableLive: true, objectives: parsed?.success ? parsed.data.objectives : null };
}

/** Easy Fit's reading, from reads this bench makes itself as the member. */
async function readExpectedReading(): Promise<HomeBrandReading> {
  const client = memberClient();
  const [summary, portfolios, book, brand, profiles] = await Promise.all([
    client
      .schema('brand_profiles')
      .rpc('get_brand_integration_summary', { p_brand_profile_id: EASYFIT_BRAND_ID }),
    client.rpc('optimizer_list_portfolios', { p_brand_id: EASYFIT_BRAND_ID }),
    client
      .schema('brand_profiles')
      .from('brand_book')
      .select(
        'business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      )
      .eq('brand_id', EASYFIT_BRAND_ID)
      .maybeSingle(),
    client
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('description, approval_chain_required')
      .eq('id', EASYFIT_BRAND_ID)
      .maybeSingle(),
    readSavedObjectives(),
  ]);
  for (const read of [summary, portfolios, book, brand]) {
    if (read.error) throw new Error(`[home-bench] reading input failed: ${read.error.message}`);
  }
  const buckets: AccountBuckets = {};
  for (const row of (summary.data ?? []) as Record<string, unknown>[]) {
    const key = row.platform_key as keyof AccountBuckets | null;
    if (!key) continue;
    const bucket = buckets[key] ?? { accounts: [] };
    buckets[key] = bucket;
    bucket.accounts.push({
      type: (row.account_type as string | null) ?? null,
      status: (row.account_status as string | null) ?? null,
    });
  }
  const bookRow = (book.data ?? {}) as { business?: unknown; headline?: unknown };
  const brandRow = (brand.data ?? {}) as {
    description?: unknown;
    approval_chain_required?: unknown;
  };
  return readBrand({
    accounts: accountCountsFrom(buckets),
    savedGoal: savedGoalFrom(
      profiles.objectives
        ? [
            {
              brand_id: EASYFIT_BRAND_ID,
              scope: 'brand',
              objectives: profiles.objectives,
              source: 'user',
            },
          ]
        : [],
    ),
    business: businessFrom({
      structuredBusiness: bookRow.business ?? null,
      headline: bookRow.headline ?? null,
      brandDescription: brandRow.description ?? null,
    }),
    portfolios: portfolioSignalsFrom(portfolios.data),
    approvalRequired: brandRow.approval_chain_required === true,
  });
}

async function openHome(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.locator('[data-home-overview]')).toBeVisible({ timeout: 120_000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('Home overview — Easy Fit, live', () => {
  test.beforeAll(async () => {
    const session = await mintSessionBundleForEmail(MEMBER_EMAIL);
    memberToken = session.accessToken;
    memberId = subjectOf(memberToken);
    storageState = session.state;
    const { data } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', memberId)
      .maybeSingle();
    originalBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    await selectBrand(EASYFIT_BRAND_ID);
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    recorder.print();
  });

  test('goal tiles print the account’s own results', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const totals = await recorder.step('edge totals read independently', readEdgeTotals);
    const saved = await readSavedObjectives();
    const conversationsCounted = typeof totals.conversations === 'number';
    notes.push(
      `edge purchases=${totals.purchases ?? 'missing'} conversations=${totals.conversations ?? 'missing'} spend=${totals.spend ?? 'missing'}`,
    );

    const expected =
      saved.objectives && saved.objectives.length > 0
        ? saved.objectives
        : inferHomeObjectives({
            purchases: totals.purchases,
            purchase_value: totals.purchase_value,
            leads: totals.leads,
            conversations: totals.conversations,
            clicks: totals.clicks,
          });
    notes.push(
      saved.tableLive
        ? `home_profiles live; goals ${saved.objectives ? 'from the saved row' : 'inferred (no row)'}`
        : 'COVERAGE: brand_profiles.home_profiles is not in production yet — goals are the inferred ones, and the saved "Tours booked" row could not be exercised',
    );
    if (!conversationsCounted) {
      notes.push(
        'COVERAGE: the deployed paid-media-metrics edge does not count conversations yet — the "Conversations started" tile is expected to say it is not counted',
      );
    }

    await recorder.step('dashboard opens on the Overview', async () => {
      await openHome(page);
      await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    const reading = await recorder.step(
      'reading built from the bench’s own reads',
      readExpectedReading,
    );
    notes.push(
      `Easy Fit reads as ${reading.mode}; opens with ${reading.modules[0]?.id}; ${reading.issues.length} issue(s), ${reading.opportunities.length} opportunity(ies)`,
    );

    await recorder.step('the reading strip says how the Home reads Easy Fit', async () => {
      const strip = page.locator('[data-home-reading]');
      await expect(strip).toHaveAttribute('data-home-reading', reading.mode);
      await expect(strip.locator('[data-home-mode]')).toHaveText(reading.modeLabel);
      await expect(strip).toContainText(reading.goal.label);
      const first = reading.modules[0];
      if (first) await expect(strip).toContainText(HOME_MODULE_LABELS[first.id]);
      const top = reading.opportunities[0];
      if (top) await expect(strip).toContainText(top.title);
    });

    await recorder.step('the modules follow the reading’s order', async () => {
      const rendered = await page
        .locator('[data-home-slot]')
        .evaluateAll((slots) => slots.map((slot) => slot.getAttribute('data-home-slot')));
      expect(rendered).toEqual(
        reading.modules.map((module) => module.id).filter((id) => id !== 'setup'),
      );
      for (const issue of reading.issues) {
        await expect(page.locator('[data-home-slot="health"]')).toContainText(issue.title);
      }
    });

    await recorder.step('each goal tile shows the edge figure', async () => {
      for (const objective of expected) {
        const tile = page.locator(`[data-home-objective="${objective.metric}"]`).first();
        await expect(tile).toBeVisible();
        await expect(tile).toContainText(objective.label);
        const value = totals[objective.metric];
        if (
          typeof value === 'number' &&
          HOME_OBJECTIVE_METRICS[objective.metric].unit === 'count'
        ) {
          await expect(tile.locator('[data-home-value]')).toHaveText(formatCount(value));
        } else if (value === undefined) {
          await expect(tile).toContainText('Not counted for this account yet');
        }
      }
    });

    await recorder.step('three module blocks render without an error state', async () => {
      for (const module of ['perf', 'org', 'cre']) {
        const block = page.locator(`[data-home-module="${module}"]`);
        await expect(block).toBeVisible();
        await expect(block.getByText(/could not be loaded/)).toHaveCount(0, { timeout: 90_000 });
      }
      await expect(
        page.locator('[data-home-module="perf"] li, [data-home-module="perf"] p').first(),
      ).toBeVisible({ timeout: 90_000 });
      await expect(
        page
          .locator(
            '[data-home-module="cre"] img, [data-home-module="cre"] p, [data-home-module="cre"] svg',
          )
          .first(),
      ).toBeVisible({ timeout: 90_000 });
    });

    await page.screenshot({
      path: 'e2e/__screenshots__/home-overview-easyfit.png',
      fullPage: true,
    });

    await recorder.step('a goal tile opens its edit control', async () => {
      const first = page.locator('[data-home-objective]').first();
      await first.hover();
      await first.getByRole('button', { name: /^Edit goal / }).click();
      await expect(page.getByLabel('Name')).toBeVisible();
      await page.keyboard.press('Escape');
    });
    recorder.record(
      'goal save path',
      'SKIP',
      'not exercised: saving would overwrite Easy Fit’s real goals',
    );

    await context.close();
  });
});
