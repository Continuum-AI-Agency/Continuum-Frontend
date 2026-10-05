/** Real client package → native folder picker → Library Storage → deployed parse → Forge card.
 * Run from Frontend: bun run forge:folder:e2e:bench <brandId> <dependency-complete.zip>
 * Only this run's temporary intake is deleted. No build, render, publish or promotion.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv } from './support/prodEnv';

const rec = new Recorder('forge:folder:e2e');
const [brandId, sourceZip] = process.argv.slice(2);
assert(brandId && sourceZip, 'Usage: <brandId> <dependency-complete.zip>');
const app = 'http://localhost:3002'; // Allowed by the deployed Backend CORS policy.
const { url, serviceRoleKey, publishableKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = app;
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const media = admin.schema('media');
const tag = `Folder-validation-${randomUUID().slice(0, 8)}`;
const output = path.resolve('../artifacts/forge-folder-validation', tag);
const folder = path.join(output, tag);
mkdirSync(folder, { recursive: true });
const originals = unzipSync(readFileSync(sourceZip));
assert(
  Object.keys(originals).some((name) => /\.aep$/i.test(name)),
  'Provide a real AE package',
);
for (const [relative, bytes] of Object.entries(originals)) {
  assert(
    !/[\\\0]|^[a-z]:/i.test(relative) &&
      !relative.startsWith('/') &&
      !relative.split('/').includes('..'),
    'Unsafe archive path',
  );
  if (relative.endsWith('/')) continue;
  const target = path.join(folder, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}
const created = new Set<string>();
let child: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let page: import('playwright').Page | undefined;
const serverLog: string[] = [];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
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
  assert.equal(session.userId, brand.data!.created_by);
  const claims = JSON.parse(
    Buffer.from(session.accessToken.split('.')[1], 'base64url').toString(),
  ) as { session_id: string };
  const member = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    auth: { persistSession: false },
  });
  const pin = await member
    .schema('brand_profiles')
    .from('user_session_brands')
    .upsert(
      { user_id: session.userId, session_id: claims.session_id, active_brand_id: brandId },
      { onConflict: 'user_id,session_id' },
    );
  assert.ifError(pin.error);
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
      NEXT_DIST_DIR: '.next/forge-folder-bench',
      NEXT_PUBLIC_API_URL: 'https://api.trycontinuum.ai',
      API_URL: 'https://api.trycontinuum.ai',
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
  await page.goto(`${app}/forge`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByRole('heading', { name: 'Forge', exact: true }).waitFor({ timeout: 180_000 });
  for (const name of ['Render', 'Templates']) {
    const tab = page.getByRole('tab', { name, exact: true });
    for (const deadline = Date.now() + 60_000; ; ) {
      await tab.click();
      if ((await tab.getAttribute('aria-selected')) === 'true') break;
      assert(Date.now() < deadline, `${name} tab did not hydrate`);
      await Bun.sleep(500);
    }
  }
  await page.getByText('How to prepare an After Effects template', { exact: true }).click();
  await page.getByText(/Use File → Dependencies → Collect Files/).waitFor();
  await page.getByRole('button', { name: 'Upload folder', exact: true }).waitFor();
  rec.record('Folder control and packaging guidance visible', 'PASS');
  await page.screenshot({ path: path.join(output, 'folder-guidance.png'), fullPage: true });
  let chooser: import('playwright').FileChooser | undefined;
  const chooserReady = page.waitForEvent('filechooser', { timeout: 60_000 }).then((value) => {
    chooser = value;
    return value;
  });
  // A dev server can show the server-rendered button before React attaches its handler.
  for (const deadline = Date.now() + 60_000; !chooser && Date.now() < deadline; ) {
    await page.getByRole('button', { name: 'Upload folder', exact: true }).click();
    await Bun.sleep(500);
  }
  await (await chooserReady).setFiles(folder);
  let assetId: string | undefined;
  for (const deadline = Date.now() + 180_000; ; ) {
    const result = await media
      .from('assets')
      .select('id')
      .eq('brand_id', brandId)
      .in('id', [...created])
      .is('deleted_at', null)
      .maybeSingle();
    assert.ifError(result.error);
    if (result.data) {
      assetId = result.data.id;
      created.add(assetId!);
      break;
    }
    assert(
      Date.now() < deadline,
      `Browser folder upload did not persist: ${serverLog.slice(-5).join('\n')}`,
    );
    await Bun.sleep(1000);
  }
  const asset = await media
    .from('assets')
    .select('bucket,storage_path,checksum')
    .eq('id', assetId!)
    .single();
  assert.ifError(asset.error);
  const download = await admin.storage.from(asset.data!.bucket).download(asset.data!.storage_path);
  assert.ifError(download.error);
  const bytes = new Uint8Array(await download.data!.arrayBuffer());
  assert.equal(sha(bytes), asset.data!.checksum);
  const packed = unzipSync(bytes);
  assert.equal(
    Object.keys(packed).length,
    Object.keys(originals).filter((name) => !name.endsWith('/')).length,
  );
  for (const [relative, original] of Object.entries(originals)) {
    if (relative.endsWith('/')) continue;
    assert.equal(
      sha(packed[`${tag}/${relative}`]),
      sha(original),
      `${relative}: original bytes changed`,
    );
  }
  rec.record(
    'Native directory → uploaded ZIP: all dependency paths and original bytes preserved',
    'PASS',
    assetId,
  );
  for (const deadline = Date.now() + 180_000; ; ) {
    const result = await media
      .from('template_sources')
      .select('parse_state,parse_error,parse')
      .eq('asset_id', assetId!)
      .eq('brand_id', brandId)
      .maybeSingle();
    assert.ifError(result.error);
    assert(result.data?.parse_state !== 'error', JSON.stringify(result.data?.parse_error));
    if (result.data?.parse_state === 'parsed') {
      assert.deepEqual(result.data.parse.missingFootage, []);
      assert(result.data.parse.comps.some((comp: { isDelivery: boolean }) => comp.isDelivery));
      writeFileSync(
        path.join(output, 'persisted-parse.json'),
        JSON.stringify({ assetId, brandId, parse: result.data.parse }, null, 2),
      );
      break;
    }
    assert(Date.now() < deadline, 'Hosted parser did not finish');
    await Bun.sleep(1000);
  }
  rec.record('Deployed automatic parse: delivery composition and no missing footage', 'PASS');
  await page
    .getByRole('button', { name: /^Open Folder validation/i })
    .first()
    .waitFor({ timeout: 60_000 });
  rec.record('Parsed folder package appears as a Forge template card', 'PASS');
  const savedZip = path.join(output, `${tag}.zip`);
  writeFileSync(savedZip, bytes);
  await page.getByLabel('Project files', { exact: true }).setInputFiles(savedZip);
  await page.getByText(/Already in Forge as/).waitFor({ timeout: 30_000 });
  assert.equal(created.size, 1, 'Repeat ZIP upload created a duplicate');
  rec.record('ZIP picker still works and deduplicates the same folder package', 'PASS');
  await page.screenshot({ path: path.join(output, 'parsed-template.png'), fullPage: true });
  writeFileSync(path.join(output, 'server.log'), serverLog.join(''));
  rec.note(
    'Local Frontend; deployed Backend and Supabase. Intake only: no Forge build, render or publication exercised.',
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => undefined);
  rec.record(
    'Folder intake end to end',
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
  for (const id of created) {
    const asset = await media
      .from('assets')
      .select('bucket,storage_path')
      .eq('id', id)
      .eq('brand_id', brandId)
      .maybeSingle();
    assert.ifError(asset.error);
    const slots = await media
      .from('template_source_slots')
      .delete()
      .eq('asset_id', id)
      .eq('brand_id', brandId);
    assert.ifError(slots.error);
    const sources = await media
      .from('template_sources')
      .delete()
      .eq('asset_id', id)
      .eq('brand_id', brandId);
    assert.ifError(sources.error);
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
  rec.record('Temporary intake assets cleaned', 'PASS', `${created.size} assets; ${output}`);
}
rec.finish({ json: true });
