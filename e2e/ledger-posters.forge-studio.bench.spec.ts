import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { apiRenderJobListResponseSchema } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import { installForgeFixtures, STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// forge:ledger:posters:e2e:bench, the page step. Spawned by the Backend half
// (Continuum-Backend/scripts/forge-ledger-posters-e2e-bench.ts), which has just driven a REAL fleet
// MP4 through callback → ingest → poster and written the service's real `listJobs` page to
// FORGE_LEDGER_POSTERS_PAYLOAD.
//
// Same harness as ledger-r2: a minted StarCraft session and the server-rendered /forge page, with
// /api/ai-studio/** answered in the browser — the jobs list here is that real payload, parsed
// through the Frontend's own contract. The poster is the real signed Supabase link.
//
// It proves the ledger draws the poster (really loaded), mounts no <video> in any row, and the
// opened render shows its poster and plays (and downloads) the Library copy — nothing on the page
// is ever fetched from the fleet's bucket. NOT exercised: the HTTP hop to Fastify, whose route parses this same return through the
// same schema.

const PAYLOAD = process.env.FORGE_LEDGER_POSTERS_PAYLOAD;
const OWNER_EMAIL = 'duane@continuumai.agency';
const FLEET_HOST = 'https://picnic-studio-v3-main-storage.s3.us-east-2.amazonaws.com';
const SHOTS_DIR = resolve(__dirname, '__screenshots__/forge-studio');
const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();

let session: MintedSession | null = null;

/** Pins THIS session to StarCraft through the member's own RLS, as ledger-r2 does. */
async function pinSessionToStarCraft(accessToken: string): Promise<void> {
  const payload = accessToken.split('.')[1] ?? '';
  const { sub, session_id } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub: string;
    session_id: string;
  };
  const member = createClient(PROD_SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[ledger-posters] session brand pin failed: ${error.message}`);
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  if (!PAYLOAD) return;
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  await pinSessionToStarCraft(session.accessToken);
});

test.afterAll(async () => {
  if (!session) return;
  const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  session = null;
});

test('the ledger draws each video render as its poster, never as a video', async ({ browser }) => {
  test.skip(
    !PAYLOAD,
    'run through `bun run forge:ledger:posters:e2e:bench`, which writes the payload',
  );
  if (!PAYLOAD || !existsSync(PAYLOAD) || !session)
    throw new Error('[ledger-posters] no payload or session');
  const page = apiRenderJobListResponseSchema.parse(JSON.parse(readFileSync(PAYLOAD, 'utf8')));
  const job = page.items[0];
  const posterUrl = job?.outputs[0]?.posterUrl;
  const libraryUrl = job?.outputs[0]?.libraryUrl;
  if (!job || !posterUrl || !libraryUrl) {
    throw new Error('[ledger-posters] the payload carries no posterUrl or libraryUrl');
  }

  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1280, height: 800 },
  });
  const fixtures = await installForgeFixtures(context);
  fixtures.state.jobs = page.items;
  const fleetHits: string[] = [];
  await context.route(`${FLEET_HOST}/**`, async (route) => {
    fleetHits.push(route.request().url());
    await route.continue();
  });
  const tab = await context.newPage();
  const loaded = (selector: string) =>
    tab
      .locator(selector)
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth));

  await tab.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(tab.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  const ledgerTab = tab.getByRole('tab', { name: 'Render ledger', exact: true });
  await expect(async () => {
    await ledgerTab.click();
    await expect(ledgerTab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  const ledger = tab.getByRole('tabpanel', { name: 'Render ledger' });
  const poster = `img[src="${posterUrl}"]`;

  // The batch row: its preview is the poster, loaded from Storage — and no player anywhere.
  await expect(ledger.locator(poster)).toHaveCount(1);
  // Drawn, not just mounted: the image finished loading with pixels.
  await expect.poll(async () => (await loaded(poster))[0] ?? 0).toBeGreaterThan(0);
  await expect(ledger.locator('video')).toHaveCount(0);
  mkdirSync(SHOTS_DIR, { recursive: true });
  await tab.screenshot({ path: resolve(SHOTS_DIR, 'ledger-posters-batches.png') });

  // The batch opened: the render's row draws the same poster, still no player.
  await ledger
    .getByRole('row')
    .filter({ has: tab.locator(poster) })
    .click();
  const label = job.label ?? job.labelPath.at(-1) ?? '';
  await expect(ledger.getByText(label, { exact: true })).toBeVisible();
  await expect(ledger.locator(poster)).toHaveCount(1);
  await expect.poll(async () => (await loaded(poster))[0] ?? 0).toBeGreaterThan(0);
  await expect(ledger.locator('video')).toHaveCount(0);
  expect(fleetHits, 'the ledger fetched a render from the fleet bucket').toEqual([]);
  await tab.screenshot({ path: resolve(SHOTS_DIR, 'ledger-posters-batch.png') });

  // Opened, the player shows the poster at once and plays the Library copy (storage behind a
  // CDN, download-disposed — a <video> ignores that), never the fleet's far bucket.
  await ledger.getByText(label, { exact: true }).click();
  const player = tab.getByRole('group', { name: 'Render preview' }).locator('video');
  await expect(player).toHaveAttribute('poster', posterUrl);
  await expect(player).toHaveAttribute('src', libraryUrl);
  await expect
    .poll(() => player.evaluate((video) => (video as HTMLVideoElement).readyState), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(2);
  await expect(tab.getByRole('link', { name: 'Download MP4' })).toHaveAttribute('href', libraryUrl);
  expect(fleetHits, 'opening the render fetched it from the fleet bucket').toEqual([]);
  await tab.screenshot({ path: resolve(SHOTS_DIR, 'ledger-posters-detail.png') });

  expect(fixtures.violations, 'a body the real contract refuses').toEqual([]);
  await context.close();
});
