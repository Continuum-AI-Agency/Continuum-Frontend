import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  type Browser,
  type BrowserType,
  chromium,
  type Page,
  test,
  webkit,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintSessionForEmail, type PlaywrightStorageState } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// ---------------------------------------------------------------------------
// canvas-media:e2e:bench — the three things Vivo47 reported on 2026-09-23, end to end,
// in a real Chromium and a real WebKit (the report came from Safari), as the bench login
// against PRODUCTION Supabase and the production Backend.
//
//   1. DOWNLOAD — an Image Generator node whose variation links expired (seeded with
//      links that really are dead: Storage answers InvalidJWT). Clicking "Download
//      variation 1" must save the ORIGINAL — sha256 and byte count equal to the
//      media.assets row — and the tab must stay on the canvas. Before the fix the tab
//      navigated onto Storage's JSON error page.
//   2. RE-DROP — the file just downloaded, dropped onto an empty Image node, must NOT
//      create a second media.assets row: the node points at the stored asset.
//   3. LIBRARY — cards paint from Supabase display derivatives
//      (/render/image/sign/), and nothing goes through /_next/image, which the Vercel
//      quota turned into a 402 on every card.
//
// Writes: one canvas room per browser in the BENCH brand (deleted by id; its sessions
// cascade), the bench user's active-brand preference (captured, restored), and — only
// if dedup is broken — the duplicate upload it would create (soft-deleted by id, its
// object removed). Nothing touches a client brand.
//
// Usage: cd Continuum-Frontend && bun run canvas-media:e2e:bench
// ---------------------------------------------------------------------------

const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();

const BENCH_BRAND_ID =
  process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const BENCH_OWNER_USER_ID =
  process.env.CONTINUUM_TEST_OWNER_USER_ID ?? '305ee8b3-12c8-4c5e-b364-97c21be8425c';
const RUN_ID = randomUUID().slice(0, 8);
const GEN_NODE_ID = `bench-gen-${RUN_ID}`;
const DROP_NODE_ID = `bench-drop-${RUN_ID}`;

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const media = () => admin.schema('media');
const brandProfiles = () => admin.schema('brand_profiles');

/* -- the Recorder envelope (same shape as the Backend `_bench` Recorder) ---------- */

const graded: { step: string; grade: 'PASS' | 'FAIL'; detail?: string }[] = [];
const notes: string[] = [];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

function grade(step: string, ok: boolean, detail?: string): void {
  graded.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

function note(message: string): void {
  notes.push(message);
  console.log(`· ${message}`);
}

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) counts[result.grade === 'PASS' ? 'pass' : 'fail'] += 1;
  console.log(
    JSON.stringify({
      bench: 'canvas-media:e2e:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes,
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

/* -- fixtures ---------------------------------------------------------------------- */

type AssetRow = {
  id: string;
  bucket: string;
  storage_path: string;
  size_bytes: number;
  checksum: string;
  head_version_id: string;
};

const roomIds: string[] = [];
let assets: AssetRow[] = [];
let expiredUrls: string[] = [];
let previousActiveBrand: string | null = null;
let storageState: PlaywrightStorageState;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function countByChecksum(checksum: string): Promise<number> {
  const { count, error } = await media()
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', BENCH_BRAND_ID)
    .eq('checksum', checksum)
    .is('deleted_at', null);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function seedRoom(label: string): Promise<string> {
  const { data: room, error } = await brandProfiles()
    .from('canvas_rooms')
    .insert({
      brand_profile_id: BENCH_BRAND_ID,
      name: `bench:canvas-media ${label} ${RUN_ID}`,
      created_by: BENCH_OWNER_USER_ID,
    })
    .select('id')
    .single();
  if (error || !room) throw new Error(`room insert failed: ${error?.message}`);
  const roomId = (room as { id: string }).id;
  roomIds.push(roomId);

  const box = { width: 300, height: 300 };
  const nodes = [
    {
      id: GEN_NODE_ID,
      type: 'nanoGen',
      position: { x: 80, y: 80 },
      ...box,
      style: box,
      data: {
        variationCount: 4,
        generatedImages: assets.map((asset, index) => ({
          preview: expiredUrls[index],
          storagePath: asset.storage_path,
          storageBucket: asset.bucket,
          assetId: asset.id,
          assetVersionId: asset.head_version_id,
        })),
      },
    },
    { id: DROP_NODE_ID, type: 'image', position: { x: 480, y: 80 }, ...box, style: box, data: {} },
  ];
  const { error: sessionError } = await brandProfiles()
    .from('canvas_sessions')
    .insert({ brand_profile_id: BENCH_BRAND_ID, room_id: roomId, nodes, edges: [] });
  if (sessionError) throw new Error(`session insert failed: ${sessionError.message}`);
  return roomId;
}

async function readDropNode(roomId: string): Promise<Record<string, unknown> | null> {
  const { data } = await brandProfiles()
    .from('canvas_sessions')
    .select('nodes')
    .eq('room_id', roomId)
    .maybeSingle();
  const nodes = ((data as { nodes?: unknown[] } | null)?.nodes ?? []) as Array<{
    id: string;
    data?: Record<string, unknown>;
  }>;
  return nodes.find((node) => node.id === DROP_NODE_ID)?.data ?? null;
}

async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, ms: number) {
  const deadline = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    value = await read();
  }
  return value;
}

test.beforeAll(async () => {
  const { data, error } = await media()
    .from('assets')
    .select('id, bucket, storage_path, size_bytes, checksum, head_version_id')
    .eq('brand_id', BENCH_BRAND_ID)
    .eq('kind', 'image')
    .eq('bucket', 'brand-profile-assets')
    .eq('mime_type', 'image/jpeg')
    .not('checksum', 'is', null)
    .not('head_version_id', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2);
  if (error) throw new Error(`asset read failed: ${error.message}`);
  assets = (data ?? []) as AssetRow[];
  if (assets.length < 2) throw new Error('bench brand needs 2 generated JPEGs with a checksum');

  // Links that are REALLY dead, not mocked: one-second TTL, then wait it out.
  expiredUrls = await Promise.all(
    assets.map(async (asset) => {
      const signed = await admin.storage.from(asset.bucket).createSignedUrl(asset.storage_path, 1);
      if (!signed.data?.signedUrl) throw new Error('could not sign the seed link');
      return signed.data.signedUrl;
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const probe = await fetch(expiredUrls[0] as string);
  const body = await probe.text();
  grade(
    'seeded variation link is dead at Storage',
    probe.status === 400 && body.includes('InvalidJWT'),
    `status=${probe.status}`,
  );

  const { data: preference } = await brandProfiles()
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', BENCH_OWNER_USER_ID)
    .maybeSingle();
  previousActiveBrand =
    (preference as { active_brand_id?: string } | null)?.active_brand_id ?? null;
  await brandProfiles().from('user_brand_preferences').upsert(
    {
      user_id: BENCH_OWNER_USER_ID,
      active_brand_id: BENCH_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // One mint for the whole run: concurrent mints for one user invalidate each other.
  storageState = await mintSessionForEmail(BENCH_OWNER_EMAIL);
});

test.afterAll(async () => {
  try {
    if (roomIds.length > 0) {
      await brandProfiles().from('canvas_active_view').delete().in('room_id', roomIds);
      await brandProfiles().from('canvas_rooms').delete().in('id', roomIds);
    }
    // Only exists if dedup failed: a second row carrying one of our checksums, made by
    // this run. Removed by id, never by time window alone.
    for (const asset of assets) {
      const { data } = await media()
        .from('assets')
        .select('id, bucket, storage_path')
        .eq('brand_id', BENCH_BRAND_ID)
        .eq('checksum', asset.checksum)
        .neq('id', asset.id)
        .gte('created_at', benchStartedAt)
        .is('deleted_at', null);
      for (const row of (data ?? []) as Array<Pick<AssetRow, 'id' | 'bucket' | 'storage_path'>>) {
        await media()
          .from('assets')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', row.id);
        await admin.storage.from(row.bucket).remove([row.storage_path]);
        note(`cleaned duplicate upload ${row.id}`);
      }
    }
    if (previousActiveBrand && previousActiveBrand !== BENCH_BRAND_ID) {
      await brandProfiles().from('user_brand_preferences').upsert(
        {
          user_id: BENCH_OWNER_USER_ID,
          active_brand_id: previousActiveBrand,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    }
  } finally {
    printBenchEnvelope();
  }
});

/* -- the three hops, per browser ------------------------------------------------------ */

async function downloadAndRedrop(page: Page, name: string, roomId: string): Promise<void> {
  const [asset] = assets as [AssetRow];
  await page.goto(`/ai-studio?roomId=${roomId}`, { timeout: 240_000 });

  const button = page.getByRole('button', { name: 'Download variation 1' });
  await button.waitFor({ state: 'attached', timeout: 180_000 });
  await button.locator('..').hover();

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
  await button.click({ force: true });
  const download = await downloadPromise;
  await page.waitForTimeout(1_500);

  grade(
    `${name}: tab stays on the canvas after download`,
    page.url().includes('/ai-studio'),
    page.url(),
  );
  if (!download) {
    grade(`${name}: download starts`, false, 'no download event within 60s');
    return;
  }
  const filePath = await download.path();
  const bytes = await readFile(filePath);
  grade(
    `${name}: downloaded bytes are the stored original`,
    sha256(bytes) === asset.checksum && bytes.length === asset.size_bytes,
    `${bytes.length} B vs ${asset.size_bytes} B`,
  );
  grade(
    `${name}: download followed a fresh original link`,
    download.url().includes('/object/sign/') && download.url() !== expiredUrls[0],
  );

  const before = await countByChecksum(asset.checksum);
  const dataTransfer = await page.evaluateHandle(
    ({ base64, fileName }) => {
      const binary = atob(base64);
      const view = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([view], fileName, { type: 'image/jpeg' }));
      return transfer;
    },
    { base64: bytes.toString('base64'), fileName: download.suggestedFilename() },
  );
  const dropZone = page.locator(`label[for="file-${DROP_NODE_ID}"]`);
  await dropZone.dispatchEvent('dragover', { dataTransfer });
  await dropZone.dispatchEvent('drop', { dataTransfer });

  const dropped = await poll(
    () => readDropNode(roomId),
    (data) => data?.referenceStatus === 'ready' || data?.referenceStatus === 'error',
    60_000,
  );
  const after = await countByChecksum(asset.checksum);
  grade(`${name}: re-drop saves no second copy`, after === before, `rows ${before} → ${after}`);
  grade(
    `${name}: re-dropped node points at the stored asset`,
    dropped?.assetId === asset.id && dropped?.bucket === asset.bucket,
    `assetId=${String(dropped?.assetId)} bucket=${String(dropped?.bucket)} status=${String(dropped?.referenceStatus)}`,
  );
}

async function libraryThumbnails(page: Page, name: string): Promise<void> {
  const optimizerRequests: string[] = [];
  const failedMedia: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/_next/image')) optimizerRequests.push(request.url());
  });
  const derivativeResponses: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/render/image/sign/')) derivativeResponses.push(response.status());
    if (response.url().includes('/storage/v1/') && response.status() >= 400) {
      failedMedia.push(`${response.status()} ${new URL(response.url()).pathname.slice(0, 90)}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') failedMedia.push(`console: ${message.text().slice(0, 200)}`);
  });
  await page.goto('/library', { timeout: 240_000 });
  const painted = await poll(
    () =>
      page.evaluate(
        () =>
          Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter(
            (img) =>
              img.src.includes('/render/image/sign/') && img.complete && img.naturalWidth > 0,
          ).length,
      ),
    (count) => count > 0,
    90_000,
  );
  grade(
    `${name}: library cards paint from Supabase derivatives`,
    painted > 0,
    `${painted} painted`,
  );
  grade(
    `${name}: nothing goes through /_next/image`,
    optimizerRequests.length === 0,
    `${optimizerRequests.length} optimizer requests`,
  );
  const broken = await page.locator('svg.lucide-image-off').count();
  note(`${name}: ${broken} cards showing the broken-image placeholder`);
  const sources = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img'))
      .map((img) => `${img.naturalWidth}px ${img.src.split('?')[0]?.slice(0, 110)}`)
      .slice(0, 6),
  );
  for (const source of sources) note(`${name}: img ${source}`);
  note(`${name}: derivative responses ${JSON.stringify(derivativeResponses.slice(0, 12))}`);
  const brokenCards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('svg.lucide-image-off')).map(
      (icon) =>
        icon.closest('[data-asset-id], article, li, [role="button"]')?.textContent?.slice(0, 80) ??
        '?',
    ),
  );
  for (const card of brokenCards.slice(0, 7)) note(`${name}: placeholder card "${card}"`);
  for (const failure of failedMedia.slice(0, 8)) note(`${name}: ${failure}`);
}

const BROWSERS: Array<[string, BrowserType]> = [
  ['chromium', chromium],
  ['webkit', webkit],
];

for (const [name, browserType] of BROWSERS) {
  test(`${name}: canvas download, re-drop dedup and library thumbnails`, async () => {
    const roomId = await seedRoom(name);
    let browser: Browser | null = null;
    try {
      browser = await browserType.launch();
      const context = await browser.newContext({
        storageState,
        acceptDownloads: true,
        viewport: { width: 1600, height: 1000 },
        baseURL: process.env.PLAYWRIGHT_BASE_URL,
      });
      const page = await context.newPage();
      await downloadAndRedrop(page, name, roomId);
      await libraryThumbnails(page, name);
    } finally {
      await browser?.close();
    }
  });
}
