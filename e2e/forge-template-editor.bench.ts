/** Real authenticated browser → editor → API → Forge → Library. No mocks, renders, or golden writes. */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  type TemplateEditableLayer,
  type TemplateLayerInventoryResponse,
  templateLayerInventoryResponseSchema,
  templateLayerPreviewResponseSchema,
  templateLayerSceneSchema,
  templateLayerVariantResponseSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { chromium, type Locator, type Page } from 'playwright';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { resolveBackendEnvironment } from '../../Continuum-Backend/scripts/run-backend';
import { mintSessionBundleForEmail } from './support/auth';
import type { LocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

const BENCH = 'forge:template-editor:e2e:bench';
const rec = new Recorder(BENCH);
const BRAND = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER = process.env.FORGE_EDITOR_OWNER_EMAIL ?? 'duane@continuumai.agency';
const APP_PORT = Number(process.env.FORGE_EDITOR_APP_PORT ?? 3154);
const API_PORT = Number(process.env.FORGE_EDITOR_BACKEND_PORT ?? 4454);
const APP = `http://127.0.0.1:${APP_PORT}`;
const ROOT = path.resolve(import.meta.dir, '../..');
const FRONTEND = process.env.FORGE_EDITOR_FRONTEND_DIR ?? path.resolve(import.meta.dir, '..');
const RUN = process.env.FORGE_EDITOR_RUN ?? `run-${Date.now()}`;
const OUT = path.join(ROOT, 'artifacts/hillclimb/template-editor', RUN);
const SEALED = path.join(tmpdir(), `continuum-template-editor-evaluator-${RUN}`);
const REPEATS = Number(process.env.FORGE_EDITOR_REPEATS ?? 2);
const PAGE_TIMEOUT = 240_000;
const CONVERGENCE_MS = 15_000;
const SEED = 20261008;
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const details = (error: unknown) => (error instanceof Error ? error.message : String(error));
const { url, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = APP;
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
process.env.MCP_JOB_WORKER_ENABLED = 'false';
process.env.BRAND_REPORT_JOB_WORKER_ENABLED = 'false';
process.env.NODE_ENV = 'test';
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const media = admin.schema('media');
const created = new Set<string>();
const infra: Array<{ repeat: number; message: string }> = [];
const scored: Record<string, number[]> = {};
const timings: Record<string, number[]> = {};
let authorization = '';
let api = '';

// No expected responses or holdout transcripts enter application code. This split is evaluated here.
const ids = Array.from({ length: 24 }, (_, index) => `case-${String(index + 1).padStart(2, '0')}`);
let seed = SEED;
const shuffled = [...ids];
for (let index = shuffled.length - 1; index > 0; index--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const other = seed % (index + 1);
  [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
}
const train = new Set(shuffled.slice(0, 16));
const test = new Set(shuffled.slice(16));
const percentile = (values: number[], part: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * part))] ?? null;
};
const timing = (name: string, started: number) => {
  const ms = performance.now() - started;
  (timings[name] ??= []).push(ms);
  return ms;
};

async function response(endpoint: string, body?: unknown) {
  return fetch(`${api}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  });
}
async function json(endpoint: string, body?: unknown): Promise<unknown> {
  const reply = await response(endpoint, body);
  const data: unknown = await reply.json();
  assert(reply.ok, `HTTP ${reply.status} ${endpoint}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
const viewPath = (asset: string, version: string) =>
  `/api/ai-studio/templates/${asset}/layers?${new URLSearchParams({ brandId: BRAND, versionId: version })}`;

async function sourceSnapshot(assetId: string) {
  const [source, asset] = await Promise.all([
    media
      .from('template_sources')
      .select('asset_id,version_id,template_key,parse_state,parse')
      .eq('asset_id', assetId)
      .eq('brand_id', BRAND)
      .single(),
    media
      .from('assets')
      .select('id,title,head_version_id,origin_ref')
      .eq('id', assetId)
      .eq('brand_id', BRAND)
      .single(),
  ]);
  assert.ifError(source.error);
  assert.ifError(asset.error);
  const version = await media
    .from('asset_versions')
    .select('id,bucket,storage_path,checksum')
    .eq('id', source.data!.version_id)
    .single();
  assert.ifError(version.error);
  const file = await admin.storage.from(version.data!.bucket).download(version.data!.storage_path);
  assert.ifError(file.error);
  assert(file.data, 'Source bytes unavailable');
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const aepMembers =
    bytes[0] === 80 && bytes[1] === 75
      ? Object.entries(unzipSync(bytes)).filter(([name]) => /\.aep$/i.test(name))
      : [];
  const rawAepSha256 =
    aepMembers.length === 1
      ? sha(aepMembers[0]![1])
      : aepMembers.length === 0 && !(bytes[0] === 80 && bytes[1] === 75)
        ? sha(bytes)
        : null;
  return {
    source: source.data!,
    asset: asset.data!,
    version: version.data!,
    digest: sha(bytes),
    rawAepSha256,
  };
}

async function findSource(): Promise<string> {
  if (process.env.FORGE_EDITOR_ASSET_ID) return process.env.FORGE_EDITOR_ASSET_ID;
  const assets = await media
    .from('assets')
    .select('id,title')
    .eq('brand_id', BRAND)
    .is('deleted_at', null)
    .ilike('title', '%vivo%');
  assert.ifError(assets.error);
  const exact = (assets.data ?? []).filter(
    (item) =>
      /1[._\s-]*1/.test(item.title ?? '') && /square|cuadrado|1080.?1080/i.test(item.title ?? ''),
  );
  assert.equal(
    exact.length,
    1,
    'Set FORGE_EDITOR_ASSET_ID to the exact owner-requested Vivo template 1.1 square; no substitute is allowed',
  );
  return exact[0]!.id;
}

async function pinSession(accessToken: string) {
  const claims = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { sub: string; session_id: string };
  const member = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const result = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: claims.sub,
      session_id: claims.session_id,
      active_brand_id: BRAND,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  assert.ifError(result.error);
  return async () => {
    const removed = await admin
      .schema('brand_profiles')
      .from('user_session_brands')
      .delete()
      .eq('user_id', claims.sub)
      .eq('session_id', claims.session_id);
    assert.ifError(removed.error);
  };
}

async function answers(address: string) {
  try {
    return (
      (await fetch(address, { redirect: 'manual', signal: AbortSignal.timeout(2000) })).status < 500
    );
  } catch {
    return false;
  }
}
function killGroup(child: ChildProcess) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}
async function startBackend(): Promise<LocalBackend> {
  const address = `http://127.0.0.1:${API_PORT}`;
  assert(
    !(await answers(`${address}/healthz`)),
    'Backend port is already owned by another process',
  );
  const cwd = path.join(ROOT, 'Continuum-Backend');
  const { environment } = await resolveBackendEnvironment({
    backendDirectory: cwd,
    forceSource: 'production',
  });
  // run-backend merges the production file after inherited values; worker and candidate overrides
  // must be applied after that merge to guarantee isolation and use the measured engine revision.
  const child = spawn('bun', ['--no-env-file', 'App/Index.ts'], {
    cwd,
    detached: true,
    env: {
      ...environment,
      NODE_ENV: 'test',
      PORT: String(API_PORT),
      HOST: '127.0.0.1',
      ALLOWED_ORIGINS: APP,
      BACKGROUND_WORKERS_ENABLED: 'false',
      ORGANIC_JOB_WORKER_ENABLED: 'false',
      MCP_JOB_WORKER_ENABLED: 'false',
      BRAND_REPORT_JOB_WORKER_ENABLED: 'false',
      ...(process.env.FORGE_EDITOR_FORGE_URL
        ? {
            TEMPLATE_FORGE_URL: process.env.FORGE_EDITOR_FORGE_URL,
            TEMPLATE_FORGE_TOKEN: process.env.FORGE_EDITOR_FORGE_TOKEN ?? '',
          }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 80) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  for (const deadline = Date.now() + 120_000; Date.now() < deadline; ) {
    if (await answers(`${address}/healthz`))
      return {
        url: address,
        stop: async () => {
          killGroup(child);
          for (
            let end = Date.now() + 10000;
            Date.now() < end && (await answers(`${address}/healthz`));
          )
            await new Promise((resolve) => setTimeout(resolve, 100));
        },
      };
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  killGroup(child);
  writeFileSync(path.join(OUT, 'backend-infrastructure.log'), tail.join(''));
  throw new Error(`Bench Backend did not boot; see ${OUT}/backend-infrastructure.log`);
}

async function startApp(): Promise<() => void> {
  assert(!(await answers(APP)), `${APP} is already used; choose a bench-owned port`);
  const tsconfigPath = path.join(OUT, 'tsconfig.app.json');
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        extends: path.join(FRONTEND, 'tsconfig.json'),
        include: [
          path.join(FRONTEND, 'next-env.d.ts'),
          `${FRONTEND}/src/**/*.ts`,
          `${FRONTEND}/src/**/*.tsx`,
        ],
      },
      null,
      2,
    ),
  );
  const child = spawn('bun', ['run', '--bun', 'next', 'dev', '--webpack'], {
    cwd: FRONTEND,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NODE_ENV: 'development',
      NEXT_DIST_DIR: `.next/forge-template-editor-${RUN}`,
      NEXT_TSCONFIG_PATH: tsconfigPath,
      NEXT_PUBLIC_API_URL: api,
      API_URL: api,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  const capture = (chunk: Buffer) => {
    tail.push(chunk.toString());
    if (tail.length > 80) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  for (const deadline = Date.now() + PAGE_TIMEOUT; Date.now() < deadline; ) {
    if (await answers(`${APP}/login`)) return () => killGroup(child);
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  killGroup(child);
  writeFileSync(path.join(OUT, 'app-infrastructure.log'), tail.join(''));
  throw new Error(`Next app did not boot; see ${OUT}/app-infrastructure.log`);
}

async function openTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
    await tab.click({ timeout: 2000 }).catch(() => undefined);
    if ((await tab.getAttribute('aria-selected').catch(() => null)) === 'true') return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Tab ${name} never became active`);
}
const editor = (page: Page) =>
  page.getByRole('region', { name: 'Template layer editor', exact: true });
const preview = (page: Page) => editor(page).getByRole('img', { name: /^Layout preview/ });
const layerMark = (page: Page, layerId: number) =>
  preview(page).locator(`g[data-layer-id="${layerId}"]`).first();
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function field(page: Page, label: string): Promise<Locator> {
  return editor(page).getByLabel(label, { exact: true }).filter({ visible: true }).last();
}
async function editNumber(page: Page, label: string, value: number) {
  const input = await field(page, label);
  await input.fill(String(value));
  await input.press('Tab');
}
async function settled(page: Page) {
  await editor(page)
    .getByText('Preview up to date', { exact: true })
    .waitFor({ timeout: CONVERGENCE_MS });
  const alerts = await editor(page).getByRole('alert').allTextContents();
  assert.equal(alerts.length, 0, alerts.join('; '));
}
async function reset(page: Page) {
  await page.keyboard.press('Escape');
  const button = editor(page).getByRole('button', { name: 'Reset', exact: true });
  if (await button.isEnabled()) await button.click();
  await settled(page);
}
async function selectLayer(page: Page, layer: TemplateEditableLayer) {
  const search = editor(page).getByLabel('Search layers', { exact: true });
  await search.fill(layer.text || layer.name);
  const list = editor(page).getByRole('list', { name: 'Layers', exact: true });
  const choice = list
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(layer.text || layer.name)}`) })
    .first();
  await choice.click();
  await search.fill('');
}
async function geometry(mark: Locator) {
  return mark.evaluate((group) => {
    const rect = group.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      opacity: group.getAttribute('opacity'),
      display: group.getAttribute('display'),
      transform: group.getAttribute('transform'),
    };
  });
}
async function renderedFingerprint(page: Page) {
  return preview(page)
    .locator('svg')
    .evaluate((svg) => {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      for (const node of clone.querySelectorAll(
        '[data-selection],[data-selected], [data-layer-outline]',
      ))
        node.remove();
      return clone.outerHTML;
    });
}

async function cleanup() {
  const ids = [...created];
  if (!ids.length) return;
  const assets = await media
    .from('assets')
    .select('id,origin_ref,title')
    .in('id', ids)
    .eq('brand_id', BRAND);
  assert.ifError(assets.error);
  assert.equal(assets.data?.length, ids.length, 'Cleanup ids must exist inside the bench brand');
  for (const asset of assets.data ?? [])
    assert(
      String(asset.title).startsWith('Template editor bench '),
      'Refusing to remove an asset not named by this bench',
    );
  const versions = await media
    .from('asset_versions')
    .select('bucket,storage_path')
    .in('asset_id', ids);
  assert.ifError(versions.error);
  const result = await media.from('assets').delete().in('id', ids).eq('brand_id', BRAND);
  assert.ifError(result.error);
  for (const bucket of new Set((versions.data ?? []).map((item) => item.bucket))) {
    const removed = await admin.storage
      .from(bucket)
      .remove(
        (versions.data ?? [])
          .filter((item) => item.bucket === bucket)
          .map((item) => item.storage_path),
      );
    assert.ifError(removed.error);
  }
  const remaining = await media.from('assets').select('id').in('id', ids);
  assert.ifError(remaining.error);
  assert.equal(remaining.data?.length, 0);
  rec.record(
    'Temporary variant cleanup by captured id',
    'PASS',
    `${ids.length} assets and their captured Storage versions removed`,
  );
}

type Case = { id: string; label: string; run: () => Promise<void> };
async function runRepeat(
  page: Page,
  assetId: string,
  repeat: number,
  baseline: Awaited<ReturnType<typeof sourceSnapshot>>,
) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const starts = new Map<string, number>();
  const replies: Array<{ route: string; ms: number; status: number }> = [];
  page.on('request', (request) => {
    if (/\/(layers|layer-scene|layer-preview)(\?|$)/.test(request.url()))
      starts.set(request.url(), performance.now());
  });
  page.on('response', (reply) => {
    const begin = starts.get(reply.url());
    if (begin !== undefined)
      replies.push({
        route: new URL(reply.url()).pathname.split('/').at(-1)!,
        ms: performance.now() - begin,
        status: reply.status(),
      });
  });
  const pageStarted = performance.now();
  await page.goto(`${APP}/forge?template=${assetId}`, {
    waitUntil: 'domcontentloaded',
    timeout: PAGE_TIMEOUT,
  });
  await page
    .getByRole('heading', { level: 1, name: 'Forge', exact: true })
    .waitFor({ timeout: PAGE_TIMEOUT });
  await openTab(page, 'Templates');
  await page.getByRole('tab', { name: 'Layers', exact: true }).waitFor({ timeout: 120_000 });
  const layerStarted = performance.now();
  await openTab(page, 'Layers');
  await editor(page)
    .getByRole('list', { name: 'Layers', exact: true })
    .waitFor({ timeout: 120_000 });
  await preview(page).locator('svg').waitFor({ timeout: 120_000 });
  const layerReady = timing('browser-layer-ready', layerStarted);
  timing('cold-route-and-compile', pageStarted);
  const inventory: TemplateLayerInventoryResponse = templateLayerInventoryResponseSchema.parse(
    await json(viewPath(assetId, baseline.source.version_id)),
  );
  const scene = templateLayerSceneSchema.parse(
    await json(
      `/api/ai-studio/templates/${assetId}/layer-scene?${new URLSearchParams({ brandId: BRAND, versionId: baseline.source.version_id })}`,
    ),
  );
  const drawnIds = await preview(page)
    .locator('g[data-layer-id]')
    .evaluateAll((groups) => groups.map((group) => Number(group.getAttribute('data-layer-id'))));
  const current = inventory.layers.filter(
    (layer) => layer.compId === inventory.compId && drawnIds.includes(layer.layerId),
  );
  const moving = current.find(
    (layer) => layer.visible && !layer.parentId && !layer.transformLocks.position && layer.position,
  );
  const text =
    current.find(
      (layer) =>
        layer.kind === 'text' &&
        layer.visible &&
        !layer.textReason &&
        layer.fontSize &&
        !layer.parentId,
    ) ??
    inventory.layers.find((layer) => layer.kind === 'text' && !layer.textReason && layer.fontSize);
  const component = current.find(
    (layer) =>
      layer.kind === 'composition' &&
      layer.visible &&
      !layer.parentId &&
      !layer.transformLocks.position &&
      layer.position,
  );
  assert(moving, 'Exact source has no drawn unparented movable layer for direct manipulation');
  assert(text, 'Exact source has no editable text layer');
  const initialFingerprint = await renderedFingerprint(page);
  let saved: { assetId: string; versionId: string; checksum: string } | undefined;
  const selectedName = async () =>
    editor(page)
      .getByRole('list', { name: 'Layers', exact: true })
      .locator('li[data-selected="true"]')
      .innerText();
  const controls = () =>
    page
      .getByRole('dialog', { name: /layer controls/i })
      .or(page.getByRole('region', { name: /layer controls/i }));
  const cases: Case[] = [
    {
      id: 'case-01',
      label: 'Layer list and scene arrive within the warm 2.5 second budget',
      run: async () => {
        assert(layerReady <= 2500, `Layers visible ${Math.round(layerReady)} ms`);
        assert(
          replies
            .filter((item) => ['layers', 'layer-scene'].includes(item.route))
            .every((item) => item.status === 200),
        );
      },
    },
    {
      id: 'case-02',
      label: 'Layer inventory and list agree on the default composition',
      run: async () => {
        const names = await editor(page)
          .getByRole('list', { name: 'Layers' })
          .locator('li')
          .count();
        assert.equal(
          names,
          inventory.layers.filter((layer) => layer.compId === scene.compId).length,
        );
      },
    },
    {
      id: 'case-03',
      label: 'Clicking a preview mark selects the corresponding layer',
      run: async () => {
        await selectLayer(page, text);
        await layerMark(page, moving.layerId).click({ force: true });
        assert((await selectedName()).includes(moving.text || moving.name));
      },
    },
    {
      id: 'case-04',
      label: 'Preview selection exposes contextual editable controls that change the shared draft',
      run: async () => {
        await layerMark(page, moving.layerId).click({ force: true });
        await controls().waitFor({ timeout: 1500 });
        assert(await controls().getByLabel('Position X', { exact: true }).isVisible());
        assert(await controls().getByLabel('Position Y', { exact: true }).isVisible());
        const x = controls().getByLabel('Position X', { exact: true });
        await x.fill(String(moving.position![0] + 7));
        await x.press('Tab');
        assert.equal(
          Number((await (await field(page, 'Position X')).inputValue()).replace(/,/g, '')),
          moving.position![0] + 7,
        );
        assert(
          (await controls().locator('[data-slot=number-scrub-field]').count()) >= 2,
          'Context controls do not use the canonical numeric knobs',
        );
      },
    },
    {
      id: 'case-05',
      label: 'Right click exposes the selected layer contextual controls',
      run: async () => {
        await layerMark(page, moving.layerId).click({ button: 'right', force: true });
        await controls().waitFor({ timeout: 1500 });
        assert((await controls().innerText()).includes(moving.text || moving.name));
      },
    },
    {
      id: 'case-06',
      label: 'Dragging a preview layer updates its position and graphic immediately',
      run: async () => {
        await selectLayer(page, moving);
        const mark = layerMark(page, moving.layerId);
        const before = await geometry(mark);
        const box = await mark.boundingBox();
        assert(box && box.width > 0 && box.height > 0);
        const started = performance.now();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 18, {
          steps: 4,
        });
        const after = await geometry(mark);
        const ms = timing('pointer-feedback', started);
        await page.mouse.up();
        assert(
          Math.abs(after.x - before.x - 24) <= 2 && Math.abs(after.y - before.y - 18) <= 2,
          `drag ${after.x - before.x},${after.y - before.y}; ${ms.toFixed(1)}ms`,
        );
        assert(ms <= 150);
        assert(
          Number((await (await field(page, 'Position X')).inputValue()).replace(/,/g, '')) !==
            moving.position![0],
        );
      },
    },
    {
      id: 'case-07',
      label: 'Arrow keys nudge the selected preview layer by one source pixel',
      run: async () => {
        await selectLayer(page, moving);
        await layerMark(page, moving.layerId).click({ force: true });
        await page.keyboard.press('Escape');
        const canvas = editor(page).getByRole('application', {
          name: 'Interactive template preview',
          exact: true,
        });
        await ((await canvas.count()) ? canvas : preview(page)).focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(
          Number((await (await field(page, 'Position X')).inputValue()).replace(/,/g, '')),
          moving.position![0] + 1,
        );
      },
    },
    {
      id: 'case-08',
      label: 'Shift arrow gives a precise larger keyboard nudge',
      run: async () => {
        await selectLayer(page, moving);
        await layerMark(page, moving.layerId).click({ force: true });
        await page.keyboard.press('Escape');
        const canvas = editor(page).getByRole('application', {
          name: 'Interactive template preview',
          exact: true,
        });
        await ((await canvas.count()) ? canvas : preview(page)).focus();
        await page.keyboard.press('Shift+ArrowDown');
        assert.equal(
          Number((await (await field(page, 'Position Y')).inputValue()).replace(/,/g, '')),
          moving.position![1] + 10,
        );
      },
    },
    {
      id: 'case-09',
      label: 'Typed position has visible feedback within 150 milliseconds',
      run: async () => {
        await selectLayer(page, moving);
        const before = await geometry(layerMark(page, moving.layerId));
        const started = performance.now();
        await editNumber(page, 'Position X', moving.position![0] + 30);
        const after = await geometry(layerMark(page, moving.layerId));
        const ms = timing('optimistic-position', started);
        assert(after.x !== before.x, 'Graphic did not move');
        assert(ms <= 150, `projection ${ms.toFixed(1)}ms`);
      },
    },
    {
      id: 'case-10',
      label: 'Rotation, opacity and scale retain typed numeric values',
      run: async () => {
        await selectLayer(page, moving);
        for (const [label, value, key] of [
          ['Rotation', 12, 'rotation'],
          ['Opacity', 65, 'opacity'],
          ['Scale X', 110, 'scale'],
        ] as const) {
          if (moving.transformLocks[key]) continue;
          await editNumber(page, label, value);
          assert.equal(
            Number((await (await field(page, label)).inputValue()).replace(/,/g, '')),
            value,
          );
        }
        assert(await editor(page).getByRole('button', { name: 'Reset', exact: true }).isEnabled());
      },
    },
    {
      id: 'case-11',
      label: 'Text-size edit changes preview geometry before server recomposition',
      run: async () => {
        await selectLayer(page, text);
        const before = await geometry(layerMark(page, text.layerId));
        const started = performance.now();
        await editNumber(page, 'Text size (pt)', text.fontSize! * 1.2);
        const after = await geometry(layerMark(page, text.layerId));
        const ms = timing('optimistic-font-size', started);
        assert(
          after.width > before.width * 1.1 || after.height > before.height * 1.1,
          'Text geometry stayed stale',
        );
        assert(ms <= 150);
      },
    },
    {
      id: 'case-12',
      label: 'Reset restores numeric values and original preview geometry',
      run: async () => {
        await selectLayer(page, moving);
        await editNumber(page, 'Position X', moving.position![0] + 40);
        await reset(page);
        assert.equal(
          Number((await (await field(page, 'Position X')).inputValue()).replace(/,/g, '')),
          moving.position![0],
        );
        assert.equal(await renderedFingerprint(page), initialFingerprint);
      },
    },
    {
      id: 'case-13',
      label: 'Authoritative preview converges to the latest repeated edit',
      run: async () => {
        await selectLayer(page, moving);
        await editNumber(page, 'Position X', moving.position![0] + 10);
        await editNumber(page, 'Position X', moving.position![0] + 50);
        const started = performance.now();
        await settled(page);
        const ms = timing('preview-convergence', started);
        assert(ms <= CONVERGENCE_MS);
        const exact = templateLayerPreviewResponseSchema.parse(
          await json(`/api/ai-studio/templates/${assetId}/layer-preview`, {
            brandId: BRAND,
            expectedVersionId: baseline.source.version_id,
            compId: inventory.compId,
            edits: [
              {
                compId: moving.compId,
                layerId: moving.layerId,
                position: [moving.position![0] + 50, moving.position![1]],
              },
            ],
            orders: [],
          }),
        );
        const actual = await layerMark(page, moving.layerId).evaluate((group) =>
          Array.from(group.querySelectorAll('path,polygon,rect,text')).map((node) => ({
            tag: node.localName,
            text: node.textContent,
            attrs: [
              'd',
              'points',
              'x',
              'y',
              'width',
              'height',
              'font-size',
              'transform',
              'opacity',
            ].map((name) => [name, node.getAttribute(name)]),
          })),
        );
        const expected = await page.evaluate(
          ({ svg, id }) => {
            const group = new DOMParser()
              .parseFromString(svg, 'image/svg+xml')
              .querySelector(`g[data-layer-id="${id}"]`);
            return group
              ? Array.from(group.querySelectorAll('path,polygon,rect,text')).map((node) => ({
                  tag: node.localName,
                  text: node.textContent,
                  attrs: [
                    'd',
                    'points',
                    'x',
                    'y',
                    'width',
                    'height',
                    'font-size',
                    'transform',
                    'opacity',
                  ].map((name) => [name, node.getAttribute(name)]),
                }))
              : null;
          },
          { svg: exact.svg, id: moving.layerId },
        );
        assert.deepEqual(
          actual,
          expected,
          'Preview geometry differs from authoritative latest-edit scene',
        );
      },
    },
    {
      id: 'case-14',
      label: 'Visibility hides then restores every displayed mark of the layer',
      run: async () => {
        await selectLayer(page, moving);
        const visible = editor(page)
          .getByRole('switch', { name: 'Visible in template', exact: true })
          .last();
        assert(!moving.visibilityReason, 'Visibility locked on selected source layer');
        await visible.click();
        assert(await layerMark(page, moving.layerId).isHidden(), 'Hidden layer is still displayed');
        await visible.click();
        assert(await layerMark(page, moving.layerId).isVisible(), 'Restored layer remains hidden');
      },
    },
    {
      id: 'case-15',
      label: 'Composition selection shows its own scene without stale previous content',
      run: async () => {
        const other = inventory.comps.find((comp) => comp.id !== inventory.compId);
        assert(other, 'No second real composition');
        await editor(page).getByRole('combobox', { name: 'Composition', exact: true }).click();
        await page.getByRole('option', { name: other.name, exact: true }).click();
        await settled(page);
        const drawn = await preview(page)
          .locator('g[data-layer-id]')
          .evaluateAll((marks) => marks.map((mark) => Number(mark.getAttribute('data-layer-id'))));
        const expected = templateLayerSceneSchema.parse(
          await json(
            `/api/ai-studio/templates/${assetId}/layer-scene?${new URLSearchParams({ brandId: BRAND, versionId: baseline.source.version_id, compId: String(other.id) })}`,
          ),
        );
        const expectedIds = await page.evaluate(
          (svg) =>
            Array.from(
              new DOMParser()
                .parseFromString(svg, 'image/svg+xml')
                .querySelectorAll('g[data-layer-id]'),
            ).map((mark) => Number(mark.getAttribute('data-layer-id'))),
          expected.svg,
        );
        assert.deepEqual(drawn, expectedIds);
        await editor(page).getByRole('combobox', { name: 'Composition', exact: true }).click();
        await page
          .getByRole('option', {
            name: inventory.comps.find((comp) => comp.id === inventory.compId)!.name,
            exact: true,
          })
          .click();
        await settled(page);
      },
    },
    {
      id: 'case-16',
      label: 'A composition component can be selected on the preview',
      run: async () => {
        assert(component, 'Real source has no drawn movable composition component');
        await layerMark(page, component.layerId).click({ force: true });
        assert((await selectedName()).includes(component.name));
      },
    },
    {
      id: 'case-17',
      label: 'Layer stack ordering changes the actual preview paint order',
      run: async () => {
        await selectLayer(page, moving);
        const comp = inventory.comps.find((item) => item.id === moving.compId)!;
        assert(!comp.orderReason, comp.orderReason ?? '');
        const label = moving.text || moving.name;
        const direction = moving.index === 0 ? `Send ${label} backward` : `Bring ${label} forward`;
        const before = await preview(page)
          .locator('g[data-layer-id]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-layer-id')));
        await editor(page).getByRole('button', { name: direction, exact: true }).click();
        const after = await preview(page)
          .locator('g[data-layer-id]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-layer-id')));
        assert.notDeepEqual(after, before);
      },
    },
    {
      id: 'case-18',
      label: 'Trial edits cause no Library head or source-byte write',
      run: async () => {
        await selectLayer(page, moving);
        await editNumber(page, 'Position X', moving.position![0] + 12);
        await settled(page);
        const current = await sourceSnapshot(assetId);
        assert.equal(current.asset.head_version_id, baseline.asset.head_version_id);
        assert.equal(current.source.version_id, baseline.source.version_id);
        assert.equal(current.digest, baseline.digest);
        assert.equal(
          await editor(page).getByRole('button', { name: 'Save', exact: true }).count(),
          0,
          'Golden editor offers in-place Save',
        );
      },
    },
    {
      id: 'case-19',
      label: 'Saving from the golden editor creates an independent named variant',
      run: async () => {
        await selectLayer(page, moving);
        await editNumber(page, 'Position X', moving.position![0] + 25);
        await editor(page)
          .getByLabel('Variant name', { exact: true })
          .fill(`Template editor bench ${RUN} ${repeat}`);
        const reply = page.waitForResponse(
          (item) =>
            item.url().endsWith(`/${assetId}/layer-variants`) && item.request().method() === 'POST',
          { timeout: 120_000 },
        );
        await editor(page).getByRole('button', { name: 'Save as variant', exact: true }).click();
        const result = await reply;
        const payload: unknown = await result.json();
        assert(result.ok(), JSON.stringify(payload));
        saved = templateLayerVariantResponseSchema.parse(payload);
        created.add(saved.assetId);
        assert.notEqual(saved.assetId, assetId);
        assert.notEqual(saved.versionId, baseline.source.version_id);
        await editor(page)
          .getByText('Save writes this variant’s next revision.', { exact: true })
          .waitFor({ timeout: 120_000 });
      },
    },
    {
      id: 'case-20',
      label: 'Saved variant carries source provenance and native position readback',
      run: async () => {
        assert(saved, 'Save case did not create a variant');
        const snapshot = await sourceSnapshot(saved.assetId);
        assert.equal(snapshot.asset.origin_ref.kind, 'template_variant');
        assert.equal(snapshot.asset.origin_ref.assetId, assetId);
        const inventory = templateLayerInventoryResponseSchema.parse(
          await json(viewPath(saved.assetId, saved.versionId)),
        );
        assert.equal(inventory.lineage.role, 'variant');
        assert.equal(inventory.lineage.parent?.assetId, assetId);
        assert.equal(
          inventory.layers.find((layer) => layer.layerId === moving.layerId)?.position?.[0],
          moving.position![0] + 25,
        );
      },
    },
    {
      id: 'case-21',
      label: 'Saving a variant advances its own revision while retaining earlier edits',
      run: async () => {
        assert(saved, 'Save case did not create a variant');
        await selectLayer(page, moving);
        await editNumber(page, 'Position Y', moving.position![1] + 20);
        const reply = page.waitForResponse(
          (item) =>
            item.url().endsWith(`/${saved!.assetId}/layer-variants`) &&
            item.request().method() === 'POST',
          { timeout: 120_000 },
        );
        await editor(page).getByRole('button', { name: 'Save', exact: true }).click();
        const result = await reply;
        const payload: unknown = await result.json();
        assert(result.ok(), JSON.stringify(payload));
        const updated = templateLayerVariantResponseSchema.parse(payload);
        assert.equal(updated.assetId, saved.assetId);
        assert.notEqual(updated.versionId, saved.versionId);
        const readback = templateLayerInventoryResponseSchema.parse(
          await json(viewPath(updated.assetId, updated.versionId)),
        );
        assert.deepEqual(
          readback.layers.find((layer) => layer.layerId === moving.layerId)?.position,
          [moving.position![0] + 25, moving.position![1] + 20],
        );
        saved = updated;
      },
    },
    {
      id: 'case-22',
      label: 'The Backend rejects an in-place golden save without altering its head',
      run: async () => {
        const reply = await response(`/api/ai-studio/templates/${assetId}/layer-variants`, {
          brandId: BRAND,
          expectedVersionId: baseline.source.version_id,
          compId: moving.compId,
          edits: [{ compId: moving.compId, layerId: moving.layerId, rotation: 2 }],
          orders: [],
          exposures: [],
          saveTo: 'this_variant',
        });
        const payload = (await reply.json()) as { error?: string };
        assert.equal(reply.status, 409);
        assert.equal(payload.error, 'golden_source_read_only');
      },
    },
    {
      id: 'case-23',
      label: 'No browser exceptions and the golden source remains byte-identical',
      run: async () => {
        assert.equal(pageErrors.length, 0, pageErrors.join('; '));
        const current = await sourceSnapshot(assetId);
        assert.equal(current.asset.head_version_id, baseline.asset.head_version_id);
        assert.equal(current.source.version_id, baseline.source.version_id);
        assert.equal(current.digest, baseline.digest);
      },
    },
    {
      id: 'case-24',
      label: 'Saved variants record native template Git branch checkpoint ancestry',
      run: async () => {
        assert(saved, 'Save case did not create a variant');
        const snapshot = await sourceSnapshot(saved.assetId);
        const ref = snapshot.asset.origin_ref as Record<string, unknown>;
        const git = ref.git as { branch?: string; head?: string; parent?: string } | undefined;
        assert(
          git?.branch && git.head && git.parent,
          'Library versions alone do not prove template Git branch/head/parent',
        );
        assert.notEqual(git.head, git.parent);
      },
    },
  ];
  const rows: Array<{
    id: string;
    label: string;
    pass: boolean;
    evidence: string;
    durationMs: number;
  }> = [];
  for (const item of cases) {
    if (Number(item.id.slice(-2)) < 19) {
      await reset(page);
      const defaultName = inventory.comps.find((comp) => comp.id === inventory.compId)!.name;
      const picker = editor(page).getByRole('combobox', { name: 'Composition', exact: true });
      if (!(await picker.innerText()).includes(defaultName)) {
        await picker.click();
        await page.getByRole('option', { name: defaultName, exact: true }).click();
        await settled(page);
      }
    }
    const started = performance.now();
    let evidence = 'assertions passed';
    let pass = true;
    try {
      await item.run();
    } catch (error) {
      const message = details(error);
      // Timeouts waiting for an expected interactive control are observable failures. Transport
      // or API failures invalidate the repeat and must never be scored as capability failures.
      if (
        /HTTP 5\d\d|net::|fetch failed|ECONN|Source bytes unavailable|template_forge_unreachable/.test(
          message,
        )
      )
        throw error;
      pass = false;
      evidence = message.slice(0, 1400);
    }
    (scored[item.id] ??= []).push(pass ? 1 : 0);
    rows.push({
      id: item.id,
      label: item.label,
      pass,
      evidence,
      durationMs: performance.now() - started,
    });
    rec.check(
      train.has(item.id) ? `${item.id}: ${item.label}` : `${item.id}: sealed test claim`,
      pass,
      train.has(item.id) ? evidence : undefined,
    );
    if (!pass && train.has(item.id))
      await page.screenshot({
        path: path.join(OUT, `train-${item.id}-${repeat}.png`),
        fullPage: true,
      });
  }
  writeFileSync(
    path.join(SEALED, `repeat-${repeat}.json`),
    JSON.stringify({ rows, replies }, null, 2),
  );
  writeFileSync(
    path.join(OUT, `train-${repeat}.json`),
    JSON.stringify(
      rows.filter((item) => train.has(item.id)),
      null,
      2,
    ),
  );
  await page.screenshot({ path: path.join(OUT, `final-${repeat}.png`), fullPage: true });
}

mkdirSync(OUT, { recursive: true });
mkdirSync(SEALED, { recursive: true, mode: 0o700 });
writeFileSync(
  path.join(SEALED, 'split.json'),
  JSON.stringify({ seed: SEED, train: [...train], test: [...test] }, null, 2),
);
writeFileSync(
  path.join(OUT, 'split-counts.json'),
  JSON.stringify({ seed: SEED, train: train.size, test: test.size }),
);
let backend: LocalBackend | undefined;
let stopApp: (() => void) | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let unpin: (() => Promise<void>) | undefined;
let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | undefined;
try {
  assert(Number.isInteger(REPEATS) && REPEATS >= 2, 'A measured run requires at least two repeats');
  assert.equal(train.size + test.size, 24);
  const assetId = await findSource();
  const baseline = await sourceSnapshot(assetId);
  assert.equal(baseline.source.parse_state, 'parsed', 'Exact Vivo source must be parsed');
  assert.notEqual(
    baseline.asset.origin_ref?.kind,
    'template_variant',
    'Bench source must be the golden upload',
  );
  writeFileSync(
    path.join(OUT, 'source.json'),
    JSON.stringify(
      {
        brandId: BRAND,
        assetId,
        versionId: baseline.source.version_id,
        sourceSha256: baseline.digest,
        rawAepSha256: baseline.rawAepSha256,
        title: baseline.asset.title,
        frontend: FRONTEND,
        modules: Object.fromEntries(
          [
            'TemplateLayerEditor.tsx',
            'TemplateLayerInspector.tsx',
            'TemplateLayerList.tsx',
            'layerPreviewSvg.ts',
          ].map((file) => [
            file,
            sha(readFileSync(path.join(FRONTEND, 'src/components/forge', file))),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  session = await mintSessionBundleForEmail(OWNER);
  authorization = `Bearer ${session.accessToken}`;
  unpin = await pinSession(session.accessToken);
  const boot = performance.now();
  backend = await startBackend();
  api = backend.url;
  stopApp = await startApp();
  timing('process-boot', boot);
  browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1100 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const lengths = Object.fromEntries(
      Object.entries(scored).map(([id, values]) => [id, values.length]),
    );
    try {
      await runRepeat(page, assetId, repeat, baseline);
    } catch (error) {
      for (const [id, values] of Object.entries(scored)) values.length = lengths[id] ?? 0;
      infra.push({ repeat, message: details(error) });
      rec.record(`Repeat ${repeat} infrastructure`, 'FAIL', details(error));
    } finally {
      await context.close();
    }
  }
  const after = await sourceSnapshot(assetId);
  rec.check(
    'Golden source bytes and version head survive the complete run',
    after.digest === baseline.digest &&
      after.source.version_id === baseline.source.version_id &&
      after.asset.head_version_id === baseline.asset.head_version_id,
  );
} catch (error) {
  infra.push({ repeat: 0, message: details(error) });
  rec.record('Bench infrastructure', 'FAIL', details(error));
} finally {
  await browser?.close().catch(() => undefined);
  stopApp?.();
  await backend?.stop().catch((error) => rec.record('Backend cleanup', 'FAIL', details(error)));
  await cleanup().catch((error) => rec.record('Temporary asset cleanup', 'FAIL', details(error)));
  await unpin?.().catch((error) => rec.record('Session brand cleanup', 'FAIL', details(error)));
  if (session) await admin.auth.admin.signOut(session.accessToken, 'local');
}
rec.check(
  'All claims have every repeat and no infrastructure exclusion',
  infra.length === 0 && ids.every((id) => scored[id]?.length === REPEATS),
);
const score = {
  rubric: 'v1',
  train: Object.fromEntries([...train].map((id) => [id, scored[id] ?? []])),
  test: Object.fromEntries([...test].map((id) => [id, scored[id] ?? []])),
};
writeFileSync(path.join(OUT, 'scores.json'), JSON.stringify(score, null, 2));
const timingSummary = Object.fromEntries(
  Object.entries(timings).map(([name, values]) => [
    name,
    { n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), values },
  ]),
);
const mean = (keys: Set<string>) => {
  const values = [...keys].flatMap((id) => scored[id] ?? []);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
};
writeFileSync(
  path.join(OUT, 'summary.json'),
  JSON.stringify(
    {
      rubric: 'v1',
      repeats: REPEATS,
      scoredCases: Object.keys(scored).length,
      train: mean(train),
      test: mean(test),
      infra,
      latency: timingSummary,
      providerRenderCostUsd: 0,
      storageNetworkCost: 'not metered',
      notExercised: [
        'After Effects render farm frame accuracy',
        'cloud deployment',
        'paid generation',
        'native mobile/touch devices',
        'unrelated product flows',
      ],
      sealedEvidence: SEALED,
    },
    null,
    2,
  ),
);
rec.note(
  `Train ${mean(train)}; sealed test ${mean(test)}; infrastructure failures ${infra.length}. Artifacts ${OUT}.`,
);
rec.note(
  'Not exercised: AE rendered-frame match, deployment, paid generation, native mobile/touch, unrelated product flows. Layout geometry and authoritative Forge SVG are exercised.',
);
rec.finish({ json: true });
