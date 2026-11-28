import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

// forge:agent-variants:fe:e2e:bench — the layer editor's agent proposes variants a person can
// read and save, in a real Chrome.
//
// WHAT IT PROVES: in the Edit layers tab, the agent pane asked for two variants of one layer's words
// draws two proposal cards, each with the forge's preview image and the change as saved words →
// new words; "Save as variant" on one makes a variant row in the family under the proposal's name;
// the person's authoring draft is not touched by proposing.
//
// REAL: hosted Postgres + GoTrue, the StarCraft bench brand's template (the one the Backend
// bench forge:agent:variants:e2e picks), a bench-owned Fastify Backend from this checkout on
// hosted, the deployed forge, one Vertex agent turn, the Next app, real Chrome.
//
// RESIDUE: the saved variant is archived (revisions are immutable; archive is how a person removes
// one) and the bench user's active brand is restored.
//
// Run: bun run forge:agent-variants:fe:e2e:bench

const BENCH = 'forge:agent-variants:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3116';
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4116);
const BRAND = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = process.env.STARCRAFT_OWNER_EMAIL ?? 'duane@continuumai.agency';
const ASSET = process.env.FORGE_AGENT_VARIANTS_ASSET ?? 'c6155dfd-0457-4b77-9769-16becdbe950a';
const LAYER = process.env.FORGE_AGENT_VARIANTS_LAYER ?? 'payoff-subtitle';
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };

const recorder = createBenchRecorder(BENCH, []);
const db = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const residue = {
  variantIds: [] as string[],
  brandPref: null as null | { userId: string; previous: string | null },
};

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
  if (residue.variantIds.length)
    await db
      .schema('media')
      .from('template_variants')
      .update({ archived_at: new Date().toISOString() })
      .eq('brand_id', BRAND)
      .in('id', residue.variantIds);
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

test('the agent pane proposes variants a person can read and save', async ({ page, context }) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  const family = await db
    .schema('media')
    .from('template_revisions')
    .select('template_id')
    .eq('brand_id', BRAND)
    .eq('source_asset_id', ASSET)
    .limit(1)
    .single();
  expect(family.error, family.error?.message).toBeNull();
  const templateId = (family.data as { template_id: string }).template_id;
  let userId = '';
  const draftRevision = async () => {
    const { data } = await db
      .schema('media')
      .from('template_authoring_drafts')
      .select('revision')
      .eq('brand_id', BRAND)
      .eq('asset_id', ASSET)
      .eq('user_id', userId);
    return JSON.stringify((data ?? []).map((row) => (row as { revision: number }).revision));
  };

  await recorder.step('setup: signed in as the StarCraft owner', async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    userId = session.userId;
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
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: session.userId, active_brand_id: BRAND }, { onConflict: 'user_id' });
  });

  const tag = Date.now().toString(36).slice(-5);
  const words = [`UI A ${tag}`, `UI B ${tag}`];
  const draftBefore = await draftRevision();
  const cards = page.getByTestId('forge-variant-proposal');

  await recorder.step(
    'the agent pane draws two proposal cards with saved → new words',
    async () => {
      // The editor's private draft must have loaded before the agent can start from it; a person
      // sees the canvas first, so the bench waits for the same two things.
      const draftLoaded = page.waitForResponse(
        (response) => response.url().includes('/authoring-draft?') && response.ok(),
        { timeout: 300_000 },
      );
      await page.goto(`${APP}/forge?template=${templateId}`, NAV);
      await page.getByRole('tab', { name: 'Edit layers' }).click({ timeout: 180_000 });
      await draftLoaded;
      await expect(page.getByRole('img', { name: /composed preview$/ })).toBeVisible({
        timeout: 180_000,
      });
      await page.getByTestId('forge-agent-toggle').click({ timeout: 180_000 });
      const input = page.getByTestId('forge-agent-input');
      await input.fill(
        `Propose two variants. In the first, the layer "${LAYER}" reads "${words[0]}"; in the second it reads "${words[1]}". Change nothing else.`,
      );
      const sent = Date.now();
      await input.press('Enter');
      await expect(cards.first()).toBeVisible({ timeout: 240_000 });
      console.log(`[${BENCH}] first proposal card: ${Date.now() - sent} ms after send`);
      await expect(cards).toHaveCount(2, { timeout: 240_000 });
      console.log(`[${BENCH}] second proposal card: ${Date.now() - sent} ms after send`);
      // The agent may propose them in either order; each word must land on exactly one card.
      for (const word of words) await expect(cards.filter({ hasText: word })).toHaveCount(1);
      for (const card of [cards.nth(0), cards.nth(1)]) {
        await expect(card).toContainText(LAYER);
        await expect(card.getByRole('button', { name: 'Save as variant' })).toBeEnabled();
      }
    },
  );

  await recorder.step("each card shows the forge's preview image", async () => {
    for (const card of [cards.nth(0), cards.nth(1)]) {
      const image = card.getByRole('img', { name: /^Preview of / });
      await expect(image).toBeVisible({ timeout: 120_000 });
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.screenshot({ path: `test-results/${BENCH.replaceAll(':', '-')}-cards.png` });
  });

  await recorder.step('proposing left the authoring draft untouched', async () => {
    expect(await draftRevision()).toBe(draftBefore);
  });

  await recorder.step('Save as variant makes a variant row under the proposal name', async () => {
    const card = cards.nth(0);
    const name = (await card.locator('p.font-medium').first().textContent())?.trim() ?? '';
    const pressed = Date.now();
    await card.getByRole('button', { name: 'Save as variant' }).click();
    await expect(card.getByRole('status')).toContainText('Saved as variant', { timeout: 180_000 });
    console.log(`[${BENCH}] save: ${Date.now() - pressed} ms to the confirmation`);
    const { data, error } = await db
      .schema('media')
      .from('template_variants')
      .select('id, name, archived_at')
      .eq('brand_id', BRAND)
      .eq('template_id', templateId)
      .eq('name', name)
      .is('archived_at', null);
    expect(error, error?.message).toBeNull();
    residue.variantIds.push(...(data ?? []).map((row) => (row as { id: string }).id));
    expect(data ?? []).toHaveLength(1);
    await page.screenshot({ path: `test-results/${BENCH.replaceAll(':', '-')}-saved.png` });
  });
});
