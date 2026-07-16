import { type Browser, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword, type PlaywrightStorageState } from './support/auth';

// End-to-end bench for the server-authoritative Library creative workflow.
// It drives the real browser UI, Next routes, local Supabase Edge Function,
// Storage and media tables. No route or database call in the feature path is
// mocked. The fixture deliberately carries the creative filename reported in
// the production failure so its versions and comments remain easy to locate.
//
// Run: bun run library:creative-operations:e2e:bench
// Prerequisite: bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local

test.use({ channel: 'chrome' });
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const OWNER_PASSWORD = 'localdev123';
const BUCKET = 'media-library';
const ASSET_ID = 'aaaaaaaa-0000-4000-8000-00000000d101';
const CREATIVE_FILE_NAME = 'crisp-silver-lynx-20260713-c19435.jpg';
const CREATIVE_TITLE = CREATIVE_FILE_NAME;
const COMMENT_BODY = 'The highlight needs a little more breathing room.';

const sourcePath = `${BRAND_ID}/${ASSET_ID}/${CREATIVE_FILE_NAME}`;

let storageState: PlaywrightStorageState;
let admin: SupabaseClient;
let jpegBytes: Buffer;

function media(client: SupabaseClient) {
  return (client as unknown as { schema: (schema: string) => SupabaseClient }).schema('media');
}

function requireLocalSupabase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url)
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL. Run bun run supabase:env:local first.');
  const hostname = new URL(url).hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`HARD GUARD: Library creative bench refuses non-local Supabase URL ${url}`);
  }
  return url;
}

async function createBrowserJpeg(browser: Browser): Promise<Buffer> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    context.fillStyle = '#d7ddc8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#5d6e43';
    context.fillRect(0, 0, canvas.width, 190);
    context.fillStyle = '#f8d38d';
    context.beginPath();
    context.arc(1120, 480, 230, 0, Math.PI * 2);
    context.fill();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('JPEG encode failed'))),
        'image/jpeg',
        0.9,
      ),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await context.close();
  return Buffer.from(bytes);
}

async function openCreative(page: Page) {
  const card = page.getByRole('button', { name: `Open ${CREATIVE_TITLE}` });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      async () => {
        if ((await page.getByRole('dialog').count()) === 0)
          await card.click().catch(() => undefined);
        return page.getByRole('dialog').count();
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);
  return page.getByRole('dialog').first();
}

async function versionRows() {
  const { data, error } = await media(admin)
    .from('asset_versions')
    .select('id, version_number, storage_path, created_by')
    .eq('asset_id', ASSET_ID)
    .order('version_number', { ascending: true });
  expect(error).toBeNull();
  return (data ?? []) as Array<{
    id: string;
    version_number: number;
    storage_path: string;
    created_by: string | null;
  }>;
}

test.beforeAll(async ({ browser }) => {
  const supabaseUrl = requireLocalSupabase();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey)
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Run bun run supabase:env:local first.');

  storageState = await mintSessionWithPassword(OWNER_EMAIL, OWNER_PASSWORD);
  admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  jpegBytes = await createBrowserJpeg(browser);
  expect(jpegBytes.byteLength).toBeGreaterThan(10_000);

  await media(admin).from('assets').delete().eq('id', ASSET_ID);
  await admin.storage.from(BUCKET).remove([sourcePath]);

  const upload = await admin.storage
    .from(BUCKET)
    .upload(sourcePath, jpegBytes, { contentType: 'image/jpeg', upsert: true });
  expect(upload.error).toBeNull();
  const inserted = await media(admin)
    .from('assets')
    .insert({
      id: ASSET_ID,
      brand_id: BRAND_ID,
      kind: 'image',
      bucket: BUCKET,
      storage_path: sourcePath,
      file_name: CREATIVE_FILE_NAME,
      mime_type: 'image/jpeg',
      size_bytes: jpegBytes.byteLength,
      width: 1600,
      height: 900,
      source: 'upload',
      status: 'ready',
      title: CREATIVE_TITLE,
      tags: ['e2e-bench', 'creative-operations'],
    });
  expect(inserted.error).toBeNull();
});

test.afterAll(async () => {
  if (!admin) return;
  const rows = await versionRows().catch(() => []);
  await media(admin).from('assets').delete().eq('id', ASSET_ID);
  await admin.storage.from(BUCKET).remove([sourcePath, ...rows.map((row) => row.storage_path)]);
});

test('a centered creative workspace posts a comment, materializes v1 through Edge, and uploads v2', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  const dialog = await openCreative(page);
  const viewport = page.viewportSize();
  const workspace = await dialog.boundingBox();
  expect(viewport).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect((workspace?.width ?? 0) / (viewport?.width ?? 1)).toBeGreaterThan(0.7);

  // Reformat is a small contextual menu, not another modal competing with the
  // creative workspace. Both operations stay visible together at this point.
  await dialog.getByRole('button', { name: 'Reformat', exact: true }).click();
  await expect(page.getByText('Reformat for placement')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Fast crop/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Smart expand/ })).toBeVisible();
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  const image = dialog.getByRole('img', { name: CREATIVE_TITLE });
  await expect(image).toBeVisible({ timeout: 60_000 });
  const overlay = dialog.getByTestId('annotation-overlay');
  const overlayBox = await overlay.boundingBox();
  if (!overlayBox) throw new Error('Image annotation overlay did not lay out');

  const commentPosted = page.waitForResponse(
    (response) =>
      response.url().includes('/api/library/comments') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );
  await page.mouse.move(
    overlayBox.x + overlayBox.width * 0.24,
    overlayBox.y + overlayBox.height * 0.28,
  );
  await page.mouse.down();
  await page.mouse.move(
    overlayBox.x + overlayBox.width * 0.52,
    overlayBox.y + overlayBox.height * 0.55,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  const composer = dialog.getByPlaceholder('Comment on this region...');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(COMMENT_BODY);
  await composer.locator('xpath=..').getByRole('button', { name: 'Post', exact: true }).click();
  await commentPosted;

  await expect.poll(async () => (await versionRows()).length).toBe(1);
  const [v1] = await versionRows();
  expect(v1).toMatchObject({ version_number: 1, storage_path: sourcePath });
  const { data: comment, error: commentError } = await media(admin)
    .from('comments')
    .select('body, version_id')
    .eq('asset_id', ASSET_ID)
    .eq('body', COMMENT_BODY)
    .single();
  expect(commentError).toBeNull();
  expect(comment).toMatchObject({ body: COMMENT_BODY, version_id: v1?.id });

  const signed = page.waitForResponse(
    (response) => response.url().includes('/api/library/versions/sign') && response.ok(),
  );
  const registered = page.waitForResponse(
    (response) =>
      response.url().includes('/api/library/versions') &&
      !response.url().includes('/sign') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await dialog.locator('input[type="file"]').setInputFiles({
    name: CREATIVE_FILE_NAME,
    mimeType: 'image/jpeg',
    buffer: jpegBytes,
  });
  await signed;
  await registered;

  await expect(dialog.getByText('Versions · 2')).toBeVisible({ timeout: 30_000 });
  const [first, second] = await versionRows();
  expect(first).toMatchObject({ version_number: 1, storage_path: sourcePath });
  expect(second?.version_number).toBe(2);
  expect(second?.storage_path).toContain(`/v2/${CREATIVE_FILE_NAME}`);
  const { data: head, error: headError } = await media(admin)
    .from('assets')
    .select('storage_path')
    .eq('id', ASSET_ID)
    .single();
  expect(headError).toBeNull();
  expect(head?.storage_path).toBe(second?.storage_path);

  await context.close();
});
