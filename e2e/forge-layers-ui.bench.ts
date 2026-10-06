/**
 * forge:layers:ui:bench — the arrangements a person makes, shown where they make and use them, in a
 * REAL Chrome. A bench-owned Backend (hosted Supabase, every background worker off) and its own
 * Next app; StarCraft (the Forge bench brand), signed in as its owner for THIS session only.
 *
 *   1. Templates → the design-import template → Layers: the file's own stack, front first, and each
 *      saved arrangement in its approved order — what the server reads out of the source file.
 *   2. Render → that template: every arrangement is a format a row picks (named chips, each in the
 *      Formats menu), and an empty field shows the saved default it will render.
 *
 * The template is the one `forge:composition:e2e:bench -- --farm` publishes and keeps (a design
 * import with arrangements, newest first), or FORGE_LAYERS_ASSET_ID. Nothing is written.
 *
 * Run: `bun run forge:layers:ui:bench` (root or Frontend). `--headed` to watch.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';
import { mintSessionBundleForEmail } from './support/auth';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

const BENCH = 'forge:layers:ui:bench';
const BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = 'duane@continuumai.agency';
const APP_PORT = Number(process.env.FORGE_LAYERS_APP_PORT ?? 3143);
const BACKEND_PORT = Number(process.env.FORGE_LAYERS_BACKEND_PORT ?? 4443);
const APP = `http://127.0.0.1:${APP_PORT}`;
const FRONTEND_DIR = process.cwd();
const SHOTS = path.resolve(FRONTEND_DIR, 'e2e/__screenshots__/forge-layers');
const PAGE_TIMEOUT_MS = 240_000;

type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
const results: Array<{ step: string; grade: Grade; detail?: string }> = [];
const notes: string[] = [];
const startedMs = Date.now();
const record = (step: string, grade: Grade, detail?: string) => {
  results.push({ step, grade, ...(detail ? { detail } : {}) });
  const glyph = { PASS: '✓', WARN: '!', SKIP: '–', FAIL: '✗' }[grade];
  console.log(`${glyph} ${grade.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`);
};
const check = (step: string, ok: boolean, detail?: string) =>
  record(step, ok ? 'PASS' : 'FAIL', detail);
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

const { url: SUPABASE_URL, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = APP;
// A bench Backend on production data must never run a production loop.
process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
const admin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

function killGroup(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

async function startApp(backendUrl: string): Promise<() => void> {
  if (await answers(APP)) throw new Error(`${APP} already answers; set FORGE_LAYERS_APP_PORT`);
  const child = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/forge-layers-bench',
      NEXT_PUBLIC_API_URL: backendUrl,
      API_URL: backendUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tail: string[] = [];
  child.stdout?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => tail.push(chunk.toString()));
  for (const deadline = Date.now() + PAGE_TIMEOUT_MS; Date.now() < deadline; ) {
    if (await answers(`${APP}/login`)) return () => killGroup(child);
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  killGroup(child);
  throw new Error(`the Next app never came up on ${APP}\n${tail.slice(-20).join('')}`);
}

type Target = {
  assetId: string;
  title: string;
  templateKey: string | null;
  arrangements: Array<{ name: string; order: number[] }>;
  comps: string[];
  published: boolean;
};

/** The newest StarCraft design import that carries arrangements — a published one first. */
async function target(): Promise<Target | null> {
  const media = admin.schema('media');
  const assets = await media
    .from('assets')
    .select('id,title,origin_ref,created_at')
    .eq('brand_id', BRAND_ID)
    .is('deleted_at', null)
    .eq('origin_ref->>kind', 'design_import')
    .not('origin_ref->arrangements', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (assets.error) throw new Error(`design imports unreadable: ${assets.error.message}`);
  const wanted = process.env.FORGE_LAYERS_ASSET_ID;
  let fallback: Target | null = null;
  for (const asset of (assets.data ?? []) as Array<{
    id: string;
    title: string | null;
    origin_ref: { arrangements?: Array<{ name: string; order: number[] }> };
  }>) {
    if (wanted && asset.id !== wanted) continue;
    if (!asset.title || !asset.origin_ref.arrangements?.length) continue;
    const source = await media
      .from('template_sources')
      .select('template_key,render_template_id,parse')
      .eq('asset_id', asset.id)
      .maybeSingle();
    const row = source.data as {
      template_key: string | null;
      render_template_id: number | null;
      parse: { comps: Array<{ name: string; isDelivery: boolean }> } | null;
    } | null;
    const candidate: Target = {
      assetId: asset.id,
      title: asset.title,
      templateKey: row?.template_key ?? null,
      arrangements: asset.origin_ref.arrangements,
      comps: (row?.parse?.comps ?? []).filter((comp) => comp.isDelivery).map((comp) => comp.name),
      published: !!row?.render_template_id,
    };
    if (candidate.published) return candidate;
    fallback ??= candidate;
  }
  return fallback;
}

async function pinSessionToStarCraft(accessToken: string) {
  const claims = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { sub: string; session_id: string };
  const member = createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pinned = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: claims.sub,
      session_id: claims.session_id,
      active_brand_id: BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (pinned.error) throw new Error(`session brand pin failed: ${pinned.error.message}`);
}

/** Retry a click until the tab reports itself selected: dev markup lands before hydration. */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true });
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
    await tab.click().catch(() => undefined);
    if ((await tab.getAttribute('aria-selected').catch(() => null)) === 'true') return;
    await page.waitForTimeout(1_000);
  }
  throw new Error(`the ${name} tab never opened`);
}

const listNames = (page: Page, scope: ReturnType<Page['locator']>) =>
  scope
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => (item.textContent ?? '').replace('Hidden in the file', '').trim()),
    );

async function run() {
  const found = await target();
  if (!found) {
    record(
      'a published design import with arrangements exists',
      'FAIL',
      'run `bun run forge:composition:e2e:bench -- --farm` first, or set FORGE_LAYERS_ASSET_ID',
    );
    return;
  }
  const tag = (found.title.match(/[0-9a-f]{8}/i)?.[0] ?? found.title).toLowerCase();
  note(`template ${found.templateKey} · ${found.title} · comps ${found.comps.join(' · ')}`);
  const arrangement = found.arrangements[0] as { name: string; order: number[] };

  let backend: LocalBackend | null = null;
  let stopApp: (() => void) | null = null;
  let browser: import('playwright').Browser | null = null;
  const session = await mintSessionBundleForEmail(OWNER_EMAIL);
  try {
    await pinSessionToStarCraft(session.accessToken);
    backend = await startLocalBackend({
      port: BACKEND_PORT,
      browserOrigin: APP,
      supabase: 'hosted',
      label: BENCH,
    });
    stopApp = await startApp(backend.url);
    note(`bench-owned Backend ${backend.url} (workers off) · app ${APP}`);

    browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => note(`page error: ${error.message.slice(0, 200)}`));
    mkdirSync(SHOTS, { recursive: true });

    await page.goto(`${APP}/forge`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page
      .getByRole('heading', { level: 1, name: 'Forge' })
      .waitFor({ timeout: PAGE_TIMEOUT_MS });

    // 1. Templates → the template → Layers.
    await openTab(page, 'Templates');
    const card = page
      .getByRole('table', { name: 'Templates' })
      .getByRole('button', { name: new RegExp(`^Open .*${tag}`, 'i') })
      .first();
    await card.waitFor({ timeout: 60_000 });
    await card.click();
    await openTab(page, 'Layers');
    const fileStack = page.getByText('as the file stacks it').first();
    await fileStack.waitFor({ timeout: 120_000 });
    const section = page.getByRole('region', { name: `Arrangement ${arrangement.name}` });
    await section.waitFor({ timeout: 30_000 });
    const fileList = page.locator('section', { has: fileStack }).getByRole('list').first();
    const fileNames = await listNames(page, fileList);
    const arranged = await listNames(page, section.getByRole('list'));
    await page.screenshot({ path: path.join(SHOTS, 'layers-tab.png'), fullPage: true });
    check(
      'Layers: the file’s own stack, front first',
      fileNames.length >= 2,
      fileNames.join(' · '),
    );
    check(
      'Layers: the saved arrangement, in its approved order — a different stack of the same layers',
      arranged.length === fileNames.length &&
        [...arranged].sort().join('|') === [...fileNames].sort().join('|') &&
        arranged.join('|') !== fileNames.join('|'),
      arranged.join(' · '),
    );

    // 2. Render → the template: the arrangements are formats.
    if (!found.published) {
      record(
        'Render: the arrangements as formats of a row',
        'SKIP',
        'the template is not published yet — a revision renders only after Publish',
      );
      return;
    }
    await openTab(page, 'Render');
    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await picker.waitFor({ timeout: 60_000 });
    await picker.click();
    await page
      .getByRole('option', { name: new RegExp(tag, 'i') })
      .first()
      .click({ timeout: 30_000 });
    const formats = page.getByRole('button', { name: /^Formats / }).first();
    await formats.waitFor({ timeout: 120_000 });
    const formatsName = (await formats.getAttribute('aria-label')) ?? '';
    check(
      'Render: every arrangement is a format of the row, by name',
      found.comps.every((comp) => formatsName.includes(comp)),
      formatsName,
    );
    await formats.click();
    const items = await page
      .getByRole('menuitemcheckbox')
      .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? '').trim()));
    check(
      'Render: the Formats menu offers each arrangement',
      found.comps.every((comp) => items.some((item) => item.includes(comp))),
      items.join(' · '),
    );
    await page.screenshot({ path: path.join(SHOTS, 'render-formats.png'), fullPage: true });
    await page.keyboard.press('Escape');

    const headline = page.getByRole('textbox', { name: 'Headline', exact: true }).first();
    const placeholder = await headline
      .getAttribute('placeholder', { timeout: 30_000 })
      .catch(() => null);
    if (placeholder === null) {
      record(
        'Render: an empty headline shows the default it renders',
        'SKIP',
        'no Headline field on this template',
      );
    } else {
      check(
        'Render: an empty headline shows the default it renders',
        placeholder === 'GO FAST',
        `placeholder ${JSON.stringify(placeholder)}`,
      );
    }
    note(`screenshots: ${SHOTS}`);
  } finally {
    await browser?.close().catch(() => undefined);
    stopApp?.();
    await backend?.stop().catch(() => undefined);
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  }
}

await run().catch((error: unknown) =>
  record(
    'the bench ran to its end',
    'FAIL',
    error instanceof Error ? error.message : String(error),
  ),
);
const counts = { pass: 0, warn: 0, skip: 0, fail: 0 };
for (const result of results) counts[result.grade.toLowerCase() as keyof typeof counts] += 1;
const exitCode = counts.fail > 0 || results.length === 0 ? 1 : 0;
console.log(
  `\n${exitCode === 0 ? 'PASS' : 'FAIL'} — ${BENCH}: ${counts.pass} pass, ${counts.warn} warn, ` +
    `${counts.skip} skip, ${counts.fail} fail (${((Date.now() - startedMs) / 1000).toFixed(1)}s)`,
);
console.log(JSON.stringify({ bench: BENCH, results, notes, counts, exitCode }));
process.exit(exitCode);
