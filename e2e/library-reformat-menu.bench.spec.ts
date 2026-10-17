import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// library:reformat-menu:fe:e2e:bench — Airtable bug #403, "Reformat doesn't work, gives
// you error".
//
// WHAT IT PROVES: a person opens a Library image, presses Reformat, and the menu opens
// (before the fix the bare DropdownMenuLabel threw MenuGroupContext-missing and the page
// fell to global-error's "500 Something went wrong"). Fast crop → Vertical then lands a
// durable Library copy whose lineage names the source image.
//
// REAL: hosted Postgres + storage + GoTrue, the bench brand's own Library image, a
// bench-owned Fastify Backend on hosted (POST /api/ai-studio/reformat-image), the Next app,
// real Chrome.
//
// UN-EXERCISED, STATED: Smart expand (a paid image model; benches spend no real money) and
// "Save crop as new version" (same menu, same route, outputMode new_version).
//
// RESIDUE: the cropped copy (row + storage object), deleted by id; the bench user's active
// brand preference, restored. The source image is only read.
//
// Run: bun run library:reformat-menu:fe:e2e:bench

const BENCH = 'library:reformat-menu:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3153';
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4433);
const BENCH_BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BENCH_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

const recorder = createBenchRecorder(BENCH, []);
const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const residue = {
  copies: [] as Array<{ id: string; bucket: string; storage_path: string }>,
  brandPref: null as null | { userId: string; previous: string | null },
};

type CopyRow = {
  id: string;
  bucket: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
  origin_ref: { operation?: string; sourceAssetIds?: string[] } | null;
};

async function readyLibraryImage(): Promise<{ id: string }> {
  const { data, error } = await db
    .schema('media')
    .from('assets')
    .select('id')
    .eq('brand_id', BENCH_BRAND)
    .eq('kind', 'image')
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`no ready bench image: ${error?.message ?? 'none'}`);
  return data as { id: string };
}

// Attributed by lineage + time, never a raw count: other sessions write the bench brand.
async function copiesOf(sourceId: string, since: string): Promise<CopyRow[]> {
  const { data, error } = await db
    .schema('media')
    .from('assets')
    .select('id, bucket, storage_path, width, height, created_at, origin_ref')
    .eq('brand_id', BENCH_BRAND)
    .gte('created_at', since)
    .filter('origin_ref', 'cs', JSON.stringify({ sourceAssetIds: [sourceId] }));
  if (error) throw new Error(`could not read copies: ${error.message}`);
  return (data ?? []) as CopyRow[];
}

async function rememberActiveBrand(userId: string): Promise<void> {
  const { data } = await db
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .select('active_brand_id')
    .eq('user_id', userId)
    .maybeSingle();
  residue.brandPref = {
    userId,
    previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
  };
}

test.use({ channel: 'chrome' });

let backend: LocalBackend | null = null;

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
});

test.afterAll(async () => {
  // One row at a time: a multi-row media.assets delete deadlocks against analyze_media.
  for (const copy of residue.copies) {
    await db.schema('media').from('assets').delete().eq('id', copy.id);
    await db.storage.from(copy.bucket).remove([copy.storage_path]);
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
  await backend?.stop();
  recorder.print();
});

test('#403: Reformat on a Library image opens its menu and crops a copy', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);

  const source = await recorder.step('setup: the bench brand has a ready Library image', () =>
    readyLibraryImage(),
  );

  await recorder.step('setup: the image opens in the Library viewer', async () => {
    const session = await mintSessionBundleForEmail(BENCH_EMAIL);
    await context.clearCookies();
    await context.addCookies(session.state.cookies);
    await rememberActiveBrand(session.userId);
    await page.goto(
      `${APP}/library?brandId=${BENCH_BRAND}&destination=home&sort=updated_desc&assetId=${source.id}`,
      NAV,
    );
    await expect(page.getByRole('button', { name: 'Reformat', exact: true })).toBeEnabled({
      timeout: 180_000,
    });
  });

  await recorder.step('Reformat opens its menu, not the 500 page (the #403 failure)', async () => {
    await page.getByRole('button', { name: 'Reformat', exact: true }).click();
    await expect(page.getByText('Reformat for placement')).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  const copy = await recorder.step('Fast crop → Vertical lands a Library copy', async () => {
    const since = new Date().toISOString();
    await page.getByRole('menuitem', { name: 'Fast crop' }).click();
    await page.getByRole('menuitem', { name: /^Vertical/ }).click();
    await expect(page.getByText('Vertical · 9:16 saved to Library')).toBeVisible({
      timeout: 120_000,
    });
    const copies = await copiesOf(source.id, since);
    residue.copies.push(...copies);
    expect(copies).toHaveLength(1);
    return copies[0];
  });

  await recorder.step('the copy is a 9:16 crop whose lineage names the source', async () => {
    expect(copy.origin_ref?.operation).toBe('crop');
    expect(copy.origin_ref?.sourceAssetIds).toContain(source.id);
    expect(copy.width && copy.height ? copy.width / copy.height : 0).toBeCloseTo(9 / 16, 2);
  });
});
