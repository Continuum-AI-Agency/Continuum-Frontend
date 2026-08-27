import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintAccessTokenForEmail, mintSessionWithPassword } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';

// Onboarding product-catalog bench — does the step actually put products in the database,
// and does it tell the truth about the ones it could not?
//
// The claim under test is the whole point of the bulk endpoint: one bad row never costs
// the good ones, the bad row comes back BY INDEX with the server's own reason, and a
// second run of the same catalog UPDATES rather than duplicating.
//
// Real path across real boundaries. The browser drives the REAL onboarding screen; the
// import goes over HTTP to the REAL Fastify Backend (bench-owned, pointed at the local
// stack); `importElementCatalog` -> `partitionElementCatalog` -> `media.asset_groups` is
// the real code; and the read-back is a second REAL Backend request, not a peek at the
// component's own state.
//
// Prerequisites (see e2e/README.md):
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   Run with: bun run onboarding:catalog:bench
//
// UN-EXERCISED HOP, STATED EXPLICITLY - this bench does NOT drive a real image upload.
// `uploadMediaAsset` posts to the `library-upload` EDGE FUNCTION, and edge functions are
// deliberately not wired on the local stack (root AGENTS.md section 3 - no secrets
// locally; the container answers 503 `name resolution failed`). So that ONE call is
// intercepted, and the interception creates the artifacts it would have created: real
// PNG bytes in the real `media-library` bucket and a real `media.assets` row, whose id is
// then what the screen carries and what the Backend's `validateMembers` loads. Everything
// on both sides of that hop - the drop zone, the draft editor, the request, the endpoint,
// the rows, the read-back - is real.

const LOCAL_OWNER_EMAIL = 'local@continuum.test';
const LOCAL_OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const MEDIA_BUCKET = 'media-library';
const BENCH_PREFIX = `${BRAND_ID}/onboarding-catalog-bench`;

// Named so a leftover row is obviously the bench's, and so the purge can find them by
// slug without touching a real Element.
const HERO = { name: 'Bench Hero Bottle', slug: 'bench-hero-bottle', sku: 'BENCH-HB-500' };
const MUG = { name: 'Bench Trail Mug', slug: 'bench-trail-mug' };
const BROKEN = { name: 'Bench Broken Widget', slug: 'bench-broken-widget' };
const BENCH_SLUGS = [HERO.slug, MUG.slug, BROKEN.slug];

const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// A 1x1 PNG. The bytes matter only in that they are real image bytes in real storage -
// nothing in this path decodes them.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[onboarding:catalog:bench] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run `bun run supabase:env:local`.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const brandProfiles = (client: SupabaseClient) => client.schema('brand_profiles');
const media = (client: SupabaseClient) => client.schema('media');

/* -- the seam: the one dead hop, replaced by the artifacts it would have made ---- */

/** Every asset row this run created, so the purge can prove it removed them. */
const seededAssetIds: string[] = [];
const seededStoragePaths: string[] = [];

async function seedLibraryImage(
  supabase: SupabaseClient,
  fileName: string,
): Promise<{ assetId: string; storagePath: string }> {
  const assetId = randomUUID();
  const storagePath = `${BENCH_PREFIX}/${assetId}.png`;

  const upload = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, PNG_BYTES, { contentType: 'image/png', upsert: true });
  if (upload.error) {
    throw new Error(`[onboarding:catalog:bench] storage upload failed: ${upload.error.message}`);
  }

  await media(supabase)
    .from('assets')
    .insert({
      id: assetId,
      brand_id: BRAND_ID,
      created_by: OWNER_ID,
      kind: 'image',
      bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: 'image/png',
      size_bytes: PNG_BYTES.byteLength,
      source: 'upload',
      status: 'stored',
    })
    .throwOnError();

  seededAssetIds.push(assetId);
  seededStoragePaths.push(storagePath);
  return { assetId, storagePath };
}

/**
 * Intercept ONLY `library-upload` and the signed-object PUT it hands out.
 *
 * `sign_upload` does the real work the edge function would have done - bytes into the
 * real bucket, a real `media.assets` row - and hands back a ticket pointing at them.
 * `register` returns the real signed URL for that object. Nothing else is stubbed: the
 * screen, the catalog request and the Backend all run against those real rows.
 */
async function interceptLibraryUpload(page: Page, supabase: SupabaseClient): Promise<void> {
  await page.route('**/functions/v1/library-upload', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; [key: string]: unknown };

    if (body?.action === 'sign_upload') {
      const seeded = await seedLibraryImage(supabase, String(body.fileName ?? 'product.png'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bucket: MEDIA_BUCKET,
          path: seeded.storagePath,
          token: 'onboarding-catalog-bench',
          assetId: seeded.assetId,
        }),
      });
      return;
    }

    if (body?.action === 'register') {
      const storagePath = String(body.storagePath);
      const signed = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, 3_600);
      if (signed.error) {
        throw new Error(`[onboarding:catalog:bench] sign failed: ${signed.error.message}`);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'ready',
          assetId: String(body.assetId),
          versionId: randomUUID(),
          storagePath,
          signedUrl: signed.data.signedUrl,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, status: 'error', message: `unexpected ${body?.action}` }),
    });
  });

  // The bytes are already in the bucket; the SDK only needs `{ Key }` back.
  await page.route('**/storage/v1/object/upload/sign/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/object/upload/sign/')[1] ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: decodeURIComponent(path) }),
    });
  });
}

/* -- seeding + purge ------------------------------------------------------------ */

let previousActiveBrandId: string | null = null;
let previousStep: number | null = null;

async function setActiveBrand(supabase: SupabaseClient, activeBrandId: string): Promise<void> {
  await brandProfiles(supabase)
    .from('user_brand_preferences')
    .upsert({ user_id: OWNER_ID, active_brand_id: activeBrandId }, { onConflict: 'user_id' })
    .throwOnError();
}

/**
 * Land the wizard on the catalog screen without clicking through two steps the bench is
 * not testing. `resumeScreenFor` takes the persisted step, so this is the same door a
 * returning brand comes through.
 */
async function setOnboardingStep(supabase: SupabaseClient, step: number): Promise<void> {
  const { data } = await brandProfiles(supabase)
    .from('user_onboarding_states')
    .select('state')
    .eq('user_id', OWNER_ID)
    .eq('brand_id', BRAND_ID)
    .maybeSingle();
  const state = (data as { state?: Record<string, unknown> } | null)?.state;
  if (!state) throw new Error('[onboarding:catalog:bench] No fixture onboarding state - hydrate.');
  if (previousStep === null) previousStep = Number(state.step ?? 0);
  await brandProfiles(supabase)
    .from('user_onboarding_states')
    .update({ state: { ...state, step } })
    .eq('user_id', OWNER_ID)
    .eq('brand_id', BRAND_ID)
    .throwOnError();
}

async function benchElementIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await media(supabase)
    .from('asset_groups')
    .select('id, external_key')
    .eq('brand_id', BRAND_ID)
    .eq('kind', 'element')
    .in(
      'external_key',
      BENCH_SLUGS.map((slug) => `element:${slug}`),
    );
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

async function purge(supabase: SupabaseClient): Promise<void> {
  const groupIds = await benchElementIds(supabase);
  if (groupIds.length > 0) {
    await media(supabase).from('asset_group_members').delete().in('group_id', groupIds);
    await media(supabase).from('asset_groups').delete().in('id', groupIds);
  }
  if (seededAssetIds.length > 0) {
    await media(supabase).from('assets').delete().in('id', seededAssetIds);
  }
  if (seededStoragePaths.length > 0) {
    await supabase.storage.from(MEDIA_BUCKET).remove(seededStoragePaths);
  }
}

/* -- the read-back: a second REAL Backend request ------------------------------- */

type WireElement = {
  slug: string;
  name: string;
  product: {
    sku?: string | null;
    price?: { amountMinor: number; currency: string } | null;
    productUrl?: string | null;
  } | null;
  members: { assetId: string; position: number }[];
};

async function readElementsFromBackend(backendUrl: string, token: string): Promise<WireElement[]> {
  const response = await fetch(`${backendUrl}/api/media/elements?brandId=${BRAND_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `[onboarding:catalog:bench] element read-back failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { elements: WireElement[] };
  return body.elements.filter((element) => BENCH_SLUGS.includes(element.slug));
}

/* -- the run -------------------------------------------------------------------- */

let backend: LocalBackend | null = null;
let context: BrowserContext | null = null;
let page: Page;
let accessToken = '';

/* -- the Recorder envelope ------------------------------------------------------
 *
 * `scripts/factory/bench.mjs` reads the LAST stdout line that parses as JSON and
 * carries `counts`. A bench that exits 0 without one is `unreadable`, not green —
 * so this spec prints the same envelope shape the Backend `_bench` Recorder does.
 * It is re-implemented rather than imported because AGENTS.md section 5 forbids a
 * Frontend file importing Backend source; the shape, not the class, is the contract.
 */
const graded: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const benchStartedAt = new Date().toISOString();
const benchStartedMs = Date.now();

const UN_EXERCISED_HOP =
  'The real image upload (library-upload edge function) is NOT exercised — edge functions are not wired on the local stack. Its artifacts (real storage object + real media.assets row) are seeded by the interception; every hop on both sides of it is real.';

function printBenchEnvelope(): void {
  const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
  for (const result of graded) {
    if (result.grade === 'PASS') counts.pass += 1;
    else if (result.grade === 'SKIP') counts.skip += 1;
    else counts.fail += 1;
  }
  console.log(
    JSON.stringify({
      bench: 'onboarding:catalog:bench',
      startedAt: benchStartedAt,
      durationMs: Date.now() - benchStartedMs,
      results: graded,
      notes: [UN_EXERCISED_HOP],
      counts,
      exitCode: counts.fail > 0 ? 1 : 0,
    }),
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('onboarding product catalog', () => {
  test.skip(
    !HAS_LOCAL_STACK,
    'Needs the local Supabase stack: bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local',
  );

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);
    backend = await startLocalBackend({
      port: Number(process.env.ONBOARDING_CATALOG_BENCH_BACKEND_PORT ?? 4416),
      browserOrigin: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3116',
      label: 'onboarding:catalog:bench',
    });

    const supabase = admin();
    // The local stack is built from a schema-only prod snapshot, so bucket ROWS are
    // absent. Private, like the real media library.
    const { error: bucketError } = await supabase.storage.createBucket(MEDIA_BUCKET, {
      public: false,
    });
    if (bucketError && !/already exists/i.test(bucketError.message)) {
      throw new Error(
        `[onboarding:catalog:bench] Could not create ${MEDIA_BUCKET}: ${bucketError.message}`,
      );
    }

    const { data: pref } = await brandProfiles(supabase)
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = (pref?.active_brand_id as string | undefined) ?? null;
    await setActiveBrand(supabase, BRAND_ID);
    await setOnboardingStep(supabase, 2);
    await purge(supabase);

    accessToken = await mintAccessTokenForEmail(LOCAL_OWNER_EMAIL);
    // Nothing of ours may exist yet, or "2 added" would be measuring somebody else.
    expect(await readElementsFromBackend(backend.url, accessToken)).toHaveLength(0);

    const state = await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD);
    context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await context.addCookies(state.cookies);
    page = await context.newPage();
    await interceptLibraryUpload(page, supabase);

    await page.goto(`/onboarding?brand=${BRAND_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('catalog-dropzone')).toBeVisible({ timeout: 180_000 });
  });

  // Playwright requires an object-destructuring first argument; nothing is taken from it.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterEach(async ({}, testInfo) => {
    graded.push({
      step: testInfo.title,
      grade:
        testInfo.status === 'passed' ? 'PASS' : testInfo.status === 'skipped' ? 'SKIP' : 'FAIL',
      detail:
        testInfo.status === 'passed' ? undefined : (testInfo.error?.message ?? testInfo.status),
    });
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright hook signature
  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    await context?.close();
    context = null;
    const supabase = admin();
    await purge(supabase);
    // Cleaned up means GONE, not "we called delete".
    expect(await benchElementIds(supabase)).toHaveLength(0);
    const { data: leftovers } = await media(supabase)
      .from('assets')
      .select('id')
      .in('id', seededAssetIds.length > 0 ? seededAssetIds : [randomUUID()]);
    expect(leftovers ?? []).toHaveLength(0);
    if (previousActiveBrandId) await setActiveBrand(supabase, previousActiveBrandId);
    if (previousStep !== null) await setOnboardingStep(supabase, previousStep);
    await backend?.stop();
    backend = null;
    printBenchEnvelope();
  });

  test('the step says it is optional, and skipping it is never a dead end', async () => {
    await expect(page.getByTestId('catalog-dropzone')).toContainText('Drop product photos here');
    // A brand with no products can leave.
    await expect(page.getByTestId('catalog-skip')).toBeEnabled();
    // And the disabled control explains its own disabled-ness rather than sitting grey.
    await expect(page.getByTestId('catalog-import')).toBeDisabled();
    await expect(page.getByTestId('catalog-import-hint')).toContainText(
      'Add at least one product photo',
    );
  });

  test('three photos become three product rows, facts optional', async () => {
    await page.getByTestId('catalog-file-input').setInputFiles([
      { name: 'hero-bottle.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'trail-mug.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'broken-widget.png', mimeType: 'image/png', buffer: PNG_BYTES },
    ]);
    await expect(page.getByTestId('catalog-draft-row')).toHaveCount(3, { timeout: 60_000 });

    const row = (index: number) => page.getByTestId('catalog-draft-row').nth(index);

    await row(0).getByTestId('catalog-name').fill(HERO.name);
    await row(0).getByTestId('catalog-sku').fill(HERO.sku);
    await row(0).getByTestId('catalog-price').fill('$19.99');
    await row(0).getByTestId('catalog-url').fill('https://bench.test/hero-bottle');
    await row(0).getByTestId('catalog-variants').fill('500ml, 750ml');

    // Nothing but a name - the case the contract calls optional and the UI must not
    // make feel required.
    await row(1).getByTestId('catalog-name').fill(MUG.name);

    // The deliberate bad row: a product page that is not a URL. Sent UNJUDGED, because
    // the server is the authority and its report is what names the row.
    await row(2).getByTestId('catalog-name').fill(BROKEN.name);
    await row(2).getByTestId('catalog-url').fill('shop.example');

    await expect(page.getByTestId('catalog-import')).toBeEnabled();
    await expect(page.getByTestId('catalog-import')).toContainText('Import 3 products');
  });

  test('a partial success reports the rows that landed AND the one that did not, by index', async () => {
    await page.getByTestId('catalog-import').click();

    await expect(page.getByTestId('catalog-result')).toBeVisible({ timeout: 90_000 });

    await expect(page.getByTestId('catalog-headline')).toHaveText(
      'Imported 2 of 3 — 2 added. 1 product was not imported — see below.',
    );
    await expect(page.getByTestId('catalog-count-added')).toHaveText('2');
    await expect(page.getByTestId('catalog-count-updated')).toHaveText('0');
    await expect(page.getByTestId('catalog-count-rejected')).toHaveText('1');

    // BY INDEX - the contract's own 0-based row index, which is the handle the person
    // fixing the spreadsheet has.
    const rejected = page.getByTestId('catalog-rejected-row');
    await expect(rejected).toHaveCount(1);
    await expect(rejected).toHaveAttribute('data-row-index', '2');
    await expect(rejected).toContainText(BROKEN.name);
    // The SERVER's reason, not a sentence the Frontend invented.
    await expect(rejected).toContainText('productUrl');
  });

  test('the accepted products really persisted, and read back with their facts', async () => {
    const elements = await readElementsFromBackend(backend?.url ?? '', accessToken);
    expect(elements.map((element) => element.slug).sort()).toEqual([HERO.slug, MUG.slug]);

    const hero = elements.find((element) => element.slug === HERO.slug);
    expect(hero?.name).toBe(HERO.name);
    expect(hero?.product?.sku).toBe(HERO.sku);
    // "$19.99" typed -> minor units on the wire, which is what the contract stores.
    expect(hero?.product?.price).toEqual({ amountMinor: 1999, currency: 'USD' });
    expect(hero?.product?.productUrl).toBe('https://bench.test/hero-bottle');
    expect(hero?.members).toHaveLength(1);
    expect(seededAssetIds).toContain(hero?.members[0]?.assetId);

    // The brand that typed nothing but a name still got a product.
    const mug = elements.find((element) => element.slug === MUG.slug);
    expect(mug?.name).toBe(MUG.name);
    expect(mug?.product ?? null).toBeNull();
    expect(mug?.members).toHaveLength(1);

    // The rejected row wrote nothing.
    expect(elements.some((element) => element.slug === BROKEN.slug)).toBe(false);
  });

  test('re-running the same catalog updates rather than duplicating', async () => {
    // The rejected row is still in the editor (its neighbours were cleared once they
    // landed). Drop it so the re-run is exactly the two products that already exist.
    await page.getByTestId('catalog-draft-row').first().getByTestId('catalog-remove').click();
    await expect(page.getByTestId('catalog-draft-row')).toHaveCount(0);

    await page.getByTestId('catalog-file-input').setInputFiles([
      { name: 'hero-bottle-v2.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'trail-mug-v2.png', mimeType: 'image/png', buffer: PNG_BYTES },
    ]);
    await expect(page.getByTestId('catalog-draft-row')).toHaveCount(2, { timeout: 60_000 });

    const row = (index: number) => page.getByTestId('catalog-draft-row').nth(index);
    // A rename plus the same SKU - the case the SKU-first identity rule exists for.
    await row(0).getByTestId('catalog-name').fill('Bench Hero Bottle 500ml');
    await row(0).getByTestId('catalog-sku').fill(HERO.sku);
    await row(1).getByTestId('catalog-name').fill(MUG.name);

    await page.getByTestId('catalog-import').click();
    await expect(page.getByTestId('catalog-headline')).toHaveText('Imported 2 of 2 — 2 updated.', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('catalog-count-added')).toHaveText('0');
    await expect(page.getByTestId('catalog-count-updated')).toHaveText('2');
    await expect(page.getByTestId('catalog-count-rejected')).toHaveText('0');

    // The anchor: still two Elements, not four.
    const elements = await readElementsFromBackend(backend?.url ?? '', accessToken);
    expect(elements).toHaveLength(2);
    // The rename edited the title and left the identity alone, which is why a quarterly
    // catalog export converges instead of accreting.
    const hero = elements.find((element) => element.slug === HERO.slug);
    expect(hero?.name).toBe('Bench Hero Bottle 500ml');
    expect(hero?.product?.sku).toBe(HERO.sku);
  });

  test('a price we could not read is shown as what was typed, never as zero', async () => {
    await page
      .getByTestId('catalog-file-input')
      .setInputFiles([{ name: 'price-check.png', mimeType: 'image/png', buffer: PNG_BYTES }]);
    await expect(page.getByTestId('catalog-draft-row')).toHaveCount(1, { timeout: 60_000 });

    const row = page.getByTestId('catalog-draft-row').first();
    await row.getByTestId('catalog-price').fill('call us');

    const issue = row.getByTestId('catalog-price-issue');
    await expect(issue).toBeVisible();
    await expect(issue).toContainText('call us');
    await expect(issue).not.toContainText('0.00');

    // Not imported - this row exists only to check the reading.
    await row.getByTestId('catalog-remove').click();
    await expect(page.getByTestId('catalog-draft-row')).toHaveCount(0);
  });
});
