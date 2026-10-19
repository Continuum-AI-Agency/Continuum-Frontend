import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { appCacheKeys } from '@/lib/cache/keys';
import { mintSessionBundleForEmail, mintSessionForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// planner:publish-account:e2e:bench
//
// WHAT IT PROVES: the planner only ever offers, and stamps, an account that can receive the post.
// A Meta ad account is never a Facebook posting target, and nothing defaults to "the first
// account in the list".
//
// Pink Elephant, 2026-10-14: the brand's Facebook bucket held its Page AND a Meta ad account.
// The list is sorted by name, the ad account ("Moisés Avendaño") sorted first, and the planner
// took the first entry as the Facebook default, so the fanned-out Facebook post was stamped with
// the ad account. It only escaped because the Backend swaps in a brand's single Page.
//
// StarCraft has the same shape: one meta_page and one meta_ad_account. Its Page has no name, so
// it is labelled by its numeric id and sorts FIRST — the old code stamped the right account by
// luck. The fixture gives the Page a bench alias that sorts after the ad account (the exact
// Pink Elephant order) and restores it afterwards. Graded on the PERSISTED row of a new Facebook
// post, on the toolbar switcher (two "Facebook accounts" let anyone point every post at the ad
// account), and on the real Backend gate (publish-intent, read-only).
//
// The brand integration summary is cached per (brand, user) in Upstash for an hour, so the
// fixture drops StarCraft's cached views on both edges — otherwise the planner reads the old order.
//
// What is REAL: hosted Postgres + the get_brand_integration_summary RPC, GoTrue auth, the
// bench-owned Fastify Backend (hosted target), the real planner in real Chrome, the real autosave.
//
// UN-EXERCISED HOPS, STATED EXPLICITLY:
//   · Approve + publish. Publishing to the bench brand's real Page is not something a bench
//     should do; the gate's account verdict is read from publish-intent instead.
//   · A brand with several Pages (no default, the switcher asks). Covered by
//     platformAccountOptions.test.ts; no bench-owned brand has two Pages.

const BENCH = 'planner:publish-account:e2e:bench';

// StarCraft: Remastered. Owned by the bench login, not by a client.
const STARCRAFT_BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = process.env.CANVAS_BENCH_OWNER_EMAIL ?? 'duane@continuumai.agency';
// Sorts after "Continuum Sandbox - Zuckerberg's Revenge", the ad account.
const PAGE_BENCH_ALIAS = 'Zz StarCraft Page (publish-account bench)';

const notes = [
  'fixture: StarCraft Page alias set to sort after the ad account, restored in afterAll',
  'un-exercised: approve/publish to the real Page (account verdict read from publish-intent)',
  'un-exercised: several-Pages brand (unit-tested; no bench-owned brand has two Pages)',
];
const recorder = createBenchRecorder(BENCH, notes);

const insertedClientKeys: string[] = [];
let reachedLastStep = false;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(`[${BENCH}] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.`);
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `[${BENCH}] Refusing to run against "${url}": run it with the hosted .env, not .env.local.`,
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type FacebookAssets = {
  pageId: string;
  pageAssignmentId: string;
  pageAlias: string | null;
  adAccountId: string;
};

type LinkRow = {
  id: string;
  alias: string | null;
  integration_accounts_assets: { id: string; type: string };
};

/** The brand's own Facebook assets, read from the store, so the bench grades against the data. */
async function readFacebookAssets(supabase: SupabaseClient): Promise<FacebookAssets> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .select('id, alias, integration_accounts_assets!inner(id, type)')
    .eq('brand_profile_id', STARCRAFT_BRAND_ID);
  if (error) throw new Error(`[${BENCH}] could not read the brand's accounts: ${error.message}`);
  const links = (data ?? []) as unknown as LinkRow[];
  const pages = links.filter((link) => link.integration_accounts_assets.type === 'meta_page');
  const adAccounts = links.filter(
    (link) => link.integration_accounts_assets.type === 'meta_ad_account',
  );
  // The bench's premise; a changed fixture must fail loudly rather than pass vacuously.
  if (pages.length !== 1 || adAccounts.length < 1) {
    throw new Error(
      `[${BENCH}] StarCraft must hold exactly one meta_page and an ad account (has ${pages.length} / ${adAccounts.length}).`,
    );
  }
  return {
    pageId: pages[0].integration_accounts_assets.id,
    pageAssignmentId: pages[0].id,
    pageAlias: pages[0].alias,
    adAccountId: adAccounts[0].integration_accounts_assets.id,
  };
}

async function setPageAlias(
  supabase: SupabaseClient,
  assignmentId: string,
  alias: string | null,
): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .update({ alias })
    .eq('id', assignmentId)
    .throwOnError();
}

/** Drop every member's cached integration summary for StarCraft. A no-op without the cache. */
async function dropCachedIntegrationSummaries(): Promise<void> {
  const url = process.env.APP_CACHE_REDIS_URL;
  const token = process.env.APP_CACHE_REDIS_TOKEN;
  if (!url || !token) return;
  const redis = new Redis({ url, token });
  const prefix = appCacheKeys.brandIntegrationsPrefix(STARCRAFT_BRAND_ID);
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 200 });
    if (keys.length > 0) await redis.del(...keys);
    cursor = String(next);
  } while (cursor !== '0');
}

type DraftRow = { id: string; platform: string; platform_account_id: string | null };

async function findRowByClientKey(
  supabase: SupabaseClient,
  clientKey: string,
): Promise<DraftRow | null> {
  const { data, error } = await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, platform, platform_account_id')
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .eq('client_key', clientKey)
    .maybeSingle();
  if (error) throw new Error(`[${BENCH}] could not read the bench row: ${error.message}`);
  return (data as DraftRow | null) ?? null;
}

async function setActiveBrand(
  supabase: SupabaseClient,
  ownerId: string,
  activeBrandId: string,
): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: ownerId, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

test.describe.configure({ mode: 'serial' });

test.describe('planner publish account is explicit', () => {
  let backend: LocalBackend | null = null;
  let ownerId = '';
  let accessToken = '';
  let previousActiveBrandId: string | null = null;
  let assets: FacebookAssets | null = null;

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(300_000);
    const supabase = admin();
    assets = await readFacebookAssets(supabase);
    if (assets.pageAlias === PAGE_BENCH_ALIAS) {
      // A run that died before restoring; the original alias is unknown, so restore to none.
      assets = { ...assets, pageAlias: null };
    }
    await setPageAlias(supabase, assets.pageAssignmentId, PAGE_BENCH_ALIAS);
    await dropCachedIntegrationSummaries();
    backend = await startLocalBackend({
      port: Number(process.env.PLANNER_ACCOUNT_BENCH_BACKEND_PORT ?? 4426),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3126',
      label: BENCH,
      supabase: 'hosted',
    });

    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    ownerId = session.userId;
    accessToken = session.accessToken;

    const { data: previous } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', ownerId)
      .maybeSingle();
    previousActiveBrandId =
      (previous as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    await setActiveBrand(supabase, ownerId, STARCRAFT_BRAND_ID);
  });

  test.afterAll(async () => {
    const supabase = admin();
    if (assets) {
      await setPageAlias(supabase, assets.pageAssignmentId, assets.pageAlias);
      await dropCachedIntegrationSummaries();
    }
    if (insertedClientKeys.length > 0) {
      await supabase
        .schema('organic')
        .from('organic_calendar_drafts')
        .delete()
        .eq('brand_id', STARCRAFT_BRAND_ID)
        .in('client_key', insertedClientKeys);
    }
    if (previousActiveBrandId) await setActiveBrand(supabase, ownerId, previousActiveBrandId);
    await backend?.stop();
    backend = null;
    if (!reachedLastStep) {
      recorder.record('bench completed', 'FAIL', 'the test did not reach its last step');
    }
    recorder.print();
  });

  test('the ad account is never offered, and a new Facebook post is stamped with the Page', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const facebook = assets as FacebookAssets;
    const state = await mintSessionForEmail(OWNER_EMAIL);
    await context.addCookies(state.cookies);

    await page.route('**/rest/v1/organic_calendar_drafts**', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { client_key?: string } | null;
        if (body?.client_key) insertedClientKeys.push(body.client_key);
      }
      return route.continue();
    });

    await recorder.step('open the planner', async () => {
      await page.goto('/organic?tab=planner');
      await expect(page.getByRole('button', { name: 'Create content' }).first()).toBeEnabled({
        timeout: 120_000,
      });
    });

    await recorder.step('create a manual Facebook post', async () => {
      await page.getByRole('button', { name: 'Create content' }).first().click();
      await page.getByRole('menuitem', { name: /new carousel/i }).click();
    });

    const row = await recorder.step('the new row is stamped with the Page', async () => {
      let found: DraftRow | null = null;
      await expect
        .poll(
          async () => {
            const key = insertedClientKeys.at(-1);
            found = key ? await findRowByClientKey(admin(), key) : null;
            return found?.id ?? null;
          },
          { timeout: 30_000 },
        )
        .not.toBeNull();
      const persisted = found as unknown as DraftRow;
      expect(persisted.platform, 'the planner created this post on another platform').toBe(
        'facebook',
      );
      expect(persisted.platform_account_id).not.toBe(facebook.adAccountId);
      expect(persisted.platform_account_id).toBe(facebook.pageId);
      return persisted;
    });

    await recorder.step(
      'the Facebook default offers the Page only, never the ad account',
      async () => {
        // Checked only now: the row above exists, so the planner has hydrated and seeded its
        // accounts. Since A7 the toolbar shows one "Default <Platform> account" control per
        // platform even with a single account, so the proof is its choices: exactly one (the Page).
        // Offering the ad account would make two.
        const trigger = page.getByRole('button', { name: /^Default Facebook account:/ });
        await expect(trigger).toHaveCount(1);
        await trigger.click();
        const choices = page.getByRole('radiogroup', { name: 'New Facebook posts go to' });
        await expect(choices.getByRole('radio')).toHaveCount(1);
        await page.keyboard.press('Escape');
      },
    );

    await recorder.step('the Backend gate reads the Page from the row', async () => {
      // publish-intent evaluates the row as stored (no single-account swap), so this is the
      // account the confirm dialog names and the publish request is checked against.
      const response = await page.request.post(
        `${backend?.url}/api/organic/calendar/drafts/${row.id}/publish-intent`,
        { headers: { Authorization: `Bearer ${accessToken}` }, data: {} },
      );
      expect(response.status(), await response.text()).toBe(200);
      const verdict = (await response.json()) as { account: { id: string | null } | null };
      expect(verdict.account?.id).toBe(facebook.pageId);
    });
    reachedLastStep = true;
  });
});
