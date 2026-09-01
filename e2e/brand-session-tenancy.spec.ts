import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';

// End-to-end proof that two concurrent sessions on ONE account hold DIFFERENT
// active brands (Airtable #272).
//
// The defect this locks down (prod, 2026-08-31): brand_profiles.user_brand_preferences
// has user_id as its SOLE primary key — one global "active brand" pointer per account,
// with no session or device scoping. Two people sharing one login: A switches brand,
// that single row is overwritten, and B's next ordinary navigation server-renders A's
// brand. Measured on prod the day this was written: 1,822 live sessions across 258
// users, 120 of whom held MORE THAN ONE live session, all multiplexed through 74
// single-row pointers.
//
// Nothing here is mocked. `mintSessionForEmail` twice with the same email mints two
// independent GoTrue sessions (two verifyOtp exchanges -> two auth.sessions rows -> two
// distinct `session_id` claims), each encoded into its own Playwright storageState, so
// the two browser contexts are genuinely two concurrent logins on one account rather
// than one session cloned. Separate contexts also mean separate
// BroadcastChannel('continuum:brand') scopes, so the two sessions cannot leak into each
// other through the client and hand us a false pass.
//
// The brand switch is driven through the real sidebar switcher, which runs the real
// switchActiveBrandAction; the verdict is read from the real server-rendered page and
// then cross-checked against real rows.
//
// Run:  bun run brands:session-tenancy:e2e:bench

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const BRAND_1_NAME = `Tenancy Bench One ${RUN_ID}`;
const BRAND_2_NAME = `Tenancy Bench Two ${RUN_ID}`;

// The seeded local fixture owner (supabase/baseline/fixtures.sql).
const OWNER_EMAIL = 'local@continuum.test';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[brand-tenancy] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required. ' +
        'Run `bun run supabase:env:local` and invoke through the package script.',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function seedBrand(db: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data, error } = await db
    .schema('brand_profiles')
    .from('brand_profiles')
    .insert({
      brand_name: name,
      created_by: userId,
      active: true,
      // Without completed_at the switcher marks the row "Onboarding incomplete"; it is
      // still selectable, but a completed brand is the ordinary case we want to measure.
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`[brand-tenancy] brand insert failed: ${error.message}`);

  const brandId = (data as { id: string }).id;
  // A trigger on brand_profiles already grants the creator an owner permission, so this
  // is an upsert rather than an insert — asserting the row we need exists without
  // caring whether we or the trigger put it there.
  const { error: permError } = await db
    .schema('brand_profiles')
    .from('permissions')
    .upsert(
      { brand_profile_id: brandId, user_id: userId, role: 'owner' },
      { onConflict: 'brand_profile_id,user_id' },
    );
  if (permError) throw new Error(`[brand-tenancy] permission upsert failed: ${permError.message}`);

  return brandId;
}

/**
 * The sidebar switcher trigger. Its accessible name is the static aria-label; its TEXT
 * is the active brand's name (BrandSwitcher.tsx renders activeTeam.name inside the
 * button), which is what makes it the honest read of "what brand is this session on".
 */
function switcherTrigger(page: import('@playwright/test').Page) {
  return page.getByRole('button', { name: 'Switch brand', exact: true });
}

/**
 * Select a brand through the real switcher.
 *
 * A synthetic pointer click on the Base UI PopoverTrigger leaves aria-expanded false
 * under Playwright; keyboard activation is the reliable path and is a real user gesture.
 * Same idiom as brand-dedupe.spec.ts.
 */
async function selectBrand(page: import('@playwright/test').Page, brandName: string) {
  const trigger = switcherTrigger(page);
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger, 'brand switcher popover did not open').toHaveAttribute(
    'aria-expanded',
    'true',
    { timeout: 30_000 },
  );

  // Filter through the real search input: the fixture account carries leftover brands
  // from other benches, so targeting by name is what keeps this deterministic.
  await page.getByPlaceholder('Search brands...').fill(brandName);
  const option = page.getByRole('option', { name: brandName });
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();

  // The action revalidates the shell; the popover closes when it settles.
  await expect(option).toBeHidden({ timeout: 120_000 });
  await page.waitForLoadState('networkidle');
}

test.describe.configure({ mode: 'serial' });

test.describe('active brand is scoped to the session, not the account', () => {
  const db = admin();
  let userId = '';
  let brand1 = '';
  let brand2 = '';
  let previousPreference: string | null = null;
  let stateA: PlaywrightStorageState;
  let stateB: PlaywrightStorageState;

  test.beforeAll(async () => {
    const { data: users, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(`[brand-tenancy] listUsers failed: ${error.message}`);
    const owner = users.users.find((u) => u.email === OWNER_EMAIL);
    if (!owner) {
      throw new Error(
        `[brand-tenancy] fixture owner ${OWNER_EMAIL} not found. Run \`bun run supabase:hydrate\`.`,
      );
    }
    userId = owner.id;

    const { data: existing } = await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', userId)
      .maybeSingle();
    previousPreference = (existing as { active_brand_id?: string } | null)?.active_brand_id ?? null;

    brand1 = await seedBrand(db, userId, BRAND_1_NAME);
    brand2 = await seedBrand(db, userId, BRAND_2_NAME);

    // Deterministic starting state: the account pointer names brand 1, so both sessions
    // begin aligned and step 4 is measuring divergence rather than a pre-existing split.
    const { error: prefError } = await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: userId, active_brand_id: brand1, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (prefError) throw new Error(`[brand-tenancy] preference seed failed: ${prefError.message}`);

    // Two independent GoTrue sessions on the SAME account.
    stateA = await mintSessionForEmail(OWNER_EMAIL);
    stateB = await mintSessionForEmail(OWNER_EMAIL);
  });

  test.afterAll(async () => {
    for (const brandId of [brand1, brand2].filter(Boolean)) {
      // Permissions first: pause_automations_for_ineligible_member() fires on the
      // permission delete and looks the brand up, so letting the brand cascade take
      // them out raises "brand profile not found" and leaves the row behind.
      await db
        .schema('brand_profiles')
        .from('permissions')
        .delete()
        .eq('brand_profile_id', brandId);
      await db.schema('brand_profiles').from('brand_profiles').delete().eq('id', brandId);
    }
    // Deleting the brands cascades the preference row away, so restore what was there.
    if (previousPreference) {
      await db.schema('brand_profiles').from('user_brand_preferences').upsert(
        {
          user_id: userId,
          active_brand_id: previousPreference,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    }
  });

  test('session B keeps its own brand after session A switches', async ({ browser }) => {
    const ctxA = await browser.newContext({ storageState: stateA });
    const ctxB = await browser.newContext({ storageState: stateB });

    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      // 1. Precondition: both sessions start on the same brand.
      await pageA.goto('/dashboard');
      await pageB.goto('/dashboard');
      await expect(
        switcherTrigger(pageA),
        'session A did not start on the seeded brand',
      ).toContainText(BRAND_1_NAME, { timeout: 60_000 });
      await expect(
        switcherTrigger(pageB),
        'session B did not start on the seeded brand',
      ).toContainText(BRAND_1_NAME, { timeout: 60_000 });

      // 2. Session A switches, through the real switcher.
      await selectBrand(pageA, BRAND_2_NAME);

      // 3. Guard against a hollow pass: a test that only checks B is unchanged also
      //    passes when the switch silently did nothing at all.
      await expect(
        switcherTrigger(pageA),
        'session A did not actually move to the second brand — the switch was a no-op',
      ).toContainText(BRAND_2_NAME, { timeout: 60_000 });

      // 4. THE LOAD-BEARING ASSERTION. A fresh server render for session B, through the
      //    real getActiveBrandContext. This is the line that is red before the fix.
      await pageB.reload();
      await expect(
        switcherTrigger(pageB),
        'TENANCY LEAK: session B server-rendered session A’s brand',
      ).toContainText(BRAND_1_NAME, { timeout: 60_000 });

      // 5. The mechanism, not just the symptom.
      const { data: sessionRows, error: sessionError } = await db
        .schema('brand_profiles')
        .from('user_session_brands')
        .select('session_id, active_brand_id')
        .eq('user_id', userId);
      if (sessionError) {
        throw new Error(`[brand-tenancy] session-brand read failed: ${sessionError.message}`);
      }
      const rows = (sessionRows ?? []) as Array<{ session_id: string; active_brand_id: string }>;
      const pinned = rows.filter((r) => [brand1, brand2].includes(r.active_brand_id));
      expect(pinned, 'expected one pinned row per session').toHaveLength(2);
      expect(
        new Set(pinned.map((r) => r.active_brand_id)).size,
        'the two sessions must be pinned to DIFFERENT brands',
      ).toBe(2);

      // The account-level pointer still moved: that is the tier a NEW device inherits.
      const { data: pref } = await db
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .select('active_brand_id')
        .eq('user_id', userId)
        .maybeSingle();
      expect(
        (pref as { active_brand_id?: string } | null)?.active_brand_id,
        'the account-level "last used anywhere" pointer should follow the most recent switch',
      ).toBe(brand2);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
