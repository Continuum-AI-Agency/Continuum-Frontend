/** Real browser → ZIP drop → Library Storage → deployed parse → Forge sheet → Render grid → web render.
 * Run from Frontend: bun run forge:web-components:browser:bench <brandId>
 * Uses the DOM fixture in scripts/fixtures/forge-web-components. Only this run's import, set,
 * jobs and their Library outputs are deleted. Green only once the Backend's web lane is deployed.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  API_RENDER_BATCHES_ROUTE,
  API_RENDER_JOBS_ROUTE,
  type ApiRenderJob,
  apiRenderBatchSchema,
  apiRenderJobSchema,
  webTemplateKey,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { zipSync } from 'fflate';
import { chromium } from 'playwright';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail, pinSessionBrand } from './support/auth';
import { loadProdSupabaseEnv } from './support/prodEnv';

const rec = new Recorder('forge:web-components:browser');
const [brandId] = process.argv.slice(2);
assert(brandId, 'Usage: <brandId>');
const app = 'http://localhost:3002'; // Allowed by the deployed Backend CORS policy.
const api = 'https://api.trycontinuum.ai';
const { url, serviceRoleKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = app;
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const media = admin.schema('media');
const suffix = randomUUID().slice(0, 8);
const tag = `Web-bench-${suffix}`;
const output = path.resolve(import.meta.dir, '../../artifacts/forge-web-components-browser', tag);
mkdirSync(output, { recursive: true });
// The DOM fixture draws its text as DOM, so the sandboxed frame can be read for it.
const fixture = path.resolve(import.meta.dir, '../../scripts/fixtures/forge-web-components/dom');
const DEFAULT_TEXT = 'Scene / 01';
const TEXT_COLUMN = 'Hero card · Text';
const WEB_PILL = "Rendered from the web component in Continuum's render browser.";
const files: Record<string, Uint8Array> = {};
for (const relative of new Bun.Glob('**/*').scanSync({ cwd: fixture }))
  files[`${tag}/${relative}`] = readFileSync(path.join(fixture, relative));
// Renamed per run: the same bytes would be deduplicated into an earlier run's import.
const manifest = JSON.parse(Buffer.from(files[`${tag}/forge-component.json`]!).toString());
files[`${tag}/forge-component.json`] = Buffer.from(JSON.stringify({ ...manifest, name: tag }));
const zipPath = path.join(output, `${tag}.zip`);
writeFileSync(zipPath, zipSync(files));

const created = new Set<string>();
const jobs: ApiRenderJob[] = [];
let templateKey: string | undefined;
let child: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let page: import('playwright').Page | undefined;
const serverLog: string[] = [];
const named = new RegExp(suffix, 'i');
try {
  const brand = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('created_by')
    .eq('id', brandId)
    .single();
  assert.ifError(brand.error);
  const owner = await admin.auth.admin.getUserById(brand.data!.created_by);
  assert.ifError(owner.error);
  const session = await mintSessionBundleForEmail(owner.data.user!.email!);
  await pinSessionBrand(session.accessToken, brandId);
  const occupied = await fetch(app, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );
  assert(!occupied, `${app} is occupied; stop this run rather than reuse a foreign server`);
  child = spawn('bun', ['run', 'dev'], {
    detached: true,
    env: {
      ...process.env,
      PORT: '3002',
      NEXT_DIST_DIR: '.next/forge-web-components-bench',
      NEXT_PUBLIC_API_URL: api,
      API_URL: api,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (bytes: Buffer) => serverLog.push(bytes.toString()));
  child.stderr?.on('data', (bytes: Buffer) => serverLog.push(bytes.toString()));
  for (const deadline = Date.now() + 180_000; ; ) {
    if (
      await fetch(`${app}/login`, { signal: AbortSignal.timeout(5000) }).then(
        (response) => response.ok,
        () => false,
      )
    )
      break;
    assert(Date.now() < deadline && child.exitCode === null, 'Next server did not start');
    await Bun.sleep(1000);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();
  page.on('pageerror', (error) => console.log(`Browser error: ${error.message.slice(0, 300)}`));
  page.on('response', async (response) => {
    if (!response.url().includes('/functions/v1/library-upload')) return;
    if (response.request().postDataJSON()?.action !== 'sign_upload' || !response.ok()) return;
    const ticket = await response.json();
    if (ticket.assetId) created.add(ticket.assetId);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') serverLog.push(message.text());
  });
  const openTab = async (name: string) => {
    const tab = page!.getByRole('tab', { name, exact: true });
    for (const deadline = Date.now() + 60_000; ; ) {
      await tab.click();
      if ((await tab.getAttribute('aria-selected')) === 'true') return;
      assert(Date.now() < deadline, `${name} tab did not hydrate`);
      await Bun.sleep(500);
    }
  };
  await page.goto(`${app}/forge`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('heading', { name: 'Forge', exact: true }).waitFor({ timeout: 180_000 });
  await openTab('Templates');
  assert.equal(await page.getByRole('tab', { name: 'Web components' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /web components/i }).count(), 0);
  rec.record('No Web components tab or button: import is the only way in', 'PASS');

  await page.getByLabel('Project files', { exact: true }).setInputFiles(zipPath);
  let assetId: string | undefined;
  for (const deadline = Date.now() + 180_000; !assetId; ) {
    const result = await media
      .from('assets')
      .select('id')
      .eq('brand_id', brandId)
      .in('id', [...created])
      .is('deleted_at', null)
      .maybeSingle();
    assert.ifError(result.error);
    assetId = result.data?.id;
    assert(
      assetId || Date.now() < deadline,
      `ZIP drop did not persist: ${serverLog.slice(-5).join('\n')}`,
    );
    if (!assetId) await Bun.sleep(1000);
  }
  templateKey = webTemplateKey(assetId!);
  for (const deadline = Date.now() + 300_000; ; ) {
    const result = await media
      .from('template_sources')
      .select('family,parse_state,parse_error,parse')
      .eq('asset_id', assetId!)
      .eq('brand_id', brandId)
      .maybeSingle();
    assert.ifError(result.error);
    assert(result.data?.parse_state !== 'error', JSON.stringify(result.data?.parse_error));
    if (result.data?.parse_state === 'parsed') {
      assert.equal(result.data.family, 'web_component');
      writeFileSync(
        path.join(output, 'persisted-parse.json'),
        JSON.stringify({ assetId, brandId, parse: result.data.parse }, null, 2),
      );
      break;
    }
    assert(Date.now() < deadline, 'Hosted parser did not finish');
    await Bun.sleep(1000);
  }
  rec.record('Dropped ZIP kept intact and parsed as a web component', 'PASS', assetId);

  const open = page.getByRole('button', { name: new RegExp(`^Open .*${suffix}`, 'i') }).first();
  await open.waitFor({ timeout: 60_000 });
  const card = page.getByRole('row').filter({ has: open });
  await card.getByText('Web component', { exact: true }).waitFor();
  await card.getByText('Ready', { exact: true }).waitFor({ timeout: 60_000 });
  rec.record('Gallery card says Web component and Ready', 'PASS');

  await open.click();
  const preview = () =>
    page!.locator('iframe[title="Web component preview"]:visible').first().contentFrame();
  await preview().getByText(DEFAULT_TEXT, { exact: true }).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: path.join(output, 'detail.png'), fullPage: true });
  rec.record('Detail sheet runs the component in its sandboxed frame', 'PASS', DEFAULT_TEXT);

  await openTab('Render');
  await page.getByRole('button', { name: 'Template', exact: true }).click();
  await page
    .getByRole('group', { name: 'Web component' })
    .getByRole('option', { name: named })
    .click();
  rec.record('Render picker lists it under Web component', 'PASS');

  const rowName = page.getByRole('textbox', { name: 'Row name', exact: true }).first();
  await rowName.waitFor({ timeout: 60_000 });
  await rowName.fill(tag);
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Drag ${tag}`, exact: true }) });
  await row.getByRole('checkbox', { name: 'Select row' }).click();
  await row.getByRole('textbox', { name: TEXT_COLUMN, exact: true }).fill('Hola bench');
  await preview().getByText('Hola bench', { exact: true }).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: path.join(output, 'grid-preview.png'), fullPage: true });
  rec.record('Row text reaches the live preview over the bridge', 'PASS');

  const fired = page.waitForResponse(
    (response) =>
      response.url().endsWith(API_RENDER_BATCHES_ROUTE) && response.request().method() === 'POST',
    { timeout: 180_000 },
  );
  // Awaited below; a step failing first must not leave this rejection unhandled.
  void fired.catch(() => undefined);
  await page.getByRole('button', { name: /^Render 1 row · \d+ files?$/ }).click();
  const tray = page.getByRole('region', { name: 'Review and render' });
  // The tray's one way forward is its footer's last button, named for the step it takes.
  const primary = tray.locator('footer').getByRole('button').last();
  for (const step of [/^Next: delivery$/, /^Render \d+ files?$/]) {
    await primary.filter({ hasText: step }).waitFor({ timeout: 120_000 });
    for (const deadline = Date.now() + 120_000; !(await primary.isEnabled()); ) {
      assert(Date.now() < deadline, `${step} never enabled: ${await tray.innerText()}`);
      await Bun.sleep(500);
    }
    await primary.click();
  }
  const batch = apiRenderBatchSchema.parse(await (await fired).json());
  assert.equal(batch.jobs.length, 1);
  jobs.push(...batch.jobs);
  rec.record('Fired from the tray: Library only, one job', 'PASS', batch.jobs[0]!.id);

  let job: ApiRenderJob | undefined;
  for (const deadline = Date.now() + 600_000; ; ) {
    const response = await fetch(
      `${api}${API_RENDER_JOBS_ROUTE}/${batch.jobs[0]!.id}?brandId=${brandId}`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    );
    assert(response.ok, `Job read ${response.status}`);
    job = apiRenderJobSchema.parse(await response.json());
    jobs.splice(0, 1, job);
    if (job.status === 'finished' || job.status === 'failed') break;
    assert(Date.now() < deadline, `Job still ${job.status}`);
    await Bun.sleep(5000);
  }
  assert.equal(job.status, 'finished', job.error ?? undefined);
  assert.equal(job.engine, 'web');
  assert.deepEqual(job.outputs.map((file) => file.kind).sort(), ['image', 'video']);
  for (const file of job.outputs) {
    const head = await fetch(file.url, { method: 'HEAD' });
    assert.equal(head.status, 200, `${file.fileName}: HEAD ${head.status}`);
  }
  rec.record(
    'Job finished on the web engine; PNG and MP4 HEAD 200',
    'PASS',
    job.outputs.map((file) => file.fileName).join(', '),
  );

  await openTab('Render ledger');
  const ledgerRow = page
    .getByRole('tabpanel', { name: 'Render ledger' })
    .getByRole('row')
    .filter({ hasText: tag });
  await ledgerRow.getByText('finished', { exact: true }).waitFor({ timeout: 180_000 });
  await ledgerRow.getByTitle(WEB_PILL, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'ledger.png'), fullPage: true });
  rec.record('Ledger row finished with the Web pill', 'PASS');
  rec.note(
    'Local Frontend; deployed Backend, render service and Supabase. Delivery is Library only: Meta and Slack are out of scope for web renders.',
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  rec.record(
    'Web component import to render, end to end',
    'FAIL',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  writeFileSync(path.join(output, 'server.log'), serverLog.join(''));
  await browser?.close();
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* Already stopped. */
    }
  }
  const jobIds = jobs.map((job) => job.id);
  const outputIds = jobs.flatMap((job) => job.outputs.flatMap((file) => file.assetId ?? []));
  const requestIds = jobs.flatMap((job) => job.renderRequestId ?? []);
  if (jobIds.length)
    assert.ifError((await media.from('ad_render_jobs').delete().in('id', jobIds)).error);
  if (requestIds.length)
    assert.ifError((await media.from('render_requests').delete().in('id', requestIds)).error);
  if (templateKey)
    assert.ifError(
      (
        await media
          .from('render_sets')
          .delete()
          .eq('brand_id', brandId)
          .eq('template_key', templateKey)
      ).error,
    );
  if (outputIds.length)
    assert.ifError(
      (
        await media
          .from('assets')
          .update({ deleted_at: new Date().toISOString() })
          .eq('brand_id', brandId)
          .in('id', outputIds)
      ).error,
    );
  for (const id of created) {
    const asset = await media
      .from('assets')
      .select('bucket,storage_path')
      .eq('id', id)
      .eq('brand_id', brandId)
      .maybeSingle();
    assert.ifError(asset.error);
    for (const table of ['template_source_slots', 'template_sources'])
      assert.ifError(
        (await media.from(table).delete().eq('asset_id', id).eq('brand_id', brandId)).error,
      );
    const removed = await media
      .from('assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('brand_id', brandId);
    assert.ifError(removed.error);
    if (asset.data) {
      const object = await admin.storage.from(asset.data.bucket).remove([asset.data.storage_path]);
      assert.ifError(object.error);
    }
  }
  rec.record(
    'Temporary import, set, jobs and outputs cleaned',
    'PASS',
    `${created.size} imports, ${jobIds.length} jobs, ${outputIds.length} outputs; ${output}`,
  );
}
rec.finish({ json: true });
