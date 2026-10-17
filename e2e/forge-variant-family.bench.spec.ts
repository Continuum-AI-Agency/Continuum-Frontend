import { expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

// forge:variant-family:fe:e2e:bench — the Variants tab as a family tree.
//
// WHAT IT PROVES: a person opens a template's Variants tab and sees its family as a tree (the
// Original at the root, each variant under the revision it branched from, with what it changed),
// switches to the lane graph, restores and re-archives a variant, and makes a published variant
// the family's default and back — each action read back from the database it wrote.
//
// REAL: hosted Postgres + GoTrue, the StarCraft bench brand's own template families, a
// bench-owned Fastify Backend on hosted, the Next app, real Chrome.
//
// SEEDED, STATED: the bench brand has no published variant, so Make default runs on its draft
// variant with its own draft head standing in as the published head for the run.
//
// UN-EXERCISED, STATED: a grandchild in the browser — no family in production has one, and making
// one is a real forge edit that leaves immutable revision rows. The tree nests it in the unit tests
// (variantTree.test.ts, VariantsPanel.test.tsx).
//
// RESIDUE: none. Every archived_at and published head is written back to what it was, the defaults
// pointer is deleted, and the bench user's active brand is restored.
//
// Run: bun run forge:variant-family:fe:e2e:bench

const BENCH = 'forge:variant-family:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3113';
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4113);
const BRAND = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = process.env.STARCRAFT_OWNER_EMAIL ?? 'duane@continuumai.agency';
// Published Original + one draft variant; published Original + six archived variants.
const DRAFT_FAMILY = 'e3d80e8c-cbb9-465b-903f-3de4fbb42605';
const ARCHIVED_FAMILY = '5ea21bda-8fd1-47c1-93f7-053f1365501f';
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

const recorder = createBenchRecorder(BENCH, []);
const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
type VariantRow = {
  id: string;
  name: string;
  is_original: boolean;
  archived_at: string | null;
  draft_head_revision_id: string;
  published_head_revision_id: string | null;
};
let draftFamily: VariantRow[] = [];
const residue = {
  variants: [] as VariantRow[],
  brandPref: null as null | { userId: string; previous: string | null },
};

async function familyRows(templateId: string): Promise<VariantRow[]> {
  const { data, error } = await db
    .schema('media')
    .from('template_variants')
    .select(
      'id, name, is_original, archived_at, draft_head_revision_id, published_head_revision_id',
    )
    .eq('brand_id', BRAND)
    .eq('template_id', templateId)
    .order('created_at');
  if (error) throw new Error(`family ${templateId}: ${error.message}`);
  return (data ?? []) as VariantRow[];
}

async function familyDefault(templateId: string): Promise<string | null> {
  const { data } = await db
    .schema('media')
    .from('template_variant_defaults')
    .select('variant_id')
    .eq('brand_id', BRAND)
    .eq('template_id', templateId)
    .maybeSingle();
  return (data as { variant_id?: string } | null)?.variant_id ?? null;
}

async function openVariantsTab(page: Page, templateId: string) {
  await page.goto(`${APP}/forge?template=${templateId}`, NAV);
  await page.getByRole('tab', { name: /^Variants/ }).click({ timeout: 180_000 });
  await expect(page.getByRole('list', { name: 'Template variants' })).toBeVisible({
    timeout: 60_000,
  });
}

const node = (page: Page, name: string) =>
  page
    .locator('[data-variant]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();

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
  draftFamily = await familyRows(DRAFT_FAMILY);
  residue.variants = [...draftFamily, ...(await familyRows(ARCHIVED_FAMILY))];
  backend = await startLocalBackend({
    port: BACKEND_PORT,
    browserOrigin: APP,
    label: BENCH,
    supabase: 'hosted',
    readyTimeoutMs: 600_000,
  });
});

test.afterAll(async () => {
  await db
    .schema('media')
    .from('template_variant_defaults')
    .delete()
    .eq('brand_id', BRAND)
    .in('template_id', [DRAFT_FAMILY, ARCHIVED_FAMILY]);
  for (const row of residue.variants) {
    await db
      .schema('media')
      .from('template_variants')
      .update({
        archived_at: row.archived_at,
        published_head_revision_id: row.published_head_revision_id,
      })
      .eq('id', row.id)
      .eq('brand_id', BRAND);
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

test('the Variants tab draws the family and acts on it', async ({ page, context }) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  const draft = draftFamily.find((row) => !row.is_original && !row.archived_at);
  expect(draft, 'the bench family keeps its draft variant').toBeTruthy();

  await recorder.step('setup: signed in as the StarCraft owner', async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    await context.clearCookies();
    await context.addCookies(session.state.cookies);
    const { data } = await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    residue.brandPref = {
      userId: session.userId,
      previous: (data as { active_brand_id?: string } | null)?.active_brand_id ?? null,
    };
    // The Forge opens on the person's active brand; restored in afterAll.
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: session.userId, active_brand_id: BRAND }, { onConflict: 'user_id' });
  });

  await recorder.step(
    'the tree puts the draft variant under the Original it came from',
    async () => {
      await openVariantsTab(page, DRAFT_FAMILY);
      const children = page.getByRole('list', { name: 'Variants of Original' });
      await expect(children).toContainText(draft!.name);
      await expect(children).toContainText('From Original · Revision 1');
      await expect(node(page, 'Original').getByText('Default', { exact: true })).toBeVisible();
      // A draft cannot be what a family opens on.
      await expect(
        node(page, draft!.name).getByRole('button', { name: 'Make default' }),
      ).toHaveCount(0);
    },
  );

  await recorder.step('the graph lists every revision of the family as a button', async () => {
    await page.getByRole('button', { name: 'Graph' }).click();
    const revisions = page.getByRole('list', { name: 'Template revisions' });
    await expect(revisions.getByRole('button', { name: 'Original · Revision 1' })).toBeVisible();
    await expect(
      revisions.getByRole('button', { name: `${draft!.name} · Revision 1` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tree' }).click();
  });

  await recorder.step('Make default moves the family to a published variant and back', async () => {
    // Seeded for the run: the bench brand has no published variant.
    await db
      .schema('media')
      .from('template_variants')
      .update({ published_head_revision_id: draft!.draft_head_revision_id })
      .eq('id', draft!.id)
      .eq('brand_id', BRAND);
    await openVariantsTab(page, DRAFT_FAMILY);
    // Timed, not just awaited: a slow action is a finding, so it is printed rather than hidden.
    const timed = async (name: string, press: () => Promise<void>) => {
      const started = Date.now();
      await press();
      await expect(node(page, name).getByText('Default', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      console.log(`[${BENCH}] Make default → ${name}: ${Date.now() - started} ms to the badge`);
    };
    await timed(draft!.name, () =>
      node(page, draft!.name).getByRole('button', { name: 'Make default' }).click(),
    );
    await expect.poll(() => familyDefault(DRAFT_FAMILY)).toBe(draft!.id);
    await timed('Original', () =>
      node(page, 'Original').getByRole('button', { name: 'Make default' }).click(),
    );
    await expect.poll(() => familyDefault(DRAFT_FAMILY)).toBeNull();
  });

  await recorder.step('an archived variant restores from the tree and archives again', async () => {
    await openVariantsTab(page, ARCHIVED_FAMILY);
    const archived = page
      .locator('[data-variant]')
      .filter({ has: page.getByText('Archived', { exact: true }) })
      .first();
    const variantId = await archived.getAttribute('data-variant');
    await archived.getByRole('button', { name: 'Restore' }).click();
    const restored = page.locator(`[data-variant="${variantId}"]`);
    await expect(restored.getByRole('button', { name: 'Archive' })).toBeVisible({
      timeout: 60_000,
    });
    await restored.getByRole('button', { name: 'Archive' }).click();
    await page
      .getByRole('alertdialog', { name: 'Archive template variant' })
      .getByRole('button', { name: 'Archive variant' })
      .click();
    await expect(restored.getByText('Archived', { exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
