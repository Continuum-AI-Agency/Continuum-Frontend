import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDefaultOnboardingState } from '../src/lib/onboarding/state';
import { mintSessionWithPassword } from './support/auth';

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
//     to Instagram, and `stageMediaForPublish` is not run.
//   · Aesthetic judgement on the hover card and the preview panel. Containment, overlap and
//     scroll deltas are measured; whether the result LOOKS right is a human call, and the
//     screenshots in e2e/__screenshots__/organic-planner-preview are attached for it.
//   · Every viewport. The planner splits vertically below 1024px, where the collapse chevron
//     loses its direction; this bench runs wide (1600px) only.
//   · Backlog persistence. Backlog rows live in sessionStorage by design, so the BacklogRow
//     hover assertion covers rendering, not durability.

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

function dayIdOffsetFromToday(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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

// Radix HoverCard closes on pointer-leave, never on Escape: reading the popper without
// dismissing the previous one measures the PREVIOUS chip's card.
async function dismissHoverCard(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0, {
    timeout: 20_000,
  });
}

const hoverCard = (page: Page) =>
  page.locator('[data-radix-popper-content-wrapper] [data-side][data-align]').first();

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
    await supabase.storage.from(BUCKET).remove([VIDEO_PATH]);
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

    // Radix HoverCard does NOT close on Escape — it closes when the pointer leaves. Reading
    // the popper without first dismissing the previous one measures the PREVIOUS row's card,
    // which is how this probe first reported a video draft as having no media at all.
    const probeHoverMedia = async (title: string) => {
      await page.mouse.move(5, 5);
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0, {
        timeout: 20_000,
      });
      const target = listRow(page, title);
      await target.scrollIntoViewIfNeeded();
      await target.hover();
      const hovered = page
        .locator('[data-radix-popper-content-wrapper] [data-side][data-align]')
        .first();
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

    await page.mouse.move(5, 5);
    await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0, {
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

    const card = page
      .locator('[data-radix-popper-content-wrapper] [data-side][data-align]')
      .first();
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
    await page.mouse.move(5, 5);
    await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0, {
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
    const backlogCard = page
      .locator('[data-radix-popper-content-wrapper] [data-side][data-align]')
      .first();
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

    await page.getByLabel('Collapse draft preview').click({ force: true });

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
    await preview.click({ position: { x: 20, y: 20 } });
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

    // The header chip counted the same asset twice — "2 videos" for one attached reel.
    const chip = preview.getByRole('button', { name: 'Media enrichment details' });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await expect(chip, 'the media chip double-counts a single reel').toContainText('1 video');
    expect(await chip.innerText()).not.toContain('2 video');

    // Edit mode is a SEPARATE component tree, and it regressed separately.
    // `getByLabel('Edit post')` matches TWICE — the button carries both aria-label and title —
    // and `.first()` picked the one whose click did nothing, which made the edit-mode half of
    // this bench pass without ever leaving read-only. Target the button itself.
    const editToggle = preview.locator('button[aria-label="Edit post"]');
    await editToggle.click();
    await expect(
      preview.locator('button[aria-label="Done editing post"]'),
      'the Edit toggle did not enter edit mode',
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
    console.log('[#231] edit mode decoded the same attached reel');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/preview-video-editing.png` });
  });

  test('#231 the picker refuses two videos instead of silently dropping one', async () => {
    await openListPlanner(page);
    const row = listRow(page, PICKER_TITLE);
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.click();

    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(preview).toBeVisible({ timeout: 60_000 });
    // `getByLabel('Edit post')` matches TWICE — the button carries both aria-label and title —
    // and `.first()` picked the one whose click did nothing, which made the edit-mode half of
    // this bench pass without ever leaving read-only. Target the button itself.
    const editToggle = preview.locator('button[aria-label="Edit post"]');
    await editToggle.click();
    await expect(
      preview.locator('button[aria-label="Done editing post"]'),
      'the Edit toggle did not enter edit mode',
    ).toBeVisible({ timeout: 20_000 });

    // The media slot itself is the picker's entry point in edit mode (`onActivate`). It sits
    // inside the scaled phone shell, so force past Playwright's stability wait and retry until
    // the popover is actually up.
    const mediaSlot = preview.locator('[aria-label^="Media slot"]').first();
    await expect(mediaSlot).toBeVisible({ timeout: 30_000 });
    // The header is CSS-uppercased and Playwright matches the TRANSFORMED text, so an exact
    // 'Add media' never matches what the browser renders.
    const pickerHeader = page.getByText(/^add media$/i);
    await expect
      .poll(
        async () => {
          if ((await pickerHeader.count()) > 0) return 1;
          await mediaSlot.click({ force: true, timeout: 5_000 }).catch(() => {});
          return pickerHeader.count();
        },
        { timeout: 60_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);

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

  // #233 — the tester's own surface. "The detail of the post aren't showing in calendar…
  // if you touch the button of edit it should open." Both halves are measured here on the
  // MONTH view, against a draft whose signed URL has decayed, with NO page.reload().
  // biome-ignore lint/correctness/noEmptyPattern: Playwright test signature
  test('#233 month hover renders decayed media + caption, and Edit opens the editor', async ({}, testInfo) => {
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

    // ---- (c) Edit opens the panel IN edit mode ----
    const preview = page.getByRole('complementary', { name: 'Draft preview' });
    const doneEditing = page.locator('button[aria-label="Done editing post"]');

    await dismissHoverCard(page);
    const editCard = await hoverMonthChip(page, VIDEO_TITLE);
    await editCard.getByRole('button', { name: 'Edit' }).click();
    await expect(preview, 'Edit did not open the preview panel').toBeVisible({ timeout: 60_000 });
    await expect(
      doneEditing,
      'Edit opened the panel read-only instead of in edit mode',
    ).toBeVisible({ timeout: 30_000 });
    console.log('[#233b] Edit from a cold month chip opened the panel in edit mode');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/month-edit-opens-editor.png` });

    // ---- (d) the ALREADY-SELECTED case: the exact shape of the bug ----
    // The month view passed `onEdit={() => onClick()}`, discarding the id; `onClick` is
    // plain selection, so on the draft that was already selected Edit did nothing at all.
    await doneEditing.click();
    await expect(doneEditing).toHaveCount(0, { timeout: 20_000 });
    await dismissHoverCard(page);
    await monthChip(page, VIDEO_TITLE).click();
    await expect(preview).toBeVisible({ timeout: 30_000 });

    const selectedCard = await hoverMonthChip(page, VIDEO_TITLE);
    await selectedCard.getByRole('button', { name: 'Edit' }).click();
    await expect(
      doneEditing,
      'Edit was a no-op on the draft that was ALREADY selected — the reported bug',
    ).toBeVisible({ timeout: 30_000 });
    console.log('[#233b] Edit works on an already-selected draft');

    // ---- (e) the COLLAPSED case: the intent has to re-open the panel ----
    await doneEditing.click();
    await page.getByLabel('Collapse draft preview').click({ force: true });
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
    const collapsedCard = await hoverMonthChip(page, VIDEO_TITLE);
    await collapsedCard.getByRole('button', { name: 'Edit' }).click();
    await expect(
      doneEditing,
      'Edit left the panel collapsed — the edit intent never re-expanded it',
    ).toBeVisible({ timeout: 30_000 });
    console.log('[#233b] Edit re-expanded a collapsed preview into edit mode');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/month-edit-from-collapsed.png` });
  });
});
