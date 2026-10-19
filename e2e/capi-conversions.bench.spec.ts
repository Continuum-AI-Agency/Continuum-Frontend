import { CAPI_ROUTES } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';

// capi:conversions:fe:e2e:bench — Meta Conversions API from Performance+.
//
// WHAT IT PROVES: a brand owner opens Performance+ → Conversions, sees the saved pixel, sends
// one test event, uploads a 3-row CSV of offline conversions, creates a webhook source whose
// ingest URL then accepts a real POST — and every one of those reaches Meta (events_received
// read off the page and off the delivery log the page renders).
//
// REAL: hosted Postgres + GoTrue, a bench-owned Fastify Backend on hosted, the Next app, real
// Chrome, graph.facebook.com. StarCraft only — its ad account is the Meta SANDBOX account and
// every send carries the saved test_event_code (benches never touch a client pixel).
//
// UN-EXERCISED, STATED: Events Manager → Test Events (Meta has no read API for it; the proof is
// events_received + fbtrace_id). Forwarding to a destination (Backend bench covers the send).
//
// RESIDUE: the bench's delivery rows and its webhook source, deleted by id; the owner's
// account-level active brand pointer, restored. StarCraft's CAPI settings stay (demo uses them).
//
// Run: bun run capi:conversions:fe:e2e:bench

const BENCH = 'capi:conversions:fe:e2e:bench';
const { url: SUPABASE_URL, serviceRoleKey } = loadProdSupabaseEnv();

const APP = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3161';
const BACKEND_PORT = Number(process.env.BENCH_BACKEND_PORT ?? 4461);
const BACKEND = `http://127.0.0.1:${BACKEND_PORT}`;
const STARCRAFT = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = readBackendEnv('CANVAS_BENCH_OWNER_EMAIL') ?? 'duane@continuumai.agency';
const NAV = { timeout: 180_000, waitUntil: 'domcontentloaded' as const };
const SHOTS = process.env.CAPI_BENCH_SHOTS_DIR;

const recorder = createBenchRecorder(BENCH, [
  'Un-exercised hop: Events Manager → Test Events (no Meta read API); proof = events_received + fbtrace_id.',
]);
const db: SupabaseClient = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const startedAt = new Date().toISOString();
const sourceName = `Bench HubSpot leads ${Date.now()}`;
const residue = { brandPref: null as null | { userId: string; previous: string | null } };

const csv = [
  'email,phone,first_name,value,currency,event_name,order_id',
  'ana@example.com,+1 555 010 0001,Ana,120.50,USD,Purchase,BENCH-CAPI-1',
  'ben@example.com,,Ben,,,Lead,BENCH-CAPI-2',
  '"cara, jr@example.com",+1 555 010 0003,Cara,,,Lead,BENCH-CAPI-3',
].join('\n');

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
  // Attributed by brand + time + this run's source name — never a raw sweep.
  const { data: sources } = await db
    .schema('brand_profiles')
    .from('meta_capi_sources')
    .select('id')
    .eq('brand_id', STARCRAFT)
    .eq('name', sourceName);
  const sourceIds = (sources ?? []).map((row: { id: string }) => row.id);
  const { data: rows } = await db
    .schema('brand_profiles')
    .from('meta_capi_deliveries')
    .select('id, source, source_id')
    .eq('brand_id', STARCRAFT)
    .gte('created_at', startedAt);
  const ours = (rows ?? []).filter(
    (row: { source: string; source_id: string | null }) =>
      row.source === 'manual' ||
      row.source === 'csv' ||
      (row.source_id !== null && sourceIds.includes(row.source_id)),
  );
  for (const row of ours) {
    await db.schema('brand_profiles').from('meta_capi_deliveries').delete().eq('id', row.id);
  }
  for (const id of sourceIds) {
    await db.schema('brand_profiles').from('meta_capi_sources').delete().eq('id', id);
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

test('Performance+ → Conversions sends to Meta from all three sources', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(60_000);
  const shot = async (name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  };

  await recorder.step('setup: StarCraft has a saved sandbox pixel', async () => {
    const { data, error } = await db
      .schema('brand_profiles')
      .from('meta_capi_settings')
      .select('pixel_id, test_event_code')
      .eq('brand_id', STARCRAFT)
      .maybeSingle();
    if (error || !data) throw new Error(`no StarCraft CAPI settings: ${error?.message ?? 'none'}`);
    expect((data as { test_event_code: string | null }).test_event_code).toBeTruthy();
  });

  await recorder.step('the owner opens Performance+ → Conversions', async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const { data: pref } = await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    residue.brandPref = {
      userId: session.userId,
      previous: (pref as { active_brand_id?: string } | null)?.active_brand_id ?? null,
    };
    // A fresh session pins itself to the account-level pointer on its first read.
    await db
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: session.userId, active_brand_id: STARCRAFT }, { onConflict: 'user_id' });
    await context.clearCookies();
    await context.addCookies(session.state.cookies);
    await page.goto(`${APP}/scale?tab=conversions`, NAV);
    await expect(page.getByRole('tab', { name: /Conversions/ })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText('Send one event')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Save a pixel above before sending.')).toHaveCount(0);
    await shot('01-conversions-tab');
  });

  await recorder.step('Send one event → Meta received 1', async () => {
    await page.getByLabel('Email', { exact: true }).fill('demo-lead@example.com');
    await page.getByRole('button', { name: 'Send event' }).click();
    await expect(page.getByText('Meta received 1 event')).toBeVisible({ timeout: 60_000 });
    await shot('02-one-event');
  });

  await recorder.step('CSV of 3 offline conversions → 3 valid, Meta received 3', async () => {
    await page.getByLabel('CSV file').setInputFiles({
      name: 'crm-export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(page.getByText('3 valid rows · 0 skipped')).toBeVisible();
    await page.getByRole('button', { name: 'Send 3 events' }).click();
    await expect(page.getByText('Sent 3 · Meta received 3')).toBeVisible({ timeout: 60_000 });
    await shot('03-csv');
  });

  const publicId = await recorder.step('create a webhook source → its ingest URL', async () => {
    await page.getByLabel('Source name').fill(sourceName);
    await page.getByRole('button', { name: 'Create source' }).click();
    await expect(page.getByText('Copy this signing secret now')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ingest URL')).toBeVisible();
    await shot('04-source-created');
    const { data, error } = await db
      .schema('brand_profiles')
      .from('meta_capi_sources')
      .select('public_id')
      .eq('brand_id', STARCRAFT)
      .eq('name', sourceName)
      .single();
    if (error || !data) throw new Error(`source row missing: ${error?.message ?? 'none'}`);
    return (data as { public_id: string }).public_id;
  });

  await recorder.step('a third-party POST to that URL reaches Meta', async () => {
    const response = await fetch(`${BACKEND}${CAPI_ROUTES.hooks}/${publicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: true,
        events: [
          {
            event_name: 'Lead',
            event_time: Math.floor(Date.now() / 1_000),
            action_source: 'system_generated',
            user: { email: 'webhook-lead@example.com' },
          },
        ],
      }),
    });
    const body = (await response.json()) as { eventsReceived?: number };
    expect(response.status).toBe(200);
    expect(body.eventsReceived).toBe(1);
  });

  await recorder.step(
    'a HubSpot payload is mapped from what the URL received → Meta received 1',
    async () => {
      const hookUrl = `${BACKEND}${CAPI_ROUTES.hooks}/${publicId}?test=1`;
      const hubspot = JSON.stringify({
        vid: 7001,
        properties: {
          email: { value: 'hubspot-lead@example.com' },
          lifecyclestage: { value: 'lead' },
        },
      });
      const post = () =>
        fetch(hookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: hubspot,
        });
      expect((await post()).status).toBe(422);

      const row = page.locator('div.rounded-md').filter({ hasText: sourceName }).first();
      await row.getByRole('button', { name: 'Map fields' }).click();
      await row.getByRole('button', { name: 'Load last received payload' }).click();
      const sample = row.getByLabel('Sample payload (JSON)');
      await expect(sample).toHaveValue(/"value": "<string>"/, { timeout: 30_000 });
      expect(await sample.inputValue()).not.toContain('hubspot-lead@example.com');
      await row.getByRole('combobox', { name: 'email path' }).click();
      await page.getByRole('option', { name: 'properties.email.value' }).click();
      await expect(row.getByText(/"email": "<string>"/)).toBeVisible();
      await shot('05-mapped-from-sample');
      await row.getByRole('button', { name: 'Save mapping' }).click();
      await expect(row.getByText('1 mapped fields')).toBeVisible({ timeout: 30_000 });

      const sent = await post();
      const body = (await sent.json()) as { eventsReceived?: number };
      expect(sent.status).toBe(200);
      expect(body.eventsReceived).toBe(1);
    },
  );

  await recorder.step('Recent deliveries shows all three sources, received', async () => {
    await page.reload(NAV);
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 120_000 });
    for (const source of ['manual', 'csv', sourceName]) {
      await expect(table.getByRole('row').filter({ hasText: source }).first()).toBeVisible();
    }
    await shot('06-deliveries');
  });
});
