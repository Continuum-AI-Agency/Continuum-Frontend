import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';

// End-to-end proof that the app stops minting duplicate brands.
//
// The defect this locks down (prod, 2026-08-14): one user accumulated 4 brands in
// 4 minutes and another held 15 rows all named "duanecscott's Brand" — 101
// junk-named brands across 57 users. Three paths produced them:
//   1. createBrandProfile opened with loadOnboardingContext(), which inserts a
//      brand of its own -> one "+ Add brand" click created TWO rows.
//   2. ensureActiveBrand minted whenever no user_onboarding_states row was
//      is_active, which is the state a brand switch leaves behind.
//   3. The unnamed "+ Add brand" button bypassed the ticket #162 dedupe guard.
//
// Nothing here is mocked: a real throwaway user, a real GoTrue session, the real
// Next.js server action behind the real sidebar button, and row counts read back
// from the real database. Fixtures are torn down in `finally`.
//
// Run:  bun run brands:dedupe:e2e:bench

const RUN_ID = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
const HANDLE = `bench-dedupe-${RUN_ID}`;
const EMAIL = `${HANDLE}@resend.dev`;
const SEED_BRAND_NAME = `Dedupe Bench Seed ${RUN_ID}`;
const DEFAULT_SHELL_NAME = `${HANDLE}'s Brand`;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[brand-dedupe] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function brandsOf(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id, brand_name, completed_at, created_at')
    .eq('created_by', userId)
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`[brand-dedupe] brand read failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; brand_name: string; completed_at: string | null }>;
}

/** Click "+ Add brand" in the sidebar switcher and wait for the action to settle. */
// The switcher trigger is a Base UI PopoverTrigger rendered through
// SidebarMenuButton. A synthetic pointer click leaves aria-expanded false under
// Playwright; keyboard activation is the reliable path and is a real user gesture.
// The items are cmdk CommandItems, i.e. role=option — not plain text nodes.
async function clickAddBrand(page: import('@playwright/test').Page) {
  // BrandSwitcher renders null while brandSummaries are in flight after the server
  // action, so land on a fresh page for each click — which is also what a user
  // clicking "+ Add brand" again a minute later actually does.
  await page.goto('/dashboard');
  const trigger = page.getByRole('button', { name: 'Switch brand', exact: true });
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger, 'brand switcher popover did not open').toHaveAttribute(
    'aria-expanded',
    'true',
    { timeout: 30_000 },
  );

  const addBrand = page.getByRole('option', { name: 'Add brand' });
  await expect(addBrand).toBeVisible({ timeout: 30_000 });
  await addBrand.click();

  // The action revalidates the shell; the popover closes when it settles.
  await expect(addBrand).toBeHidden({ timeout: 120_000 });
  await page.waitForLoadState('networkidle');
}

test.describe.configure({ mode: 'serial' });

test.describe('brand de-duplication', () => {
  let db: SupabaseClient;
  let userId: string;
  let seedBrandId: string;
  let storageState: PlaywrightStorageState;

  test.beforeAll(async () => {
    db = admin();

    const { data: created, error: userErr } = await db.auth.admin.createUser({
      email: EMAIL,
      email_confirm: true,
    });
    if (userErr || !created.user) {
      throw new Error(`[brand-dedupe] createUser failed: ${userErr?.message}`);
    }
    userId = created.user.id;

    // A completed brand so the user lands in the app shell rather than onboarding.
    const { data: brand, error: brandErr } = await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .insert({
        brand_name: SEED_BRAND_NAME,
        created_by: userId,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (brandErr || !brand) {
      throw new Error(`[brand-dedupe] seed brand insert failed: ${brandErr?.message}`);
    }
    seedBrandId = (brand as { id: string }).id;

    await db
      .schema('brand_profiles')
      .from('permissions')
      .insert({ brand_profile_id: seedBrandId, user_id: userId, role: 'owner' });

    await db
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .insert({
        user_id: userId,
        brand_id: seedBrandId,
        is_active: true,
        state: {
          brand: { name: SEED_BRAND_NAME },
          completedAt: new Date().toISOString(),
          members: [],
          invites: [],
        },
      });

    storageState = await mintSessionForEmail(EMAIL);
  });

  test.afterAll(async () => {
    if (!db || !userId) return;
    // NOT brandsOf(): that filters active=true and would strand the brand the
    // soft-delete test deactivates.
    const { data: all } = await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('id')
      .eq('created_by', userId);
    const ids = ((all ?? []) as Array<{ id: string }>).map((b) => b.id);
    for (const table of ['user_onboarding_states', 'permissions'] as const) {
      const column = table === 'permissions' ? 'brand_profile_id' : 'brand_id';
      await db.schema('brand_profiles').from(table).delete().eq('user_id', userId);
      if (ids.length > 0) {
        await db.schema('brand_profiles').from(table).delete().in(column, ids);
      }
    }
    if (ids.length > 0) {
      await db.schema('brand_profiles').from('brand_profiles').delete().in('id', ids);
    }
    await db.auth.admin.deleteUser(userId);
  });

  // Defect 1 + 3: repeat "+ Add brand" clicks used to insert a row every time
  // (and two rows on the first click). They must converge on ONE empty shell.
  test('three "+ Add brand" clicks create exactly one brand, not four', async ({ browser }) => {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard');
      await expect(await brandsOf(db, userId)).toHaveLength(1);

      await clickAddBrand(page);
      await clickAddBrand(page);
      await clickAddBrand(page);

      const brands = await brandsOf(db, userId);
      expect(
        brands.map((b) => b.brand_name),
        'three clicks must yield the seed brand plus exactly one empty shell',
      ).toEqual([SEED_BRAND_NAME, DEFAULT_SHELL_NAME]);
    } finally {
      await context.close();
    }
  });

  // Defect 2: activeBrandId reads null once every onboarding row is is_active=false
  // (what a brand switch leaves behind). Loading the app must NOT mint a brand.
  test('a page load with no active onboarding row does not mint a brand', async ({ browser }) => {
    await db
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .update({ is_active: false })
      .eq('user_id', userId);

    const before = await brandsOf(db, userId);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.waitForLoadState('networkidle');

      const after = await brandsOf(db, userId);
      expect(after.map((b) => b.id).sort()).toEqual(before.map((b) => b.id).sort());
    } finally {
      await context.close();
    }
  });

  // The reuse must not swallow a brand the user actually finished: once the shell
  // is onboarded it no longer matches, so the next click yields a genuinely new one.
  test('once the shell is onboarded, the next click creates a new brand', async ({ browser }) => {
    const shell = (await brandsOf(db, userId)).find((b) => b.brand_name === DEFAULT_SHELL_NAME);
    expect(shell, 'expected the empty shell from the first test').toBeTruthy();

    await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .update({ completed_at: new Date().toISOString(), context: { website_url: 'example.com' } })
      .eq('id', shell?.id ?? '');

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard');
      await clickAddBrand(page);

      const brands = await brandsOf(db, userId);
      expect(brands.filter((b) => b.brand_name === DEFAULT_SHELL_NAME)).toHaveLength(2);
    } finally {
      await context.close();
    }
  });

  // Part 2's cleanup relies on active=false actually hiding a brand everywhere.
  test('a soft-deleted brand disappears from the switcher', async ({ browser }) => {
    const brands = await brandsOf(db, userId);
    const victim = brands.find((b) => b.brand_name === DEFAULT_SHELL_NAME);
    await db
      .schema('brand_profiles')
      .from('brand_profiles')
      .update({ active: false })
      .eq('id', victim?.id ?? '');

    const remaining = (await brandsOf(db, userId)).filter(
      (b) => b.brand_name === DEFAULT_SHELL_NAME,
    );
    expect(remaining, 'one shell stays active so the list is not trivially empty').toHaveLength(1);

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto('/dashboard');
      const trigger = page.getByRole('button', { name: 'Switch brand', exact: true });
      await expect(trigger).toBeVisible({ timeout: 60_000 });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('option', { name: 'Add brand' })).toBeVisible({
        timeout: 30_000,
      });

      // Two brands are active (seed + one shell); the deactivated one must be gone.
      // getBrandMenuItemLabel disambiguates same-named brands with an id suffix, so
      // match on the prefix rather than the exact rendered label.
      const options = await page.getByRole('option').allInnerTexts();
      const listed = options.filter((o) => o !== 'Add brand');
      expect(listed).toHaveLength(2);
      expect(listed.some((o) => o.startsWith(SEED_BRAND_NAME))).toBe(true);
      expect(listed.filter((o) => o.startsWith(DEFAULT_SHELL_NAME))).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
});
