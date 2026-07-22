import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';

// End-to-end bench for FEA-04: the video poster-frame PICKER + opportunistic
// client-side backfill. Everything runs against the REAL local stack — real
// Supabase storage + the real library-creative-operations edge function + the
// real Next /api/library/assets route — in a real Chrome (not Playwright's
// codec-stripped Chromium) so WebCodecs H.264 decode is genuinely exercised.
//
// What it proves:
//   1. generateVideoPoster(blob, { timestampSec: 2 }) picks the RIGHT frame — the
//      bench clip paints a different color each second, so a second-2 pick comes
//      back BLUE, distinct from the automatic ~1s frame (GREEN).
//   2. persistAssetRendition(role:'poster', posterSource:'user', 2000) writes a
//      ready poster rendition carrying its provenance.
//   3. REPLACE at second 3 reuses the SAME rendition id (signAssetRendition upsert
//      on (asset_version_id,'poster')), overwrites the bytes to YELLOW, and keeps
//      posterSource 'user'.
//   4. GET /api/library/assets surfaces the poster as a ready IMAGE preview with a
//      signed URL whose bytes match the pick.
//   5. Backfill: a posterless ai_generated video gains an 'auto' poster rendition
//      when the opportunistic hook runs, and the assets API then returns it.
//
// Un-exercised by design: AI-only / non-browser-decodable videos stay posterless
// (there is no server decode path). And if CI lacks real Chrome, H.264 decode —
// and therefore every hop here — is un-exercised.
//
// Run: bun run library:poster:select:e2e:bench (from Continuum-Frontend; sources
// .env.local). Requires the local library-creative-operations edge function to
// be served; if edge functions are not wired locally, the persist/replace/read/
// backfill hops cannot run and only the in-page decode (step 1) is exercised.

test.use({ channel: 'chrome' });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const BUCKET = 'media-library';
const BENCH_TAG = 'poster-select-bench';

const PICK_ASSET_ID = 'cccccccc-0000-4000-8000-00000000d0f1';
const PICK_VERSION_ID = 'cccccccc-0000-4000-8000-00000000d0f2';
const BACKFILL_ASSET_ID = 'cccccccc-0000-4000-8000-00000000d0f3';
const BACKFILL_VERSION_ID = 'cccccccc-0000-4000-8000-00000000d0f4';

const clipPath = (assetId: string) => `${BRAND_ID}/${assetId}/bench-select.mp4`;

// The injected bundle is built with `bun build`, which does not inline Next's
// NEXT_PUBLIC_* env the way `next build` does, so createSupabaseBrowserClient
// finds no `process.env` in the page. Hand it the two public values the client
// needs; the auth session still comes from the page's own session cookies.
function browserEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}

let storageState: PlaywrightStorageState;
let admin: SupabaseClient;
let bundle: string;

function mediaTable(client: SupabaseClient, table: string) {
  return (client as unknown as { schema: (s: string) => SupabaseClient })
    .schema('media')
    .from(table);
}

function assetRow(overrides: { id: string } & Record<string, unknown>) {
  return {
    brand_id: BRAND_ID,
    kind: 'video',
    bucket: BUCKET,
    storage_path: clipPath(overrides.id),
    file_name: 'bench-select.mp4',
    mime_type: 'video/mp4',
    duration_ms: 4000,
    width: 640,
    height: 360,
    source: 'ai_generated',
    status: 'ready',
    tags: [BENCH_TAG],
    ...overrides,
  };
}

function versionRow(assetId: string, versionId: string) {
  return {
    id: versionId,
    brand_id: BRAND_ID,
    asset_id: assetId,
    version_number: 1,
    bucket: BUCKET,
    storage_path: clipPath(assetId),
    file_name: 'bench-select.mp4',
    mime_type: 'video/mp4',
    size_bytes: 0,
    width: 640,
    height: 360,
    duration_ms: 4000,
    integrity_state: 'unknown',
  };
}

async function loadPoster(versionId: string) {
  const { data } = await mediaTable(admin, 'asset_renditions')
    .select('id, state, poster_source, source_timestamp_ms, storage_path, mime_type')
    .eq('asset_version_id', versionId)
    .eq('role', 'poster')
    .maybeSingle();
  return data as {
    id: string;
    state: string;
    poster_source: string | null;
    source_timestamp_ms: number | null;
    storage_path: string | null;
    mime_type: string | null;
  } | null;
}

// The browser half (Mediabunny encode + the real videoPoster/persist modules) is
// bundled with Bun — Playwright's runner is Node and cannot import the app's TS.
function buildBrowserBundle(): string {
  const outfile = join(tmpdir(), `poster-select-bench-${Date.now()}.js`);
  execFileSync(
    'bun',
    ['build', 'e2e/support/posterSelectBenchEntry.ts', '--target=browser', '--outfile', outfile],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  const code = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return code;
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
  // Break the asset→version head link before deleting versions (FK both ways).
  await mediaTable(admin, 'assets')
    .update({ head_version_id: null })
    .in('id', [PICK_ASSET_ID, BACKFILL_ASSET_ID]);
  await mediaTable(admin, 'asset_renditions')
    .delete()
    .in('asset_version_id', [PICK_VERSION_ID, BACKFILL_VERSION_ID]);
  await mediaTable(admin, 'asset_versions')
    .delete()
    .in('id', [PICK_VERSION_ID, BACKFILL_VERSION_ID]);
  await mediaTable(admin, 'assets').delete().in('id', [PICK_ASSET_ID, BACKFILL_ASSET_ID]);
  await admin.storage.from(BUCKET).remove([clipPath(PICK_ASSET_ID), clipPath(BACKFILL_ASSET_ID)]);
});

test('poster picker: pick, persist, replace-in-place, and read back through the assets API', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__posterSelectBench));
  await page.evaluate((env) => {
    const scope = window as unknown as { process?: { env?: Record<string, string> } };
    scope.process = scope.process ?? {};
    scope.process.env = { ...(scope.process.env ?? {}), ...env };
  }, browserEnv());

  // A real H.264 MP4, one color per second (0 red, 1 green, 2 blue, 3 yellow).
  const sample = await page.evaluate(() => window.__posterSelectBench.makeSampleMp4());
  expect(sample.byteLength).toBeGreaterThan(10_000);

  // 1) The picker's decode grabs the RIGHT second — 2s is blue, not the auto ~1s.
  const pickTwo = await page.evaluate(
    (base64) => window.__posterSelectBench.capturePoster(base64, 2),
    sample.base64,
  );
  expect(pickTwo).not.toBeNull();
  if (!pickTwo) throw new Error('no poster at second 2');
  expect(pickTwo.mimeType).toBe('image/webp');
  expect(pickTwo.timestampSec).toBeGreaterThan(1.8);
  expect(pickTwo.timestampSec).toBeLessThan(2.3);
  {
    const [r, g, b] = pickTwo.centerRgb;
    expect(b).toBeGreaterThan(120);
    expect(b).toBeGreaterThan(r + 40);
    expect(b).toBeGreaterThan(g + 40);
  }

  // 2) Seed the asset + head version the poster belongs to, with real bytes.
  const mp4Bytes = Buffer.from(sample.base64, 'base64');
  for (const assetId of [PICK_ASSET_ID, BACKFILL_ASSET_ID]) {
    const upload = await admin.storage
      .from(BUCKET)
      .upload(clipPath(assetId), mp4Bytes, { contentType: 'video/mp4', upsert: true });
    expect(upload.error).toBeNull();
  }
  // assets.head_version_id and asset_versions.asset_id reference each other, so
  // seed the asset first (head null), then the version, then point the head at it.
  expect(
    (
      await mediaTable(admin, 'assets').insert([
        assetRow({ id: PICK_ASSET_ID, title: 'Poster pick bench' }),
        assetRow({ id: BACKFILL_ASSET_ID, title: 'Poster backfill bench' }),
      ])
    ).error,
  ).toBeNull();
  expect(
    (
      await mediaTable(admin, 'asset_versions').insert([
        versionRow(PICK_ASSET_ID, PICK_VERSION_ID),
        versionRow(BACKFILL_ASSET_ID, BACKFILL_VERSION_ID),
      ])
    ).error,
  ).toBeNull();
  for (const [assetId, versionId] of [
    [PICK_ASSET_ID, PICK_VERSION_ID],
    [BACKFILL_ASSET_ID, BACKFILL_VERSION_ID],
  ]) {
    expect(
      (await mediaTable(admin, 'assets').update({ head_version_id: versionId }).eq('id', assetId))
        .error,
    ).toBeNull();
  }

  // 3) Persist the second-2 pick through the REAL rendition path (edge fn).
  const persisted = await page.evaluate(
    (input) => window.__posterSelectBench.persistUserPoster(input),
    {
      brandId: BRAND_ID,
      assetId: PICK_ASSET_ID,
      assetVersionId: PICK_VERSION_ID,
      base64: pickTwo.base64,
      mimeType: pickTwo.mimeType,
      sourceTimestampMs: 2000,
    },
  );
  expect(persisted.signedUrl).toBeTruthy();

  const afterPick = await loadPoster(PICK_VERSION_ID);
  expect(afterPick?.state).toBe('ready');
  expect(afterPick?.poster_source).toBe('user');
  expect(afterPick?.source_timestamp_ms).toBe(2000);
  const firstRenditionId = afterPick?.id;

  // 4) REPLACE at second 3 (yellow): SAME rendition id, bytes swapped in place.
  const pickThree = await page.evaluate(
    (base64) => window.__posterSelectBench.capturePoster(base64, 3),
    sample.base64,
  );
  if (!pickThree) throw new Error('no poster at second 3');
  const replaced = await page.evaluate(
    (input) => window.__posterSelectBench.persistUserPoster(input),
    {
      brandId: BRAND_ID,
      assetId: PICK_ASSET_ID,
      assetVersionId: PICK_VERSION_ID,
      base64: pickThree.base64,
      mimeType: pickThree.mimeType,
      sourceTimestampMs: 3000,
    },
  );
  expect(replaced.renditionId).toBe(persisted.renditionId);

  const afterReplace = await loadPoster(PICK_VERSION_ID);
  expect(afterReplace?.id).toBe(firstRenditionId);
  expect(afterReplace?.poster_source).toBe('user');
  expect(afterReplace?.source_timestamp_ms).toBe(3000);

  // The stored bytes now round-trip to second-3's YELLOW.
  const { data: storedSigned } = await admin.storage
    .from('media-previews')
    .createSignedUrl(afterReplace?.storage_path ?? '', 60);
  const storedBytes = new Uint8Array(
    await (await fetch(storedSigned?.signedUrl ?? '')).arrayBuffer(),
  );
  const storedBase64 = Buffer.from(storedBytes).toString('base64');
  const storedRgb = await page.evaluate(
    (base64) => window.__posterSelectBench.probeImageColor(base64),
    storedBase64,
  );
  {
    const [r, g, b] = storedRgb;
    expect(r).toBeGreaterThan(120);
    expect(g).toBeGreaterThan(120);
    expect(b).toBeLessThan(90);
  }

  // 5) The assets API surfaces the poster as a ready IMAGE preview.
  const listed = await page.evaluate(
    async ({ brandId, tag }) => {
      const response = await fetch(`/api/library/assets?brandId=${brandId}&kind=video&tags=${tag}`);
      return { status: response.status, body: await response.json() };
    },
    { brandId: BRAND_ID, tag: BENCH_TAG },
  );
  expect(listed.status).toBe(200);
  const pickItem = (listed.body.items as Array<Record<string, unknown>>).find(
    (item) => item.id === PICK_ASSET_ID,
  );
  const pickPreview = pickItem?.preview as
    | { state: string; kind: string | null; signedUrl: string | null }
    | undefined;
  expect(pickPreview?.state).toBe('ready');
  expect(pickPreview?.kind).toBe('image');
  expect(pickPreview?.signedUrl).toBeTruthy();

  const previewBytes = new Uint8Array(
    await (await fetch(pickPreview?.signedUrl ?? '')).arrayBuffer(),
  );
  expect(previewBytes.byteLength).toBeGreaterThan(1_000);
  // RIFF....WEBP — a genuine WebP still, not a blank.
  expect(String.fromCharCode(...previewBytes.slice(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...previewBytes.slice(8, 12))).toBe('WEBP');

  await context.close();
});

test('backfill: a posterless ai_generated video gains an auto poster and surfaces it', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => Boolean(window.__posterSelectBench));
  await page.evaluate((env) => {
    const scope = window as unknown as { process?: { env?: Record<string, string> } };
    scope.process = scope.process ?? {};
    scope.process.env = { ...(scope.process.env ?? {}), ...env };
  }, browserEnv());

  // The backfill asset was seeded posterless (no rendition, no thumbnail_path).
  expect(await loadPoster(BACKFILL_VERSION_ID)).toBeNull();

  const sample = await page.evaluate(() => window.__posterSelectBench.makeSampleMp4());
  const backfilled = await page.evaluate(
    (input) => window.__posterSelectBench.backfillAutoPoster(input),
    {
      brandId: BRAND_ID,
      assetId: BACKFILL_ASSET_ID,
      assetVersionId: BACKFILL_VERSION_ID,
      mp4Base64: sample.base64,
    },
  );
  expect(backfilled).not.toBeNull();

  const poster = await loadPoster(BACKFILL_VERSION_ID);
  expect(poster?.state).toBe('ready');
  expect(poster?.poster_source).toBe('auto');

  const listed = await page.evaluate(
    async ({ brandId, tag }) => {
      const response = await fetch(`/api/library/assets?brandId=${brandId}&kind=video&tags=${tag}`);
      return response.json();
    },
    { brandId: BRAND_ID, tag: BENCH_TAG },
  );
  const backfillItem = (listed.items as Array<Record<string, unknown>>).find(
    (item) => item.id === BACKFILL_ASSET_ID,
  );
  const backfillPreview = backfillItem?.preview as
    | { state: string; kind: string | null; signedUrl: string | null }
    | undefined;
  expect(backfillPreview?.state).toBe('ready');
  expect(backfillPreview?.kind).toBe('image');
  expect(backfillPreview?.signedUrl).toBeTruthy();

  await context.close();
});
