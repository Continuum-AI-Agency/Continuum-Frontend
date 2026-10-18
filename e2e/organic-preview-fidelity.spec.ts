// organic:preview-fidelity:e2e:bench — the joint anchor of the publish-plan pair (wave 2).
//
// The preview must render exactly what the backend will publish. For every case below the
// bench seeds a real draft row on the local stack, opens it in the real planner, waits for
// the real dry run (GET /api/organic/calendar/drafts/:id/publish-plan) the panel makes, and
// asserts the RENDERED preview equals that response's plan: platform, format and verb, the
// account handle, the caption exactly as sent, the notices, the cover, slide order (read off
// the rendered media's own src, one slide at a time), and the readiness line against the
// server's gate. URLs are never compared — signing differs per side; storage paths do not.
//
// Accounts are seeded as real integration rows (user_integrations → integration_accounts_assets
// → brand_profile_integration_accounts) so the dry run resolves real handles. The backend's
// account list is cached per brand+provider in the app cache; the local backend this bench is
// run against must have APP_CACHE_REDIS_URL blanked or a pre-seed answer is served for an
// hour (the 'bench env' trap). Nothing is approved and nothing is published: the one Publish
// now click stops at the confirm dialog. Every row, account and object is removed afterwards.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plannerInstantFromDayTime, resolvePlannerTimeZone } from '@continuum/contracts';
import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import {
  admin,
  type BenchMedia,
  BRAND_ID,
  dayIdOffsetFromToday,
  forgetCachedIntegrations,
  HAS_LOCAL_STACK,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD,
  MEDIA_BUCKET,
  makeBenchMedia,
  OWNER_ID,
  readActiveBrand,
  repairOnboarding,
  schemaOf,
  setActiveBrand,
} from './support/plannerBench';

const PREFIX = 'plfid-';
const OUT_DIR = resolve(process.cwd(), '..', 'artifacts', 'organic-review-fe', 'fidelity');
const MEDIA_DIR = `${BRAND_ID}/preview-fidelity-bench`;
const DAY_ID = dayIdOffsetFromToday(7);
// 10:00 on that day in the BRAND's zone (read in beforeAll) — the zone the field route composes
// in and the panel states. The row's instant and its 10:00 AM label must name one moment, or
// the panel could show one time while the scheduler fires at another, unnoticed.
let brandZone = 'UTC';
let scheduledAt = '';

// ── Accounts ─────────────────────────────────────────────────────────────────────────────────

const INTEGRATIONS = {
  meta: '0f1d0000-0000-4000-8000-000000000101',
  google: '0f1d0000-0000-4000-8000-000000000102',
  linkedin: '0f1d0000-0000-4000-8000-000000000103',
  tiktok: '0f1d0000-0000-4000-8000-000000000104',
} as const;

const ACCOUNTS = [
  {
    id: '0f1d0000-0000-4000-8000-000000000201',
    integration: INTEGRATIONS.meta,
    type: 'meta_instagram_account',
    name: 'PLFID Studio',
    raw_payload: { username: 'plfid.studio' },
  },
  {
    id: '0f1d0000-0000-4000-8000-000000000202',
    integration: INTEGRATIONS.meta,
    type: 'meta_page',
    name: 'PLFID Studio Page',
    raw_payload: {},
  },
  {
    id: '0f1d0000-0000-4000-8000-000000000203',
    integration: INTEGRATIONS.google,
    type: 'youtube_channel',
    name: 'PLFID Studio TV',
    raw_payload: { handle: '@plfidstudio' },
  },
  {
    id: '0f1d0000-0000-4000-8000-000000000204',
    integration: INTEGRATIONS.linkedin,
    type: 'linkedin_organization',
    name: 'PLFID Studio Inc',
    raw_payload: {},
  },
  {
    id: '0f1d0000-0000-4000-8000-000000000205',
    integration: INTEGRATIONS.tiktok,
    type: 'tiktok_account',
    name: 'PLFID Tok',
    raw_payload: { username: 'plfid.tok' },
  },
] as const;

async function purgeAccounts(supabase: SupabaseClient): Promise<void> {
  // Assets and brand links cascade from the integration rows.
  await schemaOf(supabase, 'brand_profiles')
    .from('user_integrations')
    .delete()
    .in('id', Object.values(INTEGRATIONS))
    .throwOnError();
}

async function seedAccounts(supabase: SupabaseClient): Promise<void> {
  await purgeAccounts(supabase);
  const profiles = schemaOf(supabase, 'brand_profiles');
  await profiles
    .from('user_integrations')
    .insert(
      Object.entries(INTEGRATIONS).map(([provider, id]) => ({
        id,
        user_id: OWNER_ID,
        provider,
        metadata: { bench: 'organic-preview-fidelity' },
      })),
    )
    .throwOnError();
  await profiles
    .from('integration_accounts_assets')
    .insert(
      ACCOUNTS.map((account) => ({
        id: account.id,
        integration_id: account.integration,
        external_account_id: `${PREFIX}${account.id.slice(-3)}`,
        type: account.type,
        name: account.name,
        raw_payload: account.raw_payload,
      })),
    )
    .throwOnError();
  await profiles
    .from('brand_profile_integration_accounts')
    .insert(
      ACCOUNTS.map((account) => ({
        brand_profile_id: BRAND_ID,
        integration_account_id: account.id,
        integration_id: account.integration,
      })),
    )
    .throwOnError();
}

// ── Media and cases ──────────────────────────────────────────────────────────────────────────

const MEDIA = {
  square: { kind: 'image', width: 540, height: 540 },
  portrait: { kind: 'image', width: 540, height: 675 },
  story: { kind: 'image', width: 540, height: 960 },
  tall: { kind: 'image', width: 540, height: 1200 },
  slideA: { kind: 'image', width: 540, height: 675 },
  slideB: { kind: 'image', width: 540, height: 675 },
  slideC: { kind: 'image', width: 540, height: 675 },
  slideLoose: { kind: 'image', width: 540, height: 675 },
  cover: { kind: 'image', width: 540, height: 960 },
  vertical: { kind: 'video', width: 360, height: 640 },
  landscape: { kind: 'video', width: 640, height: 360 },
} as const;
type MediaName = keyof typeof MEDIA;

type CaseAsset = { media: MediaName; slideIndex?: number; role?: string };
type FidelityCase = {
  key: string;
  platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube';
  format: 'Post' | 'Carousel' | 'Reel' | 'Story';
  caption: string;
  hashtags?: string[];
  assets: CaseAsset[];
  /** Notices the case exists to exercise; the plan must carry them (and the panel must show them). */
  mustNotice?: string[];
  /** Seeded already bound, so no first-read bind write (and its refetch) races the case. */
  boundAccountId?: string;
};

const manyTags = Array.from({ length: 35 }, (_, index) => `#plfidtag${index + 1}`);
const longCopy = `${'PLFID long LinkedIn copy that keeps going past the platform limit. '.repeat(48)}END`;

const CASES: FidelityCase[] = [
  {
    key: 'ig-feed',
    platform: 'instagram',
    format: 'Post',
    caption: 'PLFID Instagram feed post.',
    hashtags: ['#legday', '#homeworkout'],
    assets: [{ media: 'square', slideIndex: 0 }],
  },
  {
    // Gating #9: a 9:20 image on the feed is outside 4:5–1.91:1 and is sent uncropped.
    key: 'ig-tall',
    platform: 'instagram',
    format: 'Post',
    caption: 'PLFID tall image on the Instagram feed.',
    assets: [{ media: 'tall', slideIndex: 0 }],
    mustNotice: ['aspect_out_of_range'],
  },
  {
    key: 'ig-carousel',
    platform: 'instagram',
    format: 'Carousel',
    caption: 'PLFID carousel: out of order, one unindexed, a cover that is never a slide.',
    hashtags: manyTags,
    // Stored order is NOT sent order: sent order is slideIndex, unindexed last, cover never.
    assets: [
      { media: 'slideC', slideIndex: 2 },
      { media: 'slideA', slideIndex: 0 },
      { media: 'slideLoose' },
      { media: 'cover', role: 'cover' },
      { media: 'slideB', slideIndex: 1 },
    ],
    mustNotice: ['hashtags_dropped'],
  },
  {
    key: 'ig-reel',
    platform: 'instagram',
    format: 'Reel',
    caption: 'PLFID Instagram reel with a chosen cover.',
    assets: [
      { media: 'vertical', slideIndex: 0 },
      { media: 'cover', role: 'cover' },
    ],
  },
  {
    key: 'ig-story',
    platform: 'instagram',
    format: 'Story',
    caption: 'PLFID story caption that a story never sends.',
    assets: [{ media: 'story', slideIndex: 0 }],
    mustNotice: ['caption_not_sent'],
  },
  {
    key: 'fb-feed',
    platform: 'facebook',
    format: 'Post',
    caption: 'PLFID Facebook feed post.',
    assets: [{ media: 'square', slideIndex: 0 }],
  },
  {
    key: 'fb-reel',
    platform: 'facebook',
    format: 'Reel',
    caption: 'PLFID Facebook reel.',
    assets: [{ media: 'vertical', slideIndex: 0 }],
  },
  {
    key: 'fb-text',
    platform: 'facebook',
    format: 'Post',
    caption: 'PLFID Facebook text post, no media at all.',
    assets: [],
  },
  {
    key: 'li-text',
    platform: 'linkedin',
    format: 'Post',
    caption: longCopy,
    assets: [],
    mustNotice: ['caption_truncated'],
  },
  {
    key: 'li-image',
    platform: 'linkedin',
    format: 'Post',
    caption: 'PLFID LinkedIn image post.',
    assets: [{ media: 'portrait', slideIndex: 0 }],
  },
  {
    key: 'tt-reel',
    platform: 'tiktok',
    format: 'Reel',
    caption: 'PLFID TikTok video.',
    assets: [{ media: 'vertical', slideIndex: 0 }],
  },
  {
    key: 'yt-short',
    platform: 'youtube',
    format: 'Reel',
    caption: 'PLFID Short title line\nThe short description.',
    assets: [{ media: 'vertical', slideIndex: 0 }],
  },
  {
    key: 'yt-long',
    platform: 'youtube',
    format: 'Reel',
    caption: '\n  PLFID how we brew it  \nThe full walkthrough.',
    assets: [{ media: 'landscape', slideIndex: 0 }],
  },
];

const MOVE_CASE: FidelityCase = {
  key: 'move',
  platform: 'facebook',
  format: 'Post',
  caption: 'PLFID platform move: Facebook to LinkedIn through the field route.',
  assets: [{ media: 'square', slideIndex: 0 }],
  // The Facebook page: a first-read bind would refetch the calendar mid-toggle and reset the
  // platform the case added locally.
  boundAccountId: '0f1d0000-0000-4000-8000-000000000202',
};

const GROW_CASE: FidelityCase = {
  key: 'grow',
  platform: 'instagram',
  format: 'Post',
  caption: 'PLFID one image that grows into a carousel.',
  assets: [{ media: 'slideA', slideIndex: 0 }],
  boundAccountId: '0f1d0000-0000-4000-8000-000000000201',
};

const titleOf = (fixture: FidelityCase) => `PLFID ${fixture.key}`;

function draftRow(fixture: FidelityCase, media: Map<MediaName, BenchMedia>) {
  const assets = fixture.assets.map((asset) => {
    const item = media.get(asset.media);
    if (!item) throw new Error(`media ${asset.media} was never made`);
    return {
      role: asset.role ?? (asset.slideIndex === 0 ? 'primary' : 'slide'),
      kind: item.kind,
      ...(asset.slideIndex === undefined ? {} : { slideIndex: asset.slideIndex }),
      bucket: MEDIA_BUCKET,
      storagePath: item.path,
      storageUrl: item.signedUrl,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
    };
  });
  const isVideo = assets.some((asset) => asset.kind === 'video' && asset.role !== 'cover');
  return {
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: fixture.platform,
    platform_account_id: fixture.boundAccountId ?? 'unassigned',
    status: 'draft',
    scheduled_date: scheduledAt,
    client_key: `${PREFIX}${fixture.key}`,
    media_stage: assets.length > 0 ? 'realized' : 'text_only',
    slot_data: {
      placementId: `${PREFIX}${fixture.key}`,
      dayId: DAY_ID,
      weekStart: DAY_ID,
      timeLabel: '10:00 AM',
      platform: fixture.platform,
      trendId: null,
      title: titleOf(fixture),
      caption: fixture.caption,
    },
    content_json: {
      content: { type: fixture.format.toLowerCase(), format: fixture.format },
      copy: {
        caption: fixture.caption,
        hashtags: { high: fixture.hashtags ?? [], medium: [], low: [] },
        claims: [],
      },
      ...(assets.length > 0
        ? {
            publishingAssets: assets,
            creative: {
              mediaSuggestion: {
                mediaStatus: 'user_supplied',
                kind: fixture.format === 'Carousel' ? 'carousel' : isVideo ? 'reel' : 'image',
              },
            },
          }
        : { creative: {} }),
      quality: { passed: true },
    },
  };
}

async function purgeDrafts(supabase: SupabaseClient): Promise<void> {
  await schemaOf(supabase, 'organic')
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', BRAND_ID)
    .like('client_key', `${PREFIX}%`)
    .throwOnError();
}

// ── The plan the server answered with ────────────────────────────────────────────────────────

type ServerPlan = {
  platform: string;
  format: string;
  verb: string;
  account: { handle: string | null; displayName: string | null; status: string };
  caption: { text: string | null };
  media: { storagePath: string | null; kind: string }[];
  cover: { storagePath: string | null } | null;
  notices: { code: string; message: string }[];
  options: { youtube: { title: string } | null };
};
type DryRun = {
  plan: ServerPlan;
  publishable: boolean;
  blockers: { reason: string; fix: string }[];
};

// The panel's own account rule: a username reads with its @, a Page or a company does not.
function expectedHandle(plan: ServerPlan): string | null {
  const raw = plan.account.handle ?? plan.account.displayName;
  if (!raw) return null;
  if (plan.platform === 'instagram' || plan.platform === 'tiktok') {
    return raw.startsWith('@') ? raw : `@${raw}`;
  }
  return raw;
}

// A signed or optimized media src → the storage path it was signed for.
function storagePathOf(src: string | null): string | null {
  if (!src) return null;
  let url = src;
  if (url.includes('/_next/image')) {
    url = new URL(url, 'http://localhost').searchParams.get('url') ?? url;
  }
  const match = decodeURIComponent(url).match(/\/object\/(?:sign|public)\/[^/]+\/([^?#]+)/);
  return match?.[1] ?? null;
}

async function renderedSlidePaths(preview: Locator, count: number): Promise<(string | null)[]> {
  const paths: (string | null)[] = [];
  for (let position = 0; position < count; position += 1) {
    if (position > 0) await preview.getByLabel('Next slide').first().click();
    const media = preview.locator('[data-frame-media] img[alt*="slide"], [data-frame-media] video');
    await expect(media.first()).toBeVisible({ timeout: 30_000 });
    // The slide re-signs after mount; read the src once it names a storage object.
    let path: string | null = null;
    await expect
      .poll(
        async () => {
          path = storagePathOf(await media.first().getAttribute('src'));
          return path;
        },
        { timeout: 30_000, message: `slide ${position + 1} never rendered a storage-backed src` },
      )
      .not.toBeNull();
    paths.push(path);
  }
  return paths;
}

const listRow = (page: Page, text: string) =>
  page
    .locator('[data-tour-id="organic-list-content"] div[role="button"]')
    .filter({ hasText: text })
    .first();

async function openListPlanner(page: Page): Promise<void> {
  await page.goto('/organic?tab=planner&view=list', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Planner', exact: true })).toBeVisible({
    timeout: 120_000,
  });
  const listToggle = page.locator('[data-tour-id="organic-list-view"]').first();
  await expect
    .poll(
      async () => {
        if ((await listToggle.getAttribute('aria-pressed')) === 'true') return 'list';
        await listToggle.click({ timeout: 5_000 }).catch(() => {});
        return 'not-list';
      },
      { timeout: 120_000, intervals: [1000, 2000, 3000] },
    )
    .toBe('list');
}

/** Opens a case's draft and returns the dry run the panel made for it. */
async function openCase(
  page: Page,
  fixture: FidelityCase,
  rowId: string,
): Promise<{ preview: Locator; dryRun: DryRun }> {
  // The panel aborts a dry run whose key moved on (the server binds the row's account on the
  // first read, which changes the key), so the first response may carry no body. Take the
  // first one that does.
  let dryRun: DryRun | null = null;
  const planResponse = page.waitForResponse(
    async (response: Response) => {
      if (
        !response.url().includes(`/drafts/${rowId}/publish-plan`) ||
        !response.url().includes(`platform=${fixture.platform}`)
      ) {
        return false;
      }
      const body = (await response.json().catch(() => null)) as DryRun | null;
      if (!body?.plan) return false;
      dryRun = body;
      return true;
    },
    { timeout: 90_000 },
  );
  const row = listRow(page, titleOf(fixture));
  await expect(row, `${fixture.key}: no planner row`).toBeVisible({ timeout: 120_000 });
  await row.click();
  const preview = page.getByRole('complementary', { name: 'Draft preview' });
  await expect(preview).toBeVisible({ timeout: 60_000 });
  const response = await planResponse;
  expect(response.status(), `${fixture.key}: the dry run failed`).toBeLessThan(400);
  if (!dryRun) throw new Error(`${fixture.key}: no readable dry run`);
  return { preview, dryRun };
}

test.describe('organic preview fidelity — the preview renders the publish plan', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'needs the local Supabase stack — bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let context: BrowserContext | null = null;
  let page: Page;
  let previousActiveBrandId: string | null = null;
  let mediaPaths: string[] = [];
  let benchMedia = new Map<MediaName, BenchMedia>();
  const rowIds = new Map<string, string>();
  const comparisons: Record<string, unknown>[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    mkdirSync(OUT_DIR, { recursive: true });
    const supabase = admin();
    previousActiveBrandId = await readActiveBrand(supabase);
    await setActiveBrand(supabase, BRAND_ID);
    await repairOnboarding(supabase);
    await purgeDrafts(supabase);
    await seedAccounts(supabase);
    const { data: brand } = await schemaOf(supabase, 'brand_profiles')
      .from('brand_profiles')
      .select('timezone')
      .eq('id', BRAND_ID)
      .single()
      .throwOnError();
    brandZone = resolvePlannerTimeZone((brand as { timezone: string | null }).timezone);
    scheduledAt =
      plannerInstantFromDayTime({ dayId: DAY_ID, timeOfDay: '10:00', timeZone: brandZone }) ?? '';
    console.log(`[fidelity] brand zone ${brandZone}; posts fire at ${scheduledAt}`);

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();

    const media = await makeBenchMedia(page, supabase, MEDIA, MEDIA_DIR);
    benchMedia = media;
    mediaPaths = [...media.values()].map((item) => item.path);
    const rows = [...CASES, MOVE_CASE, GROW_CASE].map((fixture) => draftRow(fixture, media));
    const { data } = await schemaOf(supabase, 'organic')
      .from('organic_calendar_drafts')
      .insert(rows)
      .select('id, client_key')
      .throwOnError();
    for (const row of (data ?? []) as { id: string; client_key: string }[]) {
      rowIds.set(row.client_key.slice(PREFIX.length), row.id);
    }
    await openListPlanner(page);
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    // A partial run (one -g case) must not replace the full run's record with its fragment.
    if (comparisons.length >= CASES.length) {
      writeFileSync(
        resolve(OUT_DIR, 'comparison.json'),
        `${JSON.stringify(comparisons, null, 2)}\n`,
      );
    }
    await context?.close();
    const supabase = admin();
    await purgeDrafts(supabase);
    await purgeAccounts(supabase);
    await forgetCachedIntegrations();
    if (mediaPaths.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(mediaPaths);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
    // Net zero: nothing this bench wrote survives it.
    const { count } = await schemaOf(supabase, 'organic')
      .from('organic_calendar_drafts')
      .select('id', { count: 'exact', head: true })
      .like('client_key', `${PREFIX}%`);
    const { count: accounts } = await schemaOf(supabase, 'brand_profiles')
      .from('user_integrations')
      .select('id', { count: 'exact', head: true })
      .in('id', Object.values(INTEGRATIONS));
    console.log(
      `[fidelity] cleanup: ${count ?? '?'} draft rows, ${accounts ?? '?'} integrations left`,
    );
    expect(count ?? 0).toBe(0);
    expect(accounts ?? 0).toBe(0);
  });

  for (const fixture of CASES) {
    test(`${fixture.key}: the rendered preview equals the dry-run plan`, async () => {
      const rowId = rowIds.get(fixture.key);
      if (!rowId) throw new Error(`${fixture.key}: the row was never seeded`);
      const { preview, dryRun } = await openCase(page, fixture, rowId);
      const plan = dryRun.plan;
      const label = fixture.key;

      for (const code of fixture.mustNotice ?? []) {
        expect(
          plan.notices.map((notice) => notice.code),
          `${label}: the plan does not carry the ${code} notice this case exists for`,
        ).toContain(code);
      }

      // Who: the account resolved from the seeded integrations, shown before any click.
      expect(plan.account.status, `${label}: the dry run did not resolve the seeded account`).toBe(
        'resolved',
      );
      await expect(preview.locator('[data-review-account]')).toHaveText(
        expectedHandle(plan) ?? '',
        { timeout: 30_000 },
      );

      // What: the panel's own plan names the same platform, format and verb.
      const panel = preview.locator('[data-plan-platform]').first();
      await expect(panel).toHaveAttribute('data-plan-platform', plan.platform);
      await expect(panel).toHaveAttribute('data-plan-format', plan.format);
      await expect(panel).toHaveAttribute('data-plan-verb', plan.verb);
      await expect(preview.locator('[data-preview-frame]').first()).toHaveAttribute(
        'data-preview-frame',
        plan.platform,
      );

      // When: the instant the scheduler fires (the row's scheduled_date), day and zone included.
      const when = ((await preview.locator('[data-review-when]').textContent()) ?? '').trim();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: brandZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).formatToParts(new Date(scheduledAt));
      const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
      const firesAt = `${part('weekday')} ${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`;
      expect(when.endsWith(firesAt), `${label}: shows "${when}", fires ${firesAt}`).toBe(true);

      // The caption, exactly as sent — or none at all.
      const captionReadout = preview
        .locator('[data-preview-frame] button')
        .filter({ has: preview.page().locator('span.whitespace-pre-wrap') })
        .first();
      let renderedCaption: string | null = null;
      if (plan.caption.text === null) {
        await expect(
          preview.locator('[data-preview-frame] span.whitespace-pre-wrap'),
          `${label}: a caption is shown that is never sent`,
        ).toHaveCount(0);
      } else {
        // innerText, not textContent: the readout draws each newline as a <br>, and what the
        // reader sees is the line break.
        renderedCaption = await captionReadout
          .locator('span.whitespace-pre-wrap')
          .evaluate((node) => (node as HTMLElement).innerText);
        expect(renderedCaption.replace(/​/g, '').trim(), `${label}: caption as sent`).toBe(
          plan.caption.text.trim(),
        );
      }
      if (plan.options.youtube) {
        await expect(preview.locator('[data-preview-frame]').first()).toContainText(
          plan.options.youtube.title,
        );
      }

      // Every difference from what was typed, as a visible notice.
      const shownNotices = await preview.locator('[data-plan-notice]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          code: node.getAttribute('data-plan-notice') ?? '',
          message: (node.textContent ?? '').trim(),
        })),
      );
      const byCode = (list: { code: string; message: string }[]) =>
        [...list].sort((a, b) => `${a.code}${a.message}`.localeCompare(`${b.code}${b.message}`));
      expect(byCode(shownNotices), `${label}: notices`).toEqual(
        byCode(plan.notices.map(({ code, message }) => ({ code, message: message.trim() }))),
      );
      // Readable, not just present: a long caption once clipped the cut-caption notice out of
      // the slot and painted over the dropped-tags one while the DOM text still matched.
      for (const notice of await preview.locator('[data-plan-notice]').all()) {
        await expect(notice, `${label}: a notice is clipped out of view`).toBeInViewport({
          ratio: 1,
        });
        const uncovered = await notice.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit !== null && node.contains(hit);
        });
        expect(uncovered, `${label}: something is drawn over a notice`).toBe(true);
      }

      // The cover that goes with the video — or none.
      const cover = preview.locator('[data-plan-cover]');
      if (plan.cover) {
        await expect(cover).toHaveAttribute('data-plan-cover', plan.cover.storagePath ?? '');
      } else {
        await expect(cover).toHaveCount(0);
      }

      // Slides in sent order, read off what is on screen.
      const sentPaths = plan.media.map((item) => item.storagePath);
      let shownPaths: (string | null)[] = [];
      if (sentPaths.length === 0) {
        await expect(
          preview.locator('[data-frame-media] img, [data-frame-media] video'),
          `${label}: media is drawn for a post that sends none`,
        ).toHaveCount(0);
      } else {
        shownPaths = await renderedSlidePaths(preview, sentPaths.length);
        expect(shownPaths, `${label}: slide order`).toEqual(sentPaths);
      }

      // The gate: the panel and the server agree on whether it can go, and on what to fix.
      const readiness = preview.locator('[data-readiness]').first();
      await expect(readiness).toHaveAttribute(
        'data-readiness',
        dryRun.publishable ? 'ready' : 'blocked',
      );
      const shownFixes = await preview
        .locator('[data-readiness-fix]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-readiness-fix')));
      expect([...new Set(shownFixes)].sort(), `${label}: fixes`).toEqual(
        [...new Set(dryRun.blockers.map((blocker) => blocker.fix))].sort(),
      );

      comparisons.push({
        case: label,
        platform: plan.platform,
        format: plan.format,
        verb: plan.verb,
        account: expectedHandle(plan),
        caption: { sent: plan.caption.text, shown: renderedCaption },
        notices: { sent: plan.notices.map((n) => n.code), shown: shownNotices.map((n) => n.code) },
        cover: plan.cover?.storagePath ?? null,
        slides: { sent: sentPaths, shown: shownPaths },
        publishable: dryRun.publishable,
        fixes: shownFixes,
        when,
      });
      await page.screenshot({ path: resolve(OUT_DIR, `${label}.png`) });
    });
  }

  // Gating #11, the positive half: a publishable post's Publish now is enabled and reaches the
  // platform confirm through the real publish-intent route. Never confirmed. TikTok and YouTube
  // are here because wave 1's confirm checks for them now stop at the account gate.
  for (const [key, platformLabel] of [
    ['ig-feed', 'Instagram'],
    ['tt-reel', 'TikTok'],
    ['yt-short', 'YouTube'],
  ] as const) {
    test(`${key}: Publish now reaches the ${platformLabel} confirm, and the bench cancels it`, async () => {
      const fixture = CASES.find((candidate) => candidate.key === key);
      const rowId = fixture ? rowIds.get(fixture.key) : undefined;
      if (!fixture || !rowId) throw new Error(`${key} was never seeded`);
      await openListPlanner(page);
      await listRow(page, titleOf(fixture)).click();
      const preview = page.getByRole('complementary', { name: 'Draft preview' });
      const publish = preview.getByRole('button', { name: 'Publish now', exact: true });
      await expect(publish).toBeEnabled({ timeout: 60_000 });
      // Read once the plan has resolved: until then the header shows the brand's name.
      const account = preview.locator('[data-review-account]').first();
      await expect(account, `${key}: the preview names an account`).toHaveText(/^@/);
      const handle = (await account.innerText()).trim();
      const intent = page.waitForResponse(
        (response) =>
          response.url().includes('/publish-intent') && response.request().method() === 'POST',
        { timeout: 60_000 },
      );
      await publish.click();
      const intentResponse = await intent;
      const body = (await intentResponse.json().catch(() => null)) as {
        publishable?: boolean;
        platform?: string;
        account?: unknown;
        media?: unknown;
        blockers?: unknown;
      } | null;
      console.log(
        `[fidelity] publish-intent ${intentResponse.status()} platform=${body?.platform} publishable=${body?.publishable} account=${JSON.stringify(body?.account ?? null)} media=${JSON.stringify(body?.media ?? null)} blockers=${JSON.stringify(body?.blockers ?? null)}`,
      );
      expect(intentResponse.status()).toBeLessThan(400);
      expect(body?.publishable).toBe(true);
      expect(body?.platform).toBe(fixture.platform);
      const dialog = page.getByRole('alertdialog');
      await expect(dialog.getByText(`Publish to ${platformLabel}?`)).toBeVisible({
        timeout: 30_000,
      });
      // The confirm names the destination by the handle the preview showed, not an id.
      await expect(dialog.getByText(handle)).toBeVisible();
      await page.screenshot({ path: resolve(OUT_DIR, `${key}-publish-confirm.png`) });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });
    });
  }

  // Gating #15: the platform chip persists through PATCH /fields — the row itself moves, and
  // the dry run then answers for the new platform. No browser write to the row.
  test('move: dropping Facebook for LinkedIn moves the row through the field route', async () => {
    const rowId = rowIds.get(MOVE_CASE.key);
    if (!rowId) throw new Error('the move row was never seeded');
    await openListPlanner(page);
    await openCase(page, MOVE_CASE, rowId);
    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    const browserWrites: string[] = [];
    page.on('request', (request) => {
      if (/\/rest\/v1\/organic_calendar_drafts/.test(request.url()) && request.method() !== 'GET') {
        browserWrites.push(`${request.method()} ${request.url()}`);
      }
    });
    const chip = () => preview.getByRole('button', { name: /^Change platforms/ });
    // One toggle per opening, as a user clicks it: the menu re-renders under the chip when the
    // selection changes, and a second click during that transition lands on nothing.
    const toggle = async (name: string) => {
      const item = page.getByRole('menuitemcheckbox', { name, exact: true });
      await chip().click();
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitemcheckbox')).toHaveCount(0, { timeout: 20_000 });
    };

    await toggle('LinkedIn');
    const fieldsPatch = page.waitForResponse(
      (response) =>
        response.url().includes(`/drafts/${rowId}/fields`) &&
        response.request().method() === 'PATCH',
      { timeout: 60_000 },
    );
    const linkedinPlan = page.waitForResponse(
      (response) =>
        response.url().includes(`/drafts/${rowId}/publish-plan`) &&
        response.url().includes('platform=linkedin'),
      { timeout: 60_000 },
    );
    await toggle('Facebook');
    const patch = await fieldsPatch;
    const patchBody = patch.request().postDataJSON() as Record<string, unknown>;
    console.log(`[fidelity] move PATCH ${patch.status()} body=${JSON.stringify(patchBody)}`);
    expect(patch.status()).toBeLessThan(400);
    expect(patchBody.platform).toBe('linkedin');
    expect('accountId' in patchBody).toBe(true);

    const { data: row } = await schemaOf(admin(), 'organic')
      .from('organic_calendar_drafts')
      .select('platform, slot_data')
      .eq('id', rowId)
      .single()
      .throwOnError();
    expect((row as { platform: string }).platform).toBe('linkedin');
    expect(((row as { slot_data: { platform: unknown } }).slot_data.platform as string) ?? '').toBe(
      'linkedin',
    );
    await linkedinPlan;
    await expect(preview.locator('[data-plan-platform]').first()).toHaveAttribute(
      'data-plan-platform',
      'linkedin',
    );
    expect(browserWrites, 'the browser wrote the draft row directly').toEqual([]);
    comparisons.push({ case: 'move', patch: patchBody, rowPlatform: 'linkedin' });
    await page.screenshot({ path: resolve(OUT_DIR, 'move-to-linkedin.png') });
  });

  // Gating #3 across the boundary. The "+" on a one-image post sends the second slide AND the
  // carousel format in ONE field PATCH (useDraftMediaPlacement.test.ts pins that body). This
  // sends that body to the real route with the panel's own session and asks the real dry run
  // what goes out. NOT driven: the library pick that builds the body in the browser — the
  // bench brand has no library assets to pick.
  test('grow: a second slide and the carousel format in one PATCH publish a carousel', async () => {
    const rowId = rowIds.get(GROW_CASE.key);
    const second = benchMedia.get('slideB');
    if (!rowId || !second) throw new Error('the grow row was never seeded');
    await openListPlanner(page);
    const firstRead = page.waitForResponse(
      (response) => response.url().includes(`/drafts/${rowId}/publish-plan`),
      { timeout: 60_000 },
    );
    await listRow(page, titleOf(GROW_CASE)).click();
    const read = await firstRead;
    const authorization = read.request().headers().authorization ?? '';
    const route = `${new URL(read.url()).origin}/api/organic/calendar/drafts/${rowId}`;

    const { data } = await schemaOf(admin(), 'organic')
      .from('organic_calendar_drafts')
      .select('updated_at, content_json')
      .eq('id', rowId)
      .single()
      .throwOnError();
    const stored = data as {
      updated_at: string;
      content_json: {
        publishingAssets: { storagePath: string }[];
        creative: { mediaSuggestion: Record<string, unknown> };
      };
    };
    const [first] = stored.content_json.publishingAssets;
    if (!first) throw new Error('the grow row has no image');
    const patched = await page.request.patch(`${route}/fields`, {
      headers: { authorization },
      data: {
        expected_updated_at: stored.updated_at,
        format: 'Carousel',
        media: {
          publishingAssets: [
            { ...first, slideIndex: 0 },
            {
              role: 'primary',
              kind: 'image',
              slideIndex: 1,
              bucket: MEDIA_BUCKET,
              storagePath: second.path,
              storageUrl: second.signedUrl,
              mimeType: second.mimeType,
              width: second.width,
              height: second.height,
            },
          ],
          mediaSuggestion: {
            ...stored.content_json.creative.mediaSuggestion,
            mediaStatus: 'user_supplied',
          },
        },
      },
    });
    expect(patched.status(), await patched.text()).toBeLessThan(400);

    const planned = await page.request.get(`${route}/publish-plan?platform=instagram`, {
      headers: { authorization },
    });
    const dryRun = (await planned.json()) as DryRun;
    const sent = dryRun.plan.media.map((item) => item.storagePath);
    console.log(
      `[fidelity] grow PATCH ${patched.status()} → plan format=${dryRun.plan.format} media=${JSON.stringify(sent)} publishable=${dryRun.publishable}`,
    );
    expect(dryRun.plan.format).toBe('CAROUSEL');
    expect(sent).toEqual([first.storagePath, second.path]);
    expect(dryRun.publishable).toBe(true);
    comparisons.push({ case: 'grow', format: dryRun.plan.format, media: sent });
  });
});
