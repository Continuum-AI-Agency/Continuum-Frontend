import { randomUUID } from 'node:crypto';
import { kpiConfigForPlatform } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { buildCacheKey } from '../../supabase/functions/fetch-organic-analytics/lib/cache-key.ts';
import { parseDateRange } from '../../supabase/functions/fetch-organic-analytics/lib/date.ts';
import type { IntegrationAccountRow } from '../../supabase/functions/fetch-organic-analytics/lib/types.ts';
import { fetchXAnalytics } from '../../supabase/functions/fetch-organic-analytics/lib/x.ts';
import { formatNumber } from '../src/components/organic/organic-format';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// organic:x:metrics:e2e:bench — Organic → Metrics on an X account, on the hosted stack.
//
// REAL: hosted Postgres + GoTrue, the brand integration summary RPC, the Next app's new
// /api/organic-analytics/x route, the DEPLOYED organic-reporting edge (assignment check, cache
// key, reporting_cache read, Upstash), the Frontend response schema, and the rendered KPI cards
// in real Chromium, as the bench login on the bench brand.
//
// SEEDED, AND WHY: the X developer app has no credits — X answers every read `402 credits
// depleted` (2026-10-07). So the fixture is an X account on the bench brand plus the cached
// responses the edge would have written, built by the edge's OWN fetchXAnalytics (real
// normalisation and totals) over an X v2 timeline page, stored under the edge's OWN buildCacheKey.
//
// UN-EXERCISED, STATED: the X timeline read itself, its usage_events row and the post snapshots.
// Those are lib/x.test.ts; the live read waits on funded X credits.
//
// Residue: one user_integrations row (asset, grant and assignment cascade from it), and the
// account's cache rows + Upstash keys, removed through the edge's own `invalidate`. By id only.

const BENCH = 'organic:x:metrics:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();
const SERVICE_BEARER = readBackendEnv('SUPABASE_API_KEY') || serviceRoleKey;
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const RUN_ID = Date.now().toString(36);
const X_USER_ID = `bench-x-${RUN_ID}`;
const ACCOUNT_NAME = `Bench X ${RUN_ID}`;
const RANGE_PRESET = 'last_7d';

const notes: string[] = [];
const recorder = createBenchRecorder(BENCH, notes);
const db = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const profiles = db.schema('brand_profiles');
const residue = {
  integrationId: null as string | null,
  accountId: null as string | null,
  brandPref: null as { userId: string; previous: string | null } | null,
};

/** An X v2 `GET /2/users/:id/tweets` page, as documented: three posts, one with a video. */
function timelinePage(today: string) {
  return {
    data: [
      {
        id: `${RUN_ID}1`,
        text: 'Leg day is a mindset. New class schedule is live.',
        created_at: `${today}T09:00:00.000Z`,
        public_metrics: {
          impression_count: 1840,
          like_count: 63,
          reply_count: 7,
          retweet_count: 9,
          quote_count: 2,
          bookmark_count: 11,
        },
      },
      {
        id: `${RUN_ID}2`,
        text: 'Members asked, we listened: open 24/7 from Monday.',
        created_at: `${today}T07:30:00.000Z`,
        attachments: { media_keys: ['7_bench'] },
        public_metrics: {
          impression_count: 5210,
          like_count: 148,
          reply_count: 21,
          retweet_count: 30,
          quote_count: 4,
          bookmark_count: 26,
        },
      },
      {
        id: `${RUN_ID}3`,
        text: 'Form check Friday — reply with your squat.',
        created_at: `${today}T06:10:00.000Z`,
        public_metrics: {
          impression_count: 960,
          like_count: 22,
          reply_count: 14,
          retweet_count: 1,
          quote_count: 0,
          bookmark_count: 3,
        },
      },
    ],
    includes: {
      media: [
        {
          media_key: '7_bench',
          type: 'video',
          preview_image_url: 'https://pbs.twimg.com/ext_tw_video_thumb/bench.jpg',
        },
      ],
    },
    meta: { result_count: 3 },
  };
}

async function seedXAccount(userId: string): Promise<IntegrationAccountRow> {
  const { data: cipher } = await profiles.rpc('encrypt_token', { token: `bench-unused-${RUN_ID}` });
  if (typeof cipher !== 'string') throw new Error('encrypt_token returned no ciphertext');
  const integrationId = randomUUID();
  await profiles
    .from('user_integrations')
    .insert({
      id: integrationId,
      user_id: userId,
      provider: 'x',
      status: 'active',
      access_token_encrypted: cipher,
      expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      metadata: { scopes: ['tweet.read', 'users.read'], username: X_USER_ID, bench: BENCH },
    })
    .throwOnError();
  residue.integrationId = integrationId;

  const raw_payload = { username: X_USER_ID, public_metrics: { followers_count: 4120 } };
  const { data: asset } = await profiles
    .from('integration_accounts_assets')
    .insert({
      integration_id: integrationId,
      type: 'x_user',
      external_account_id: X_USER_ID,
      name: ACCOUNT_NAME,
      status: 'active',
      raw_payload,
    })
    .select('id')
    .single()
    .throwOnError();
  residue.accountId = asset.id;

  await profiles
    .from('brand_integration_grants')
    .insert({ brand_profile_id: BENCH_BRAND, integration_id: integrationId, granted_by: userId })
    .throwOnError();
  await profiles
    .from('brand_profile_integration_accounts')
    .insert({
      brand_profile_id: BENCH_BRAND,
      integration_account_id: asset.id,
      integration_id: integrationId,
    })
    .throwOnError();

  return {
    id: asset.id,
    integration_id: integrationId,
    external_account_id: X_USER_ID,
    ad_account_id: null,
    type: 'x_user',
    name: ACCOUNT_NAME,
    raw_payload,
  };
}

/** The response index.ts caches for one scope, assembled the way it assembles it. */
async function seedCachedResponse(
  account: IntegrationAccountRow,
  scope: 'kpis' | 'posts',
  postsLimit: number,
) {
  const range = parseDateRange({ preset: RANGE_PRESET });
  const now = new Date();
  const page = timelinePage(range.until);
  const analytics = await fetchXAnalytics({
    account,
    token: 'unused',
    range,
    postsLimit,
    warnings: [],
    billing: { allowed: async () => true, record: async () => {} },
    brandId: BENCH_BRAND,
    fetchImpl: (async () => Response.json(page)) as unknown as typeof fetch,
    now,
  });
  const response = {
    platform: 'x',
    scope,
    accountId: X_USER_ID,
    brandId: BENCH_BRAND,
    integrationAccountId: account.id,
    externalAccountId: X_USER_ID,
    fetchedAt: now.toISOString(),
    range: { preset: range.preset, since: range.since, until: range.until },
    metrics: analytics.metrics,
    posts: analytics.posts,
    comparison: null,
    comparisonDaily: null,
  };
  const cacheKey = buildCacheKey({
    platform: 'x',
    scope,
    brandId: BENCH_BRAND,
    integrationAccountId: account.id,
    externalAccountId: X_USER_ID,
    since: range.since,
    until: range.until,
    selectedPostId: null,
    postsLimit,
    commentsLimit: 20,
  });
  await profiles
    .from('reporting_cache')
    .insert({
      cache_key: cacheKey,
      provider: 'x',
      scope_type: 'organic_analytics_x',
      account_id: account.id,
      scope_id: X_USER_ID,
      range_preset: range.preset,
      range_since: range.since,
      range_until: range.until,
      payload: response,
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3600_000).toISOString(),
      updated_at: now.toISOString(),
    })
    .throwOnError();
  return response;
}

async function pinActiveBrand(userId: string) {
  const { data } = await profiles
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  residue.brandPref = {
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  };
  await profiles
    .from('user_brand_preferences')
    .upsert({ user_id: userId, active_brand_id: BENCH_BRAND }, { onConflict: 'user_id' })
    .throwOnError();
}

test.afterAll(async () => {
  if (residue.accountId) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/organic-reporting/analytics`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${SERVICE_BEARER}`,
        apikey: SERVICE_BEARER,
      },
      body: JSON.stringify({
        brandId: BENCH_BRAND,
        integrationAccountId: residue.accountId,
        platform: 'x',
        range: { preset: RANGE_PRESET },
        invalidate: true,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { deletedKeys?: number };
    recorder.record(
      'cleanup: edge invalidated the account cache',
      res.ok ? 'PASS' : 'FAIL',
      `status=${res.status} keys=${body.deletedKeys ?? '?'}`,
    );
    await profiles.from('reporting_cache').delete().eq('account_id', residue.accountId);
  }
  if (residue.integrationId) {
    await profiles.from('user_integrations').delete().eq('id', residue.integrationId);
    const { count } = await profiles
      .from('integration_accounts_assets')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', residue.integrationId);
    recorder.record(
      'cleanup: fixture X account removed',
      count === 0 ? 'PASS' : 'FAIL',
      `assets left=${count}`,
    );
  }
  const pref = residue.brandPref;
  if (pref?.previous) {
    await profiles
      .from('user_brand_preferences')
      .upsert({ user_id: pref.userId, active_brand_id: pref.previous }, { onConflict: 'user_id' });
  }
  notes.push(
    'un-exercised: the live X timeline read (X app credits depleted), its usage_events row and post snapshots',
  );
  recorder.print();
});

test('Organic → Metrics shows an X account through the X route and the deployed edge', async ({
  page,
  context,
}) => {
  const session = await mintSessionBundleForEmail(BENCH_EMAIL);
  await context.addCookies(session.state.cookies);
  await pinActiveBrand(session.userId);

  const account = await recorder.step('seed: X account assigned to the bench brand', () =>
    seedXAccount(session.userId),
  );
  const seeded = await recorder.step('seed: edge-shaped kpis + posts cache rows', async () => ({
    kpis: await seedCachedResponse(account, 'kpis', 12),
    posts: await seedCachedResponse(account, 'posts', 25),
  }));

  await page.goto('/organic?tab=metrics', { waitUntil: 'domcontentloaded' });

  await recorder.step('the account picker lists the X account under "X"', async () => {
    await page.locator('[data-tour-id="metrics-scope-account-trigger"]:visible').click();
    const item = page.getByRole('option', { name: ACCOUNT_NAME });
    await expect(item).toBeVisible();
    await expect(page.getByText('X', { exact: true }).first()).toBeVisible();
    const kpiResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/organic-analytics/x') &&
        r.request().postDataJSON()?.scope === 'kpis',
    );
    await item.click();
    const kpis = await kpiResponse;
    expect(kpis.status()).toBe(200);
    const body = (await kpis.json()) as { metrics: Record<string, number>; platform: string };
    expect(body.platform).toBe('x');
    expect(body.metrics).toMatchObject({
      views: seeded.kpis.metrics.views,
      likes: seeded.kpis.metrics.likes,
    });
  });

  await recorder.step(
    'the KPI strip renders the X catalog metrics with the seeded totals',
    async () => {
      const shown = kpiConfigForPlatform('x').slice(0, 3);
      expect(shown.map((m) => m.key)).toEqual(['views', 'subscribers', 'likes']);
      for (const metric of shown) {
        const card = page.locator(`[aria-label="Account metric ${metric.label}"]:visible`);
        await expect(card).toContainText(
          formatNumber(
            seeded.kpis.metrics[metric.key as keyof typeof seeded.kpis.metrics] as number,
          ),
        );
      }
    },
  );

  await recorder.step(
    'the posts scope answers through the same route with x.com permalinks',
    async () => {
      const res = await page.request.post('/api/organic-analytics/x', {
        data: {
          brandId: BENCH_BRAND,
          integrationAccountId: account.id,
          range: { preset: RANGE_PRESET },
          scope: 'posts',
          postsLimit: 25,
        },
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { posts: Array<{ id: string; permalink: string }> };
      expect(body.posts.map((p) => p.id)).toEqual(seeded.posts.posts.map((p) => String(p.id)));
      expect(
        body.posts.every((p) => p.permalink.startsWith(`https://x.com/${X_USER_ID}/status/`)),
      ).toBe(true);
    },
  );
});
