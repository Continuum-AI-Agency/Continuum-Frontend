import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';

// End-to-end bench for Library v1.6: video poster thumbnails + the transcript
// panel. Everything here runs against the REAL local stack — real Supabase
// storage, real media.assets rows, the real Next routes, and a real Chrome (not
// Playwright's codec-stripped Chromium) so WebCodecs H.264 encode/decode is real.
//
// What it proves:
//   1. A poster produced by src/lib/library/videoPoster.ts is a genuinely decoded
//      frame from the RIGHT moment (the bench video paints a different color each
//      second; the poster must come back GREEN, the color of second 1).
//   2. POST /api/library/thumbnail stores those bytes in the asset's own bucket
//      and persists media.assets.thumbnail_path, which then SIGNS and downloads
//      back byte-identical.
//   3. The library grid paints the poster and fetches no video bytes (poster
//      attribute set, src withheld, preload="none").
//   4. The detail modal renders the timecoded transcript, seeks the player when a
//      line is clicked, and says the RIGHT thing for the two empty states —
//      transcript '' (analyzed, no speech) vs null (never transcribed).
//
// Run: bun run library:bench   (from Continuum-Frontend; sources .env.local)

// Real Chrome: Playwright's bundled Chromium has no proprietary codecs, so H.264
// encode/decode — what a user's browser actually does — would not be exercised.
test.use({ channel: 'chrome' });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const BUCKET = 'media-library';

const TRANSCRIBED_ID = 'aaaaaaaa-0000-4000-8000-00000000bee1';
const SILENT_ID = 'aaaaaaaa-0000-4000-8000-00000000bee2';
const UNTRANSCRIBED_ID = 'aaaaaaaa-0000-4000-8000-00000000bee3';
// media.assets is uniquely keyed on (bucket, storage_path), so each seeded row
// gets its own copy of the clip under its own asset folder.
const clipPath = (assetId: string) => `${BRAND_ID}/${assetId}/bench-clip.mp4`;
const CLIP_PATH = clipPath(TRANSCRIBED_ID);
const POSTER_PATH = `${BRAND_ID}/${TRANSCRIBED_ID}/thumb.webp`;

const SEGMENTS = [
  { startMs: 0, endMs: 1200, text: 'Cold pressed, never blended.' },
  { startMs: 1500, endMs: 2600, text: 'Three ingredients, nothing else.' },
  { startMs: 2900, endMs: 3900, text: 'Taste the difference on day one.' },
];

let storageState: PlaywrightStorageState;
let admin: SupabaseClient;
let bundle: string;
let sampleMp4Base64: string;

function mediaAssets(client: SupabaseClient) {
  return (client as unknown as { schema: (s: string) => SupabaseClient })
    .schema('media')
    .from('assets');
}

function assetRow(overrides: { id: string } & Record<string, unknown>) {
  return {
    brand_id: BRAND_ID,
    kind: 'video',
    bucket: BUCKET,
    storage_path: clipPath(overrides.id),
    file_name: 'bench-clip.mp4',
    mime_type: 'video/mp4',
    duration_ms: 4000,
    width: 640,
    height: 360,
    source: 'upload',
    status: 'ready',
    tags: ['e2e-bench'],
    ...overrides,
  };
}

// The browser half of the bench (Mediabunny encode + the real videoPoster module)
// is bundled for the page with Bun — Playwright's runner is Node and cannot
// import the app's TS directly.
function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `poster-bench-${Date.now()}.js`);
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
// after the card paints, so a single click can hit dead DOM. Retry until the
// dialog is actually up.
async function openCard(page: Page, title: string): Promise<void> {
  const card = page.getByRole('button', { name: `Open ${title}` });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        await card.click();
        return page.getByRole('dialog').count();
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBeGreaterThan(0);
}

test.beforeAll(async () => {
  storageState = await mintSessionForEmail(OWNER_EMAIL);
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  bundle = buildBrowserBundle();
});

test.afterAll(async () => {
  if (!admin) return;
  await mediaAssets(admin).delete().in('id', [TRANSCRIBED_ID, SILENT_ID, UNTRANSCRIBED_ID]);
  await admin.storage
    .from(BUCKET)
    .remove([
      clipPath(TRANSCRIBED_ID),
      clipPath(SILENT_ID),
      clipPath(UNTRANSCRIBED_ID),
      POSTER_PATH,
    ]);
});

test('poster: a real decoded frame is generated, stored, persisted, signed, and painted', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__posterBench));

  // 1) A real H.264 MP4, encoded in the browser, one color per second.
  const sample = await page.evaluate(() => window.__posterBench.makeSampleMp4());
  expect(sample.byteLength).toBeGreaterThan(10_000);
  sampleMp4Base64 = sample.base64;

  // 2) The real poster generator, on real WebCodecs.
  const probe = await page.evaluate(
    (base64) => window.__posterBench.runPoster(base64),
    sample.base64,
  );
  expect(probe).not.toBeNull();
  if (!probe) throw new Error('no poster');

  expect(probe.mimeType).toBe('image/webp');
  expect(probe.byteLength).toBeGreaterThan(2_000);
  expect(probe.width).toBe(640);
  expect(probe.height).toBe(360);
  // Grabbed ~1s in, not frame 0.
  expect(probe.timestampSec).toBeGreaterThan(0.8);
  expect(probe.timestampSec).toBeLessThan(1.3);
  // ...and the pixels prove it: second 1 is painted green (#00c853).
  const [r, g, b] = probe.centerRgb;
  expect(g).toBeGreaterThan(120);
  expect(g).toBeGreaterThan(r + 40);
  expect(g).toBeGreaterThan(b + 40);

  // 3) Seed the asset the poster belongs to: real bytes in real storage, real row.
  const mp4Bytes = Buffer.from(sample.base64, 'base64');
  for (const assetId of [TRANSCRIBED_ID, SILENT_ID, UNTRANSCRIBED_ID]) {
    const upload = await admin.storage
      .from(BUCKET)
      .upload(clipPath(assetId), mp4Bytes, { contentType: 'video/mp4', upsert: true });
    expect(upload.error).toBeNull();
  }

  const seeded = await mediaAssets(admin).insert([
    assetRow({
      id: TRANSCRIBED_ID,
      title: 'Bench clip transcribed',
      description: 'Poster + transcript bench fixture.',
      transcript: SEGMENTS.map((segment) => segment.text).join('\n'),
      transcript_segments: SEGMENTS,
      transcript_source: 'gemini_video',
    }),
    assetRow({
      id: SILENT_ID,
      title: 'Bench clip silent',
      transcript: '',
      transcript_segments: [],
      transcript_source: 'gemini_video',
    }),
    assetRow({ id: UNTRANSCRIBED_ID, title: 'Bench clip untranscribed' }),
  ]);
  expect(seeded.error).toBeNull();

  // 4) The route: the browser POSTs the poster with its real session cookies.
  const persisted = await page.evaluate(
    async ({ base64, assetId, brandId }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const form = new FormData();
      form.append('brandId', brandId);
      form.append('assetId', assetId);
      form.append('poster', new Blob([bytes], { type: 'image/webp' }), 'thumb.webp');
      const response = await fetch('/api/library/thumbnail', { method: 'POST', body: form });
      return { status: response.status, body: await response.json() };
    },
    { base64: probe.base64, assetId: TRANSCRIBED_ID, brandId: BRAND_ID },
  );
  expect(persisted.status).toBe(200);
  expect(persisted.body).toMatchObject({ bucket: BUCKET, thumbnailPath: POSTER_PATH });

  // 5) The row carries the path, and the path signs + downloads the same bytes.
  const { data: row } = await mediaAssets(admin)
    .select('thumbnail_path')
    .eq('id', TRANSCRIBED_ID)
    .maybeSingle();
  expect((row as { thumbnail_path: string } | null)?.thumbnail_path).toBe(POSTER_PATH);

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(POSTER_PATH, 60);
  expect(signed?.signedUrl).toBeTruthy();
  const downloaded = new Uint8Array(await (await fetch(signed?.signedUrl ?? '')).arrayBuffer());
  expect(downloaded.byteLength).toBe(probe.byteLength);
  // RIFF....WEBP — the stored bytes really are a WebP still.
  expect(String.fromCharCode(...downloaded.slice(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...downloaded.slice(8, 12))).toBe('WEBP');

  // 6) The grid paints the poster and fetches NO video bytes for it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const card = page.getByRole('button', { name: 'Open Bench clip transcribed' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const video = card.locator('video');
  await expect(video).toHaveAttribute('poster', /token=|\/storage\/v1\/object\/sign\//);
  await expect(video).toHaveAttribute('preload', 'none');
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.getAttribute('src')),
  ).toBeNull();

  await context.close();
});

test('transcript: lines render, a click seeks the player, and the two empty states differ', async ({
  browser,
}) => {
  expect(sampleMp4Base64).toBeTruthy();

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'load' });

  await openCard(page, 'Bench clip transcribed');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // A transcribed video with no conversation opens ON the transcript.
  const transcriptTab = dialog.getByRole('button', { name: /^Transcript/ });
  await expect(transcriptTab).toHaveAttribute('aria-pressed', 'true');

  for (const segment of SEGMENTS) {
    await expect(dialog.getByText(segment.text)).toBeVisible();
  }
  // Timecodes, not raw milliseconds.
  await expect(dialog.getByText('0:02', { exact: true })).toBeVisible();

  // Click the third line -> the stage player seeks to its startMs (2900ms).
  const stageVideo = dialog.locator('video').first();
  await expect
    .poll(async () => stageVideo.evaluate((element: HTMLVideoElement) => element.readyState >= 1))
    .toBe(true);

  await dialog.getByRole('button', { name: new RegExp(SEGMENTS[2]?.text ?? '') }).click();
  await expect
    .poll(async () => stageVideo.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(2.85);
  const seeked = await stageVideo.evaluate((element: HTMLVideoElement) => element.currentTime);
  expect(seeked).toBeLessThan(3.05);

  // The active line is the one under the playhead.
  await expect(
    dialog.getByRole('button', { name: new RegExp(SEGMENTS[2]?.text ?? '') }),
  ).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // '' (analyzed, no speech) and null (never transcribed) are DIFFERENT answers.
  await openCard(page, 'Bench clip silent');
  const silentDialog = page.getByRole('dialog');
  await silentDialog.getByRole('button', { name: /^Transcript/ }).click();
  await expect(silentDialog.getByText('Analyzed — no speech in this video.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(silentDialog).toBeHidden();

  await openCard(page, 'Bench clip untranscribed');
  const untranscribedDialog = page.getByRole('dialog');
  await untranscribedDialog.getByRole('button', { name: /^Transcript/ }).click();
  await expect(
    untranscribedDialog.getByText("This video hasn't been transcribed yet."),
  ).toBeVisible();

  await context.close();
});
