import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';

// End-to-end bench for the browser-only half of Library v1.7 — the half no
// server-side bench can reach:
//
//   1. A time-RANGE comment renders as a BAR on the scrubber whose geometry IS
//      the seekFraction/seekSpan math against the video's REAL decoded duration,
//      and clicking it seeks the player.
//   2. The set-in / set-out draft flow actually PUTS `endMs` on the wire — the
//      POST body is intercepted, so a UI that showed a span but posted a moment
//      would fail here.
//   3. The public /share/[token] page, in a FRESH UNAUTHENTICATED context, paints
//      the same markers, seeks on click, and offers NO way to author anything.
//   4. The Library video editor restores its saved cut: open → the seeded clip →
//      add a second clip from the picker → close → reopen → both clips are back,
//      which is only true if media.timeline_drafts round-tripped through the real
//      route.
//
// Everything runs against the REAL local stack (real storage bytes, real rows,
// real Next routes) in REAL Chrome — Playwright's bundled Chromium has no H.264,
// so the video the whole feature is about would not decode there.
//
// NOT COVERED (stated, not hidden): the editor's WebCodecs RENDER/export path.
// Encoding a cut and pushing it back as a new version is minutes of CPU per run
// and is exercised by the canvas splice benches; this spec proves the draft
// document survives, not that mediabunny can mux. See the note in the last test.
//
// Run: bun run library:e2e:bench   (from Continuum-Frontend; sources .env.local)

test.use({ channel: 'chrome' });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const OWNER_USER_ID = '00000000-0000-0000-0000-0000000000a1';
const BUCKET = 'media-library';

const SOURCE_ID = 'aaaaaaaa-0000-4000-8000-00000000cee1';
const EXTRA_ID = 'aaaaaaaa-0000-4000-8000-00000000cee2';
const SOURCE_VERSION_ID = 'aaaaaaaa-0000-4000-8000-00000000cee4';
const EXTRA_VERSION_ID = 'aaaaaaaa-0000-4000-8000-00000000cee5';
const SOURCE_TITLE = 'Bench range clip';
const EXTRA_TITLE = 'Bench range extra clip';
const SHARE_TOKEN = 'bench-range-share-token';

// The seeded range: 1.0s → 2.5s of a 4s clip. Deliberately not a round fraction
// of the duration, so a bar that merely spanned the whole lane would not pass.
const RANGE_START_MS = 1000;
const RANGE_END_MS = 2500;
const RANGE_BODY = 'Range note: the hook drags through here.';
const POINT_BODY = 'Point note: fix this frame.';
const POINT_MS = 3500;

const clipPath = (assetId: string) => `${BRAND_ID}/${assetId}/bench-range-clip.mp4`;

let storageState: PlaywrightStorageState;
let admin: SupabaseClient;
let mp4Base64: string;

function mediaTable(client: SupabaseClient, table: string) {
  return (client as unknown as { schema: (s: string) => SupabaseClient })
    .schema('media')
    .from(table);
}

function assetRow(id: string, title: string) {
  return {
    id,
    brand_id: BRAND_ID,
    kind: 'video',
    bucket: BUCKET,
    storage_path: clipPath(id),
    file_name: 'bench-range-clip.mp4',
    mime_type: 'video/mp4',
    duration_ms: 4000,
    width: 640,
    height: 360,
    source: 'upload',
    status: 'ready',
    title,
    tags: ['e2e-bench'],
  };
}

// The MP4 is minted by the same browser-side entry the poster bench uses: a real
// H.264 clip, one colour per second. Bun cannot encode it (no WebCodecs), so it
// is built in the page and handed back as bytes.
function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `range-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/posterBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
}

// The grid is a client island inside an RSC page: in dev, hydration can land
// after the card paints, so a single click can hit dead DOM.
async function openCard(page: Page, title: string): Promise<Locator> {
  const card = page.getByRole('button', { name: `Open ${title}` });
  await expect(card).toBeVisible({ timeout: 60_000 });
  // Wait for the island to actually hydrate before clicking: the card paints
  // from the server long before it carries a listener, and on a cold dev server
  // that gap runs to tens of seconds. Re-click only while no dialog is open —
  // a blind retry loop lands its second click on the overlay and closes the
  // modal it just opened.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect
    .poll(
      async () => {
        if ((await page.getByRole('dialog').count()) === 0) {
          await card.click().catch(() => undefined);
        }
        return page.getByRole('dialog').count();
      },
      { timeout: 90_000, intervals: [1000, 2000, 3000] },
    )
    .toBeGreaterThan(0);
  return page.getByRole('dialog').first();
}

async function waitForMetadata(video: Locator): Promise<number> {
  try {
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.readyState >= 1), {
        timeout: 30_000,
      })
      .toBe(true);
  } catch (cause) {
    const state = await video.evaluate((el: HTMLVideoElement) => ({
      currentSrc: el.currentSrc,
      error: el.error?.message ?? null,
      networkState: el.networkState,
      readyState: el.readyState,
    }));
    throw new Error(`Video metadata did not load: ${JSON.stringify(state)}`, { cause });
  }
  // The component floors the decoded duration into ms; mirror it exactly rather
  // than assuming the encoder produced precisely 4000.
  return video.evaluate((el: HTMLVideoElement) => Math.floor(el.duration * 1000));
}

// Where the marker actually sits, measured off the rendered boxes — not read back
// out of the inline style the component wrote.
async function laneGeometry(marker: Locator): Promise<{ left: number; width: number }> {
  return marker.evaluate((element) => {
    const lane = element.parentElement as HTMLElement;
    const laneBox = lane.getBoundingClientRect();
    const markerBox = element.getBoundingClientRect();
    return {
      left: (markerBox.left - laneBox.left) / laneBox.width,
      width: markerBox.width / laneBox.width,
    };
  });
}

test.beforeAll(async ({ browser }) => {
  storageState = await mintSessionForEmail(OWNER_EMAIL);
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const bundle = buildBrowserBundle();
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__posterBench));
  const sample = await page.evaluate(() => window.__posterBench.makeSampleMp4());
  expect(sample.byteLength).toBeGreaterThan(10_000);
  mp4Base64 = sample.base64;
  await context.close();

  const bytes = Buffer.from(mp4Base64, 'base64');
  for (const assetId of [SOURCE_ID, EXTRA_ID]) {
    const upload = await admin.storage
      .from(BUCKET)
      .upload(clipPath(assetId), bytes, { contentType: 'video/mp4', upsert: true });
    expect(upload.error).toBeNull();
  }

  const seeded = await mediaTable(admin, 'assets').insert([
    assetRow(SOURCE_ID, SOURCE_TITLE),
    assetRow(EXTRA_ID, EXTRA_TITLE),
  ]);
  expect(seeded.error).toBeNull();

  const versions = await mediaTable(admin, 'asset_versions').insert([
    {
      id: SOURCE_VERSION_ID,
      brand_id: BRAND_ID,
      asset_id: SOURCE_ID,
      version_number: 1,
      bucket: BUCKET,
      storage_path: clipPath(SOURCE_ID),
      file_name: 'bench-range-clip.mp4',
      mime_type: 'video/mp4',
      duration_ms: 4000,
      width: 640,
      height: 360,
      created_by: OWNER_USER_ID,
    },
    {
      id: EXTRA_VERSION_ID,
      brand_id: BRAND_ID,
      asset_id: EXTRA_ID,
      version_number: 1,
      bucket: BUCKET,
      storage_path: clipPath(EXTRA_ID),
      file_name: 'bench-range-clip.mp4',
      mime_type: 'video/mp4',
      duration_ms: 4000,
      width: 640,
      height: 360,
      created_by: OWNER_USER_ID,
    },
  ]);
  expect(versions.error).toBeNull();
  expect(
    (
      await mediaTable(admin, 'assets')
        .update({ head_version_id: SOURCE_VERSION_ID })
        .eq('id', SOURCE_ID)
    ).error,
  ).toBeNull();
  expect(
    (
      await mediaTable(admin, 'assets')
        .update({ head_version_id: EXTRA_VERSION_ID })
        .eq('id', EXTRA_ID)
    ).error,
  ).toBeNull();

  const comments = await mediaTable(admin, 'comments').insert([
    {
      brand_id: BRAND_ID,
      asset_id: SOURCE_ID,
      version_id: SOURCE_VERSION_ID,
      body: RANGE_BODY,
      annotation: { kind: 'time', timeMs: RANGE_START_MS, endMs: RANGE_END_MS },
      created_by: OWNER_USER_ID,
      visibility: 'shared',
    },
    {
      brand_id: BRAND_ID,
      asset_id: SOURCE_ID,
      version_id: SOURCE_VERSION_ID,
      body: POINT_BODY,
      annotation: { kind: 'time', timeMs: POINT_MS },
      created_by: OWNER_USER_ID,
      visibility: 'shared',
    },
  ]);
  expect(comments.error).toBeNull();

  const share = await mediaTable(admin, 'share_links').insert({
    brand_id: BRAND_ID,
    token: SHARE_TOKEN,
    scope: 'asset',
    asset_id: SOURCE_ID,
    permissions: 'view',
    created_by: OWNER_USER_ID,
  });
  expect(share.error).toBeNull();
});

test.afterAll(async () => {
  if (!admin) return;
  await mediaTable(admin, 'share_links').delete().eq('token', SHARE_TOKEN);
  // Comments and timeline_drafts both cascade from media.assets.
  await mediaTable(admin, 'assets').delete().in('id', [SOURCE_ID, EXTRA_ID]);
  await admin.storage.from(BUCKET).remove([clipPath(SOURCE_ID), clipPath(EXTRA_ID)]);
});

test('detail modal: a range comment is a BAR whose geometry is the seekFraction math, and it seeks', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  const dialog = await openCard(page, SOURCE_TITLE);
  const video = dialog.locator('video').first();
  const durationMs = await waitForMetadata(video);
  expect(durationMs).toBeGreaterThan(3_000);

  // The strip labels a span "Comment from <in>–<out>" and a moment "Comment at
  // <t>". Both markers are on this video, so the two locators are the assertion
  // that a range is NOT rendered as a point.
  const rangeMarker = dialog.getByRole('button', {
    name: /^Comment from 0:01\s*[–-]\s*0:02:/,
  });
  const pointMarker = dialog.getByRole('button', { name: /^Comment at 0:03:/ });
  await expect(rangeMarker).toHaveCount(1, { timeout: 60_000 });
  await expect(pointMarker).toHaveCount(1, { timeout: 60_000 });

  const geometry = await laneGeometry(rangeMarker);
  const expectedLeft = RANGE_START_MS / durationMs;
  const expectedWidth = (RANGE_END_MS - RANGE_START_MS) / durationMs;
  expect(Math.abs(geometry.left - expectedLeft)).toBeLessThan(0.01);
  expect(Math.abs(geometry.width - expectedWidth)).toBeLessThan(0.01);
  // A point comment has no span at all — the bar must be measurably wide, which
  // is what a pre-feature (endMs-less) render could never produce.
  expect(geometry.width).toBeGreaterThan(0.3);

  await rangeMarker.click();
  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.85);
  const seeked = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  expect(seeked).toBeLessThan(1.15);

  await context.close();
});

test('set-in / set-out: the posted comment carries endMs on the wire', async ({ browser }) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  const dialog = await openCard(page, SOURCE_TITLE);
  const video = dialog.locator('video').first();
  await waitForMetadata(video);

  // In-point at the playhead (0:00).
  await dialog.getByRole('button', { name: /^Comment at 0:0/ }).click();
  await expect(dialog.getByPlaceholder('Comment at this moment...')).toBeVisible({
    timeout: 60_000,
  });

  // Move the playhead to 0:03 the way a reviewer does — through the transport —
  // then set the out-point there.
  const seek = dialog.getByRole('slider', { name: 'Seek' });
  await seek.evaluate((element: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setValue?.call(element, '3000');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const outPoint = dialog.getByRole('button', { name: /^End at 0:03/ });
  await expect(outPoint).toBeEnabled();
  await outPoint.click();

  // The composer now knows it is a passage, not a moment.
  const composer = dialog.getByPlaceholder('Comment on this passage...');
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await composer.fill('Bench span from the transport');

  const posted = page.waitForRequest((request) => {
    if (!request.url().includes('/functions/v1/library-creative-operations')) return false;
    try {
      return request.postDataJSON()?.action === 'create_asset_comment';
    } catch {
      return false;
    }
  });
  await composer.locator('xpath=..').getByRole('button', { name: 'Post', exact: true }).click();
  const body = (await posted).postDataJSON() as {
    annotation?: { kind?: string; timeMs?: number; endMs?: number };
  };

  expect(body.annotation?.kind).toBe('time');
  expect(typeof body.annotation?.endMs).toBe('number');
  expect(body.annotation?.endMs).toBeGreaterThan(body.annotation?.timeMs ?? 0);
  // The out-point is the frame the reviewer was looking at, not a rounded guess.
  expect(Math.abs((body.annotation?.endMs ?? 0) - 3000)).toBeLessThan(200);

  await context.close();
});

test('share page: markers render and seek, while anonymous feedback requires identity', async ({
  browser,
}) => {
  // No storageState: a genuinely signed-out browser, which is what a share link
  // is handed to.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/share/${SHARE_TOKEN}`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(RANGE_BODY)).toBeVisible({ timeout: 60_000 });
  const video = page.locator('video').first();
  await waitForMetadata(video);

  const rangeMarker = page.getByRole('button', { name: /^Comment from 0:01\s*[–-]\s*0:02:/ });
  await expect(rangeMarker).toHaveCount(1, { timeout: 60_000 });
  await expect(rangeMarker).toHaveAttribute('data-time-ms', '1000');
  await expect(page.getByRole('button', { name: /^Comment at 0:03:/ })).toHaveCount(1, {
    timeout: 60_000,
  });

  await rangeMarker.click();
  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.85);
  expect(await video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(1.15);

  // Open collaboration: anyone with the link can view, while commenting asks
  // for a name and email before the external reviewer session is minted.
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveAttribute('required', '');
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute('required', '');
  await expect(
    page.getByRole('textbox', { name: 'Leave a comment on this version…' }),
  ).toHaveAttribute('required', '');
  await expect(page.getByRole('button', { name: /repl(y|ies)|resolve|delete/i })).toHaveCount(0);

  await context.close();
});

test('library editor: a cut survives closing the dialog (timeline_drafts round-trip)', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  await openCard(page, SOURCE_TITLE);
  await page.getByRole('button', { name: 'Edit video' }).click();

  const editor = page.getByRole('dialog').last();
  await expect(editor.getByText('Video editor')).toBeVisible({ timeout: 30_000 });

  // A never-cut asset opens on a seeded timeline: the video alone, one clip.
  const clips = editor.getByTestId('timeline-clip');
  await expect(clips).toHaveCount(1, { timeout: 30_000 });

  await editor.getByRole('button', { name: 'Add media' }).click();
  const picker = page.getByRole('dialog').last();
  await expect(picker.getByText('Add media from the Library')).toBeVisible({ timeout: 60_000 });
  await picker.getByRole('button', { name: EXTRA_TITLE }).click();
  await picker.getByRole('button', { name: /^Add 1$/ }).click();

  // In the bin — now put it on the timeline.
  const saved = page.waitForResponse(
    (response) => {
      if (
        !response.url().includes('/api/library/timeline-drafts') ||
        response.request().method() !== 'PUT' ||
        !response.ok()
      ) {
        return false;
      }
      try {
        return response.request().postDataJSON()?.document?.items?.length === 2;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
  await editor
    .getByRole('button', { name: `Add ${EXTRA_TITLE} to the timeline`, exact: true })
    .click();
  await expect(clips).toHaveCount(2);
  await saved;

  await page.keyboard.press('Escape');
  await expect(editor.getByText('Video editor')).toBeHidden();

  // Reopen: the cut must come back from the server, not from React state.
  const reloaded = page.waitForResponse(
    (response) =>
      response.url().includes('/api/library/timeline-drafts') &&
      response.request().method() === 'GET' &&
      response.ok(),
  );
  await page.getByRole('button', { name: 'Edit video' }).click();
  const reopened = page.getByRole('dialog').last();
  await expect(reopened.getByText('Video editor')).toBeVisible({ timeout: 30_000 });
  const restored = (await (await reloaded).json()) as {
    draft?: { document?: { items?: unknown[]; pool?: unknown[] } } | null;
  };
  expect(restored.draft?.document?.items).toHaveLength(2);
  expect(restored.draft?.document?.pool).toHaveLength(2);

  await expect(reopened.getByTestId('timeline-clip')).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(reopened.getByText(EXTRA_TITLE).first()).toBeVisible();

  // NOT EXERCISED: the render/export hop (mediabunny + WebCodecs encode → new
  // version / new asset). It is minutes of CPU per run and is covered by the
  // canvas splice bench; this test proves the DRAFT round-trips, nothing more.

  await context.close();
});
