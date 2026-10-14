import { type ChildProcess, spawn } from 'node:child_process';
import {
  creativeRefFromAsset,
  type MediaAsset,
  shapeUserSuppliedMedia,
} from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// organic:creative-replace:fe:e2e:bench — Airtable bug #402, "the Replace button isn't
// working, so you can't change a photo".
//
// WHAT IT PROVES: a planner post opens in the read-only preview; a person enlarges its photo,
// presses Replace, picks another image from the brand's Library, and attaches it. The swap
// reaches organic_calendar_drafts.content_json.publishingAssets and survives a reload.
// Before the fix the Replace click closed the lightbox and opened a picker that was never
// mounted, so the "Add media" step below is the one that failed.
//
// REAL: hosted Postgres + storage + GoTrue, the bench brand's own Library assets, a
// bench-owned Fastify Backend on hosted (the fields PATCH), the Next app, real Chrome.
// The seeded draft carries media in the exact shape the product's own shaper writes.
//
// UN-EXERCISED, STATED: carousel slide replace (same entry point; unit-tested in
// OrganicDraftPreview.test.tsx) and the Details "Reuse from library" hover card.
//
// RESIDUE: one draft row, deleted by id. Library assets are only read.
//
// Run: bun run organic:creative-replace:fe:e2e:bench

const BENCH = 'organic:creative-replace:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const FRONTEND_DIR = process.cwd();
const APP_PORT = Number(process.env.CREATIVE_REPLACE_APP_PORT ?? 3134);
const APP = `http://127.0.0.1:${APP_PORT}`;
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4424);
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const RUN_ID = `${Date.now()}`;
const DRAFT_TITLE = `REPLACE BENCH ${RUN_ID}`;
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };
const SCREENSHOT_DIR = process.env.CREATIVE_REPLACE_SCREENSHOT_DIR;

const recorder = createBenchRecorder(BENCH, []);
const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const residue = {
  draftIds: [] as string[],
  brandPref: null as null | { userId: string; previous: string | null },
};

type AssetRow = {
  id: string;
  brand_id: string;
  kind: 'image';
  bucket: string;
  storage_path: string;
  file_name: string;
  title: string | null;
  mime_type: string;
  created_at: string;
  updated_at: string;
};

const tileLabel = (asset: AssetRow) => asset.title ?? asset.file_name;

async function readyLibraryImages(): Promise<AssetRow[]> {
  const { data, error } = await db
    .schema('media')
    .from('assets')
    .select(
      'id, brand_id, kind, bucket, storage_path, file_name, title, mime_type, created_at, updated_at',
    )
    .eq('brand_id', BENCH_BRAND)
    .eq('kind', 'image')
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`could not read the bench Library: ${error.message}`);
  return (data ?? []) as AssetRow[];
}

function asMediaAsset(row: AssetRow, signedUrl: string): MediaAsset {
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: 'image',
    bucket: row.bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    source: 'upload',
    status: 'ready',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl,
  };
}

async function seedSingleImageDraft(ownerId: string, asset: AssetRow): Promise<string> {
  const signed = await db.storage.from(asset.bucket).createSignedUrl(asset.storage_path, 3600);
  if (!signed.data?.signedUrl) throw new Error(`could not sign ${asset.storage_path}`);
  // The product's own shaper, so the seed is what an attach would have written.
  const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([
    creativeRefFromAsset(asMediaAsset(asset, signed.data.signedUrl)),
  ]);
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  const dayId = day.toISOString().slice(0, 10);
  const { data, error } = await db
    .schema('organic')
    .from('organic_calendar_drafts')
    .insert({
      brand_id: BENCH_BRAND,
      user_id: ownerId,
      platform: 'instagram',
      platform_account_id: 'unassigned',
      status: 'draft',
      scheduled_date: `${dayId}T15:00:00.000Z`,
      media_stage: 'realized',
      slot_data: {
        dayId,
        weekStart: dayId,
        timeLabel: '3:00 PM',
        platform: 'instagram',
        title: DRAFT_TITLE,
        draftSnapshot: {
          title: DRAFT_TITLE,
          status: 'draft',
          platforms: ['instagram'],
          format: 'Post',
          timeLabel: '3:00 PM',
          dateLabel: dayId,
          mediaCount: 1,
        },
      },
      content_json: {
        copy: { caption: 'REPLACE BENCH caption — the copy is not what is under test.' },
        content: { format: 'Post', type: 'post', titleTopic: DRAFT_TITLE },
        creative: { creativeIdea: DRAFT_TITLE, mediaSuggestion: mediaSuggestionPatch },
        publishingAssets,
      },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not seed the draft: ${error?.message}`);
  const draftId = (data as { id: string }).id;
  residue.draftIds.push(draftId);
  return draftId;
}

async function savedAssetIds(draftId: string): Promise<string[]> {
  const { data, error } = await db
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('content_json')
    .eq('id', draftId)
    .single();
  if (error || !data) throw new Error(`could not read draft ${draftId}: ${error?.message}`);
  const assets = (data as { content_json: { publishingAssets?: Array<{ assetId?: string }> } })
    .content_json?.publishingAssets;
  return (assets ?? []).map((asset) => asset.assetId ?? '');
}

async function pinActiveBrand(userId: string): Promise<void> {
  const prefs = db.schema('brand_profiles').from('user_brand_preferences');
  const { data } = await prefs.select('active_brand_id').eq('user_id', userId).maybeSingle();
  residue.brandPref = {
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  };
  await prefs
    .upsert({ user_id: userId, active_brand_id: BENCH_BRAND }, { onConflict: 'user_id' })
    .throwOnError();
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function killGroup(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-(child.pid as number), name);
    } catch {
      // Already gone.
    }
  };
  signal('SIGTERM');
  const quit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!quit) signal('SIGKILL');
}

// The registered script sources .env.local (the local stack) and Playwright starts its
// webServer before this file loads, so the hosted-targeted app has to be spawned here.
async function startHostedApp(backendUrl: string): Promise<() => Promise<void>> {
  if (await answers(APP)) {
    throw new Error(`${APP} already answers; set CREATIVE_REPLACE_APP_PORT to a free port.`);
  }
  const child = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/creative-replace-e2e-hosted',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 30) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const stop = () => killGroup(child);
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (await answers(`${APP}/login`)) return stop;
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await stop();
  throw new Error(`hosted Next app never came up on ${APP}\n${tail.join('')}`);
}

function fieldsSaved(page: Page, draftId: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(`/api/organic/calendar/drafts/${draftId}/fields`) &&
      response.request().method() === 'PATCH' &&
      response.ok(),
    { timeout: 60_000 },
  );
}

async function openDraft(page: Page, draftId: string): Promise<void> {
  await page.goto(`${APP}/organic?tab=planner&draftId=${draftId}`, NAV);
  try {
    await page.getByLabel('Enlarge creative').waitFor({ state: 'visible', timeout: 120_000 });
  } catch (error) {
    if (SCREENSHOT_DIR) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/open-draft-failed.png`, fullPage: true });
    }
    const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400);
    throw new Error(`the draft never showed its photo; the page read: ${shown}`, { cause: error });
  }
}

// The preview's own <img>: its signed URL carries the storage path.
async function shownCreativeSrc(page: Page): Promise<string> {
  const media = page.getByLabel('Enlarge creative').locator('xpath=..');
  return (await media.locator('img').first().getAttribute('src')) ?? '';
}

test.use({ channel: 'chrome' });

let backend: LocalBackend | null = null;
let stopApp: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  test.setTimeout(900_000);
  // A Backend on hosted from a laptop must not act on prod's queues or scheduled posts.
  Object.assign(process.env, {
    MCP_JOB_WORKER_ENABLED: 'false',
    BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    ORGANIC_SCHEDULED_PUBLISH_INTERVAL_MS: '2147483647',
    ORGANIC_REALIZE_DRIVER_INTERVAL_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_KICKOFF_MS: '2147483647',
    COMPETITOR_AD_SPY_SYNC_INTERVAL_MS: '2147483647',
  });
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
  stopApp = await startHostedApp(backend.url);
});

test.afterAll(async () => {
  for (const id of residue.draftIds) {
    await db.schema('organic').from('organic_calendar_drafts').delete().eq('id', id);
  }
  if (residue.brandPref?.previous) {
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: residue.brandPref.userId, active_brand_id: residue.brandPref.previous },
        { onConflict: 'user_id' },
      );
  }
  await stopApp?.();
  await backend?.stop();
  recorder.print();
});

test('#402: Replace on a read-only planner photo swaps it for a Library image', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);

  const library = await recorder.step(
    'setup: the bench brand has two ready Library images',
    async () => {
      const images = await readyLibraryImages();
      if (images.length < 2) throw new Error(`bench brand has ${images.length} ready images`);
      return images;
    },
  );
  const original = library[0];

  const draftId = await recorder.step(
    'setup: a single-photo draft, open read-only in the planner',
    async () => {
      const session = await mintSessionBundleForEmail(BENCH_EMAIL);
      await context.clearCookies();
      await context.addCookies(session.state.cookies);
      await pinActiveBrand(session.userId);
      const id = await seedSingleImageDraft(session.userId, original);
      await openDraft(page, id);
      await expect(page.getByLabel('Edit post', { exact: true })).toBeVisible();
      expect(await shownCreativeSrc(page)).toContain(original.storage_path);
      return id;
    },
  );

  await recorder.step('Enlarge → Replace opens the Library picker (the #402 failure)', async () => {
    await page.getByLabel('Enlarge creative').click();
    await page.getByRole('button', { name: 'Replace' }).click();
    await expect(page.getByText('Add media', { exact: true })).toBeVisible();
    // Opened, and STILL open once the lightbox's close and focus return have settled.
    await page.waitForTimeout(1_000);
    await expect(page.getByText('Add media', { exact: true })).toBeVisible();
  });

  const picked = await recorder.step(
    'picking another image and attaching it saves the draft',
    async () => {
      const byLabel = new Map(library.map((asset) => [tileLabel(asset), asset]));
      const isOther = (label: string) => {
        const asset = byLabel.get(label);
        return asset !== undefined && label !== tileLabel(original);
      };
      // Scoped to the picker: the panel's Edit toggle is an aria-pressed button too.
      const tiles = page.locator('[data-slot="popover-content"] button[aria-pressed]');
      const tileLabels = async () =>
        (
          await tiles.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
        ).filter((label): label is string => label !== null);
      await expect
        .poll(async () => (await tileLabels()).some(isOther), { timeout: 60_000 })
        .toBe(true)
        .catch(async () => {
          throw new Error(
            `no other bench image in the picker; tiles: ${(await tileLabels()).join(' | ')}`,
          );
        });
      const label = (await tileLabels()).find(isOther) as string;
      const choice = byLabel.get(label) as AssetRow;
      await tiles
        .and(page.getByLabel(label, { exact: true }))
        .first()
        .click();
      const saved = fieldsSaved(page, draftId);
      await page.getByRole('button', { name: /^Attach/ }).click();
      await saved;
      const ids = await savedAssetIds(draftId);
      // Labels are not unique, so grade the persisted id against every image with that label.
      const sameLabel = library.filter((asset) => tileLabel(asset) === tileLabel(choice));
      expect(ids).toHaveLength(1);
      expect(ids[0]).not.toBe(original.id);
      expect(sameLabel.map((asset) => asset.id)).toContain(ids[0]);
      return sameLabel.find((asset) => asset.id === ids[0]) as AssetRow;
    },
  );

  await recorder.step('the new photo shows in the panel and survives a reload', async () => {
    await expect.poll(() => shownCreativeSrc(page)).toContain(picked.storage_path);
    await openDraft(page, draftId);
    await expect.poll(() => shownCreativeSrc(page)).toContain(picked.storage_path);
  });
});
