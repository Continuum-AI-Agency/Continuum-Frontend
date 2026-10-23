import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';
import { dayIdOffsetFromToday, forgetCachedIntegrations } from './support/plannerBench';

// Organic planner list + draft-preview bench (Airtable #227, #225, #226, #231, #233).
//
// Drives the REAL code path across its real boundaries: forty-odd draft rows are written to
// the real local Postgres, read back through the real Backend `/api/organic/calendar/drafts`,
// rendered by the real planner list, and MEASURED BY A REAL BROWSER. The video fixture is a
// real H.264 MP4 encoded in-page with Mediabunny and uploaded to real Supabase storage; the
// preview re-signs it from the durable bucket+path pair. Nothing is mocked.
//
// Every geometric claim in this file was UNPROVEN before it existed: the four fixes it guards
// were verified at the props/class level under happy-dom, which does no layout at all. Wave C's
// `h-24` bulk-bar clearance was a reasoned estimate that had never been measured, and its hover
// -card fix (moving the overflow onto the alignment axis so floating-ui's `shift` can correct
// it) was reasoned from library internals and had never been observed.
//
// Real Chrome, not Playwright's Chromium: the bundled build ships no proprietary codecs, so
// H.264 — what a user's browser actually decodes — would never be exercised.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Frontend on :3001 and Backend on :4000, both on the LOCAL stack:
//     bun run dev:fe:local-supabase   (PORT=3001)
//     bun run dev:be:local-supabase
//   :3000 belongs to another project on this machine, and Continuum-Backend/App/cors.ts
//   allowlists 3000/3001/3002 only — a port outside that set fails CORS, not auth.
//   Run with: bun run planner:preview:e2e:bench
//
// UN-EXERCISED HOPS, STATED EXPLICITLY — this bench does NOT cover:
//   · Live agent streaming. Every draft here is a PERSISTED row rendered through the same
//     components a live run feeds; no token was streamed, no agent turn was taken.
//   · Real media generation. The MP4 is encoded locally by Mediabunny and the poster by the
//     app's own poster module — no Vertex/Veo call, no reel render.
//   · Publishing. The attach path is exercised up to the picker's refusal; nothing is posted
//     to Instagram, and `stageMediaForPublish` is not run. The TikTok/YouTube case drives
//     Publish through the real `publish-intent` route to the confirm dialog and CANCELS it:
//     the provider hop (TikTok/YouTube actually receiving the post) is not exercised here —
//     `organic:tiktok:live:bench` is the bench that posts for real.
//   · Aesthetic judgement on the hover card and the preview panel. Containment, overlap and
//     scroll deltas are measured; whether the result LOOKS right is a human call, and the
//     screenshots in e2e/__screenshots__/organic-planner-preview are attached for it.
//   · Every viewport, in the #225–#233 suite. It runs wide (1600px) only. The "planner UX
//     (U1–U7)" describe at the bottom covers 1280x800, 1440x900, 1920x1080 (geometry, frames,
//     timing, keyboard) plus 900x900 and 390x844 (the narrow sheet).
//   · Backlog persistence. Backlog rows live in sessionStorage by design, so the BacklogRow
//     hover assertion covers rendering, not durability.
//
// The "planner UX (U1–U7)" describe additionally does NOT cover:
//   · Live platform publishing: its drafts are previewed, never published.
//   · Real external posted content. The published-post previews come from rows seeded into
//     `organic.organic_published_posts`; the `organic-reporting` edge fetch, which is what
//     yields TikTok and YouTube posts in production, is not wired on the local stack. A YouTube
//     long-form PUBLISHED post cannot be seeded at all: `organic_published_posts_platform_check`
//     allows instagram/facebook/linkedin/tiktok only. The U4 YouTube case records that and
//     skips; the YouTube long-form DRAFT frame is still covered by U3, and the production
//     YouTube posted shape (mediaType SHORTS, watch?v= links) by the calendar-posts
//     route.test.ts and social-preview-utils unit tests. Posted Instagram, Facebook, TikTok
//     and LinkedIn rows are seeded and previewed in both month and week.
//   · Production-build timing. U5's milliseconds come from `next dev` on :3001, so they are
//     noisy. The render counts are the deterministic gate.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
// The RFC-4122-valid fixture brand. The legacy fixture brand (…0000b1) has a zero version
// nibble, which the Backend's `z.uuid()` rejects outright — the planner would render an empty
// list and the bench would be proving nothing.
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

const BENCH_CLIENT_KEY_PREFIX = 'bench-plprev-';
const BULK_ROW_COUNT = 40;
const BUCKET = 'brand-profile-assets';
const MEDIA_BUCKET = 'media-library';
const VIDEO_PATH = `${BRAND_ID}/planner-preview-bench/reel.mp4`;
// TikTok and YouTube reels get a real 9:16 encode. A YouTube upload's frame follows its media
// (wider than tall, or over 180 s, is long-form), so the 640x360 sample would — correctly —
// preview as a 16:9 watch page, not the Short this case is about.
const VERTICAL_VIDEO_PATH = `${BRAND_ID}/planner-preview-bench/reel-vertical.mp4`;
const LIBRARY_VIDEO_A = `${BRAND_ID}/planner-preview-bench/library-a.mp4`;
const LIBRARY_VIDEO_B = `${BRAND_ID}/planner-preview-bench/library-b.mp4`;
const LIBRARY_ASSET_A = 'bbbbbbbb-0000-4000-8000-00000000ce01';
const LIBRARY_ASSET_B = 'bbbbbbbb-0000-4000-8000-00000000ce02';

const SCREENSHOT_DIR =
  process.env.PLANNER_PREVIEW_BENCH_SCREENSHOT_DIR ?? 'e2e/__screenshots__/organic-planner-preview';

const VIDEO_TITLE = 'PLPREV Video — the attached reel must render in the preview';
const VIDEO_FRESH_TITLE = 'PLPREV Fresh — a freshly attached reel, live signed URL';
const FAR_TITLE = 'PLPREV Far — a draft outside the visible calendar range';
const PICKER_TITLE = 'PLPREV Picker — two videos must be refused';
// TikTok and YouTube drafts used to render "Preview for tiktok is coming soon": no media, no
// picker, a chip reading "Instagram" and a disabled "Publish to Instagram".
const PLATFORM_REEL_TITLES = {
  tiktok: 'PLPREV TikTok — the reel must preview and publish on TikTok',
  youtube: 'PLPREV YouTube — the reel must preview and publish on YouTube',
} as const;
const PLATFORM_REEL_LABELS = { tiktok: 'TikTok', youtube: 'YouTube' } as const;

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Real Chrome: H.264 decode is the whole point of the #231 pixel assertion.
test.use({ channel: 'chrome' });

type Box = { x: number; y: number; width: number; height: number };

declare global {
  interface Window {
    __posterBench: {
      makeSampleMp4: () => Promise<{ base64: string; byteLength: number; mimeType: string }>;
    };
  }
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[planner:preview:e2e:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// The browser half of the bench (a real Mediabunny H.264 encode) is bundled for the page with
// Bun — Playwright's runner is Node and cannot import the app's TS directly. Same helper the
// Library poster bench uses.
function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `planner-preview-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/posterBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

function textDraftRow(index: number) {
  const dayId = dayIdOffsetFromToday(index);
  const clientKey = `${BENCH_CLIENT_KEY_PREFIX}bulk-${`${index}`.padStart(3, '0')}`;
  const title = `PLPREV Row ${`${index}`.padStart(3, '0')} — a list long enough to have to scroll`;
  const caption = `PLPREV CAPTION ${index}. Forty rows is more than one viewport, which is the only way to tell a list that scrolls from a list that merely renders.`;
  return {
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: 'instagram',
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: `${dayId}T12:00:00.000Z`,
    client_key: clientKey,
    media_stage: 'text_only',
    slot_data: {
      placementId: clientKey,
      dayId,
      weekStart: dayId,
      timeLabel: '9:00 AM',
      platform: 'instagram',
      trendId: null,
      title,
      caption,
      draftSnapshot: {
        id: clientKey,
        clientKey,
        title,
        summary: '',
        timeLabel: '9:00 AM',
        dateLabel: dayId,
        status: 'draft',
        platforms: ['instagram'],
        format: 'Post',
        objective: 'Engagement',
        creativeIdea: title,
        captionPreview: caption,
        tags: [],
        mediaCount: 0,
      },
    },
  };
}

// A reel whose upload-time signed URL has decayed (`storageUrl: ''`), on a platform other than
// Instagram — the same re-sign path #231 proves for Instagram.
function platformReelRow(platform: keyof typeof PLATFORM_REEL_TITLES, dayOffset: number) {
  const dayId = dayIdOffsetFromToday(dayOffset);
  const clientKey = `${BENCH_CLIENT_KEY_PREFIX}${platform}`;
  const title = PLATFORM_REEL_TITLES[platform];
  const caption = `PLPREV ${platform.toUpperCase()} CAPTION. One reel, previewed where it posts.`;
  return {
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform,
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: `${dayId}T10:00:00.000Z`,
    client_key: clientKey,
    media_stage: 'realized',
    slot_data: {
      placementId: clientKey,
      dayId,
      weekStart: dayId,
      timeLabel: '10:00 AM',
      platform,
      trendId: null,
      title,
      caption,
    },
    content_json: {
      content: { type: 'reel', format: 'Reel' },
      copy: { caption, hashtags: { high: [], medium: [], low: [] }, claims: [] },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'video',
          storagePath: VERTICAL_VIDEO_PATH,
          storageUrl: '',
          bucket: BUCKET,
          mimeType: 'video/mp4',
        },
      ],
      creative: {
        mediaSuggestion: {
          kind: 'reel',
          mediaStatus: 'user_supplied',
          url: null,
          assetUrl: null,
          signedUrl: null,
          assets: null,
          assetBase64: null,
          hyperframe: null,
          reel: {
            generated: true,
            url: VERTICAL_VIDEO_PATH,
            bucket: BUCKET,
            signedUrl: null,
            thumbnailUrl: null,
            durationSec: 4,
            scenes: [],
          },
        },
      },
      quality: { passed: true },
    },
  };
}

async function purgeBenchRows(supabase: SupabaseClient): Promise<void> {
  await supabase
    .schema('organic')
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', BRAND_ID)
    .like('client_key', `${BENCH_CLIENT_KEY_PREFIX}%`);
  await (supabase as unknown as { schema: (s: string) => SupabaseClient })
    .schema('media')
    .from('assets')
    .delete()
    .in('id', [LIBRARY_ASSET_A, LIBRARY_ASSET_B]);
}

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await supabase
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

// The /organic page Zod-normalizes EVERY onboarding row the user has, so one malformed row
// (the local stack leaves `state = {}`) takes the whole page down whichever brand is active.
async function repairOnboarding(supabase: SupabaseClient): Promise<void> {
  const defaultState = createDefaultOnboardingState({
    id: OWNER_ID,
    email: LOCAL_OWNER_EMAIL,
    role: 'owner',
  } as Parameters<typeof createDefaultOnboardingState>[0]);

  const { data: onboardingRows } = await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .select('brand_id, state')
    .eq('user_id', OWNER_ID);

  for (const row of onboardingRows ?? []) {
    const state = row.state as Record<string, unknown> | null;
    if (state && typeof state.step === 'number') continue;
    await supabase
      .schema('brand_profiles')
      .from('user_onboarding_states')
      .update({ state: defaultState })
      .eq('user_id', OWNER_ID)
      .eq('brand_id', row.brand_id)
      .throwOnError();
  }

  await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .update({ is_active: false })
    .eq('user_id', OWNER_ID)
    .throwOnError();

  await supabase
    .schema('brand_profiles')
    .from('user_onboarding_states')
    .upsert(
      { user_id: OWNER_ID, brand_id: BRAND_ID, state: defaultState, is_active: true },
      { onConflict: 'user_id,brand_id' },
    )
    .throwOnError();
}

function intersects(a: Box, b: Box, slackPx = 1): boolean {
  return (
    a.x + a.width - slackPx > b.x &&
    b.x + b.width - slackPx > a.x &&
    a.y + a.height - slackPx > b.y &&
    b.y + b.height - slackPx > a.y
  );
}

const listViewport = (page: Page) =>
  page.locator('[data-tour-id="organic-list-content"] [data-slot="scroll-area-viewport"]').first();

// List rows are `div[role="button"]` — they hold their own checkbox and delete control, so they
// cannot be a <button>. The week grid's `button[aria-pressed]` selector does NOT match them.
const listRow = (page: Page, text: string) =>
  page
    .locator('[data-tour-id="organic-list-content"] div[role="button"]')
    .filter({ hasText: text })
    .first();

async function openListPlanner(page: Page, extraQuery = ''): Promise<void> {
  await page.goto(`/organic?tab=planner&view=list${extraQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  const plannerTab = page.getByRole('button', { name: 'Planner', exact: true });
  await expect(plannerTab).toBeVisible({ timeout: 120_000 });

  // `initialView` is applied on mount only, and the toolbar click is the belt-and-braces path.
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

  await expect(listViewport(page)).toBeVisible({ timeout: 60_000 });
}

// A month chip is a plain <button> carrying the draft title. `getByRole` would also match
// the hover card's own controls once it opens, so the chip lookup is scoped by title.
const monthChip = (page: Page, title: string) =>
  page.getByRole('button', { name: title, exact: false }).first();

async function openMonthPlanner(page: Page, extraQuery = ''): Promise<void> {
  await page.goto(`/organic?tab=planner&view=month${extraQuery}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

  const plannerTab = page.getByRole('button', { name: 'Planner', exact: true });
  await expect(plannerTab).toBeVisible({ timeout: 120_000 });

  const monthToggle = page.getByRole('button', { name: 'Month', exact: true }).first();
  await expect
    .poll(
      async () => {
        if ((await monthToggle.getAttribute('aria-pressed')) === 'true') return 'month';
        await monthToggle.click({ timeout: 5_000 }).catch(() => {});
        return 'not-month';
      },
      { timeout: 120_000, intervals: [1000, 2000, 3000] },
    )
    .toBe('month');
}

// Somewhere hover-neutral: (5,5) sits on the collapsed sidebar, which expands over the grid on
// hover and then swallows the pointer for whatever is beneath it (the month grid's first column).
// The empty middle of the top bar opens nothing and closes any open hover card.
const parkPointer = (page: Page) => page.mouse.move((page.viewportSize()?.width ?? 1440) / 2, 12);

// HoverCard closes on pointer-leave: reading the popover without
// dismissing the previous one measures the PREVIOUS chip's card.
async function dismissHoverCard(page: Page): Promise<void> {
  await parkPointer(page);
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0, {
    timeout: 20_000,
  });
}

// The header is CSS-uppercased and Playwright matches the TRANSFORMED text, so an exact
// 'Add media' never matches what the browser renders.
async function openLibraryPicker(page: Page, trigger: Locator): Promise<Locator> {
  const pickerHeader = page.getByText(/^add media$/i);
  await expect
    .poll(
      async () => {
        if ((await pickerHeader.count()) > 0) return 1;
        await trigger.click({ force: true, timeout: 5_000 }).catch(() => {});
        return pickerHeader.count();
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);
  return pickerHeader;
}

const hoverCard = (page: Page) => page.locator('[data-slot="hover-card-content"]').first();

async function hoverMonthChip(page: Page, title: string) {
  await dismissHoverCard(page);
  const chip = monthChip(page, title);
  await chip.scrollIntoViewIfNeeded();
  await chip.hover();
  const card = hoverCard(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

test.describe('organic planner list + draft preview', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'needs the local Supabase stack — bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let context: BrowserContext | null = null;
  let page: Page;
  let previousActiveBrandId: string | null = null;
  let videoDraftId: string | null = null;
  let farDraftId: string | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    const supabase = admin();

    const { data: pref } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;

    await setActiveBrand(supabase, BRAND_ID);
    await repairOnboarding(supabase);
    await purgeBenchRows(supabase);

    for (const bucket of [BUCKET, MEDIA_BUCKET]) {
      const { error } = await supabase.storage.createBucket(bucket, { public: false });
      if (error && !/already exists/i.test(error.message)) {
        throw new Error(`[planner:preview:e2e:bench] bucket ${bucket}: ${error.message}`);
      }
    }

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();

    // A real H.264 MP4, encoded by Mediabunny inside the real browser. A hand-rolled byte
    // string would not decode, and `videoWidth > 0` is the assertion that matters.
    const bundle = buildBrowserBundle();
    await page.goto('/organic', { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: bundle, type: 'module' });
    await page.waitForFunction(() => Boolean(window.__posterBench), undefined, {
      timeout: 60_000,
    });
    const sample = await page.evaluate(() => window.__posterBench.makeSampleMp4());
    expect(sample.byteLength, 'the encoder produced no real bytes').toBeGreaterThan(10_000);
    const mp4Bytes = Buffer.from(sample.base64, 'base64');
    const vertical = await page.evaluate(() =>
      (window as unknown as { __posterBench: UxBench }).__posterBench.makeMp4OfSize(360, 640, 4),
    );
    const { error: verticalError } = await supabase.storage
      .from(BUCKET)
      .upload(VERTICAL_VIDEO_PATH, Buffer.from(vertical.base64, 'base64'), {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (verticalError) {
      throw new Error(
        `[planner:preview:e2e:bench] upload ${VERTICAL_VIDEO_PATH}: ${verticalError.message}`,
      );
    }

    for (const path of [VIDEO_PATH]) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, mp4Bytes, { contentType: 'video/mp4', upsert: true });
      if (error) throw new Error(`[planner:preview:e2e:bench] upload ${path}: ${error.message}`);
    }
    for (const path of [LIBRARY_VIDEO_A, LIBRARY_VIDEO_B]) {
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, mp4Bytes, { contentType: 'video/mp4', upsert: true });
      if (error) throw new Error(`[planner:preview:e2e:bench] upload ${path}: ${error.message}`);
    }

    await (supabase as unknown as { schema: (s: string) => SupabaseClient })
      .schema('media')
      .from('assets')
      .upsert(
        [
          { id: LIBRARY_ASSET_A, storage_path: LIBRARY_VIDEO_A, file_name: 'plprev-a.mp4' },
          { id: LIBRARY_ASSET_B, storage_path: LIBRARY_VIDEO_B, file_name: 'plprev-b.mp4' },
        ].map((asset) => ({
          ...asset,
          brand_id: BRAND_ID,
          kind: 'video',
          bucket: MEDIA_BUCKET,
          mime_type: 'video/mp4',
          duration_ms: 4000,
          width: 640,
          height: 360,
          source: 'upload',
          status: 'ready',
          tags: ['e2e-bench'],
        })),
        { onConflict: 'id' },
      )
      .throwOnError();

    const rows: Record<string, unknown>[] = [];
    for (let index = 0; index < BULK_ROW_COUNT; index += 1) rows.push(textDraftRow(index));

    // #231's subject. `storageUrl: ''` + `signedUrl: null` is DELIBERATE: it forces
    // `useDraftWithFreshMedia` to re-sign from the durable bucket+path pair, the same decay a
    // draft suffers once its upload-time signed URL expires.
    //
    // `thumbnailUrl: null` is also deliberate. Production `media.assets` rows for videos
    // frequently have no thumbnail, and those legitimately render through a `#t=0.01`
    // first-frame seek with NO poster attribute — asserting a non-empty poster would have made
    // this bench fail against the majority of real drafts.
    const videoDay = dayIdOffsetFromToday(1);
    const videoClientKey = `${BENCH_CLIENT_KEY_PREFIX}video`;
    rows.push({
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${videoDay}T09:00:00.000Z`,
      client_key: videoClientKey,
      media_stage: 'realized',
      slot_data: {
        placementId: videoClientKey,
        dayId: videoDay,
        weekStart: videoDay,
        timeLabel: '8:00 AM',
        platform: 'instagram',
        trendId: null,
        title: VIDEO_TITLE,
        caption: 'PLPREV VIDEO CAPTION. The calendar card rendered it; the preview did not.',
        draftSnapshot: {
          id: videoClientKey,
          clientKey: videoClientKey,
          title: VIDEO_TITLE,
          summary: '',
          timeLabel: '8:00 AM',
          dateLabel: videoDay,
          status: 'draft',
          platforms: ['instagram'],
          format: 'Reel',
          objective: 'Awareness',
          creativeIdea: VIDEO_TITLE,
          captionPreview: 'PLPREV VIDEO CAPTION.',
          tags: [],
          mediaCount: 1,
        },
      },
      content_json: {
        content: { type: 'reel', format: 'Reel' },
        copy: {
          caption: 'PLPREV VIDEO CAPTION. The calendar card rendered it; the preview did not.',
          hashtags: { high: [], medium: [], low: [] },
          claims: [],
        },
        publishingAssets: [
          {
            role: 'primary',
            kind: 'video',
            storagePath: VIDEO_PATH,
            storageUrl: '',
            bucket: BUCKET,
            mimeType: 'video/mp4',
          },
        ],
        creative: {
          mediaSuggestion: {
            kind: 'reel',
            mediaStatus: 'user_supplied',
            url: null,
            assetUrl: null,
            signedUrl: null,
            assets: null,
            assetBase64: null,
            hyperframe: null,
            reel: {
              generated: true,
              url: VIDEO_PATH,
              bucket: BUCKET,
              signedUrl: null,
              thumbnailUrl: null,
              durationSec: 4,
              scenes: [],
            },
          },
        },
        quality: { passed: true },
      },
    });

    // The SAME reel, but with a live signed URL, as it looks the moment it is attached.
    //
    // This second row exists because of a gap the first one exposed: only the preview pane
    // re-signs (`useDraftWithFreshMedia`). The list row and the hover card call
    // `resolveDraftMedia` on the raw store draft, so a video whose signed URL has decayed
    // resolves to nothing there and renders blank. That gap is measured and reported by #225
    // below rather than papered over; this row is what a NON-decayed video looks like, and it
    // is what the hover-card media claim is asserted against.
    const freshSigned = await supabase.storage.from(BUCKET).createSignedUrl(VIDEO_PATH, 3600);
    if (freshSigned.error || !freshSigned.data?.signedUrl) {
      throw new Error(
        `[planner:preview:e2e:bench] could not sign the fixture reel: ${freshSigned.error?.message}`,
      );
    }
    const freshDay = dayIdOffsetFromToday(3);
    const freshClientKey = `${BENCH_CLIENT_KEY_PREFIX}fresh`;
    rows.push({
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${freshDay}T09:00:00.000Z`,
      client_key: freshClientKey,
      media_stage: 'realized',
      slot_data: {
        placementId: freshClientKey,
        dayId: freshDay,
        weekStart: freshDay,
        timeLabel: '7:00 AM',
        platform: 'instagram',
        trendId: null,
        title: VIDEO_FRESH_TITLE,
        caption: 'PLPREV FRESH CAPTION. A live signed URL, as the picker leaves it.',
      },
      content_json: {
        content: { type: 'reel', format: 'Reel' },
        copy: {
          caption: 'PLPREV FRESH CAPTION. A live signed URL, as the picker leaves it.',
          hashtags: { high: [], medium: [], low: [] },
          claims: [],
        },
        publishingAssets: [
          {
            role: 'primary',
            kind: 'video',
            storagePath: VIDEO_PATH,
            storageUrl: freshSigned.data.signedUrl,
            bucket: BUCKET,
            mimeType: 'video/mp4',
          },
        ],
        creative: {
          mediaSuggestion: {
            kind: 'reel',
            mediaStatus: 'user_supplied',
            url: null,
            assetUrl: null,
            signedUrl: null,
            assets: null,
            assetBase64: null,
            hyperframe: null,
            reel: {
              generated: true,
              url: VIDEO_PATH,
              bucket: BUCKET,
              signedUrl: freshSigned.data.signedUrl,
              thumbnailUrl: null,
              durationSec: 4,
              scenes: [],
            },
          },
        },
        quality: { passed: true },
      },
    });

    // #226's subject: far enough out that the month grid's ordered index does not contain it,
    // which is where Escape used to fall into an early return and die.
    const farDay = dayIdOffsetFromToday(38);
    const farClientKey = `${BENCH_CLIENT_KEY_PREFIX}far`;
    rows.push({
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${farDay}T12:00:00.000Z`,
      client_key: farClientKey,
      media_stage: 'text_only',
      slot_data: {
        placementId: farClientKey,
        dayId: farDay,
        weekStart: farDay,
        timeLabel: '3:00 PM',
        platform: 'instagram',
        trendId: null,
        title: FAR_TITLE,
        caption: 'PLPREV FAR CAPTION. Deep-linked drafts are exactly the ones outside the grid.',
      },
    });

    // #231's picker subject: a draft with copy but NO media, so the editable media slot is
    // reachable without disturbing the video draft. The copy is load-bearing — a draft with an
    // empty content_json reads as "no copy yet" and the preview renders the Generate-copy state
    // where the media area would be, with no picker anywhere.
    const pickerDay = dayIdOffsetFromToday(2);
    const pickerClientKey = `${BENCH_CLIENT_KEY_PREFIX}picker`;
    rows.push({
      brand_id: BRAND_ID,
      user_id: OWNER_ID,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${pickerDay}T15:00:00.000Z`,
      client_key: pickerClientKey,
      media_stage: 'text_only',
      slot_data: {
        placementId: pickerClientKey,
        dayId: pickerDay,
        weekStart: pickerDay,
        timeLabel: '4:00 PM',
        platform: 'instagram',
        trendId: null,
        title: PICKER_TITLE,
        caption: 'PLPREV PICKER CAPTION. A post carries at most one video.',
      },
      content_json: {
        content: { type: 'post', format: 'FeedPost' },
        copy: {
          caption: 'PLPREV PICKER CAPTION. A post carries at most one video.',
          hashtags: { high: [], medium: [], low: [] },
          claims: [],
        },
        creative: {},
        quality: { passed: true },
      },
    });

    rows.push(platformReelRow('tiktok', 4), platformReelRow('youtube', 5));

    const { data: inserted } = await supabase
      .schema('organic')
      .from('organic_calendar_drafts')
      .insert(rows)
      .select('id, client_key')
      .throwOnError();

    const byKey = new Map(
      ((inserted ?? []) as { id: string; client_key: string }[]).map((row) => [
        row.client_key,
        row.id,
      ]),
    );
    if (!byKey.get(videoClientKey) || !byKey.get(farClientKey)) {
      throw new Error('seeded drafts did not come back with ids');
    }
    // The FRONTEND draft id is `slot_data.placementId`, not the Postgres row id
    // (`mapSlotDataDraftId`), and `?draftId=` is matched against the frontend id. Deep-linking
    // the row id silently selects nothing.
    videoDraftId = videoClientKey;
    farDraftId = farClientKey;
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    await context?.close();
    const supabase = admin();
    await purgeBenchRows(supabase);
    await supabase.storage.from(BUCKET).remove([VIDEO_PATH, VERTICAL_VIDEO_PATH]);
    await supabase.storage.from(MEDIA_BUCKET).remove([LIBRARY_VIDEO_A, LIBRARY_VIDEO_B]);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  test('#227 the list actually scrolls, and a selection does not bury its own last row', async () => {
    await openListPlanner(page);
    await expect(listRow(page, 'PLPREV Row 000')).toBeVisible({ timeout: 120_000 });

    const viewport = listViewport(page);
    const geometry = await viewport.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      geometry.scrollHeight,
      `the list viewport does not overflow: scrollHeight ${geometry.scrollHeight} <= clientHeight ${geometry.clientHeight} — the ScrollArea root grew to its intrinsic height again`,
    ).toBeGreaterThan(geometry.clientHeight);

    // A viewport that overflows is not the same as a viewport that scrolls: the reported bug
    // was a list that rendered every row and moved none of them. Drive a real wheel event.
    await viewport.hover();
    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => viewport.evaluate((el) => el.scrollTop), {
        timeout: 15_000,
        intervals: [200, 400, 800],
      })
      .toBeGreaterThan(100);
    const scrollTopAfterWheel = await viewport.evaluate((el) => el.scrollTop);

    console.log(
      `[#227] viewport ${geometry.clientHeight}px tall over ${geometry.scrollHeight}px of content; one wheel moved scrollTop 0 → ${scrollTopAfterWheel}`,
    );

    // Now the clearance. Select rows so the fixed bulk bar mounts, scroll to the very bottom,
    // and assert the last row is not underneath it. Wave C's `h-24` spacer was a reasoned
    // estimate that had never been measured against a real toolbar.
    for (const index of [0, 1, 2]) {
      const row = listRow(page, `PLPREV Row ${`${index}`.padStart(3, '0')}`);
      await row.scrollIntoViewIfNeeded();
      await row.hover();
      await row.getByRole('checkbox').first().check({ force: true });
    }
    await expect(page.getByLabel('Clear selection')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('bulk-toolbar-clearance')).toHaveCount(1, { timeout: 20_000 });

    await viewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(600);

    const toolbarBox = await page.getByLabel('Clear selection').evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node && getComputedStyle(node).position !== 'fixed') node = node.parentElement;
      const rect = (node ?? (el as HTMLElement)).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    const lastRowBox = await page
      .locator('[data-tour-id="organic-list-content"] div[role="button"]')
      .last()
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });

    expect(
      intersects(lastRowBox, toolbarBox),
      `the bulk toolbar ${JSON.stringify(toolbarBox)} covers the last list row ${JSON.stringify(lastRowBox)}`,
    ).toBe(false);

    console.log(
      `[#227] scrolled to the end: last row bottom ${(lastRowBox.y + lastRowBox.height).toFixed(1)}px, toolbar top ${toolbarBox.y.toFixed(1)}px — clearance ${(toolbarBox.y - (lastRowBox.y + lastRowBox.height)).toFixed(1)}px`,
    );

    await page.screenshot({ path: `${SCREENSHOT_DIR}/list-scrolled-with-bulk-bar.png` });
    await page.getByLabel('Clear selection').click();
  });

  test('#225 the hover preview lands INSIDE the viewport, even on the last row', async () => {
    await openListPlanner(page);
    await expect(listRow(page, 'PLPREV Row 000')).toBeVisible({ timeout: 120_000 });

    // The hover card (Base UI PreviewCard) closes when the pointer leaves, not on Escape. Reading
    // the popup without first dismissing the previous one measures the PREVIOUS row's card,
    // which is how this probe first reported a video draft as having no media at all.
    const probeHoverMedia = async (title: string) => {
      await parkPointer(page);
      await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0, {
        timeout: 20_000,
      });
      const target = listRow(page, title);
      await target.scrollIntoViewIfNeeded();
      await target.hover();
      const hovered = page.locator('[data-slot="hover-card-content"]').first();
      await expect(hovered).toBeVisible({ timeout: 20_000 });
      const read = () =>
        hovered.evaluate((el) => {
          const video = el.querySelector('video') as HTMLVideoElement | null;
          const img = el.querySelector('img') as HTMLImageElement | null;
          return {
            hasVideo: Boolean(video),
            videoSrc: (video?.getAttribute('src') ?? '').slice(0, 64),
            videoPoster: video?.getAttribute('poster') ?? null,
            naturalWidth: img?.naturalWidth ?? 0,
          };
        });
      // Re-signing is asynchronous, so a decayed draft's media arrives a beat after the
      // card opens. Reading once would measure the placeholder and call it a blank card.
      await expect
        .poll(async () => (await read()).hasVideo, {
          timeout: 30_000,
          intervals: [250, 500, 1000, 2000],
        })
        .toBe(true);
      return read();
    };

    // The media claims run BEFORE any preview is opened, so nothing the preview pane does to
    // the store can be mistaken for the list's own resolution. Every earlier resolver on this
    // surface filtered to `kind === 'image'` and never read `mediaSuggestion.reel`, so a video
    // draft's row and hover card were blank.
    const freshProbe = await probeHoverMedia(VIDEO_FRESH_TITLE);
    expect(
      freshProbe.hasVideo || freshProbe.naturalWidth > 0,
      `hover card carried no renderable media for a live video draft: ${JSON.stringify(freshProbe)}`,
    ).toBe(true);
    // A raw <img> could never render an MP4 — that is why the row goes through ChatMediaThumb.
    expect(
      freshProbe.hasVideo,
      'the hover card rendered the reel into something other than a <video>',
    ).toBe(true);
    console.log(`[#225] live video row hover media: ${JSON.stringify(freshProbe)}`);

    // #233a. The same reel with a DECAYED signed URL. `useDraftWithFreshMedia` used to live
    // ONLY in the preview pane, so the list row and its hover card resolved a lapsed URL to
    // nothing and painted the gradient placeholder — "the detail of the post aren't showing…
    // you have to reload". The hook is now shared by every rendering surface, so this is an
    // assertion rather than the report it used to be.
    const decayedProbe = await probeHoverMedia(VIDEO_TITLE);
    expect(
      decayedProbe.hasVideo,
      `a decayed video draft still renders no <video> on the list surface: ${JSON.stringify(decayedProbe)}`,
    ).toBe(true);
    expect(
      decayedProbe.videoSrc.length,
      'the decayed draft resolved to an empty media URL — it was never re-signed',
    ).toBeGreaterThan(0);
    console.log(
      `[#233a] decayed (storageUrl:'' , reel.signedUrl:null) video row hover media: ${JSON.stringify(decayedProbe)}`,
    );

    await parkPointer(page);
    await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0, {
      timeout: 20_000,
    });

    // Open the preview panel: `side="right"` had no room beside a full-width row whenever the
    // panel was open, which is what flipped the card off the left of the screen.
    await listRow(page, VIDEO_TITLE).click();
    await expect(page.getByRole('complementary', { name: 'Draft preview' })).toBeVisible({
      timeout: 60_000,
    });

    const viewport = listViewport(page);
    await viewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);

    // The LAST row is the worst case: nothing below it for a `side="bottom"` card to use, so
    // this is where `shift` has to do its work.
    const rows = page.locator('[data-tour-id="organic-list-content"] div[role="button"]');
    const lastRow = rows.last();
    await lastRow.hover();

    const card = page.locator('[data-slot="hover-card-content"]').first();
    await expect(card, 'no hover card opened on the last list row').toBeVisible({
      timeout: 20_000,
    });

    const viewportSize = page.viewportSize();
    if (!viewportSize) throw new Error('no viewport size');
    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error('hover card has no bounding box');

    expect(
      cardBox.x,
      `hover card starts off the left edge at x=${cardBox.x}`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      cardBox.y,
      `hover card starts above the top edge at y=${cardBox.y}`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      cardBox.x + cardBox.width,
      `hover card runs past the right edge: ${cardBox.x + cardBox.width} > ${viewportSize.width}`,
    ).toBeLessThanOrEqual(viewportSize.width + 1);
    expect(
      cardBox.y + cardBox.height,
      `hover card runs past the bottom edge: ${cardBox.y + cardBox.height} > ${viewportSize.height}`,
    ).toBeLessThanOrEqual(viewportSize.height + 1);

    console.log(
      `[#225] last-row hover card at ${JSON.stringify(cardBox)} inside a ${viewportSize.width}x${viewportSize.height} viewport`,
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/hover-card-last-row.png` });

    // A BacklogRow had no thumbnail and no hover at all before this batch. Backlog drafts are
    // client-created, so this creates one through the real UI. The group header sits at the
    // top of the list and its "+" only paints on hover, so scroll back up and force the click.
    await parkPointer(page);
    await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0, {
      timeout: 20_000,
    });
    await listViewport(page).evaluate((el) => {
      el.scrollTop = 0;
    });
    const backlogGroup = page
      .locator('[data-tour-id="organic-list-content"] div[role="button"]')
      .filter({ hasText: /^Backlog/ })
      .first();
    await backlogGroup.scrollIntoViewIfNeeded();
    await backlogGroup.hover();
    // `getByRole('button', { name: 'Add Backlog' })` also matches the group HEADER, which is a
    // div[role=button] whose accessible name is computed from its contents — clicking that
    // collapses the group instead. The aria-label selector hits the "+" itself.
    const addBacklog = page.locator('[aria-label="Add Backlog"]').first();
    const ideaInput = page.getByLabel('Post idea').first();
    await expect
      .poll(
        async () => {
          if ((await ideaInput.count()) > 0) return 1;
          await addBacklog.click({ force: true, timeout: 5_000 }).catch(() => {});
          return ideaInput.count();
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);
    await ideaInput.fill('PLPREV Backlog — a backlog row must preview like any other');
    await page.getByLabel('Save post idea').first().click();

    const backlogRow = listRow(page, 'PLPREV Backlog');
    await expect(backlogRow).toBeVisible({ timeout: 20_000 });
    await backlogRow.hover();
    const backlogCard = page.locator('[data-slot="hover-card-content"]').first();
    await expect(backlogCard, 'a BacklogRow still offers no hover preview').toBeVisible({
      timeout: 20_000,
    });
    const backlogBox = await backlogCard.boundingBox();
    if (!backlogBox) throw new Error('backlog hover card has no bounding box');
    expect(backlogBox.x).toBeGreaterThanOrEqual(-1);
    expect(backlogBox.x + backlogBox.width).toBeLessThanOrEqual(viewportSize.width + 1);
    console.log(`[#225] backlog hover card at ${JSON.stringify(backlogBox)}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/hover-card-backlog.png` });
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('#226 collapse STAYS collapsed with ?draftId= in the URL, and Escape closes a far draft', async ({}, testInfo) => {
    testInfo.setTimeout(480_000);
    // The param is the precondition: two effects re-selected the draft the instant the panel
    // cleared, so the chevron, the X and Escape were all dead whenever it was present.
    await openListPlanner(page, `&draftId=${farDraftId}`);

    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(preview, 'the deep link never opened the preview').toBeVisible({
      timeout: 120_000,
    });

    // `locator.evaluate` WAITS for its element and has no default timeout, so it hangs forever
    // once the panel unmounts — which is exactly what collapsing does. Read the width off the
    // document instead: absent means zero, which is the state being asserted.
    const previewWidth = () =>
      page.evaluate(
        () => (document.querySelector('#planner-preview') as HTMLElement | null)?.offsetWidth ?? 0,
      );

    const openWidth = await previewWidth();
    expect(openWidth).toBeGreaterThan(100);

    // A plain click: the collapse button is no longer inside the separator's pointer capture.
    await page.getByLabel('Collapse draft preview').click();

    // Zero, and STILL zero a second later. A single check would pass against the bug, because
    // the re-select effects fire on the very next render.
    const widthSamples: number[] = [];
    for (let sample = 0; sample < 6; sample += 1) {
      await page.waitForTimeout(200);
      widthSamples.push(await previewWidth());
    }
    expect(
      widthSamples.every((width) => width === 0),
      `the preview panel re-opened after collapse: widths over 1.2s were ${widthSamples.join(', ')}`,
    ).toBe(true);
    console.log(
      `[#226] collapsed panel widths over 1.2s: ${widthSamples.join(', ')} (open width was ${openWidth})`,
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-collapsed.png` });

    // The trigger that stays mounted when the handle unmounts — collapsing used to remove the
    // only way back.
    const expand = page.getByTestId('planner-preview-expand');
    await expect(expand, 'nothing offered to re-open the collapsed preview').toBeVisible({
      timeout: 20_000,
    });
    await expand.click();
    await expect
      .poll(previewWidth, { timeout: 20_000, intervals: [200, 400, 800] })
      .toBeGreaterThan(100);
    console.log('[#226] expand restored the panel');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-expanded-again.png` });

    // Escape on a draft OUTSIDE the ordered calendar index — the deep-linked draft is exactly
    // the one the ordered lookup returns -1 for, which is where Escape used to early-return.
    // Focus INSIDE the preview without clicking: its top-left corner is now the collapse
    // chevron, and a positional click there collapses the panel instead. The aside itself is
    // focusable (tabIndex -1).
    await preview.focus();
    await parkPointer(page);
    await page.keyboard.press('Escape');
    await expect(
      preview,
      'Escape did not close a draft outside the visible calendar range',
    ).toHaveCount(0, { timeout: 20_000 });
    console.log('[#226] Escape closed a draft outside the ordered calendar index');
  });

  test('#231 an attached video renders in the preview, read-only and in edit mode', async () => {
    await openListPlanner(page);
    const row = listRow(page, VIDEO_TITLE);
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.click();

    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(preview).toBeVisible({ timeout: 60_000 });

    // The bug's own screenshot: an empty media area offering the library/upload split for a
    // draft that already had a video attached.
    await expect(
      preview.getByText('Select from library'),
      'the preview still shows the empty-media CTA for a draft that has a video',
    ).toHaveCount(0, { timeout: 30_000 });

    const readOnlyVideo = preview.locator('video');
    await expect(readOnlyVideo, 'the read-only preview renders no <video>').toHaveCount(1, {
      timeout: 60_000,
    });

    const src = await readOnlyVideo.getAttribute('src');
    const poster = await readOnlyVideo.getAttribute('poster');
    expect(
      Boolean(poster) || (src ?? '').endsWith('#t=0.01'),
      `a poster-less video must seek its first frame: src=${src} poster=${poster}`,
    ).toBe(true);

    // Pixel truth. A dead signed URL can never reach readyState 1 with a non-zero videoWidth,
    // so a green here proves the preview re-signed from the durable bucket+path pair.
    await expect
      .poll(
        async () =>
          readOnlyVideo.evaluate(
            (el) =>
              (el as HTMLVideoElement).readyState >= 1 && (el as HTMLVideoElement).videoWidth > 0,
          ),
        { timeout: 60_000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);
    const dimensions = await readOnlyVideo.evaluate((el) => ({
      w: (el as HTMLVideoElement).videoWidth,
      h: (el as HTMLVideoElement).videoHeight,
    }));
    console.log(
      `[#231] read-only preview decoded ${dimensions.w}x${dimensions.h}; poster=${poster ?? 'none'}, src ends #t=0.01: ${(src ?? '').endsWith('#t=0.01')}`,
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-video-readonly.png` });

    // There is no edit mode any more: the frame edits in place, so the media above IS the
    // editable media area. Prove it is (the live media slot, no toggle to find) and that the
    // reel decodes inside it.
    await expect(
      preview.locator('button[aria-label="Edit post"]'),
      'an Edit post toggle came back — the frame is meant to edit in place',
    ).toHaveCount(0);
    await expect(
      preview.locator('[aria-label^="Media slot"]').first(),
      'the in-place media area is not the live media slot',
    ).toBeVisible({ timeout: 20_000 });
    const editVideo = preview.locator('video');
    await expect(editVideo, 'edit mode renders no <video>').toHaveCount(1, { timeout: 30_000 });
    await expect
      .poll(
        async () =>
          editVideo.evaluate(
            (el) =>
              (el as HTMLVideoElement).readyState >= 1 && (el as HTMLVideoElement).videoWidth > 0,
          ),
        { timeout: 60_000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);
    console.log('[#231] the in-place media slot decoded the same attached reel');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-video-editing.png` });
  });

  test('#231 the picker refuses two videos instead of silently dropping one', async () => {
    await openListPlanner(page);
    const row = listRow(page, PICKER_TITLE);
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.click();

    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(preview).toBeVisible({ timeout: 60_000 });
    // Gating #2: the picker works without an edit mode.

    // The empty slot splits into "Select from library" and "Upload from your computer"; a
    // forced click on the slot's centre lands on Upload and opens the OS file chooser, never
    // the picker. Click the library entry the user clicks. It sits inside the scaled phone
    // shell, so force past Playwright's stability wait and retry until the popover is up.
    const mediaSlot = preview.locator('[aria-label^="Media slot"]').first();
    await expect(mediaSlot).toBeVisible({ timeout: 30_000 });
    await openLibraryPicker(
      page,
      mediaSlot.getByRole('button', { name: 'Select from library' }).first(),
    );

    const tileA = page.getByRole('button', { name: 'plprev-a.mp4' }).first();
    const tileB = page.getByRole('button', { name: 'plprev-b.mp4' }).first();
    await expect(tileA, 'the seeded library videos never reached the picker').toBeVisible({
      timeout: 60_000,
    });
    await tileA.click();
    await tileB.click();

    await expect(page.getByText('Only one video per post')).toBeVisible({ timeout: 20_000 });
    const attach = page.getByRole('button', { name: /^Attach/ });
    await expect(attach, 'Attach stayed enabled with two videos selected').toBeDisabled();

    console.log('[#231] two video tiles → "Only one video per post", Attach disabled');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/picker-refuses-two-videos.png` });
  });

  for (const platform of ['tiktok', 'youtube'] as const) {
    const label = PLATFORM_REEL_LABELS[platform];
    test(`${label}: the reel previews, the library picker opens, and the account gate holds before the click`, async () => {
      await openListPlanner(page);
      const row = listRow(page, PLATFORM_REEL_TITLES[platform]);
      await expect(row).toBeVisible({ timeout: 120_000 });
      // The dry run fires as the preview opens: listen first.
      const planResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/publish-plan') &&
          response.url().includes(`platform=${platform}`),
        { timeout: 90_000 },
      );
      await row.click();

      const preview = page.getByRole('complementary', { name: 'Draft preview' });
      await expect(preview).toBeVisible({ timeout: 60_000 });

      await expect(
        preview.getByText(/coming soon/i),
        `the ${label} draft still falls through to the coming-soon placeholder`,
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(
        preview.getByRole('button', { name: /^Change platforms/ }),
        `the platform chip does not name ${label}`,
      ).toHaveText(label, { timeout: 30_000 });

      // Pixel truth, as #231: a <video> that decodes proves the media mounted AND re-signed.
      const video = preview.locator('video');
      await expect(video, `the ${label} preview renders no <video>`).toHaveCount(1, {
        timeout: 60_000,
      });
      await expect
        .poll(
          async () =>
            video.evaluate(
              (el) =>
                (el as HTMLVideoElement).readyState >= 1 && (el as HTMLVideoElement).videoWidth > 0,
            ),
          { timeout: 60_000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);
      const box = await video.boundingBox();
      console.log(
        `[${platform}] preview decoded the reel; frame ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}`,
      );
      expect(box && box.height > box.width, `the ${label} reel frame is not vertical`).toBe(true);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-${platform}-readonly.png` });

      // The library picker is mounted inside the media node the placeholder used to drop, and
      // it is live without an edit mode.
      const mediaSlot = preview.locator('[aria-label^="Media slot"]').first();
      await expect(mediaSlot, `the ${label} preview has no live media slot`).toBeVisible({
        timeout: 30_000,
      });
      // A slot that already holds media opens the creative full screen; its Replace is the
      // user's way into the library for a post that has media.
      // The slot's creative re-signs asynchronously, and a click while it is still loading
      // opens nothing. Retry the slot's own "Enlarge creative" control (the slot itself when
      // that is not there yet) until the lightbox, and its Replace, is up.
      const replace = page.getByRole('button', { name: 'Replace' }).first();
      const enlarge = mediaSlot.getByRole('button', { name: 'Enlarge creative' }).first();
      await expect
        .poll(
          async () => {
            if (await replace.isVisible().catch(() => false)) return true;
            const opener = (await enlarge.isVisible().catch(() => false)) ? enlarge : mediaSlot;
            await opener.click({ force: true, timeout: 5_000 }).catch(() => {});
            return replace.isVisible().catch(() => false);
          },
          {
            timeout: 60_000,
            intervals: [500, 1000, 2000],
            message: `the ${label} creative lightbox offers no Replace`,
          },
        )
        .toBe(true);
      const pickerHeader = await openLibraryPicker(page, replace);
      await expect(
        page.getByRole('button', { name: 'plprev-a.mp4' }).first(),
        `the library media never reached the ${label} picker`,
      ).toBeVisible({ timeout: 60_000 });
      console.log(`[${platform}] library picker opened with the seeded library videos`);
      await page.keyboard.press('Escape');
      await expect(pickerHeader).toHaveCount(0, { timeout: 20_000 });

      // The server's own reading of the row, from the same resolver publish runs: the post goes
      // to this platform, with its media.
      const plan = await planResponse;
      const planBody = (await plan.json().catch(() => null)) as {
        plan?: { platform?: string; media?: unknown[] } | null;
        accounts?: { id: string }[];
        blockers?: { reason: string }[];
      } | null;
      console.log(
        `[${platform}] publish-plan ${plan.status()} platform=${String(planBody?.plan?.platform)} media=${planBody?.plan?.media?.length ?? 0} accounts=${planBody?.accounts?.length ?? 0} blockers=${JSON.stringify(planBody?.blockers?.map((b) => b.reason) ?? null)}`,
      );
      expect(plan.status(), `publish-plan failed for ${label}`).toBeLessThan(400);
      expect(planBody?.plan?.platform).toBe(platform);
      expect(planBody?.plan?.media?.length ?? 0).toBeGreaterThan(0);

      // Gating #10/#11: the account is known BEFORE the click. This brand connects no ${label}
      // account; the old panel let Publish reach the confirm dialog and the server then refused
      // it (account_missing). Now the preview says so, makes it a fix, and disables Publish now.
      const accountConnected = (planBody?.accounts?.length ?? 0) > 0;
      if (accountConnected) {
        await expect(
          preview.getByRole('button', { name: 'Publish now', exact: true }),
          `no enabled "Publish now" for a ${label} post with an account`,
        ).toBeEnabled({ timeout: 30_000 });
      } else {
        await expect(preview.locator('[data-review-account]')).toHaveText('No account connected', {
          timeout: 30_000,
        });
        await expect(preview.locator('[data-readiness-fix="account"]')).toBeVisible();
        await expect(
          preview.getByRole('button', { name: 'Publish now', exact: true }),
        ).toBeDisabled();
      }
      await page.screenshot({ path: `${SCREENSHOT_DIR}/publish-gate-${platform}.png` });
    });
  }

  // #233 — the tester's own surface. "The detail of the post aren't showing in calendar…
  // if you touch the button of edit it should open." Both halves are measured here on the
  // MONTH view, against a draft whose signed URL has decayed, with NO page.reload().
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('#233 month hover renders media + caption, and Open in editor opens the panel', async ({}, testInfo) => {
    testInfo.setTimeout(480_000);

    // Every sign POST the page makes, counted at the network. The cache claim cannot be
    // made from the DOM — only from what actually left the browser.
    const signRequests: string[] = [];
    const countSign = (url: string) => {
      if (url.includes('/api/organic/agent/hyperframes/sign')) signRequests.push(url);
    };
    page.on('request', (request) => {
      if (request.method() === 'POST') countSign(request.url());
    });

    await openMonthPlanner(page);
    await page.getByRole('button', { name: 'Today', exact: true }).click();

    // The fixture sits one day out, which normally lands in the current month; roll
    // forward once rather than depending on the day the bench happens to run.
    const chip = monthChip(page, VIDEO_TITLE);
    if (!(await chip.isVisible().catch(() => false))) {
      await page
        .getByLabel('Next month')
        .click()
        .catch(() => {});
    }
    await expect(chip, 'the seeded video draft never appeared on the month grid').toBeVisible({
      timeout: 120_000,
    });

    // ---- (a) media + caption, with NO reload ----
    const card = await hoverMonthChip(page, VIDEO_TITLE);
    await expect
      .poll(async () => card.locator('video').count(), {
        timeout: 30_000,
        intervals: [250, 500, 1000, 2000],
      })
      .toBeGreaterThan(0);
    const cardVideo = card.locator('video').first();
    const cardSrc = await cardVideo.getAttribute('src');
    expect(
      (cardSrc ?? '').length,
      'the month hover card resolved the decayed draft to an empty media URL',
    ).toBeGreaterThan(0);
    await expect(card, 'the hover card rendered no caption').toContainText('PLPREV VIDEO CAPTION');
    await expect(card.getByText('No caption yet')).toHaveCount(0);
    console.log(`[#233a] month hover card media src: ${(cardSrc ?? '').slice(0, 72)}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/month-hover-decayed-media.png` });

    // ---- (b) a second hover costs ZERO further sign POSTs ----
    const signsAfterFirstHover = signRequests.length;
    await dismissHoverCard(page);
    const secondCard = await hoverMonthChip(page, VIDEO_TITLE);
    await expect
      .poll(async () => secondCard.locator('video').count(), {
        timeout: 30_000,
        intervals: [250, 500, 1000],
      })
      .toBeGreaterThan(0);
    // Settle: a late request would otherwise be counted after the assertion.
    await page.waitForTimeout(1_500);
    expect(
      signRequests.length - signsAfterFirstHover,
      `a re-hover re-signed: ${signRequests.length - signsAfterFirstHover} extra POST(s) — the TTL cache is not holding`,
    ).toBe(0);
    console.log(
      `[#233a] ${signRequests.length} sign POST(s) total; the second hover added ${signRequests.length - signsAfterFirstHover}`,
    );

    // ---- (c) a click opens the side preview; the context action opens the caption ----
    // There is no edit mode: "Open in editor" opens the caption editor in place.
    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    const doneEditing = preview.getByRole('textbox', { name: /caption/i }).first();
    const closeCaption = () => doneEditing.evaluate((el) => (el as HTMLTextAreaElement).blur());

    await dismissHoverCard(page);
    await monthChip(page, VIDEO_TITLE).click();
    await expect(preview, 'clicking the post did not open the side preview').toBeVisible({
      timeout: 60_000,
    });
    await expect(preview.locator('video').first()).toBeVisible({ timeout: 30_000 });
    await monthChip(page, VIDEO_TITLE).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in editor' }).click();
    await expect(doneEditing, 'Open in editor did not open the caption').toBeVisible({
      timeout: 30_000,
    });
    console.log('[#233b] click opened the preview and the context action opened the caption');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/month-edit-opens-editor.png` });

    // ---- (d) the ALREADY-SELECTED case ----
    await closeCaption();
    await expect(doneEditing).toHaveCount(0, { timeout: 20_000 });
    await dismissHoverCard(page);
    await monthChip(page, VIDEO_TITLE).click();
    await expect(preview).toBeVisible({ timeout: 30_000 });

    await monthChip(page, VIDEO_TITLE).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in editor' }).click();
    await expect(
      doneEditing,
      'Edit was a no-op on the draft that was ALREADY selected — the reported bug',
    ).toBeVisible({ timeout: 30_000 });
    console.log('[#233b] Edit works on an already-selected draft');

    // ---- (e) the COLLAPSED case: the intent has to re-open the panel ----
    await closeCaption();
    await page.getByLabel('Collapse draft preview').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (document.querySelector('#planner-preview') as HTMLElement | null)?.offsetWidth ?? 0,
          ),
        { timeout: 20_000, intervals: [200, 400, 800] },
      )
      .toBe(0);

    await dismissHoverCard(page);
    await monthChip(page, VIDEO_TITLE).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open in editor' }).click();
    await expect(
      doneEditing,
      'Edit left the panel collapsed — the edit intent never re-expanded it',
    ).toBeVisible({ timeout: 30_000 });
    console.log('[#233b] Edit re-expanded a collapsed preview with the caption open');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/month-edit-from-collapsed.png` });
  });
});

// ---------------------------------------------------------------------------------------------
// Planner UX (Organic+ wave 1, U1–U7) — the anchor of
// artifacts/factory/plans/2026-10-17T06-34-47-organic-planner-ux.md §5, written against the DOM
// contract the implementation streams share (data-draft-id / data-post-id on the focusable
// chip, data-planner-scroller + data-planner-content, data-preview-frame*, the attention dock,
// the narrow sheet). Every number lands in artifacts/organic-planner-ux/bench/measurements.json,
// written as each test runs, so a red run still leaves what it measured.
//
// Platform rows are union(connected platforms, platforms of EVERY loaded draft, posted
// platforms), not just the visible week. So each test purges its own rows and seeds a complete
// dataset, and the 1/3/5 platform count is asserted on the week grid before any measurement.
// Brand …b2 is shared with other shells: every row here carries the `bench-plux-` prefix and
// only those rows are deleted. The one exception is the post a lookahead tile creates through
// the real UI: it has no prefix, so that test finds it by brand + owner + day + created-after
// and deletes it by id.
// ---------------------------------------------------------------------------------------------

const UX_PREFIX = 'bench-plux-';
const UX_MEDIA_DIR = `${BRAND_ID}/planner-ux-bench`;
const UX_OUT_DIR = resolve(process.cwd(), '../artifacts/organic-planner-ux/bench');
const UX_MEASUREMENTS = join(UX_OUT_DIR, 'measurements.json');
const UX_WIDE = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;
const UX_NARROW = [
  { width: 900, height: 900 },
  { width: 390, height: 844 },
] as const;
const UX_VIEWS = ['week', 'month', 'list'] as const;
const UX_EMPTY_PX_MAX = 64;
const UX_FIXTURE_SETTLE_MS = 350;

type UxView = (typeof UX_VIEWS)[number];
type UxPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube';
type UxFormat = 'Post' | 'Carousel' | 'Reel' | 'Story';
type UxFrameKind = 'feed' | 'vertical' | 'story' | 'landscape';
type UxDraft = {
  id: string;
  platform: UxPlatform;
  dayId: string | null;
  title: string;
  marker: string;
};
type UxMedia = {
  kind: 'image' | 'video';
  path: string;
  signedUrl: string;
  width: number;
  height: number;
  mimeType: string;
};
type UxBox = { x: number; y: number; width: number; height: number };

const UX_PLATFORM_SETS: Record<1 | 3 | 5, UxPlatform[]> = {
  1: ['facebook'],
  3: ['instagram', 'facebook', 'linkedin'],
  5: ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube'],
};

// Every media file the frame and posted fixtures need, at the exact size its aspect claims.
const UX_MEDIA_SPECS = {
  png45: { kind: 'image', width: 1080, height: 1350 },
  png45b: { kind: 'image', width: 1080, height: 1350 },
  png45c: { kind: 'image', width: 1080, height: 1350 },
  png11: { kind: 'image', width: 1080, height: 1080 },
  png916: { kind: 'image', width: 1080, height: 1920 },
  png191: { kind: 'image', width: 1910, height: 1000 },
  png169: { kind: 'image', width: 1920, height: 1080 },
  mp4v: { kind: 'video', width: 1080, height: 1920 },
  mp4h: { kind: 'video', width: 1920, height: 1080 },
} as const;
type UxMediaName = keyof typeof UX_MEDIA_SPECS;

const UX_FRAME_FIXTURES: Array<{
  key: string;
  label: string;
  platform: UxPlatform;
  format: UxFormat;
  media: UxMediaName[];
  kind: UxFrameKind;
  aspect: number | null;
  // A media format with nothing attached: the frame shows "Needs media" at its own aspect.
  needsMedia?: boolean;
  // Off-shape media in a full-screen frame is letterboxed, never cropped.
  letterboxed?: boolean;
}> = [
  {
    key: 'ig-feed',
    label: 'Instagram feed image 4:5',
    platform: 'instagram',
    format: 'Post',
    media: ['png45'],
    kind: 'feed',
    aspect: 4 / 5,
  },
  {
    key: 'ig-carousel',
    label: 'Instagram carousel, 3 slides',
    platform: 'instagram',
    format: 'Carousel',
    media: ['png45', 'png45b', 'png45c'],
    kind: 'feed',
    aspect: 4 / 5,
  },
  {
    key: 'ig-reel',
    label: 'Instagram reel 9:16',
    platform: 'instagram',
    format: 'Reel',
    media: ['mp4v'],
    kind: 'vertical',
    aspect: 9 / 16,
  },
  {
    key: 'ig-story',
    label: 'Instagram story 9:16',
    platform: 'instagram',
    format: 'Story',
    media: ['png916'],
    kind: 'story',
    aspect: 9 / 16,
  },
  {
    key: 'fb-text',
    label: 'Facebook text-only post',
    platform: 'facebook',
    format: 'Post',
    media: [],
    kind: 'feed',
    aspect: null,
  },
  {
    key: 'fb-feed',
    label: 'Facebook feed image 1:1',
    platform: 'facebook',
    format: 'Post',
    media: ['png11'],
    kind: 'feed',
    aspect: 1,
  },
  {
    key: 'fb-reel',
    label: 'Facebook reel 9:16',
    platform: 'facebook',
    format: 'Reel',
    media: ['mp4v'],
    kind: 'vertical',
    aspect: 9 / 16,
  },
  {
    key: 'li-image',
    label: 'LinkedIn image 1.91:1',
    platform: 'linkedin',
    format: 'Post',
    media: ['png191'],
    kind: 'feed',
    aspect: 1.91,
  },
  {
    key: 'tt-video',
    label: 'TikTok video 9:16',
    platform: 'tiktok',
    format: 'Reel',
    media: ['mp4v'],
    kind: 'vertical',
    aspect: 9 / 16,
  },
  {
    key: 'yt-short',
    label: 'YouTube Short 9:16',
    platform: 'youtube',
    format: 'Reel',
    media: ['mp4v'],
    kind: 'vertical',
    aspect: 9 / 16,
  },
  {
    key: 'yt-long',
    label: 'YouTube long-form 16:9',
    platform: 'youtube',
    format: 'Reel',
    media: ['mp4h'],
    kind: 'landscape',
    aspect: 16 / 9,
  },
  {
    key: 'ig-reel-nomedia',
    label: 'Instagram reel with no media yet',
    platform: 'instagram',
    format: 'Reel',
    media: [],
    kind: 'vertical',
    aspect: 9 / 16,
    needsMedia: true,
  },
  {
    key: 'tt-landscape',
    label: 'TikTok with a 16:9 video',
    platform: 'tiktok',
    format: 'Reel',
    media: ['mp4h'],
    kind: 'vertical',
    aspect: 9 / 16,
    letterboxed: true,
  },
];

// Published rows in the shapes production writes. `media_urls` is one object per post type —
// {videoUrl} (REEL), {imageUrl} (POST), {items: [{imageUrl}]} (CAROUSEL) — never an array. A
// `durable` image becomes the snapshot's publishingAsset, which the route re-signs and prefers.
const UX_POSTED_FIXTURES: Array<{
  key: string;
  platform: UxPlatform;
  postType: 'POST' | 'REEL' | 'CAROUSEL';
  permalink: string | null;
  mediaUrls: { videoUrl: UxMediaName } | { imageUrl: UxMediaName } | { items: UxMediaName[] };
  durable: UxMediaName | null;
  kind: UxFrameKind;
  aspect: number;
  title: string;
  // The frame paints the video itself (no still anywhere): `<video src="…#t=0.01">`.
  paintsVideo?: boolean;
}> = [
  {
    // Reel "C": a reel with no snapshot, no permalink, only {videoUrl}.
    key: 'posted-ig-reel-c',
    platform: 'instagram',
    postType: 'REEL',
    permalink: null,
    mediaUrls: { videoUrl: 'mp4v' },
    durable: null,
    kind: 'vertical',
    aspect: 9 / 16,
    title: 'PLUX Posted · Instagram reel C',
    paintsVideo: true,
  },
  {
    key: 'posted-ig-post',
    platform: 'instagram',
    postType: 'POST',
    permalink: 'https://www.instagram.com/p/PLUXBENCH02/',
    mediaUrls: { imageUrl: 'png45' },
    durable: 'png45',
    kind: 'feed',
    aspect: 4 / 5,
    title: 'PLUX Posted · Instagram post 4:5',
  },
  {
    key: 'posted-ig-carousel',
    platform: 'instagram',
    postType: 'CAROUSEL',
    permalink: 'https://www.instagram.com/p/PLUXBENCH03/',
    mediaUrls: { items: ['png45', 'png45b', 'png45c'] },
    durable: null,
    kind: 'feed',
    aspect: 4 / 5,
    title: 'PLUX Posted · Instagram carousel',
  },
  {
    key: 'posted-fb-post',
    platform: 'facebook',
    postType: 'POST',
    permalink: 'https://www.facebook.com/plux.bench/posts/1001',
    mediaUrls: { imageUrl: 'png11' },
    durable: 'png11',
    kind: 'feed',
    aspect: 1,
    title: 'PLUX Posted · Facebook post',
  },
  {
    key: 'posted-tt-video',
    platform: 'tiktok',
    postType: 'REEL',
    permalink: 'https://www.tiktok.com/@plux.bench/video/1001',
    mediaUrls: { imageUrl: 'png916' },
    durable: 'png916',
    kind: 'vertical',
    aspect: 9 / 16,
    title: 'PLUX Posted · TikTok video',
  },
  {
    key: 'posted-li-post',
    platform: 'linkedin',
    postType: 'POST',
    permalink: 'https://www.linkedin.com/feed/update/urn:li:activity:1001/',
    mediaUrls: { imageUrl: 'png191' },
    durable: 'png191',
    kind: 'feed',
    aspect: 1.91,
    title: 'PLUX Posted · LinkedIn post',
  },
  {
    // organic_published_posts_platform_check has no 'youtube', so this row is refused (23514)
    // and the case is reported as not exercised. The production YouTube shape (SHORTS / watch?v=)
    // is covered by the calendar-posts route.test.ts and social-preview-utils unit tests.
    key: 'posted-yt-long',
    platform: 'youtube',
    postType: 'POST',
    permalink: 'https://www.youtube.com/watch?v=PLUXBENCH01',
    mediaUrls: { imageUrl: 'png169' },
    durable: 'png169',
    kind: 'landscape',
    aspect: 16 / 9,
    title: 'PLUX Posted · YouTube long-form',
  },
];

type UxBench = {
  makeMp4OfSize: (width: number, height: number, seconds?: number) => Promise<{ base64: string }>;
  makePngOfSize: (width: number, height: number) => Promise<{ base64: string }>;
};

type UxScrollerBox = UxBox & {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  visible: { top: number; bottom: number; left: number; right: number };
};

type UxGeometry = {
  contract: boolean;
  emptyPx: number;
  innerBottom: number;
  contentBottom: number;
  // Bottom of the last DRAWN dock row or header inside the dock's visible box; never the dock
  // box itself, which is a 1fr track and always reaches the bottom.
  dockContentBottom: number | null;
  dockCount: number;
  dockHeight: number | null;
  // window.innerHeight − the view region's inner bottom: the planner reaches the screen's foot.
  viewportGapPx: number;
  // Ancestors of the view region that are scrolled: the workspace column must not be.
  scrolledAncestors: string[];
  // The Week/Month/List toggle is on screen (a scrolled column hides the toolbar above it).
  togglesInViewport: boolean;
  togglesFound: number;
  // Two-column dock (attention | lookahead): the attention column's own dead band, reported.
  dockTwoColumn: boolean;
  attentionEmptyPx: number | null;
  // The rail's insight note and the dock's attention heading: the same sentence, two places.
  insight: string | null;
  attentionHeading: string | null;
  dockDrawn: boolean;
  dockItemsDrawn: number;
  dockHeadersDrawn: number;
  region: UxBox;
  scroller: UxScrollerBox;
};

type UxSelection = {
  preview: UxBox | null;
  handle: UxBox | null;
  sheets: number;
  cards: Array<{
    id: string;
    scrollHeight: number;
    clientHeight: number;
    // null title = a card this bench did not seed (another writer's draft): no title to measure.
    title: string | null;
    titleLines: number | null;
  }>;
  cardsUseContract: boolean;
  cardTimes: Array<{ text: string; scrollWidth: number; clientWidth: number }>;
  headerTitle: {
    text: string;
    scrollWidth: number;
    clientWidth: number;
    overlapsCollapse: boolean;
  } | null;
};

type UxFrameReading = {
  frame: { platform: string | null; kind: string | null; box: UxBox } | null;
  slot: { box: UxBox; scrollHeight: number; clientHeight: number } | null;
  media: UxBox | null;
  mediaAspect: number | null;
  minFont: number | null;
  minFontText: string;
  zoomed: string[];
  storyProgress: boolean;
  sendMessage: boolean;
  needsMediaInMedia: boolean;
  needsMediaAnywhere: boolean;
  // The decoded picture's painted rect inside its element, from object-fit: inside the media
  // box = letterboxed, past it = cropped.
  mediaContent: { fit: string; decoded: boolean; rect: UxBox | null } | null;
};

const uxTodayIndex = () => (new Date(`${dayIdOffsetFromToday(0)}T12:00:00Z`).getUTCDay() + 6) % 7;

// Mon..Sun of the week the planner opens on, in the browser's (= this machine's) local zone.
function uxWeekDayIds(): string[] {
  const today = uxTodayIndex();
  return Array.from({ length: 7 }, (_, index) => dayIdOffsetFromToday(index - today));
}

function uxPlatformDataset(count: 1 | 3 | 5): UxDraft[] {
  const week = uxWeekDayIds();
  const today = uxTodayIndex();
  // Two drafts per platform on two different days: never more than one per cell.
  return UX_PLATFORM_SETS[count].flatMap((platform, index) =>
    (['a', 'b'] as const).map((slot) => ({
      id: `${UX_PREFIX}p${count}-${platform}-${slot}`,
      platform,
      dayId: week[(today + index + (slot === 'a' ? 0 : 3)) % 7] ?? null,
      title: `PLUX ${platform} ${slot.toUpperCase()} · autumn drop teaser`,
      marker: `PLUXCAP-p${count}-${platform}-${slot}`,
    })),
  );
}

function uxMediaSuggestion(media: UxMedia[]) {
  const [first] = media;
  if (!first) return {};
  const base = {
    mediaStatus: 'user_supplied',
    width: first.width,
    height: first.height,
    assetUrl: null,
    assetBase64: null,
    hyperframe: null,
  };
  if (first.kind === 'video') {
    return {
      ...base,
      kind: 'reel',
      url: null,
      signedUrl: null,
      assets: null,
      reel: {
        generated: true,
        url: first.path,
        bucket: BUCKET,
        signedUrl: first.signedUrl,
        thumbnailUrl: null,
        mimeType: first.mimeType,
        durationSec: 2,
        scenes: [],
      },
    };
  }
  return {
    ...base,
    kind: 'image',
    url: first.path,
    bucket: BUCKET,
    signedUrl: first.signedUrl,
    mimeType: first.mimeType,
    assets: media.map((item, order) => ({
      role: order === 0 ? 'primary' : 'slide',
      order,
      url: item.path,
      bucket: BUCKET,
      signedUrl: item.signedUrl,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      generated: false,
    })),
  };
}

// Width and height ride on EVERY per-asset field the draft media carries (publishingAssets,
// mediaSuggestion, mediaSuggestion.assets), so the frame resolver can read either source.
function uxDraftRow(
  draft: UxDraft,
  options: { format?: UxFormat; media?: UxMedia[]; timeLabel?: string } = {},
) {
  const format = options.format ?? 'Post';
  const media = options.media ?? [];
  const caption = `${draft.marker} ${draft.title}. Long enough to wrap in a feed frame, which is where truncation shows.`;
  return {
    brand_id: BRAND_ID,
    user_id: OWNER_ID,
    platform: draft.platform,
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: draft.dayId ? `${draft.dayId}T12:00:00.000Z` : null,
    client_key: draft.id,
    media_stage: media.length > 0 ? 'realized' : 'text_only',
    slot_data: {
      placementId: draft.id,
      ...(draft.dayId ? { dayId: draft.dayId, weekStart: draft.dayId } : {}),
      timeLabel: options.timeLabel ?? '10:00 AM',
      platform: draft.platform,
      trendId: null,
      title: draft.title,
      caption,
    },
    content_json: {
      content: { type: format.toLowerCase(), format },
      copy: { caption, hashtags: { high: [], medium: [], low: [] }, claims: [] },
      ...(media.length > 0
        ? {
            publishingAssets: media.map((item, slideIndex) => ({
              role: slideIndex === 0 ? 'primary' : 'slide',
              kind: item.kind,
              slideIndex,
              storagePath: item.path,
              storageUrl: item.signedUrl,
              bucket: BUCKET,
              mimeType: item.mimeType,
              width: item.width,
              height: item.height,
            })),
            creative: { mediaSuggestion: uxMediaSuggestion(media) },
          }
        : { creative: {} }),
      quality: { passed: true },
    },
  };
}

function uxPostedRow(
  fixture: (typeof UX_POSTED_FIXTURES)[number],
  media: Map<UxMediaName, UxMedia>,
  publishedAt: string,
) {
  const signed = (name: UxMediaName) => {
    const item = media.get(name);
    if (!item) throw new Error(`media ${name} was never made`);
    return item;
  };
  // Title first: with no snapshot the route titles a post by its caption's first 72 characters.
  const caption = `${fixture.title} PLUXCAP-${fixture.key}. Published, previewed in its own frame.`;
  const mediaUrls =
    'videoUrl' in fixture.mediaUrls
      ? { videoUrl: signed(fixture.mediaUrls.videoUrl).signedUrl }
      : 'imageUrl' in fixture.mediaUrls
        ? { imageUrl: signed(fixture.mediaUrls.imageUrl).signedUrl }
        : { items: fixture.mediaUrls.items.map((name) => ({ imageUrl: signed(name).signedUrl })) };
  const durable = fixture.durable ? signed(fixture.durable) : null;
  return {
    platform_post_id: `${UX_PREFIX}${fixture.key}`,
    brand_id: BRAND_ID,
    platform: fixture.platform,
    platform_account_id: `${UX_PREFIX}account`,
    post_type: fixture.postType,
    caption,
    permalink: fixture.permalink,
    published_at: publishedAt,
    media_urls: mediaUrls,
    content_snapshot: durable
      ? {
          title: fixture.title,
          caption,
          publishingAssets: [
            {
              kind: 'image',
              storagePath: durable.path,
              bucket: BUCKET,
              width: durable.width,
              height: durable.height,
            },
          ],
        }
      : null,
  };
}

const uxSchema = (supabase: SupabaseClient, schema: string) =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema(schema);

async function purgeUxRows(supabase: SupabaseClient): Promise<void> {
  await uxSchema(supabase, 'organic')
    .from('organic_published_posts')
    .delete()
    .eq('brand_id', BRAND_ID)
    .like('platform_post_id', `${UX_PREFIX}%`)
    .throwOnError();
  await uxSchema(supabase, 'organic')
    .from('organic_calendar_drafts')
    .delete()
    .eq('brand_id', BRAND_ID)
    .like('client_key', `${UX_PREFIX}%`)
    .throwOnError();
}

async function seedUxDrafts(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  await purgeUxRows(supabase);
  if (rows.length > 0) {
    await uxSchema(supabase, 'organic').from('organic_calendar_drafts').insert(rows).throwOnError();
  }
}

// Rows on the shared brand that are NOT ours. They add planner rows the bench did not ask for.
async function foreignUxDrafts(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await uxSchema(supabase, 'organic')
    .from('organic_calendar_drafts')
    .select('client_key, platform')
    .eq('brand_id', BRAND_ID);
  return ((data ?? []) as { client_key: string | null; platform: string | null }[])
    .filter((row) => !(row.client_key ?? '').startsWith(UX_PREFIX))
    .map((row) => `${row.client_key ?? '(no client_key)'}:${row.platform ?? '?'}`);
}

// Other shells' benches write …b2 too, and their rows add planner rows. Wait (bounded) for any
// foreign row on a platform outside `allowed` to go away; whatever is left is reported, not hidden.
async function awaitForeignUxDrafts(
  supabase: SupabaseClient,
  allowed: UxPlatform[],
  timeoutMs = 120_000,
): Promise<{ foreign: string[]; waitedMs: number }> {
  const startedAt = Date.now();
  for (;;) {
    const foreign = await foreignUxDrafts(supabase);
    const blocking = foreign.filter(
      (row) => !allowed.some((platform) => row.endsWith(`:${platform}`)),
    );
    if (blocking.length === 0 || Date.now() - startedAt > timeoutMs) {
      return { foreign, waitedMs: Date.now() - startedAt };
    }
    await new Promise((done) => setTimeout(done, 5_000));
  }
}

// Per-test sections, rewritten when that test starts. A worker restart after a failure keeps
// every other test's numbers because the file, not the process, is the accumulator.
function uxRecorder(title: string): (entry: Record<string, unknown>) => void {
  const write = (
    mutate: (all: Record<string, { startedAt: string; entries: unknown[] }>) => void,
  ) => {
    mkdirSync(UX_OUT_DIR, { recursive: true });
    let all: Record<string, { startedAt: string; entries: unknown[] }> = {};
    try {
      all = JSON.parse(readFileSync(UX_MEASUREMENTS, 'utf8'));
    } catch {
      all = {};
    }
    mutate(all);
    writeFileSync(UX_MEASUREMENTS, `${JSON.stringify(all, null, 2)}\n`);
  };
  write((all) => {
    all[title] = { startedAt: new Date().toISOString(), entries: [] };
  });
  return (entry) =>
    write((all) => {
      all[title] ??= { startedAt: new Date().toISOString(), entries: [] };
      all[title].entries.push({ at: new Date().toISOString(), ...entry });
    });
}

const uxShot = (page: Page, name: string) =>
  page.screenshot({ path: join(UX_OUT_DIR, `${name}.jpg`), type: 'jpeg', quality: 70 });

const uxRegion = (page: Page) =>
  page.locator('[data-tour-id="organic-list-content"]:visible').first();

const uxDraftPreview = (page: Page) => page.getByRole('complementary', { name: 'Draft preview' });

async function uxSettle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page.waitForTimeout(UX_FIXTURE_SETTLE_MS);
}

// The dock and the platform rows draw from async reads (integrations, posted content) that can
// land after the planner first paints, seconds late in a long run. A baseline taken before they
// land reads a late dock as the sheet moving the grid, so "before" waits for the page's requests
// to go quiet (capped: a poll may never let them) and then for two reads 400ms apart to agree.
async function uxSettledGeometry(page: Page, view: UxView) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  let last = await page.evaluate(uxGeometryProbe, view);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.waitForTimeout(400);
    const next = await page.evaluate(uxGeometryProbe, view);
    const same =
      next?.dockHeight === last?.dockHeight &&
      next?.scroller.height === last?.scroller.height &&
      next?.scroller.scrollHeight === last?.scroller.scrollHeight;
    last = next;
    if (same) break;
  }
  return last;
}

async function uxSwitchView(page: Page, view: UxView): Promise<void> {
  const label = view === 'week' ? 'Week' : view === 'month' ? 'Month' : 'List';
  const toggle = page.getByRole('button', { name: label, exact: true }).first();
  await expect
    .poll(
      async () => {
        if ((await toggle.getAttribute('aria-pressed').catch(() => null)) === 'true') return view;
        await toggle.click({ timeout: 5_000 }).catch(() => {});
        return 'pending';
      },
      { timeout: 120_000, intervals: [500, 1000, 2000] },
    )
    .toBe(view);
}

async function uxPreviewIsOpen(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '[role="complementary"][aria-label$="preview"], [data-slot="sheet-content"]',
      ),
    ).some((el) => el.getClientRects().length > 0),
  );
}

async function uxClosePreview(page: Page): Promise<void> {
  if (!(await uxPreviewIsOpen(page))) return;
  const close = page.getByRole('button', { name: 'Close preview' }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  } else {
    await parkPointer(page);
    await page.keyboard.press('Escape');
  }
  await expect.poll(() => uxPreviewIsOpen(page), { timeout: 20_000 }).toBe(false);
}

async function uxOpenPlanner(page: Page, view: UxView, firstTitle: string): Promise<void> {
  await page.goto(`/organic?tab=planner&view=${view}`, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Planner', exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await uxSwitchView(page, view);
  if (view !== 'list') {
    const today = page.getByRole('button', { name: 'Today', exact: true }).first();
    if (await today.isVisible().catch(() => false)) await today.click();
  }
  await expect(uxRegion(page).getByText(firstTitle).first()).toBeVisible({ timeout: 120_000 });
  await uxClosePreview(page);
  await parkPointer(page);
  await uxSettle(page);
}

// Menus, popovers, dialogs and sheets — by data-slot, never a bare role=dialog (Base UI toasts
// are role=dialog too). An open one covers or scroll-locks the page under a pointer gesture.
const UX_OVERLAY_SLOTS = [
  'popover-content',
  'dropdown-menu-content',
  'context-menu-content',
  'select-content',
  'dialog-content',
  'alert-dialog-content',
  'sheet-content',
  'hover-card-content',
]
  .map((slot) => `[data-slot="${slot}"]:visible`)
  .join(', ');

async function uxAwaitNoOverlay(page: Page): Promise<void> {
  await parkPointer(page);
  await expect(
    page.locator(UX_OVERLAY_SLOTS),
    'a menu, popover, dialog or sheet is still open',
  ).toHaveCount(0, {
    timeout: 10_000,
  });
}

const uxLiveRegion = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="DndLiveRegion"]'))
      .map((el) => (el.textContent ?? '').trim())
      .filter(Boolean)
      .join(' | '),
  );

// The DOM contract puts `data-draft-id` on the FOCUSABLE chip. Until a stream lands it, the
// fallback is the innermost button-ish element carrying the title (a dnd wrapper is an
// ancestor, so `.last()` skips it). `uxContract` reports which one was used.
async function uxChip(page: Page, draft: UxDraft): Promise<{ chip: Locator; contract: boolean }> {
  const region = uxRegion(page);
  const byId = region.locator(`[data-draft-id="${draft.id}"]:visible`).first();
  // The title can paint in the dock before the view's own rows mount, so give the contract
  // attribute a moment before concluding it is absent.
  const contract = await byId
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (contract) return { chip: byId, contract };
  return {
    chip: region
      .locator(':is(button, [role="button"]):not([data-testid="planner-attention-dock"] *)')
      .filter({ hasText: draft.title })
      .last(),
    contract,
  };
}

async function uxPlatformRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const platforms = new Set<string>();
    for (const cell of Array.from(document.querySelectorAll('[data-planner-cell]'))) {
      if (cell.getClientRects().length === 0) continue;
      const platform = (cell.getAttribute('data-planner-cell') ?? '').split('::')[2];
      if (platform) platforms.add(platform);
    }
    return [...platforms];
  });
}

// Empty px = view-region inner bottom − max(content bottom clipped to its scroller, bottom of the
// last drawn dock row or header).
// With the contract attributes absent it falls back to the real content boxes (planner cells,
// list rows) and their nearest scrolling ancestor, and says so (`contract: false`).
const uxGeometryProbe = (view: string): UxGeometry | null => {
  const shown = (el: Element | null | undefined): el is HTMLElement =>
    Boolean(el) &&
    (el as HTMLElement).getClientRects().length > 0 &&
    getComputedStyle(el as HTMLElement).visibility !== 'hidden';
  const boxOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const region = Array.from(
    document.querySelectorAll('[data-tour-id="organic-list-content"]'),
  ).find(shown);
  if (!region) return null;
  const regionRect = region.getBoundingClientRect();
  const innerBottom =
    regionRect.top +
    region.clientTop +
    region.clientHeight -
    Number.parseFloat(getComputedStyle(region).paddingBottom || '0');

  const contractScroller = Array.from(region.querySelectorAll('[data-planner-scroller]')).find(
    shown,
  );
  const contractContent = Array.from(region.querySelectorAll('[data-planner-content]')).find(shown);
  let scroller: HTMLElement = region;
  let contentBottom = regionRect.top;
  const contract = Boolean(contractScroller && contractContent);
  if (contractScroller && contractContent) {
    scroller = contractScroller;
    contentBottom = contractContent.getBoundingClientRect().bottom;
  } else {
    const boxes = Array.from(
      region.querySelectorAll(view === 'list' ? '[role="button"]' : '[data-planner-cell]'),
    ).filter(shown);
    if (boxes.length > 0) {
      contentBottom = Math.max(...boxes.map((el) => el.getBoundingClientRect().bottom));
      for (
        let node = boxes[0]?.parentElement ?? null;
        node && node !== region;
        node = node.parentElement
      ) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          scroller = node;
          break;
        }
      }
    }
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const visible = {
    top: scrollerRect.top + scroller.clientTop,
    bottom: scrollerRect.top + scroller.clientTop + scroller.clientHeight,
    left: scrollerRect.left + scroller.clientLeft,
    right: scrollerRect.left + scroller.clientLeft + scroller.clientWidth,
  };
  const clipped = Math.min(contentBottom, visible.bottom);
  const docks = Array.from(
    document.querySelectorAll('[data-testid="planner-attention-dock"]'),
  ).filter(shown);
  const dock = docks[0] ?? null;
  let dockContentBottom: number | null = null;
  let attentionBottom: number | null = null;
  let dockItemsDrawn = 0;
  let dockHeadersDrawn = 0;
  if (dock) {
    const outer = dock.getBoundingClientRect();
    // The dock's visible box for one row: the dock itself, narrowed by every clipping box
    // between the row and the dock (its own scrolling list).
    const visibleSpan = (el: Element) => {
      let top = outer.top;
      let bottom = outer.bottom;
      for (let node = el.parentElement; node && node !== dock; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === 'visible') continue;
        const r = node.getBoundingClientRect();
        top = Math.max(top, r.top + node.clientTop);
        bottom = Math.min(bottom, r.top + node.clientTop + node.clientHeight);
      }
      return { top, bottom };
    };
    for (const el of Array.from(dock.querySelectorAll('[data-dock-item], h2'))) {
      if (el.getClientRects().length === 0 || getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      const span = visibleSpan(el);
      if (r.height <= 0 || r.bottom <= span.top || r.top >= span.bottom) continue;
      if (el.tagName === 'H2') dockHeadersDrawn += 1;
      else dockItemsDrawn += 1;
      const bottom = Math.min(r.bottom, span.bottom);
      dockContentBottom = Math.max(dockContentBottom ?? r.top, bottom);
      if (el.closest('[data-dock-section="attention"]')) {
        attentionBottom = Math.max(attentionBottom ?? r.top, bottom);
      }
    }
  }
  const attentionSection = dock?.querySelector('[data-dock-section="attention"]') ?? null;
  const lookaheadSection = dock?.querySelector('[data-dock-section="lookahead"]') ?? null;
  const dockTwoColumn = Boolean(
    attentionSection &&
      lookaheadSection &&
      shown(attentionSection) &&
      shown(lookaheadSection) &&
      Math.abs(
        attentionSection.getBoundingClientRect().top - lookaheadSection.getBoundingClientRect().top,
      ) < 2 &&
      lookaheadSection.getBoundingClientRect().left >
        attentionSection.getBoundingClientRect().left + 1,
  );
  const scrolledAncestors: string[] = [];
  for (let node = region.parentElement; node; node = node.parentElement) {
    if (node.scrollTop !== 0) {
      scrolledAncestors.push(
        `${node.tagName.toLowerCase()}.${String(node.getAttribute('class') ?? '').slice(0, 60)} scrollTop=${node.scrollTop}`,
      );
    }
  }
  const toggles = Array.from(document.querySelectorAll('button[aria-pressed]')).filter(
    (el) => shown(el) && ['Week', 'Month', 'List'].includes((el.textContent ?? '').trim()),
  );
  return {
    contract,
    emptyPx: innerBottom - Math.max(clipped, dockContentBottom ?? Number.NEGATIVE_INFINITY),
    innerBottom,
    contentBottom,
    dockContentBottom,
    dockCount: docks.length,
    dockHeight: dock ? dock.getBoundingClientRect().height : null,
    viewportGapPx: window.innerHeight - innerBottom,
    scrolledAncestors,
    togglesInViewport:
      toggles.length > 0 &&
      toggles.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      }),
    togglesFound: toggles.length,
    dockTwoColumn,
    attentionEmptyPx:
      dockTwoColumn && attentionBottom !== null ? innerBottom - attentionBottom : null,
    insight:
      Array.from(document.querySelectorAll('[aria-label="Planning insight"]'))
        .find(shown)
        ?.textContent?.trim() ?? null,
    attentionHeading:
      dock?.querySelector('[data-dock-section="attention"] h2')?.textContent?.trim() ?? null,
    dockDrawn: dockItemsDrawn + dockHeadersDrawn > 0,
    dockItemsDrawn,
    dockHeadersDrawn,
    region: boxOf(region),
    scroller: {
      ...boxOf(scroller),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      visible,
    },
  };
};

const uxSelectionProbe = (args: { view: string; titles: string[] }): UxSelection => {
  const shown = (el: Element | null | undefined): el is HTMLElement =>
    Boolean(el) && (el as HTMLElement).getClientRects().length > 0;
  const boxOf = (el: Element | null | undefined) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  // Line boxes the reader can SEE: a line-clamped title still lays out its hidden lines, so
  // only the fragments inside the element's own box count.
  const visibleLines = (el: Element): number => {
    const own = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = Array.from(range.getClientRects())
      .filter(
        (r) => r.width > 0 && r.height > 0 && r.top >= own.top - 1 && r.bottom <= own.bottom + 1,
      )
      .map((r) => r.top)
      .sort((a, b) => a - b);
    return tops.filter((top, index) => index === 0 || top - (tops[index - 1] ?? top) > 2).length;
  };
  const region = Array.from(
    document.querySelectorAll('[data-tour-id="organic-list-content"]'),
  ).find(shown);
  const contractCards = region
    ? Array.from(region.querySelectorAll('[data-draft-id]')).filter(shown)
    : [];
  const cardsUseContract = contractCards.length > 0;
  const cardEls =
    args.view !== 'week' || !region
      ? []
      : cardsUseContract
        ? contractCards
        : Array.from(
            region.querySelectorAll('[data-planner-cell] button[aria-pressed]:not([data-post-id])'),
          ).filter(shown);
  const cards = cardEls.map((card) => {
    const text = card.textContent ?? '';
    const title = args.titles.find((candidate) => text.includes(candidate));
    let titleEl: Element | null = null;
    if (title) {
      for (const node of Array.from(card.querySelectorAll('*'))) {
        if ((node.textContent ?? '').trim() === title) titleEl = node;
      }
      if (!titleEl) {
        for (const node of Array.from(card.querySelectorAll('*'))) {
          if ((node.textContent ?? '').includes(title)) titleEl = node;
        }
      }
    }
    return {
      id: card.getAttribute('data-draft-id') ?? title ?? '(unknown)',
      scrollHeight: card.scrollHeight,
      clientHeight: card.clientHeight,
      title: title ?? null,
      titleLines: titleEl ? visibleLines(titleEl) : null,
    };
  });

  const cardTimes =
    args.view === 'week' && region
      ? Array.from(region.querySelectorAll('[data-card-time]'))
          .filter(shown)
          .map((el) => ({
            text: (el.textContent ?? '').trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }))
      : [];

  const panel = document.querySelector('#planner-preview');
  const aside =
    panel?.querySelector('[role="complementary"]') ??
    Array.from(document.querySelectorAll('[role="complementary"][aria-label$="preview"]')).find(
      shown,
    ) ??
    null;
  const headerTitleEl =
    aside?.querySelector('h2') ?? aside?.querySelector(':scope > div:first-child p') ?? null;
  let headerTitle: UxSelection['headerTitle'] = null;
  if (headerTitleEl instanceof HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(headerTitleEl);
    const textRect = range.getBoundingClientRect();
    const collapse = document.querySelector('[data-testid="planner-preview-collapse"]');
    const c = shown(collapse) ? collapse.getBoundingClientRect() : null;
    headerTitle = {
      text: (headerTitleEl.textContent ?? '').trim(),
      scrollWidth: headerTitleEl.scrollWidth,
      clientWidth: headerTitleEl.clientWidth,
      overlapsCollapse: Boolean(
        c &&
          textRect.right - 1 > c.left &&
          c.right - 1 > textRect.left &&
          textRect.bottom - 1 > c.top &&
          c.bottom - 1 > textRect.top,
      ),
    };
  }
  const handle = Array.from(document.querySelectorAll('[data-slot="resizable-handle"]')).find(
    shown,
  );
  return {
    preview: shown(panel) ? boxOf(panel) : boxOf(aside),
    handle: boxOf(handle),
    sheets: Array.from(document.querySelectorAll('[data-slot="sheet-content"]')).filter(shown)
      .length,
    cards,
    cardsUseContract,
    cardTimes,
    headerTitle,
  };
};

const uxFrameProbe = (root: Element): UxFrameReading => {
  const boxOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const frame = root.querySelector('[data-preview-frame]');
  const slot = root.querySelector('[data-preview-frame-slot]');
  const media = frame?.querySelector('[data-frame-media]') ?? null;
  let minFont: number | null = null;
  let minFontText = '';
  if (frame) {
    for (const el of [frame, ...Array.from(frame.querySelectorAll('*'))]) {
      const text = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (!text || el.getClientRects().length === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0) continue;
      const size = Number.parseFloat(style.fontSize);
      if (minFont === null || size < minFont) {
        minFont = size;
        minFontText = text.slice(0, 48);
      }
    }
  }
  const zoomed = Array.from(root.querySelectorAll('*'))
    .filter((el) => {
      const zoom = getComputedStyle(el).zoom;
      return Boolean(zoom) && zoom !== '1' && zoom !== 'normal';
    })
    .slice(0, 5)
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)} zoom=${getComputedStyle(el).zoom}`,
    );
  const visibleText = (root as HTMLElement).innerText ?? '';
  const mediaBox = media ? boxOf(media) : null;
  const picture = media?.querySelector('video, img') ?? null;
  let mediaContent: UxFrameReading['mediaContent'] = null;
  if (picture instanceof HTMLVideoElement || picture instanceof HTMLImageElement) {
    const intrinsicW =
      picture instanceof HTMLVideoElement ? picture.videoWidth : picture.naturalWidth;
    const intrinsicH =
      picture instanceof HTMLVideoElement ? picture.videoHeight : picture.naturalHeight;
    const fit = getComputedStyle(picture).objectFit;
    const box = picture.getBoundingClientRect();
    let rect: UxBox | null = null;
    if (intrinsicW > 0 && intrinsicH > 0) {
      const contain = Math.min(box.width / intrinsicW, box.height / intrinsicH);
      const scale =
        fit === 'cover'
          ? Math.max(box.width / intrinsicW, box.height / intrinsicH)
          : fit === 'none'
            ? 1
            : fit === 'scale-down'
              ? Math.min(1, contain)
              : contain;
      const width = fit === 'fill' ? box.width : intrinsicW * scale;
      const height = fit === 'fill' ? box.height : intrinsicH * scale;
      // object-position is the default 50% 50%.
      rect = {
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height,
      };
    }
    mediaContent = { fit, decoded: intrinsicW > 0, rect };
  }
  return {
    frame: frame
      ? {
          platform: frame.getAttribute('data-preview-frame'),
          kind: frame.getAttribute('data-frame-kind'),
          box: boxOf(frame),
        }
      : null,
    slot: slot
      ? { box: boxOf(slot), scrollHeight: slot.scrollHeight, clientHeight: slot.clientHeight }
      : null,
    media: mediaBox,
    mediaAspect: mediaBox && mediaBox.height > 0 ? mediaBox.width / mediaBox.height : null,
    minFont,
    minFontText,
    zoomed,
    storyProgress: Boolean(root.querySelector('[data-story-progress]')),
    sendMessage: /Send message/.test(visibleText),
    needsMediaInMedia: /Needs media/.test((media as HTMLElement | null)?.innerText ?? ''),
    needsMediaAnywhere: /Needs media|No media/i.test(visibleText),
    mediaContent,
  };
};

// The §1e render probe: a React devtools hook that counts, per component name, the fibers that
// PERFORMED work in a commit (PerformedWork flag = 1), skipping bailed-out subtrees whose child
// is still the current tree's child. A fiber with no alternate was MOUNTED in this commit and is
// counted apart. `census()` walks the whole current tree, so a gate can prove the component it
// caps is actually on screen. Installed before React loads; read back as plain counters.
function uxRenderProbeInit(): void {
  type ProbeFiber = {
    tag: number;
    key: string | null;
    type: unknown;
    flags: number;
    alternate: ProbeFiber | null;
    child: ProbeFiber | null;
    sibling: ProbeFiber | null;
  };
  const tags = new Set([0, 1, 11, 14, 15]);
  const probe = {
    counts: {} as Record<string, number>,
    mounts: {} as Record<string, number>,
    // Renders per component name per React key, and `commit|name|key` per render, so a gate
    // can tell the edited cell from every other cell of the same component.
    keyed: {} as Record<string, Record<string, number>>,
    log: [] as string[],
    commits: 0,
    lastCommitAt: 0,
    roots: 0,
    census: (): Record<string, number> => {
      const found: Record<string, number> = {};
      const walk = (start: ProbeFiber | null): void => {
        for (let fiber = start; fiber; fiber = fiber.sibling) {
          if (tags.has(fiber.tag)) {
            const name = nameOf(fiber);
            found[name] = (found[name] ?? 0) + 1;
          }
          walk(fiber.child);
        }
      };
      for (const root of roots) walk((root as { current: ProbeFiber }).current.child);
      return found;
    },
  };
  const roots = new Set<unknown>();
  const nameOf = (fiber: ProbeFiber): string => {
    const type = fiber.type as {
      displayName?: string;
      name?: string;
      render?: { name?: string };
      type?: { name?: string };
    } | null;
    return type?.displayName || type?.name || type?.render?.name || type?.type?.name || '(anon)';
  };
  const visit = (start: ProbeFiber | null): void => {
    for (let fiber = start; fiber; fiber = fiber.sibling) {
      if (tags.has(fiber.tag) && fiber.alternate && fiber.flags & 1) {
        const name = nameOf(fiber);
        probe.counts[name] = (probe.counts[name] ?? 0) + 1;
        const key = fiber.key ?? '(no key)';
        probe.keyed[name] ??= {};
        probe.keyed[name][key] = (probe.keyed[name][key] ?? 0) + 1;
        if (probe.log.length < 5_000) probe.log.push(`${probe.commits}|${name}|${key}`);
      } else if (tags.has(fiber.tag) && !fiber.alternate) {
        const name = nameOf(fiber);
        probe.mounts[name] = (probe.mounts[name] ?? 0) + 1;
      }
      if (!fiber.alternate || fiber.child !== fiber.alternate.child) visit(fiber.child);
    }
  };
  const target = window as unknown as Record<string, unknown>;
  target.__pluxProbe = probe;
  target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    onCommitFiberRoot: (_id: number, root: { current: ProbeFiber }) => {
      roots.add(root);
      probe.roots = roots.size;
      probe.commits += 1;
      probe.lastCommitAt = performance.now();
      visit(root.current.child);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}

type UxProbeWindow = {
  __pluxProbe?: {
    counts: Record<string, number>;
    mounts: Record<string, number>;
    keyed: Record<string, Record<string, number>>;
    log: string[];
    census: () => Record<string, number>;
    commits: number;
    lastCommitAt: number;
    roots: number;
  };
  __pluxPaint?: Promise<number>;
  __pluxLongTasks?: number[];
};

async function uxWaitQuiet(page: Page, quietMs = 300): Promise<void> {
  await page
    .waitForFunction(
      (quiet) => {
        const probe = (window as unknown as UxProbeWindow).__pluxProbe;
        return !probe || performance.now() - probe.lastCommitAt > quiet;
      },
      quietMs,
      { timeout: 5_000, polling: 100 },
    )
    .catch(() => {});
}

// Per view: the components a selection may touch, how often, and whether one must be on screen
// for the gate to mean anything (a cap over a component that never mounted passes vacuously).
// DraftRow/BacklogRow are OrganicListView's; the dock's rows are DraftRowContent and
// Dated/UndatedDraftButton, and onboarding's DraftRow is not on this page.
const UX_RENDER_GATES: Record<UxView, Array<{ name: string; cap: number; required: boolean }>> = {
  week: [
    { name: 'PlannerCell', cap: 2, required: true },
    { name: 'DraggableDraftCardComponent', cap: 2, required: true },
    { name: 'PostedCellChip', cap: 0, required: true },
  ],
  month: [
    { name: 'MonthDayCell', cap: 2, required: true },
    { name: 'DraftChip', cap: 2, required: true },
    { name: 'PostedContentChip', cap: 0, required: true },
  ],
  list: [
    { name: 'DraftRow', cap: 2, required: true },
    { name: 'BacklogRow', cap: 2, required: false },
  ],
};

// A typing burst in the open caption. Every OTHER cell/chip/row of the gated components renders
// 0 times; the edited draft's own renders 1–2 times (1 = the burst's store write, +1 = the
// server echo when the row comes back with new server fields), and at least once, or the burst
// never landed. The dock's lookahead tiles never render. No dock in month.
const UX_TYPING_GATES: Record<
  UxView,
  { edited: Array<{ name: string; key: (draft: UxDraft) => string }>; zero: string[] }
> = {
  week: {
    edited: [
      { name: 'PlannerCell', key: (draft) => `${draft.dayId}-${draft.platform}` },
      { name: 'DraggableDraftCardComponent', key: (draft) => `draft-${draft.id}` },
    ],
    zero: ['LookaheadTile'],
  },
  month: {
    edited: [
      { name: 'MonthDayCell', key: (draft) => draft.dayId ?? '' },
      { name: 'DraftChip', key: (draft) => draft.id },
    ],
    zero: [],
  },
  list: { edited: [{ name: 'DraftRow', key: (draft) => draft.id }], zero: ['LookaheadTile'] },
};

// Resets the render counters and arms a pointerdown → "preview shows this draft" + 2 rAF timer.
const uxArmPaint = (marker: string): boolean => {
  const w = window as unknown as UxProbeWindow;
  // Already on screen = the timer would resolve at once and time nothing.
  const alreadyShown = (
    document.querySelector('[role="complementary"][aria-label="Draft preview"]')?.textContent ?? ''
  ).includes(marker);
  if (w.__pluxProbe) {
    w.__pluxProbe.counts = {};
    w.__pluxProbe.mounts = {};
    w.__pluxProbe.keyed = {};
    w.__pluxProbe.log = [];
  }
  w.__pluxPaint = new Promise<number>((resolvePaint, rejectPaint) => {
    let startedAt = -1;
    let done = false;
    const check = () => {
      if (done || startedAt < 0) return;
      const aside = document.querySelector('[role="complementary"][aria-label="Draft preview"]');
      if (!(aside?.textContent ?? '').includes(marker)) return;
      done = true;
      observer.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolvePaint(performance.now() - startedAt)),
      );
    };
    const observer = new MutationObserver(check);
    window.addEventListener(
      'pointerdown',
      () => {
        startedAt = performance.now();
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        check();
      },
      { capture: true, once: true },
    );
    setTimeout(() => {
      if (done) return;
      observer.disconnect();
      rejectPaint(new Error(`the preview never showed ${marker}`));
    }, 30_000);
  });
  return alreadyShown;
};

// The pointer sequence dispatched ON the chip without moving the mouse there: a real hover opens
// the chip's hover card, whose open/close re-renders DraftChip and would count against the
// selection's own budget. dnd-kit sees the pointerup and stands down.
const uxDispatchClick = (el: Element) => {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
  };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', init));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  (el as HTMLElement).click();
};

function uxPercentile(samples: number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? Number.NaN;
}

const uxWithin = (inner: UxBox, outer: UxBox, slack = 1) =>
  inner.x >= outer.x - slack &&
  inner.y >= outer.y - slack &&
  inner.x + inner.width <= outer.x + outer.width + slack &&
  inner.y + inner.height <= outer.y + outer.height + slack;

const uxAspectOk = (actual: number | null, expected: number) =>
  actual !== null && Math.abs(actual / expected - 1) <= 0.02;

// The frame contract assertions U3 and U4 share. Soft: one fixture's miss must not hide the rest.
function uxAssertFrame(
  reading: UxFrameReading,
  expected: {
    label: string;
    platform: UxPlatform;
    kind: UxFrameKind;
    aspect: number | null;
    needsMedia?: boolean;
    letterboxed?: boolean;
  },
): void {
  const { label } = expected;
  expect.soft(reading.frame, `${label}: no [data-preview-frame] in the preview`).not.toBeNull();
  expect
    .soft(reading.frame?.platform, `${label}: data-preview-frame (the platform it previews as)`)
    .toBe(expected.platform);
  expect.soft(reading.frame?.kind, `${label}: data-frame-kind`).toBe(expected.kind);
  expect.soft(reading.slot, `${label}: no [data-preview-frame-slot]`).not.toBeNull();
  if (reading.frame && reading.slot) {
    expect
      .soft(
        uxWithin(reading.frame.box, reading.slot.box),
        `${label}: frame ${JSON.stringify(reading.frame.box)} spills out of its slot ${JSON.stringify(reading.slot.box)}`,
      )
      .toBe(true);
    expect
      .soft(
        reading.slot.scrollHeight,
        `${label}: the frame slot scrolls (${reading.slot.scrollHeight} > ${reading.slot.clientHeight})`,
      )
      .toBeLessThanOrEqual(reading.slot.clientHeight + 1);
  }
  if (expected.aspect === null) {
    // A text post on a text-first platform (Facebook, LinkedIn): no media box, no placeholder.
    expect.soft(reading.media, `${label}: a text-only post renders a media box`).toBeNull();
    expect
      .soft(reading.needsMediaAnywhere, `${label}: a text-only post shows a media placeholder`)
      .toBe(false);
  } else {
    expect
      .soft(
        uxAspectOk(reading.mediaAspect, expected.aspect),
        `${label}: [data-frame-media] aspect ${reading.mediaAspect?.toFixed(4)} is not within 2% of ${expected.aspect.toFixed(4)}`,
      )
      .toBe(true);
    expect
      .soft(
        reading.needsMediaInMedia,
        expected.needsMedia
          ? `${label}: no "Needs media" inside [data-frame-media] for a media format with no media`
          : `${label}: "Needs media" shows over attached media`,
      )
      .toBe(Boolean(expected.needsMedia));
  }
  if (expected.letterboxed) {
    const content = reading.mediaContent;
    expect.soft(content?.decoded, `${label}: the media never decoded`).toBe(true);
    if (content?.rect && reading.media) {
      expect
        .soft(
          uxWithin(content.rect, reading.media),
          `${label}: the ${content.fit} picture ${JSON.stringify(content.rect)} overflows [data-frame-media] ${JSON.stringify(reading.media)}: cropped, not letterboxed`,
        )
        .toBe(true);
    }
  }
  expect
    .soft(
      reading.minFont ?? 0,
      `${label}: smallest text in the frame is ${reading.minFont}px ("${reading.minFontText}")`,
    )
    .toBeGreaterThanOrEqual(12);
  expect.soft(reading.zoomed, `${label}: elements with computed zoom ≠ 1`).toEqual([]);
  const isStory = expected.kind === 'story';
  expect
    .soft(reading.storyProgress, `${label}: [data-story-progress] present=${reading.storyProgress}`)
    .toBe(isStory);
  // Wave 2 (fidelity item 11): "Send message" is a viewer affordance a post never sends, so an
  // editable draft's story frame no longer draws it. Wave 1 asserted it on stories; the plan
  // inverts that, and the story still reads as one through [data-story-progress] above.
  expect
    .soft(reading.sendMessage, `${label}: "Send message" present=${reading.sendMessage}`)
    .toBe(false);
}

// Polls the frame until the media box stops moving: media sizes itself once it loads.
async function uxReadFrame(
  page: Page,
  rootSelector: string,
  waitMs: number,
): Promise<UxFrameReading> {
  const root = page.locator(rootSelector).first();
  const read = () => root.evaluate(uxFrameProbe);
  const deadline = Date.now() + waitMs;
  let previous = await read();
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const next = await read();
    const stable =
      next.frame !== null &&
      previous.frame !== null &&
      (next.mediaContent === null || next.mediaContent.decoded) &&
      JSON.stringify(next.media) === JSON.stringify(previous.media) &&
      JSON.stringify(next.mediaContent) === JSON.stringify(previous.mediaContent) &&
      JSON.stringify(next.frame.box) === JSON.stringify(previous.frame.box);
    previous = next;
    if (stable) break;
  }
  return previous;
}

const uxMediaCache = new Map<UxMediaName, UxMedia>();
const uxUploadedPaths = new Set<string>();

// Real media, made in the real browser: canvas PNGs and Mediabunny H.264 MP4s of exact sizes,
// uploaded to real local storage and signed. Cached per worker.
async function uxEnsureMedia(
  page: Page,
  supabase: SupabaseClient,
): Promise<Map<UxMediaName, UxMedia>> {
  if (uxMediaCache.size === Object.keys(UX_MEDIA_SPECS).length) return uxMediaCache;
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (bucketError && !/already exists/i.test(bucketError.message)) {
    throw new Error(`[planner UX] bucket ${BUCKET}: ${bucketError.message}`);
  }
  await page.goto('/organic', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: buildBrowserBundle(), type: 'module' });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __posterBench?: unknown }).__posterBench),
    undefined,
    {
      timeout: 60_000,
    },
  );
  for (const [name, spec] of Object.entries(UX_MEDIA_SPECS) as [
    UxMediaName,
    (typeof UX_MEDIA_SPECS)[UxMediaName],
  ][]) {
    const made = await page.evaluate(
      ({ kind, width, height }) => {
        const bench = (window as unknown as { __posterBench: UxBench }).__posterBench;
        return kind === 'video'
          ? bench.makeMp4OfSize(width, height, 2)
          : bench.makePngOfSize(width, height);
      },
      { kind: spec.kind, width: spec.width, height: spec.height },
    );
    const bytes = Buffer.from(made.base64, 'base64');
    expect(bytes.byteLength, `${name}: the in-page encoder produced no bytes`).toBeGreaterThan(
      1_000,
    );
    const mimeType = spec.kind === 'video' ? 'video/mp4' : 'image/png';
    const path = `${UX_MEDIA_DIR}/${name}.${spec.kind === 'video' ? 'mp4' : 'png'}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`[planner UX] upload ${path}: ${error.message}`);
    uxUploadedPaths.add(path);
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 6 * 3600);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(`[planner UX] sign ${path}: ${signed.error?.message}`);
    }
    uxMediaCache.set(name, {
      kind: spec.kind,
      path,
      signedUrl: signed.data.signedUrl,
      width: spec.width,
      height: spec.height,
      mimeType,
    });
  }
  return uxMediaCache;
}

test.describe('planner UX (U1–U7)', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'needs the local Supabase stack — bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );
  // Not serial: a gate that is red until its stream lands must not skip the gates after it.
  test.describe.configure({ timeout: 600_000 });
  // Playwright's default action/navigation timeout is unbounded: a chip that never renders
  // would otherwise burn the whole 10-minute test instead of failing with its locator.
  test.use({ actionTimeout: 30_000, navigationTimeout: 120_000 });

  let context: BrowserContext | null = null;
  let page: Page;
  let cookies: Awaited<ReturnType<typeof mintSessionWithPassword>>['cookies'] = [];
  let previousActiveBrandId: string | null = null;
  let brandTimeZone = 'UTC';

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    const supabase = admin();
    mkdirSync(UX_OUT_DIR, { recursive: true });
    const { data: pref } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;
    const { data: brand } = await supabase
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('timezone')
      .eq('id', BRAND_ID)
      .maybeSingle();
    brandTimeZone = (brand?.timezone as string | undefined) || 'UTC';

    await setActiveBrand(supabase, BRAND_ID);
    await repairOnboarding(supabase);
    await purgeUxRows(supabase);
    await forgetCachedIntegrations();

    cookies = (await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD)).cookies;
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(cookies);
    page = await context.newPage();
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    await context?.close();
    const supabase = admin();
    await purgeUxRows(supabase);
    if (uxUploadedPaths.size > 0) await supabase.storage.from(BUCKET).remove([...uxUploadedPaths]);
    uxUploadedPaths.clear();
    uxMediaCache.clear();
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
  });

  // ---- U1 + U2: geometry, unselected and selected, every wide viewport and view ----
  for (const count of [1, 3, 5] as const) {
    // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
    test(`U1+U2 geometry sweep · ${count} platform${count === 1 ? '' : 's'}`, async ({}, testInfo) => {
      const record = uxRecorder(testInfo.title);
      const supabase = admin();
      const dataset = uxPlatformDataset(count);
      const titles = dataset.map((draft) => draft.title);
      await seedUxDrafts(
        supabase,
        dataset.map((draft) => uxDraftRow(draft)),
      );
      const { foreign, waitedMs } = await awaitForeignUxDrafts(supabase, UX_PLATFORM_SETS[count]);
      record({
        seeded: dataset.map((draft) => `${draft.id}@${draft.dayId}`),
        foreignRows: foreign,
        waitedForForeignMs: waitedMs,
      });

      await page.setViewportSize(UX_WIDE[1]);
      await uxOpenPlanner(page, 'week', dataset[0]?.title ?? '');
      // A row the drafts do not explain comes from the brand's connected integrations, which the
      // planner reads through a 1h Upstash cache another shell's bench can have filled.
      const rows = await uxPlatformRows(page);
      record({ platformRows: rows });
      expect(
        rows.length,
        `the week grid shows ${rows.length} platform rows (${rows.join(', ')}), the bench seeded ${count} (${UX_PLATFORM_SETS[count].join(', ')}); foreign drafts on the brand: ${foreign.join(', ') || 'none'}`,
      ).toBe(count);

      // The draft on TODAY: inside every view's default range.
      const target = dataset[0];
      if (!target) throw new Error('empty dataset');

      for (const viewport of UX_WIDE) {
        await page.setViewportSize(viewport);
        for (const view of UX_VIEWS) {
          const tag = `${viewport.width}x${viewport.height}-${view}-${count}p`;
          await uxSwitchView(page, view);
          await uxClosePreview(page);
          await parkPointer(page);
          await uxSettle(page);

          const unselected = await page.evaluate(uxGeometryProbe, view);
          await uxShot(page, `geometry-${tag}-unselected`);
          expect(unselected, `${tag}: no visible view region`).not.toBeNull();
          if (!unselected) continue;

          const { chip, contract: chipContract } = await uxChip(page, target);
          await chip.scrollIntoViewIfNeeded();
          await chip.click();
          await expect(
            uxDraftPreview(page),
            `${tag}: selecting a chip opened no preview`,
          ).toBeVisible({
            timeout: 60_000,
          });
          await parkPointer(page);
          await uxSettle(page);
          const selected = await page.evaluate(uxGeometryProbe, view);
          const selection = await page.evaluate(uxSelectionProbe, { view, titles });
          const chipBox = await chip.boundingBox();
          await uxShot(page, `geometry-${tag}-selected`);
          record({
            tag,
            viewport,
            view,
            count,
            chipContract,
            unselected,
            selected,
            selection,
            chipBox,
          });

          // U2 — the dead band, both states.
          for (const [state, g] of [
            ['unselected', unselected],
            ['selected', selected],
          ] as const) {
            if (!g) continue;
            expect
              .soft(
                g.contract,
                `${tag} ${state}: [data-planner-scroller]/[data-planner-content] missing (emptyPx is the heuristic fallback)`,
              )
              .toBe(true);
            expect
              .soft(
                g.emptyPx,
                `${tag} ${state}: ${g.emptyPx.toFixed(1)}px empty below the last drawn content (view ${g.contentBottom.toFixed(0)}, dock rows ${g.dockContentBottom?.toFixed(0) ?? 'none drawn'})`,
              )
              .toBeLessThanOrEqual(UX_EMPTY_PX_MAX);
            if (view === 'month') {
              expect
                .soft(g.dockCount, `${tag} ${state}: the attention dock renders in month`)
                .toBe(0);
            }
            expect
              .soft(
                g.viewportGapPx,
                `${tag} ${state}: the view region stops ${g.viewportGapPx.toFixed(1)}px above the screen's foot`,
              )
              .toBeLessThanOrEqual(24);
            expect
              .soft(g.scrolledAncestors, `${tag} ${state}: the workspace column is scrolled`)
              .toEqual([]);
            expect
              .soft(
                g.togglesInViewport,
                `${tag} ${state}: the Week/Month/List toggle (${g.togglesFound} found) is off screen`,
              )
              .toBe(true);
            // A dock that has room to unfold draws its header; with room for a row, a row.
            // Under 2.75rem it folds away entirely, which the empty-px gate already prices.
            const rem = 14.5;
            if (g.dockCount > 0 && (g.dockHeight ?? 0) >= 2.75 * rem) {
              expect
                .soft(g.dockHeadersDrawn, `${tag} ${state}: an unfolded dock draws no header`)
                .toBeGreaterThanOrEqual(1);
              if ((g.dockHeight ?? 0) >= 6 * rem) {
                expect
                  .soft(
                    g.dockItemsDrawn,
                    `${tag} ${state}: a ${g.dockHeight?.toFixed(0)}px dock draws no item`,
                  )
                  .toBeGreaterThanOrEqual(1);
              }
            }
            if (g.insight !== null && g.attentionHeading !== null) {
              expect
                .soft(
                  g.insight,
                  `${tag} ${state}: the rail insight is not the dock's attention heading`,
                )
                .toBe(g.attentionHeading.replace(/^Needs attention · /, ''));
            }
          }
          if (view === 'week' && count === 5 && viewport.width === 1440) {
            expect
              .soft(
                unselected.scroller.scrollHeight,
                `${tag}: the week overflows vertically (${unselected.scroller.scrollHeight} > ${unselected.scroller.clientHeight})`,
              )
              .toBeLessThanOrEqual(unselected.scroller.clientHeight + 1);
          }

          // U1 — the calendar reflows beside the preview (3 and 5 platforms).
          expect(selected, `${tag}: no view region measured with the preview open`).not.toBeNull();
          if (count >= 3 && selected) {
            expect.soft(selection.sheets, `${tag}: a sheet opened on a wide viewport`).toBe(0);
            expect.soft(selection.preview, `${tag}: no #planner-preview box`).not.toBeNull();
            if (selection.preview) {
              expect
                .soft(
                  selection.preview.x,
                  `${tag}: the preview (left ${selection.preview.x}) overlaps the calendar (right ${selected.region.x + selected.region.width})`,
                )
                .toBeGreaterThanOrEqual(selected.region.x + selected.region.width - 1);
              const shrink = unselected.region.width - selected.region.width;
              const expectedShrink = selection.preview.width + (selection.handle?.width ?? 0);
              expect
                .soft(
                  Math.abs(shrink - expectedShrink),
                  `${tag}: the calendar shrank ${shrink.toFixed(1)}px for a ${expectedShrink.toFixed(1)}px preview + handle`,
                )
                .toBeLessThanOrEqual(16);
            }
            if (view === 'week') {
              expect
                .soft(
                  selected.scroller.scrollWidth,
                  `${tag}: the week scrolls sideways beside the preview (${selected.scroller.scrollWidth} > ${selected.scroller.clientWidth})`,
                )
                .toBeLessThanOrEqual(selected.scroller.clientWidth + 1);
              expect
                .soft(selection.cards.length, `${tag}: no week cards measured`)
                .toBeGreaterThan(0);
              for (const time of selection.cardTimes) {
                expect
                  .soft(
                    time.scrollWidth,
                    `${tag}: card time "${time.text}" is cut off (${time.scrollWidth} > ${time.clientWidth})`,
                  )
                  .toBeLessThanOrEqual(time.clientWidth + 1);
              }
              expect
                .soft(selection.cardTimes.length, `${tag}: no [data-card-time] measured`)
                .toBeGreaterThan(0);
              for (const card of selection.cards) {
                expect
                  .soft(
                    card.scrollHeight,
                    `${tag}: card ${card.id} clips its content (${card.scrollHeight} > ${card.clientHeight})`,
                  )
                  .toBeLessThanOrEqual(card.clientHeight + 1);
                if (card.title === null) continue;
                expect
                  .soft(
                    card.titleLines ?? 99,
                    `${tag}: card ${card.id} title runs ${card.titleLines ?? 'unmeasurable'} lines`,
                  )
                  .toBeLessThanOrEqual(2);
              }
            }
            if (chipBox) {
              const v = selected.scroller.visible;
              expect
                .soft(
                  chipBox.x >= v.left - 1 &&
                    chipBox.y >= v.top - 1 &&
                    chipBox.x + chipBox.width <= v.right + 1 &&
                    chipBox.y + chipBox.height <= v.bottom + 1,
                  `${tag}: the selected chip ${JSON.stringify(chipBox)} is outside the scroller's visible rect ${JSON.stringify(v)}`,
                )
                .toBe(true);
            }
            expect.soft(selection.headerTitle, `${tag}: no preview header title`).not.toBeNull();
            if (selection.headerTitle) {
              expect
                .soft(
                  selection.headerTitle.scrollWidth,
                  `${tag}: the preview title "${selection.headerTitle.text}" is clipped`,
                )
                .toBeLessThanOrEqual(selection.headerTitle.clientWidth + 1);
              expect
                .soft(
                  selection.headerTitle.overlapsCollapse,
                  `${tag}: the collapse chevron covers the preview title "${selection.headerTitle.text}"`,
                )
                .toBe(false);
            }
          }

          await uxClosePreview(page);
        }
      }
    });
  }

  // ---- U2: the dock's Unscheduled row is a drag source onto the week ----
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test("U2 dock drag: an unscheduled draft dragged onto another platform's week cell persists its day and platform", async ({}, testInfo) => {
    const record = uxRecorder(testInfo.title);
    const supabase = admin();
    const dataset = uxPlatformDataset(3);
    // The undated draft is a Facebook draft dropped on ANOTHER platform's row: a same-platform
    // drop would make the persisted-platform assertion true by construction.
    // A FUTURE free cell: dropped on a past day, the backend keeps slot_data.dayId but pushes
    // scheduled_date to ~now + 5 min. Only when the week has no future free cell (late Sunday)
    // does the drop land in the past, and then the day is read from slot_data instead.
    const week = uxWeekDayIds();
    const isFree = (platform: UxPlatform, dayId: string) =>
      !dataset.some((draft) => draft.platform === platform && draft.dayId === dayId);
    const cells = [...week.slice(uxTodayIndex() + 1), ...week].flatMap((dayId) =>
      UX_PLATFORM_SETS[3]
        .filter((platform) => platform !== 'facebook')
        .map((platform) => ({ dayId, platform })),
    );
    const target = cells.find((cell) => isFree(cell.platform, cell.dayId));
    if (!target) throw new Error('no free cell this week');
    const targetDay = target.dayId;
    const targetIsFuture = week.indexOf(targetDay) > uxTodayIndex();
    const loose: UxDraft = {
      id: `${UX_PREFIX}unscheduled`,
      platform: 'facebook',
      dayId: null,
      title: 'PLUX Unscheduled · drag me onto the week',
      marker: 'PLUXCAP-unscheduled',
    };
    await seedUxDrafts(supabase, [...dataset.map((draft) => uxDraftRow(draft)), uxDraftRow(loose)]);

    await page.setViewportSize(UX_WIDE[1]);
    await uxOpenPlanner(page, 'week', dataset[0]?.title ?? '');
    await expect(
      uxRegion(page).locator('[data-slot="skeleton"]:visible'),
      'the planner is still loading',
    ).toHaveCount(0, { timeout: 30_000 });
    const item = page
      .locator(
        `[data-testid="planner-attention-dock"] [data-dock-item][data-dock-draft-id="${loose.id}"] button`,
      )
      .first();
    await expect(item, 'the unscheduled draft is not a dock item').toBeVisible({ timeout: 30_000 });
    const targetCell = `planner-cell::${targetDay}::${target.platform}`;
    const cell = uxRegion(page).locator(`[data-planner-cell="${targetCell}"]`).first();
    await uxAwaitNoOverlay(page);
    await cell.scrollIntoViewIfNeeded();
    // Unscheduled is the LAST attention group: centre its row inside the attention section,
    // which is the dock's own overflow-y scroller (a generic scrollIntoView can stop short).
    await item.evaluate((el) => {
      const scroller = el.closest('[data-dock-section="attention"]');
      if (!(scroller instanceof HTMLElement)) return;
      const row = el.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      scroller.scrollTop += row.top + row.height / 2 - (box.top + scroller.clientHeight / 2);
    });
    await uxSettle(page);
    const from = await item.boundingBox();
    if (!from) throw new Error('the dock row has no box');
    await uxShot(page, 'dock-drag-before');

    // A real pointer drag through dnd-kit: past the 8px activation distance, then in steps. The
    // cell is measured again right before the press, after anything above it has settled.
    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height / 2;
    // The press must land ON the row: a row clipped by the dock's own overflow is drawn but
    // cannot be grabbed, and a drag that never starts would read as a failed drop.
    const pressHit = await item.evaluate(
      (el, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return {
          onRow: Boolean(hit && el.contains(hit)),
          hit: hit?.outerHTML.slice(0, 140) ?? null,
        };
      },
      { x: fromX, y: fromY },
    );
    record({
      pressPoint: { x: fromX, y: fromY },
      viewport: page.viewportSize(),
      row: from,
      attentionSection: await page
        .locator('[data-testid="planner-attention-dock"] [data-dock-section="attention"]')
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            y: r.y,
            height: r.height,
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
          };
        })
        .catch(() => null),
      pressHit,
    });
    expect(pressHit.onRow, `the dock row's centre is covered by ${pressHit.hit}`).toBe(true);
    await page.mouse.move(fromX, fromY);
    const to = await cell.boundingBox();
    if (!to) throw new Error('the target cell has no box');
    await page.mouse.down();
    await page.mouse.move(fromX + 12, fromY - 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 24 });
    await page.waitForTimeout(200);
    // Where the target is at the moment of release: a drag can scroll or reflow the grid.
    const atRelease = {
      cell: await cell.boundingBox(),
      scrollTop: await uxRegion(page)
        .locator('[data-planner-scroller]')
        .first()
        .evaluate((el) => el.scrollTop)
        .catch(() => null),
      over: await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-planner-cell]')
            ?.getAttribute('data-planner-cell') ?? null,
        { x: to.x + to.width / 2, y: to.y + to.height / 2 },
      ),
    };
    await page.mouse.up();
    await parkPointer(page);

    // Where the card actually renders: the cell that holds it, or nowhere.
    const renderedIn = async () =>
      page.evaluate((id) => {
        const card = Array.from(document.querySelectorAll(`[data-draft-id="${id}"]`)).find(
          (el) => el.getClientRects().length > 0,
        );
        return card?.closest('[data-planner-cell]')?.getAttribute('data-planner-cell') ?? null;
      }, loose.id);
    let landedIn: string | null = null;
    await expect
      .poll(
        async () => {
          landedIn = await renderedIn();
          return landedIn;
        },
        { timeout: 20_000, message: 'the dropped draft does not render in the target cell' },
      )
      .toBe(targetCell)
      .catch(() => {});
    expect.soft(landedIn, `the dropped draft renders in ${landedIn ?? 'no cell'}`).toBe(targetCell);

    const dayOf = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: brandTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(iso));
    let persisted: {
      platform: string | null;
      scheduledDate: string | null;
      slotDayId: string | null;
    } | null = null;
    const readBack = async () => {
      const { data } = await uxSchema(supabase, 'organic')
        .from('organic_calendar_drafts')
        .select('platform, scheduled_date, slot_data')
        .eq('brand_id', BRAND_ID)
        .eq('client_key', loose.id)
        .maybeSingle();
      const row = (data ?? null) as {
        platform: string | null;
        scheduled_date: string | null;
        slot_data: { dayId?: string } | null;
      } | null;
      persisted = {
        platform: row?.platform ?? null,
        scheduledDate: row?.scheduled_date ?? null,
        slotDayId: row?.slot_data?.dayId ?? null,
      };
      return persisted;
    };
    try {
      await expect
        .poll(
          async () => {
            const row = await readBack();
            if (!row.scheduledDate) return 'scheduled_date still null';
            if (row.slotDayId !== targetDay) return `slot_data.dayId ${row.slotDayId}`;
            if (targetIsFuture && dayOf(row.scheduledDate) !== targetDay) {
              return `scheduled_date day ${dayOf(row.scheduledDate)}`;
            }
            return targetDay;
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] },
        )
        .toBe(targetDay);
      await expect
        .poll(async () => (await readBack()).platform, {
          timeout: 15_000,
          message: `the drop moved the draft onto the ${target.platform} row but the persisted platform stayed`,
        })
        .toBe(target.platform);
    } finally {
      await uxShot(page, 'dock-drag-after');
      record({ target, targetIsFuture, landedIn, persisted, from, to, atRelease });
    }
  });

  // ---- U2: the dock's other halves — Overdue, the rail's sentence, the 4-week lookahead ----
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('U2 dock: an overdue draft is listed, the rail says the dock heading, a lookahead tile creates a post', async ({}, testInfo) => {
    const record = uxRecorder(testInfo.title);
    const supabase = admin();
    const dataset = uxPlatformDataset(3);
    const overdue: UxDraft = {
      id: `${UX_PREFIX}overdue`,
      platform: 'facebook',
      dayId: dayIdOffsetFromToday(-8),
      title: 'PLUX Overdue · this was due last week',
      marker: 'PLUXCAP-overdue',
    };
    await seedUxDrafts(supabase, [
      ...dataset.map((draft) => uxDraftRow(draft)),
      uxDraftRow(overdue),
    ]);
    await page.setViewportSize(UX_WIDE[1]);
    await uxOpenPlanner(page, 'week', dataset[0]?.title ?? '');
    const dock = page.locator('[data-testid="planner-attention-dock"]').first();

    await expect
      .soft(
        dock.locator(
          `ul[aria-label="Overdue"] [data-dock-item][data-dock-draft-id="${overdue.id}"]`,
        ),
        'the past-dated draft is not in an Overdue group',
      )
      .toHaveCount(1, { timeout: 20_000 });
    const heading =
      (await dock.locator('[data-dock-section="attention"] h2').first().textContent()) ?? '';
    const insight =
      (await page.locator('[aria-label="Planning insight"]:visible').first().textContent()) ?? '';
    expect
      .soft(insight.trim(), `the rail insight is not the dock heading "${heading}"`)
      .toBe(heading.trim().replace(/^Needs attention · /, ''));
    const lookaheadHeading =
      (await dock.locator('[data-dock-section="lookahead"] h2').first().textContent()) ?? '';
    expect.soft(lookaheadHeading.trim()).toMatch(/^Next 4 weeks · \d+ open days?$/);

    const tiles = dock.locator(
      '[data-dock-section="lookahead"] button[data-dock-item][data-dock-day]',
    );
    await expect.soft(tiles, 'the lookahead is not 28 day tiles').toHaveCount(28);
    const today = dayIdOffsetFromToday(0);
    await expect
      .soft(dock.locator(`[data-dock-day="${today}"]`), 'today is not aria-current="date"')
      .toHaveAttribute('aria-current', 'date');
    const pastDay = uxWeekDayIds().find((dayId) => dayId < today);
    if (pastDay) {
      await expect
        .soft(dock.locator(`[data-dock-day="${pastDay}"]`), `${pastDay} is past and not disabled`)
        .toBeDisabled();
    }

    // A tile click writes a REAL manual draft that carries no bench prefix. It is matched
    // exactly — brand, the bench owner, created after this point, the tile's day, the title and
    // format the tile creates — so a concurrent shell's row is never touched, and deleted by id
    // whatever happens next.
    const tileDay = dayIdOffsetFromToday(7);
    const startedAt = new Date(Date.now() - 2_000).toISOString();
    const tile = dock.locator(`[data-dock-day="${tileDay}"]`).first();
    const created: string[] = [];
    // `New <Platform> post` on the first platform the tile lists as open.
    let expectedTitle: string | null = null;
    const findCreated = async () => {
      if (!expectedTitle) return [];
      const { data } = await uxSchema(supabase, 'organic')
        .from('organic_calendar_drafts')
        .select('id, client_key, slot_data')
        .eq('brand_id', BRAND_ID)
        .eq('user_id', OWNER_ID)
        .gte('created_at', startedAt);
      return (
        (data ?? []) as {
          id: string;
          client_key: string | null;
          slot_data: {
            dayId?: string;
            title?: string;
            draftSnapshot?: { format?: string; origin?: string };
          } | null;
        }[]
      )
        .filter(
          (row) =>
            (row.client_key ?? '').startsWith('draft-') &&
            row.slot_data?.dayId === tileDay &&
            row.slot_data?.title === expectedTitle &&
            // The field route rewrites the snapshot's format in the publisher's spelling (POST).
            row.slot_data?.draftSnapshot?.format?.toLowerCase() === 'post' &&
            row.slot_data?.draftSnapshot?.origin === 'manual',
        )
        .map((row) => row.id);
    };
    try {
      await expect(tile, `no lookahead tile for ${tileDay}`).toBeVisible({ timeout: 20_000 });
      const label = (await tile.getAttribute('aria-label')) ?? '';
      expect.soft(label, 'the tile label').toMatch(/^Plan a post for .+ · \d+ planned · open: /);
      const firstOpen = /open: ([^,]+)/.exec(label)?.[1]?.trim().toLowerCase() ?? '';
      expect(firstOpen, `the tile for ${tileDay} has no open platform`).not.toBe('none');
      expectedTitle = `New ${firstOpen.charAt(0).toUpperCase()}${firstOpen.slice(1)} post`;
      await tile.click();
      await expect(uxDraftPreview(page), 'the tile did not open the new post').toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(
          async () => {
            created.splice(0, created.length, ...(await findCreated()));
            return created.length;
          },
          { timeout: 30_000, message: `the tile's post was never written for ${tileDay}` },
        )
        .toBeGreaterThanOrEqual(1);
      await uxShot(page, 'dock-lookahead-created');
    } finally {
      await uxClosePreview(page).catch(() => {});
      const leftovers = [...new Set([...created, ...(await findCreated())])];
      if (leftovers.length > 0) {
        await uxSchema(supabase, 'organic')
          .from('organic_calendar_drafts')
          .delete()
          .in('id', leftovers)
          .throwOnError();
      }
      record({ heading, insight, lookaheadHeading, tileDay, expectedTitle, created: leftovers });
    }
  });

  // ---- U2: keyboard moves, a pick-up dropped in place, and a refused cross-platform drop ----
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('U2 keyboard drag: Space-Arrow-Space moves a card a day; a dock row dropped in place writes nothing; a Story on Facebook is refused', async ({}, testInfo) => {
    const record = uxRecorder(testInfo.title);
    const supabase = admin();
    const dataset = uxPlatformDataset(3);
    const week = uxWeekDayIds();
    const busy = (platform: UxPlatform, dayId: string) =>
      dataset.some((draft) => draft.platform === platform && draft.dayId === dayId);
    const storyDay =
      week.find((dayId) => !busy('instagram', dayId) && !busy('facebook', dayId)) ??
      week.find((dayId) => !busy('instagram', dayId));
    if (!storyDay) throw new Error('no free Instagram day for the Story');
    const story: UxDraft = {
      id: `${UX_PREFIX}story`,
      platform: 'instagram',
      dayId: storyDay,
      title: 'PLUX Story · stories post to Instagram only',
      marker: 'PLUXCAP-story',
    };
    const loose: UxDraft = {
      id: `${UX_PREFIX}unscheduled`,
      platform: 'facebook',
      dayId: null,
      title: 'PLUX Unscheduled · picked up and put back',
      marker: 'PLUXCAP-unscheduled',
    };
    // A card whose next day, same row, is free and still this week.
    const mover = dataset.find((draft) => {
      const index = week.indexOf(draft.dayId ?? '');
      const next = week[index + 1];
      return (
        index >= 0 &&
        next !== undefined &&
        !busy(draft.platform, next) &&
        !(draft.platform === 'instagram' && next === storyDay)
      );
    });
    if (!mover?.dayId) throw new Error('no card with a free next day this week');
    const moverNext = week[week.indexOf(mover.dayId) + 1];
    await seedUxDrafts(supabase, [
      ...dataset.map((draft) => uxDraftRow(draft)),
      uxDraftRow(story, { format: 'Story' }),
      uxDraftRow(loose),
    ]);
    const readRow = async (clientKey: string) => {
      const { data } = await uxSchema(supabase, 'organic')
        .from('organic_calendar_drafts')
        .select('platform, scheduled_date, updated_at, slot_data')
        .eq('brand_id', BRAND_ID)
        .eq('client_key', clientKey)
        .maybeSingle();
      return data as {
        platform: string | null;
        scheduled_date: string | null;
        updated_at: string;
        slot_data: { dayId?: string } | null;
      } | null;
    };
    const steps: Record<string, unknown> = { mover: mover.id, moverNext, storyDay };
    // The first Space must actually pick the draft up: the focused control reports
    // data-dragging, or dnd-kit's live region announces "Picked up <title>".
    const pickedUp = (title: string) =>
      expect
        .poll(
          () =>
            page.evaluate(
              (name) =>
                document.activeElement?.getAttribute('data-dragging') === 'true' ||
                Array.from(document.querySelectorAll('[id^="DndLiveRegion"]')).some((el) =>
                  (el.textContent ?? '').startsWith(`Picked up ${name}`),
                ),
              title,
            ),
          { timeout: 3_000 },
        )
        .toBe(true)
        .then(() => true)
        .catch(() => false);

    await page.setViewportSize(UX_WIDE[1]);
    await uxOpenPlanner(page, 'week', dataset[0]?.title ?? '');
    await expect(uxRegion(page).locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
      timeout: 30_000,
    });
    try {
      // (a) Space picks the card up, ArrowRight moves it one cell, Space drops it.
      const card = uxRegion(page).locator(`[data-draft-id="${mover.id}"]`).first();
      // Focus is re-checked right before the key: a late re-render can replace the card's node
      // and drop focus to <body>, where Space picks nothing up.
      await expect
        .poll(
          async () => {
            await card.focus();
            return card.evaluate((el) => el === document.activeElement);
          },
          { timeout: 10_000, message: 'the week card would not keep focus' },
        )
        .toBe(true);
      await page.keyboard.press('Space');
      steps.moverPickedUp = await pickedUp(mover.title);
      expect.soft(steps.moverPickedUp, 'Space did not pick the week card up').toBe(true);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
      await page.keyboard.press('Space');
      await expect
        .poll(async () => (await readRow(mover.id))?.slot_data?.dayId ?? null, {
          timeout: 20_000,
        })
        .toBe(moverNext)
        .catch(() => {});
      const moved = await readRow(mover.id);
      steps.keyboardMove = moved;
      expect
        .soft(
          moved?.slot_data?.dayId,
          `the keyboard move did not persist ${mover.id} onto ${moverNext}`,
        )
        .toBe(moverNext);
      await uxClosePreview(page).catch(() => {});

      // (b) A dock row picked up and dropped where it is writes nothing.
      const before = await readRow(loose.id);
      const dockRow = page
        .locator(`[data-testid="planner-attention-dock"] [data-dock-draft-id="${loose.id}"] button`)
        .first();
      await expect
        .poll(
          async () => {
            await dockRow.focus();
            return dockRow.evaluate((el) => el === document.activeElement);
          },
          { timeout: 10_000, message: 'the dock row would not keep focus' },
        )
        .toBe(true);
      await page.keyboard.press('Space');
      steps.dockPickedUp = await pickedUp(loose.title);
      expect.soft(steps.dockPickedUp, 'Space did not pick the dock row up').toBe(true);
      await page.keyboard.press('Space');
      await page.waitForTimeout(2_000);
      const after = await readRow(loose.id);
      steps.dockInPlace = { before, after };
      expect
        .soft(after?.updated_at, 'a dock row dropped in place wrote to its row')
        .toBe(before?.updated_at);
      expect
        .soft(after?.scheduled_date ?? null, 'a dock row dropped in place got a date')
        .toBeNull();
      await uxClosePreview(page).catch(() => {});

      // (c) A Story dropped on the Facebook row is refused, with a toast, and stays put.
      const storyCard = uxRegion(page).locator(`[data-draft-id="${story.id}"]`).first();
      const facebookCell = uxRegion(page)
        .locator(`[data-planner-cell="planner-cell::${storyDay}::facebook"]`)
        .first();
      await uxAwaitNoOverlay(page);
      await facebookCell.scrollIntoViewIfNeeded();
      await storyCard.scrollIntoViewIfNeeded();
      const from = await storyCard.boundingBox();
      if (!from) throw new Error('the Story card has no box');
      const fromX = from.x + from.width / 2;
      const fromY = from.y + from.height / 2;
      const storyHit = await storyCard.evaluate(
        (el, point) => {
          const hit = document.elementFromPoint(point.x, point.y);
          return {
            onCard: Boolean(hit && el.contains(hit)),
            hit: hit?.outerHTML.slice(0, 140) ?? null,
          };
        },
        { x: fromX, y: fromY },
      );
      steps.storyPress = { point: { x: fromX, y: fromY }, viewport: page.viewportSize(), storyHit };
      expect(storyHit.onCard, `the Story card's centre is covered by ${storyHit.hit}`).toBe(true);
      await page.mouse.move(fromX, fromY);
      await page.mouse.down();
      await page.mouse.move(fromX + 12, fromY + 12, { steps: 4 });
      steps.storyPickedUp = await pickedUp(story.title);
      expect.soft(steps.storyPickedUp, 'the pointer did not pick the Story up').toBe(true);
      // Re-measured mid-drag: the target is wherever the cell is NOW.
      const to = await facebookCell.boundingBox();
      if (!to) throw new Error('the Facebook cell has no box');
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 24 });
      await expect
        .poll(() => uxLiveRegion(page), { timeout: 5_000 })
        .toContain(`${story.title} is over`)
        .catch(() => {});
      steps.storyOver = await uxLiveRegion(page);
      expect
        .soft(String(steps.storyOver), 'the Story was not over the Facebook cell at release')
        .toContain('· Facebook');
      await page.mouse.up();
      await parkPointer(page);
      steps.storyDropAnnounced = await uxLiveRegion(page);
      await expect
        .soft(page.getByText('Stories only post to Instagram', { exact: true }), 'no refusal toast')
        .toBeVisible({ timeout: 10_000 });
      await expect
        .soft(
          page.getByText(`"${story.title}" stays where it was.`),
          'the toast does not name the Story',
        )
        .toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_500);
      const storyRow = await readRow(story.id);
      steps.storyAfterRefusal = storyRow;
      expect.soft(storyRow?.platform, 'the refused Story changed platform').toBe('instagram');
      expect.soft(storyRow?.slot_data?.dayId, 'the refused Story changed day').toBe(storyDay);
      await uxShot(page, 'drag-story-refused');
    } finally {
      record(steps);
    }
  });

  // ---- U3: per-platform frames, fitted, at every wide viewport ----
  for (const viewport of UX_WIDE) {
    // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
    test(`U3 frames at ${viewport.width}x${viewport.height}: every platform × format gets its own fitted frame`, async ({}, testInfo) => {
      const record = uxRecorder(testInfo.title);
      const supabase = admin();
      const media = await uxEnsureMedia(page, supabase);
      const today = dayIdOffsetFromToday(0);
      const drafts = UX_FRAME_FIXTURES.map((fixture, index) => ({
        fixture,
        draft: {
          id: `${UX_PREFIX}frame-${fixture.key}`,
          platform: fixture.platform,
          dayId: today,
          title: `PLUX Frame · ${fixture.label}`,
          marker: `PLUXCAP-frame-${fixture.key}`,
        } satisfies UxDraft,
        timeLabel: `${(index % 12) + 1}:00 ${index < 12 ? 'AM' : 'PM'}`,
      }));
      await seedUxDrafts(
        supabase,
        drafts.map(({ fixture, draft, timeLabel }) =>
          uxDraftRow(draft, {
            format: fixture.format,
            timeLabel,
            media: fixture.media.map((name) => {
              const item = media.get(name);
              if (!item) throw new Error(`media ${name} was never made`);
              return item;
            }),
          }),
        ),
      );

      await page.setViewportSize(viewport);
      await uxOpenPlanner(page, 'list', drafts[0]?.draft.title ?? '');
      let framesSeen = false;
      for (const { fixture, draft } of drafts) {
        const label = `${viewport.width}x${viewport.height} ${fixture.label}`;
        await uxClosePreview(page);
        const { chip } = await uxChip(page, draft);
        await chip.scrollIntoViewIfNeeded();
        await chip.click();
        const preview = uxDraftPreview(page);
        await expect(preview, `${label}: no preview opened`).toBeVisible({ timeout: 60_000 });
        // A story overlays no caption, so "this draft is showing" is the chip's pressed state
        // or, before the contract lands on a surface, the caption marker in the preview.
        await expect
          .poll(
            async () =>
              (await chip.getAttribute('aria-pressed').catch(() => null)) === 'true' ||
              ((await preview.textContent().catch(() => '')) ?? '').includes(draft.marker),
            { timeout: 30_000, message: `${label}: the preview never showed this draft` },
          )
          .toBe(true);
        await parkPointer(page);
        const reading = await uxReadFrame(page, '#planner-preview', framesSeen ? 15_000 : 6_000);
        framesSeen ||= reading.frame !== null;
        uxAssertFrame(reading, {
          label,
          platform: fixture.platform,
          kind: fixture.kind,
          aspect: fixture.aspect,
          needsMedia: fixture.needsMedia,
          letterboxed: fixture.letterboxed,
        });

        // Text over full-screen media must stay neutral-50 in the LIGHT theme too: globals.css
        // remaps `text-white` to navy there, which is dark on dark.
        let lightColors: Record<string, string | null> | null = null;
        if ((fixture.kind === 'vertical' || fixture.kind === 'story') && viewport.width === 1440) {
          lightColors = await page.evaluate(async (marker) => {
            const html = document.documentElement;
            const saved = { theme: html.getAttribute('data-theme'), className: html.className };
            html.setAttribute('data-theme', 'light');
            html.classList.remove('dark');
            html.classList.add('light');
            await new Promise((done) => setTimeout(done, 400));
            // Chrome reports Tailwind 4's palette in lab()/oklch(); a 1px canvas fill turns any
            // CSS colour into the sRGB bytes the screen actually gets.
            const srgb = (el: Element | null | undefined): string | null => {
              if (!el) return null;
              const canvas = document.createElement('canvas');
              canvas.width = 1;
              canvas.height = 1;
              const ctx = canvas.getContext('2d');
              if (!ctx) return null;
              ctx.fillStyle = getComputedStyle(el).color;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
              return `rgb(${r}, ${g}, ${b})`;
            };
            const ownText = (el: Element) =>
              Array.from(el.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent ?? '')
                .join('')
                .trim();
            const frame = document.querySelector('#planner-preview [data-preview-frame]');
            const all = frame ? Array.from(frame.querySelectorAll('*')) : [];
            const colors: Record<string, string | null> = {};
            if (frame?.getAttribute('data-frame-kind') === 'vertical') {
              colors.caption = srgb(all.filter((el) => ownText(el).includes(marker)).pop());
            } else {
              // The story header is the text row under the progress bar; the avatar is a
              // filled chip with its own dark-on-light text, so filled boxes are skipped.
              const header = frame?.querySelector('[data-story-progress]')?.nextElementSibling;
              const onFill = (el: Element) => {
                for (
                  let node: Element | null = el;
                  node && node !== header;
                  node = node.parentElement
                ) {
                  if (getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
                }
                return false;
              };
              const headerText = header
                ? Array.from(header.querySelectorAll('*')).find((el) => ownText(el) && !onFill(el))
                : null;
              colors.storyHeader = srgb(headerText);
              // No 'Send message' bar to read: a draft never draws the reply bar it cannot send
              // (fidelity item 11), which uxAssertFrame asserts.
            }
            if (saved.theme === null) html.removeAttribute('data-theme');
            else html.setAttribute('data-theme', saved.theme);
            html.className = saved.className;
            return colors;
          }, draft.marker);
          for (const [part, color] of Object.entries(lightColors)) {
            const channels = (color ?? '').match(/\d+/g)?.map(Number) ?? [];
            expect
              .soft(
                channels.length === 3 && channels.every((channel) => channel >= 248),
                `${label}: the ${part} text in the light theme is ${color}, not neutral-50 (rgb 250, 250, 250)`,
              )
              .toBe(true);
          }
        }
        if (viewport.width === 1440) await uxShot(page, `frame-${fixture.key}`);
        record({
          fixture: fixture.key,
          viewport,
          expected: { kind: fixture.kind, aspect: fixture.aspect },
          reading,
          lightColors,
        });
      }
      await uxClosePreview(page);
    });
  }

  // ---- U4: a published post previews in the frame a draft of its platform and format gets ----
  for (const view of ['month', 'week'] as const) {
    // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
    test(`U4 ${view}: published posts in production shapes open in their platform frame`, async ({}, testInfo) => {
      const record = uxRecorder(testInfo.title);
      const supabase = admin();
      const media = await uxEnsureMedia(page, supabase);
      await seedUxDrafts(supabase, []);
      // One post per day, so no month cell folds one behind "+N more".
      const week = uxWeekDayIds();
      const seeded: typeof UX_POSTED_FIXTURES = [];
      const refused: Array<{ key: string; code: string | undefined; message: string }> = [];
      for (const [index, fixture] of UX_POSTED_FIXTURES.entries()) {
        const dayId = week[(uxTodayIndex() + 7 - index) % 7];
        const { error } = await uxSchema(supabase, 'organic')
          .from('organic_published_posts')
          .insert(uxPostedRow(fixture, media, `${dayId}T12:00:00.000Z`));
        if (error) {
          refused.push({ key: fixture.key, code: error.code, message: error.message });
          console.log(
            `[U4 ${view}] ${fixture.key} NOT EXERCISED — insert refused: ${error.message}`,
          );
          continue;
        }
        seeded.push(fixture);
      }
      record({ refused });
      // Only the YouTube row may be refused, and only by the platform check (23514): any other
      // refusal is a broken fixture, not a known gap.
      expect(
        refused.map((refusal) => `${refusal.key}:${refusal.code}`),
        `unexpected published-post refusals: ${JSON.stringify(refused)}`,
      ).toEqual(['posted-yt-long:23514']);

      await page.setViewportSize(UX_WIDE[1]);
      await uxOpenPlanner(page, view, seeded[0]?.title ?? '');
      for (const fixture of seeded) {
        const label = `${view} posted ${fixture.key}`;
        await uxClosePreview(page);
        const postId = `published:${fixture.platform}:${UX_PREFIX}${fixture.key}`;
        const chip = uxRegion(page).locator(`button[data-post-id="${postId}"]:visible`).first();
        await expect(chip, `${label}: no button[data-post-id] chip`).toBeVisible({
          timeout: 30_000,
        });
        await chip.click();
        const preview = page.getByRole('complementary', { name: 'Published post preview' });
        await expect(preview, `${label}: no Published post preview`).toBeVisible({
          timeout: 60_000,
        });
        await expect(
          page.locator('[data-slot="popover-content"]:visible'),
          `${label}: a popover opened instead of (or as well as) the panel`,
        ).toHaveCount(0);
        await parkPointer(page);
        const reading = await uxReadFrame(page, '#planner-preview', 10_000);
        uxAssertFrame(reading, {
          label,
          platform: fixture.platform,
          kind: fixture.kind,
          aspect: fixture.aspect,
        });
        let video: { src: string; readyState: number } | null = null;
        if (fixture.paintsVideo) {
          // A video-only post paints its first frame: src ends #t=0.01 and the frame decodes.
          const frameVideo = preview.locator('[data-preview-frame] video').first();
          await expect
            .soft(frameVideo, `${label}: the frame renders no <video>`)
            .toHaveCount(1, { timeout: 30_000 });
          await expect
            .poll(
              async () =>
                frameVideo.evaluate((el) => (el as HTMLVideoElement).readyState).catch(() => -1),
              {
                timeout: 30_000,
                message: `${label}: the frame video never painted (readyState < 2)`,
              },
            )
            .toBeGreaterThanOrEqual(2)
            .catch(() => {});
          video = await frameVideo
            .evaluate((el) => ({
              src: (el as HTMLVideoElement).getAttribute('src') ?? '',
              readyState: (el as HTMLVideoElement).readyState,
            }))
            .catch(() => null);
          expect
            .soft(video?.src.endsWith('#t=0.01'), `${label}: video src ${video?.src.slice(-40)}`)
            .toBe(true);
          expect
            .soft(video?.readyState ?? -1, `${label}: video readyState`)
            .toBeGreaterThanOrEqual(2);
        }
        // FB 1:1 and LinkedIn 1.91 are also what a frame shows before anything loads, so the
        // aspect alone cannot prove the image arrived: it must have decoded.
        if (
          !fixture.paintsVideo &&
          (fixture.platform === 'facebook' || fixture.platform === 'linkedin')
        ) {
          const decoded = await expect
            .poll(
              () =>
                preview
                  .locator('[data-preview-frame] [data-frame-media] img')
                  .first()
                  .evaluate(
                    (el) =>
                      (el as HTMLImageElement).complete &&
                      (el as HTMLImageElement).naturalWidth > 0,
                  )
                  .catch(() => false),
              { timeout: 20_000 },
            )
            .toBe(true)
            .then(() => true)
            .catch(() => false);
          expect.soft(decoded, `${label}: the frame image never decoded`).toBe(true);
        }
        if (fixture.permalink) {
          await expect
            .soft(preview.getByRole('link', { name: /Open post/i }), `${label}: no Open post link`)
            .toBeVisible();
        }
        await uxShot(page, `posted-${view}-${fixture.key}`);
        record({ fixture: fixture.key, reading, video });
      }
      await uxClosePreview(page);
    });
  }

  // ---- U5: select → paint, and renders per selection ----
  for (const view of UX_VIEWS) {
    test(`U5 ${view}: select → paint p50 ≤ 100ms / p95 ≤ 200ms, capped renders and no mounts per selection`, async ({
      browser,
    }, testInfo) => {
      const record = uxRecorder(testInfo.title);
      const supabase = admin();
      const dataset = uxPlatformDataset(5);
      await seedUxDrafts(
        supabase,
        dataset.map((draft) => uxDraftRow(draft)),
      );
      // One published chip in range, so the posted chip's 0-render cap is over a mounted chip.
      const posted = UX_POSTED_FIXTURES[0];
      if (posted) {
        await uxSchema(supabase, 'organic')
          .from('organic_published_posts')
          .insert({
            platform_post_id: `${UX_PREFIX}u5-posted`,
            brand_id: BRAND_ID,
            platform: posted.platform,
            platform_account_id: `${UX_PREFIX}account`,
            post_type: posted.postType,
            caption: 'PLUXCAP-u5-posted A published chip that must not re-render',
            permalink: posted.permalink,
            published_at: `${dayIdOffsetFromToday(0)}T12:00:00.000Z`,
            content_snapshot: { title: 'PLUX U5 posted chip' },
          })
          .throwOnError();
      }
      const first = dataset[0];
      const second = dataset.find(
        (draft) => draft !== first && draft.dayId?.slice(0, 7) === first?.dayId?.slice(0, 7),
      );
      if (!first || !second) throw new Error('no two drafts in the same month');
      const gates = UX_RENDER_GATES[view];

      const probeContext = await browser.newContext({ viewport: UX_WIDE[1] });
      try {
        await probeContext.addCookies(cookies);
        await probeContext.addInitScript(uxRenderProbeInit);
        const probePage = await probeContext.newPage();
        await uxOpenPlanner(probePage, view, first.title);
        const hooked = await probePage.evaluate(
          () => (window as unknown as UxProbeWindow).__pluxProbe?.roots ?? 0,
        );
        expect(
          hooked,
          'the render probe never saw a React commit — the devtools hook was not picked up',
        ).toBeGreaterThan(0);

        type Sample = {
          index: number;
          target: string;
          ms: number;
          counts: Record<string, number>;
          mounts: Record<string, number>;
        };
        const select = async (index: number, target: UxDraft): Promise<Sample> => {
          await parkPointer(probePage);
          await uxWaitQuiet(probePage);
          const { chip, contract } = await uxChip(probePage, target);
          expect(
            contract,
            `${view}: no [data-draft-id="${target.id}"] chip — the gate would measure a fallback`,
          ).toBe(true);
          await chip.scrollIntoViewIfNeeded();
          await uxWaitQuiet(probePage);
          const alreadyShown = await probePage.evaluate(uxArmPaint, target.marker);
          expect
            .soft(alreadyShown, `${view}: ${target.id} was already showing when the timer armed`)
            .toBe(false);
          await chip.evaluate(uxDispatchClick);
          const ms = await probePage.evaluate(
            () => (window as unknown as UxProbeWindow).__pluxPaint ?? Promise.resolve(Number.NaN),
          );
          await probePage.waitForTimeout(500);
          const { counts, mounts } = await probePage.evaluate(() => {
            const probe = (window as unknown as UxProbeWindow).__pluxProbe;
            return { counts: { ...(probe?.counts ?? {}) }, mounts: { ...(probe?.mounts ?? {}) } };
          });
          return { index, target: target.id, ms, counts, mounts };
        };

        // Swap: the preview is open and the selection moves between two chips.
        const swaps: Sample[] = [];
        for (let index = 0; index < 9; index += 1) {
          swaps.push(await select(index, index % 2 === 0 ? first : second));
        }
        // Open from closed: the preview is shut before every click.
        const opens: Sample[] = [];
        for (let index = 0; index < 9; index += 1) {
          await uxClosePreview(probePage);
          opens.push(await select(index, index % 2 === 0 ? first : second));
        }
        const census = await probePage.evaluate(
          () => (window as unknown as UxProbeWindow).__pluxProbe?.census() ?? {},
        );
        await uxShot(probePage, `u5-${view}-selected`);

        // Typing in the open preview's caption: a batch of keystrokes may re-render the draft's
        // own cell or chip once, and never the dock's lookahead tiles.
        let typing: Record<string, unknown> | null = null;
        {
          const preview = probePage.getByRole('complementary', { name: 'Draft preview' });
          if (!(await preview.isVisible().catch(() => false))) {
            const { chip } = await uxChip(probePage, first);
            await chip.evaluate(uxDispatchClick);
          }
          await expect(preview, `${view}: no preview to type into`).toBeVisible({
            timeout: 30_000,
          });
          const editCaption = preview
            .getByRole('button', { name: /^(Edit|Add an?) (\w+ )?caption$/i })
            .first();
          // The preview's body is a lazy chunk: wait for the button, isVisible() would not.
          if (
            await editCaption
              .waitFor({ state: 'visible', timeout: 10_000 })
              .then(() => true)
              .catch(() => false)
          )
            await editCaption.click();
          const caption = preview.getByRole('textbox', { name: /caption/i }).first();
          await expect(caption, `${view}: no caption textbox`).toBeVisible({ timeout: 20_000 });
          await caption.evaluate((el) => {
            const field = el as HTMLTextAreaElement;
            field.focus();
            field.setSelectionRange(field.value.length, field.value.length);
          });
          await uxWaitQuiet(probePage);
          await probePage.evaluate(() => {
            const probe = (window as unknown as UxProbeWindow).__pluxProbe;
            if (probe) {
              probe.counts = {};
              probe.mounts = {};
              probe.keyed = {};
              probe.log = [];
            }
          });
          // The burst is only over once it is saved: wait for the field-edit PATCH it triggers.
          const saved = probePage
            .waitForResponse(
              (response) =>
                response.url().includes('/fields') && response.request().method() === 'PATCH',
              { timeout: 20_000 },
            )
            .then((response) => response.status())
            .catch(() => null);
          await probePage.keyboard.type('vwxyz', { delay: 40 });
          const savedStatus = await saved;
          await uxWaitQuiet(probePage, 800);
          const value = await caption.inputValue().catch(() => '');
          const { counts, keyed, log } = await probePage.evaluate(() => {
            const probe = (window as unknown as UxProbeWindow).__pluxProbe;
            return {
              counts: { ...(probe?.counts ?? {}) },
              keyed: JSON.parse(JSON.stringify(probe?.keyed ?? {})) as Record<
                string,
                Record<string, number>
              >,
              log: [...(probe?.log ?? [])],
            };
          });
          const gate = UX_TYPING_GATES[view];
          const perGate = gate.edited.map(({ name, key }) => {
            const editedKey = key(first);
            const byKey = keyed[name] ?? {};
            const own = byKey[editedKey] ?? 0;
            const others = Object.entries(byKey).filter(([k]) => k !== editedKey);
            return {
              name,
              editedKey,
              own,
              othersTotal: others.reduce((sum, [, n]) => sum + n, 0),
              others: Object.fromEntries(others.slice(0, 8)),
              // Which commits rendered the edited one (commit number from the probe).
              ownCommits: log
                .filter((entry) => entry.endsWith(`|${name}|${editedKey}`))
                .map((entry) => Number(entry.split('|')[0])),
            };
          });
          typing = {
            savedStatus,
            captionTail: value.slice(-12),
            perGate,
            zero: Object.fromEntries(gate.zero.map((name) => [name, counts[name] ?? 0])),
            counts,
          };
          expect.soft(savedStatus, `${view} typing: no /fields PATCH answered`).not.toBeNull();
          expect
            .soft(savedStatus ?? 0, `${view} typing: the /fields PATCH failed`)
            .toBeLessThan(400);
          expect
            .soft(value.endsWith('vwxyz'), `${view} typing: the caption ends "${value.slice(-12)}"`)
            .toBe(true);
          for (const entry of perGate) {
            expect
              .soft(
                entry.own,
                `${view} typing: the edited ${entry.name} (${entry.editedKey}) never re-rendered — the burst did not land`,
              )
              .toBeGreaterThanOrEqual(1);
            expect
              .soft(
                entry.own,
                `${view} typing: the edited ${entry.name} (${entry.editedKey}) rendered ${entry.own}× in commits ${entry.ownCommits.join(', ')}`,
              )
              .toBeLessThanOrEqual(2);
            expect
              .soft(
                entry.othersTotal,
                `${view} typing: ${entry.othersTotal} renders of OTHER ${entry.name}s ${JSON.stringify(entry.others)}`,
              )
              .toBe(0);
          }
          for (const name of gate.zero) {
            expect.soft(counts[name] ?? 0, `${view} typing: ${name} renders`).toBe(0);
          }
          await probePage.keyboard.press('Escape');
          await uxClosePreview(probePage).catch(() => {});
        }

        // Day focus: a click on an EMPTY stretch of a cell focuses its day, and only the days
        // leaving and entering focus may re-render.
        let dayFocus: Record<string, unknown> | null = null;
        const cellName = view === 'week' ? 'PlannerCell' : view === 'month' ? 'MonthDayCell' : null;
        if (cellName) {
          const busy = new Set(dataset.map((draft) => `${draft.dayId}::${draft.platform}`));
          busy.add(`${dayIdOffsetFromToday(0)}::instagram`);
          const today = dayIdOffsetFromToday(0);
          const cellId =
            view === 'week'
              ? uxWeekDayIds()
                  .flatMap((dayId) =>
                    UX_PLATFORM_SETS[5].map((platform) => `${dayId}::${platform}`),
                  )
                  .find((key) => !busy.has(key))
              : [8, -8, 9, -9, 10, -10, 11, -11, 12, -12, 13, -13, 14, -14]
                  .map((offset) => dayIdOffsetFromToday(offset))
                  .find((dayId) => dayId.slice(0, 7) === today.slice(0, 7));
          if (!cellId) throw new Error(`${view}: no empty cell to focus`);
          const cell = uxRegion(probePage)
            .locator(`[data-planner-cell="planner-cell::${cellId}"]`)
            .first();
          await cell.scrollIntoViewIfNeeded();
          // A point on the cell itself, not on a control inside it.
          const point = await cell.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const candidates = [
              [r.left + r.width / 2, r.bottom - 3],
              [r.left + 4, r.bottom - 3],
              [r.right - 4, r.bottom - 3],
              [r.left + 4, r.top + r.height / 2],
            ];
            for (const [x, y] of candidates) {
              const hit = document.elementFromPoint(x ?? 0, y ?? 0);
              if (hit && el.contains(hit) && !hit.closest('button, [role="button"], a, input')) {
                return { x: x ?? 0, y: y ?? 0 };
              }
            }
            return null;
          });
          expect(point, `${view}: no empty, non-control point inside ${cellId}`).not.toBeNull();
          if (point) {
            await parkPointer(probePage);
            await uxWaitQuiet(probePage);
            await probePage.evaluate(() => {
              const probe = (window as unknown as UxProbeWindow).__pluxProbe;
              if (probe) {
                probe.counts = {};
                probe.mounts = {};
              }
            });
            await probePage.mouse.click(point.x, point.y);
            await probePage.evaluate(
              () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
            );
            await probePage.waitForTimeout(300);
            const counts = await probePage.evaluate(() => ({
              ...((window as unknown as UxProbeWindow).__pluxProbe?.counts ?? {}),
            }));
            // Day focus is not a selection: the bound is the cells of the two days it touches
            // (the day leaving focus and the day entering it), one per platform row in week,
            // and never the whole grid.
            const renders = counts[cellName] ?? 0;
            const rows = view === 'week' ? (await uxPlatformRows(probePage)).length : 1;
            const mountedCells = census[cellName] ?? 0;
            const bound = 2 * rows;
            dayFocus = { cellId, point, renders, rows, bound, mountedCells, counts };
            expect
              .soft(
                renders,
                `${view}: focusing ${cellId} re-rendered no ${cellName} — the click missed`,
              )
              .toBeGreaterThanOrEqual(1);
            expect
              .soft(
                renders,
                `${view}: focusing ${cellId} re-rendered ${renders} ${cellName}s, over 2 days × ${rows} row(s)`,
              )
              .toBeLessThanOrEqual(bound);
            expect
              .soft(
                renders,
                `${view}: focusing ${cellId} re-rendered every one of the ${mountedCells} ${cellName}s`,
              )
              .toBeLessThan(mountedCells);
          }
        }

        const timesOf = (series: Sample[]) => series.slice(1).map((sample) => sample.ms);
        const summary = (series: Sample[]) => {
          const times = timesOf(series);
          return { p50: uxPercentile(times, 0.5), p95: uxPercentile(times, 0.95), times };
        };
        const swap = summary(swaps);
        const open = summary(opens);
        record({
          view,
          clickMethod: 'dispatched pointer sequence, no hover',
          census: Object.fromEntries(gates.map((gate) => [gate.name, census[gate.name] ?? 0])),
          swaps,
          opens,
          swap,
          open,
          dayFocus,
          typing,
        });
        console.log(
          `[U5 ${view}] swap p50 ${swap.p50.toFixed(1)} p95 ${swap.p95.toFixed(1)} · open p50 ${open.p50.toFixed(1)} p95 ${open.p95.toFixed(1)} ms`,
        );

        for (const gate of gates) {
          const mounted = census[gate.name] ?? 0;
          if (gate.required) {
            expect
              .soft(mounted, `${view}: no ${gate.name} is mounted — its cap would pass vacuously`)
              .toBeGreaterThanOrEqual(1);
          } else if (mounted === 0) {
            continue;
          }
          for (const [seriesName, series] of [
            ['swap', swaps],
            ['open', opens],
          ] as const) {
            for (const sample of series.slice(1)) {
              const tag = `${view} ${seriesName} ${sample.index}`;
              expect
                .soft(sample.counts[gate.name] ?? 0, `${tag}: ${gate.name} renders`)
                .toBeLessThanOrEqual(gate.cap);
              expect.soft(sample.mounts[gate.name] ?? 0, `${tag}: ${gate.name} mounts`).toBe(0);
            }
          }
        }
        // Moving the selection between two open drafts mounts nothing at all; opening from
        // closed legitimately mounts the preview, so only the gated names are held to 0 there.
        for (const sample of swaps.slice(1)) {
          expect
            .soft(Object.keys(sample.mounts), `${view} swap ${sample.index}: components mounted`)
            .toEqual([]);
        }
        for (const [series, name] of [
          [swap, 'swap'],
          [open, 'open-from-closed'],
        ] as const) {
          expect
            .soft(series.p50, `${view} ${name}: select→paint p50 over ${series.times.join(', ')}`)
            .toBeLessThanOrEqual(100);
          expect
            .soft(series.p95, `${view} ${name}: select→paint p95 over ${series.times.join(', ')}`)
            .toBeLessThanOrEqual(200);
        }
      } finally {
        await probeContext.close();
      }
    });
  }

  // ---- U6: narrow — the preview is a modal sheet and the grid does not move ----
  for (const viewport of UX_NARROW) {
    for (const view of UX_VIEWS) {
      // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
      test(`U6 ${viewport.width}x${viewport.height} ${view}: the preview is a modal sheet that leaves the grid alone`, async ({}, testInfo) => {
        const record = uxRecorder(testInfo.title);
        const supabase = admin();
        const dataset = uxPlatformDataset(5);
        await seedUxDrafts(
          supabase,
          dataset.map((draft) => uxDraftRow(draft)),
        );
        const target = dataset[0];
        if (!target) throw new Error('empty dataset');

        await page.setViewportSize(viewport);
        await uxOpenPlanner(page, view, target.title);
        const before = await uxSettledGeometry(page, view);
        // Phone width, before anything opens: the workflow stepper's four stages and its insight
        // note must not overprint each other, and the week's sticky platform rail must stay on
        // top of the cards that scroll under it.
        const stepper =
          viewport.width === 390
            ? await page.evaluate(() => {
                const nav = Array.from(
                  document.querySelectorAll('nav[aria-label="Content workflow"]'),
                ).find((el) => el.getClientRects().length > 0);
                if (!nav) return null;
                const parts = [
                  ...Array.from(nav.querySelectorAll('ol > li > span:first-child')),
                  ...Array.from(nav.querySelectorAll('[aria-label="Planning insight"]')),
                ];
                const boxes = parts.map((el) => {
                  const r = el.getBoundingClientRect();
                  return { x: r.x, y: r.y, width: r.width, height: r.height };
                });
                const overlaps: string[] = [];
                for (let i = 0; i < boxes.length; i += 1) {
                  for (let j = i + 1; j < boxes.length; j += 1) {
                    const a = boxes[i];
                    const b = boxes[j];
                    if (
                      a &&
                      b &&
                      a.x + a.width - 1 > b.x &&
                      b.x + b.width - 1 > a.x &&
                      a.y + a.height - 1 > b.y &&
                      b.y + b.height - 1 > a.y
                    ) {
                      overlaps.push(`${i}×${j}`);
                    }
                  }
                }
                return {
                  stages: nav.querySelectorAll('ol > li').length,
                  hasInsight: Boolean(nav.querySelector('[aria-label="Planning insight"]')),
                  boxes,
                  overlaps,
                };
              })
            : null;
        const railHit =
          viewport.width === 390 && view === 'week'
            ? await page.evaluate(
                () =>
                  new Promise<Record<string, unknown> | null>((done) => {
                    const region = Array.from(
                      document.querySelectorAll('[data-tour-id="organic-list-content"]'),
                    ).find((el) => el.getClientRects().length > 0);
                    const scroller = region?.querySelector('[data-planner-scroller="week"]');
                    const content = region?.querySelector('[data-planner-content="week"]');
                    // The platform rail cell: sticky to the LEFT (day headers stick to the top).
                    const rail = content
                      ? Array.from(content.children).find((el) => {
                          const style = getComputedStyle(el);
                          return (
                            el.hasAttribute('title') &&
                            style.position === 'sticky' &&
                            style.left === '0px'
                          );
                        })
                      : null;
                    if (!scroller || !rail) {
                      done(null);
                      return;
                    }
                    const start = scroller.scrollLeft;
                    scroller.scrollLeft = start + 200;
                    // Let scroll-snap settle before probing the stack.
                    setTimeout(
                      () =>
                        requestAnimationFrame(() => {
                          const r = rail.getBoundingClientRect();
                          const hit = document.elementFromPoint(
                            r.left + r.width / 2,
                            r.top + r.height / 2,
                          );
                          const result = {
                            scrolledBy: scroller.scrollLeft - start,
                            inside: Boolean(hit && rail.contains(hit)),
                            hit: hit?.outerHTML.slice(0, 120) ?? null,
                            stack: document
                              .elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
                              .slice(0, 4)
                              .map(
                                (el) =>
                                  `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 50)}`,
                              ),
                            rail: { x: r.x, y: r.y, width: r.width, height: r.height },
                            viewport: { width: window.innerWidth, height: window.innerHeight },
                          };
                          scroller.scrollLeft = start;
                          done(result);
                        }),
                      400,
                    );
                  }),
              )
            : null;
        await page.evaluate(() => {
          const w = window as unknown as UxProbeWindow;
          w.__pluxLongTasks = [];
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) w.__pluxLongTasks?.push(entry.duration);
          }).observe({ type: 'longtask' });
        });

        const { chip, contract } = await uxChip(page, target);
        await chip.scrollIntoViewIfNeeded();
        await chip.click();
        const sheet = page.locator('[data-slot="sheet-content"]:visible').first();
        await expect(sheet, 'no [data-slot="sheet-content"] opened below 64rem').toBeVisible({
          timeout: 30_000,
        });
        await expect
          .soft(sheet, 'the sheet is not named "Draft preview"')
          .toHaveAccessibleName(/Draft preview/);
        await expect
          .soft(sheet, 'the sheet is not aria-modal')
          .toHaveAttribute('aria-modal', 'true');
        await expect
          .soft(page.locator('[data-slot="sheet-overlay"]:visible'), 'the sheet has no scrim')
          .toHaveCount(1);
        await uxSettle(page);
        const open = await page.evaluate(uxGeometryProbe, view);
        await uxShot(page, `narrow-${viewport.width}x${viewport.height}-${view}-sheet`);

        await parkPointer(page);
        await page.keyboard.press('Escape');
        await expect(sheet, 'Escape did not close the sheet').toHaveCount(0, { timeout: 20_000 });
        await expect
          .soft(chip, 'focus did not return to the chip after Escape')
          .toBeFocused({ timeout: 5_000 });
        await uxSettle(page);
        const after = await page.evaluate(uxGeometryProbe, view);
        const longTasks = await page.evaluate(
          () => (window as unknown as UxProbeWindow).__pluxLongTasks ?? [],
        );
        // At phone width the page itself must not scroll sideways; the week does, inside its
        // own scroller, with cards still wide enough to read.
        const fit = await page.evaluate(() => {
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const region = Array.from(
            document.querySelectorAll('[data-tour-id="organic-list-content"]'),
          ).find((el) => el.getClientRects().length > 0);
          const cards = region
            ? Array.from(region.querySelectorAll('[data-draft-id]'))
                .filter((el) => el.getClientRects().length > 0)
                .map((el) => el.getBoundingClientRect().width)
            : [];
          return {
            rem,
            pageScrollWidth: document.scrollingElement?.scrollWidth ?? 0,
            innerWidth: window.innerWidth,
            narrowestCard: cards.length > 0 ? Math.min(...cards) : null,
          };
        });
        record({
          viewport,
          view,
          chipContract: contract,
          before,
          open,
          after,
          fit,
          stepper,
          railHit,
          longTasks,
        });
        if (viewport.width === 390 && view !== 'month') {
          expect(stepper, `${view}: no workflow stepper found at 390`).not.toBeNull();
        }
        if (stepper) {
          expect
            .soft(stepper.stages, `${view}: the workflow stepper has ${stepper.stages} stages`)
            .toBe(4);
          expect
            .soft(
              stepper.overlaps,
              `${view}: stepper stages / insight overprint at 390 (index pairs)`,
            )
            .toEqual([]);
        }
        if (railHit !== null || (viewport.width === 390 && view === 'week')) {
          expect.soft(railHit, 'the week has no sticky platform rail to probe').not.toBeNull();
          expect
            .soft(railHit?.scrolledBy ?? 0, 'the week did not scroll sideways by 200px')
            .toBeGreaterThan(0);
          expect
            .soft(
              railHit?.inside,
              `a card shows through the platform rail: ${String(railHit?.hit)}`,
            )
            .toBe(true);
        }

        expect
          .soft(contract, `${view}: the chip was found off the [data-draft-id] contract`)
          .toBe(true);
        expect.soft(before?.contract, `${view}: scroller contract attributes missing`).toBe(true);
        for (const [state, g] of [
          ['open', open],
          ['closed again', after],
        ] as const) {
          expect
            .soft(
              Math.abs((g?.region.x ?? 0) - (before?.region.x ?? 0)) <= 1 &&
                Math.abs((g?.region.width ?? 0) - (before?.region.width ?? 0)) <= 1,
              `${view}: the view region moved with the sheet ${state}: ${JSON.stringify(before?.region)} → ${JSON.stringify(g?.region)}`,
            )
            .toBe(true);
        }
        if (viewport.width === 390) {
          expect
            .soft(
              fit.pageScrollWidth,
              `${view}: the page scrolls sideways at 390 (${fit.pageScrollWidth} > ${fit.innerWidth})`,
            )
            .toBeLessThanOrEqual(fit.innerWidth);
          if (view === 'week' && before) {
            expect
              .soft(
                before.scroller.scrollWidth > before.scroller.clientWidth,
                `the week does not scroll sideways at 390 (${before.scroller.scrollWidth} ≤ ${before.scroller.clientWidth})`,
              )
              .toBe(true);
            expect
              .soft(
                fit.narrowestCard ?? 0,
                `a week card is ${fit.narrowestCard}px wide, under 6rem (${6 * fit.rem}px)`,
              )
              .toBeGreaterThanOrEqual(6 * fit.rem);
          }
        }
        expect
          .soft(
            Math.abs((open?.scroller.clientHeight ?? 0) - (before?.scroller.clientHeight ?? 0)),
            `${view}: the scroller went ${before?.scroller.clientHeight} → ${open?.scroller.clientHeight}px when the sheet opened`,
          )
          .toBeLessThanOrEqual(2);
        expect
          .soft(
            Math.max(0, ...longTasks),
            `${view}: long tasks across open + close: ${longTasks.map((t) => t.toFixed(0)).join(', ')}`,
          )
          .toBeLessThanOrEqual(200);
      });
    }
  }

  // ---- U7: keyboard, focus return, dismissal that sticks ----
  for (const view of UX_VIEWS) {
    // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
    test(`U7 ${view} keys: Enter opens, Escape and × return focus to the opener, dismissal sticks`, async ({}, testInfo) => {
      const record = uxRecorder(testInfo.title);
      const supabase = admin();
      const dataset = uxPlatformDataset(5);
      await seedUxDrafts(
        supabase,
        dataset.map((draft) => uxDraftRow(draft)),
      );
      const target = dataset[0];
      if (!target) throw new Error('empty dataset');

      await page.setViewportSize(UX_WIDE[1]);
      await uxOpenPlanner(page, view, target.title);
      const { chip, contract } = await uxChip(page, target);
      const preview = uxDraftPreview(page);
      const focusInsidePreview = async () => {
        const tab = preview.getByRole('tab', { name: 'Preview' }).first();
        if (await tab.isVisible().catch(() => false)) await tab.focus();
        else await preview.locator('button').first().focus();
      };
      const openWithEnter = async () => {
        await parkPointer(page);
        await chip.scrollIntoViewIfNeeded();
        await chip.focus();
        await page.keyboard.press('Enter');
        await expect(preview, 'Enter on a focused chip did not open the preview').toBeVisible({
          timeout: 30_000,
        });
      };
      const active = () =>
        page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? null);
      const steps: Record<string, unknown> = { chipContract: contract };
      const escapeFromInside = async () => {
        await focusInsidePreview();
        await parkPointer(page);
        steps.lastEscapeFrom = await active();
        await page.keyboard.press('Escape');
        await expect(preview, 'Escape from inside the preview did not close it').toHaveCount(0, {
          timeout: 20_000,
        });
      };
      // Recorded in `finally`: a hard stop mid-sequence still leaves every step it reached.
      try {
        expect.soft(contract, 'the chip was found off the [data-draft-id] contract').toBe(true);
        await openWithEnter();
        await expect
          .soft(chip, 'the open chip is not aria-pressed')
          .toHaveAttribute('aria-pressed', 'true');
        // Tab from the selected chip into the preview, as a keyboard user does: no .focus().
        const insidePreview = () =>
          page.evaluate(() =>
            Boolean(
              document
                .querySelector('[role="complementary"][aria-label="Draft preview"]')
                ?.contains(document.activeElement),
            ),
          );
        // Tab from the open draft lands in its preview in ONE press, whatever the week holds;
        // without that the walk crossed the rest of the grid and the dock (75 stops in a busy
        // week). The loop runs to the page's own tab stops so a miss records the path it took.
        const tabStops = await page.evaluate(
          () =>
            document.querySelectorAll(
              'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
            ).length,
        );
        let tabs = 0;
        let reached = false;
        const tabPath: string[] = [];
        while (tabs < tabStops + 5 && !reached) {
          await page.keyboard.press('Tab');
          tabs += 1;
          reached = await insidePreview();
          tabPath.push(
            await page.evaluate(() => {
              const el = document.activeElement;
              const label = el?.getAttribute('aria-label') ?? el?.textContent ?? '';
              return `${el?.tagName ?? '?'}:${label.trim().slice(0, 40)}`;
            }),
          );
        }
        steps.tabsToPreview = reached ? tabs : null;
        steps.tabStops = tabStops;
        if (!reached) steps.tabPath = tabPath;
        expect
          .soft(
            steps.tabsToPreview,
            `Tab from the open draft took ${tabs} presses to reach its preview`,
          )
          .toBe(1);
        // Recorded, not gated: what one Escape does on the first tab stop inside the preview.
        // A tooltip-wrapped control there takes the first Escape for its tooltip.
        if (reached) {
          steps.firstTabStop = await active();
          await parkPointer(page);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
          steps.firstTabStopEscapeClosed = !(await preview.isVisible().catch(() => false));
        }
        if (await preview.isVisible().catch(() => false)) await escapeFromInside();
        await expect
          .soft(chip, 'Escape did not return focus to the chip')
          .toBeFocused({ timeout: 5_000 });
        steps.escapeFocus = await page.evaluate(
          () => document.activeElement?.outerHTML.slice(0, 160) ?? null,
        );

        await openWithEnter();
        await page.getByRole('button', { name: 'Close preview' }).first().click();
        await expect(preview, 'the × did not close the preview').toHaveCount(0, {
          timeout: 20_000,
        });
        await expect
          .soft(chip, 'the × did not return focus to the chip')
          .toBeFocused({ timeout: 5_000 });
        steps.closeFocus = await page.evaluate(
          () => document.activeElement?.outerHTML.slice(0, 160) ?? null,
        );

        await openWithEnter();
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(400);
        const pressed = await uxRegion(page)
          .locator('[data-draft-id][aria-pressed="true"]:visible')
          .first()
          .getAttribute('data-draft-id', { timeout: 5_000 })
          .catch(() => null);
        steps.arrowDownSelected = pressed;
        expect.soft(pressed, 'ArrowDown selected no other [data-draft-id] chip').not.toBeNull();
        expect.soft(pressed, 'ArrowDown left the selection on the same draft').not.toBe(target.id);
        if (pressed && pressed !== target.id) {
          await escapeFromInside();
          await expect
            .soft(
              uxRegion(page).locator(`[data-draft-id="${pressed}"]`).first(),
              'Escape did not return focus to draft B',
            )
            .toBeFocused({ timeout: 5_000 });
          steps.arrowDownEscapeFocus = await page.evaluate(
            () =>
              document.activeElement?.getAttribute('data-draft-id') ??
              document.activeElement?.outerHTML.slice(0, 160) ??
              null,
          );
        } else {
          await uxClosePreview(page);
        }

        // The opener wins: a preview opened from a dock row hands focus back to that row.
        if (view === 'week') {
          const dockRow = page
            .locator('[data-testid="planner-attention-dock"] [data-dock-item][data-dock-draft-id]')
            .first();
          await expect(dockRow, 'no draft row drawn in the dock').toBeVisible({ timeout: 20_000 });
          const dockDraftId = await dockRow.getAttribute('data-dock-draft-id');
          const dockButton = page
            .locator(
              `[data-testid="planner-attention-dock"] [data-dock-draft-id="${dockDraftId}"] button`,
            )
            .first();
          await dockButton.scrollIntoViewIfNeeded();
          await dockButton.click();
          await expect(preview, 'a dock row did not open the preview').toBeVisible({
            timeout: 30_000,
          });
          await escapeFromInside();
          await expect
            .soft(dockButton, 'Escape did not return focus to the dock row that opened the preview')
            .toBeFocused({ timeout: 5_000 });
          steps.dockFocus = {
            dockDraftId,
            active: await page.evaluate(
              () => document.activeElement?.outerHTML.slice(0, 160) ?? null,
            ),
          };
        }

        // Dismissal sticks: a reload must not reopen what Escape closed.
        await openWithEnter();
        await escapeFromInside();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(uxRegion(page).getByText(target.title).first()).toBeVisible({
          timeout: 120_000,
        });
        await page.waitForTimeout(3_000);
        const reopened = await uxPreviewIsOpen(page);
        steps.reopenedAfterReload = reopened;
        expect.soft(reopened, 'a reload re-opened the preview that Escape dismissed').toBe(false);
        await uxShot(page, `u7-${view}-after-reload`);
      } finally {
        record(steps);
      }
    });
  }

  // ---- U7: editable targets keep their keys, wide (aside) and narrow (sheet) ----
  for (const viewport of [UX_WIDE[1], UX_NARROW[1]]) {
    const narrow = viewport.width < 1024;
    for (const view of UX_VIEWS) {
      // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
      test(`U7 caption ${viewport.width}x${viewport.height} ${view}: Backspace and Escape stay in the caption`, async ({}, testInfo) => {
        const record = uxRecorder(testInfo.title);
        const supabase = admin();
        const dataset = uxPlatformDataset(5);
        await seedUxDrafts(
          supabase,
          dataset.map((draft) => uxDraftRow(draft)),
        );
        const target = dataset[0];
        if (!target) throw new Error('empty dataset');

        await page.setViewportSize(viewport);
        await uxOpenPlanner(page, view, target.title);
        const { chip, contract } = await uxChip(page, target);
        expect.soft(contract, 'the chip was found off the [data-draft-id] contract').toBe(true);
        // Narrow: the sheet dialog. Base UI toasts are role=dialog too, so the name decides.
        const preview = narrow
          ? page.getByRole('dialog', { name: /Draft preview/ })
          : uxDraftPreview(page);
        const steps: Record<string, unknown> = { viewport, view, chipContract: contract };
        try {
          await parkPointer(page);
          await chip.scrollIntoViewIfNeeded();
          await chip.focus();
          await page.keyboard.press('Enter');
          await expect(preview, 'Enter on a focused chip did not open the preview').toBeVisible({
            timeout: 30_000,
          });
          const editCaption = preview
            .getByRole('button', { name: /^(Edit|Add an?) (\w+ )?caption$/i })
            .first();
          // The preview's body is a lazy chunk: wait for the button, isVisible() would not.
          if (
            await editCaption
              .waitFor({ state: 'visible', timeout: 10_000 })
              .then(() => true)
              .catch(() => false)
          )
            await editCaption.click();
          const caption = preview.getByRole('textbox', { name: /caption/i }).first();
          await expect(caption, 'no caption textbox in the preview').toBeVisible({
            timeout: 20_000,
          });
          await caption.evaluate((el) => {
            const field = el as HTMLTextAreaElement;
            field.focus();
            field.setSelectionRange(field.value.length, field.value.length);
          });
          await page.keyboard.type('abc');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(500);
          await expect
            .soft(page.getByRole('alertdialog'), 'Backspace in the caption raised a dialog')
            .toHaveCount(0);
          const value = await caption.inputValue().catch(() => '');
          steps.captionTail = value.slice(-12);
          expect
            .soft(value.endsWith('ab'), `the caption ends "${value.slice(-12)}", not "…ab"`)
            .toBe(true);

          // First Escape leaves the caption editor, and focus lands on its own Edit button.
          await page.keyboard.press('Escape');
          await page.waitForTimeout(400);
          await expect
            .soft(preview, 'the first Escape in the caption closed the whole preview')
            .toBeVisible();
          await expect
            .soft(
              editCaption,
              'after the first Escape, focus is not on the "Edit … caption" button',
            )
            .toBeFocused({ timeout: 5_000 });
          steps.firstEscapeFocus = await page.evaluate(
            () => document.activeElement?.outerHTML.slice(0, 160) ?? null,
          );

          // Second Escape closes the preview and returns focus to the chip.
          if (await preview.isVisible().catch(() => false)) {
            await parkPointer(page);
            await page.keyboard.press('Escape');
            await expect
              .soft(preview, 'the second Escape did not close the preview')
              .toHaveCount(0, { timeout: 20_000 });
            await expect
              .soft(chip, 'the second Escape did not return focus to the chip')
              .toBeFocused({ timeout: 5_000 });
          }
          await uxShot(page, `u7-caption-${viewport.width}-${view}`);
        } finally {
          await uxClosePreview(page).catch(() => {});
          record(steps);
        }
      });
    }
  }
});
