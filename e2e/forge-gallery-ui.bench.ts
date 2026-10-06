/**
 * forge:gallery:ui:bench — the Templates gallery and the Render picker, in a REAL Chrome, on real
 * StarCraft data (the Forge bench brand), against a bench-owned Backend (hosted Supabase, every
 * background worker off) and its own Next app, signed in as the brand owner for THIS session only.
 *
 *   1. Templates: a header click sorts each group and says so (aria-sort); a second click flips it.
 *   2. Source: a design import reads as the file it came from (Photoshop/Illustrator), not as the
 *      After Effects package it was built into — the registry's origin read, end to end.
 *   3. Variants: a template's published builds expand as rows under it; hovering the template and
 *      a build shows a picture; Edit on a build opens the template it was built from on Edit layers.
 *   4. Render: the picker searches, scrolls, groups by source type, starts a template's reads on
 *      highlight, and records how long a pick takes to become a usable grid.
 *
 * Nothing is written. Sub-rows here are a template's outputs (its delivery compositions). Named
 * registry variants are unit-tested only: production holds none, and making one would author a
 * package into the bench brand's Library, as an immutable revision nothing could clean up.
 *
 * Run: `bun run forge:gallery:ui:bench` (Frontend). `--headed` to watch.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Locator, type Page } from 'playwright';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { type LocalBackend, startLocalBackend } from './support/localBackend';
import { loadProdSupabaseEnv } from './support/prodEnv';

const BENCH = 'forge:gallery:ui:bench';
const BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const OWNER_EMAIL = 'duane@continuumai.agency';
const APP_PORT = Number(process.env.FORGE_GALLERY_APP_PORT ?? 3144);
const BACKEND_PORT = Number(process.env.FORGE_GALLERY_BACKEND_PORT ?? 4444);
const APP = `http://127.0.0.1:${APP_PORT}`;
const FRONTEND_DIR = process.cwd();
const SHOTS = path.resolve(FRONTEND_DIR, 'e2e/__screenshots__/forge-gallery');
const PAGE_TIMEOUT_MS = 240_000;
// Where the pointer rests between hovers: the empty page header. (0, 0) opens the app's sidebar,
// which then covers the template names.
const PARK: [number, number] = [900, 20];
const SOURCE_LABEL: Record<string, string> = { photoshop: 'Photoshop', illustrator: 'Illustrator' };

const notes: string[] = [];
const rec = createBenchRecorder(BENCH, notes);
let failed = false;
const check = (step: string, ok: boolean, detail?: string) => {
  if (!ok) failed = true;
  rec.record(step, ok ? 'PASS' : 'FAIL', detail);
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};
const skip = (step: string, detail: string) => {
  rec.record(step, 'SKIP', detail);
  console.log(`– SKIP ${step} — ${detail}`);
};
const note = (message: string) => {
  notes.push(message);
  console.log(`· ${message}`);
};

const { url: SUPABASE_URL, publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
process.env.PLAYWRIGHT_BASE_URL = APP;
// A bench Backend on production data must never run a production loop.
process.env.ORGANIC_JOB_WORKER_ENABLED = 'false';
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
// Edit layers previews through the forge, whose credentials only production's env carries. Just
// those two — nothing else of production's env reaches the bench processes.
for (const line of readFileSync(
  path.resolve(FRONTEND_DIR, '../Continuum-Backend/.env.production'),
  'utf8',
).split('\n')) {
  const found = line.match(/^(TEMPLATE_FORGE_(?:URL|TOKEN))=(.*)$/);
  if (found && !process.env[found[1]!])
    process.env[found[1]!] = found[2]!.trim().replace(/^["']|["']$/g, '');
}
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
  if (await answers(APP)) throw new Error(`${APP} already answers; set FORGE_GALLERY_APP_PORT`);
  const child = spawn('bun', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: true,
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NEXT_DIST_DIR: '.next/forge-gallery-bench',
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

type DesignImport = { assetId: string; title: string; source: string };

/** A published StarCraft design import whose template has published builds to expand. */
async function designImport(): Promise<DesignImport | null> {
  const media = admin.schema('media');
  const assets = await media
    .from('assets')
    .select('id,title,origin_ref')
    .eq('brand_id', BRAND_ID)
    .is('deleted_at', null)
    .eq('origin_ref->>kind', 'design_import')
    .order('created_at', { ascending: false })
    .limit(30);
  if (assets.error) throw new Error(`design imports unreadable: ${assets.error.message}`);
  for (const asset of (assets.data ?? []) as Array<{
    id: string;
    title: string | null;
    origin_ref: { source?: string };
  }>) {
    if (!asset.title || !SOURCE_LABEL[asset.origin_ref.source ?? '']) continue;
    const source = await media
      .from('template_sources')
      .select('template_key')
      .eq('asset_id', asset.id)
      .maybeSingle();
    if (source.data?.template_key)
      return { assetId: asset.id, title: asset.title, source: asset.origin_ref.source! };
  }
  return null;
}

const table = (page: Page) => page.getByRole('table', { name: 'Templates' });
/** A template row: the row holding the name button, never a sub-row. */
const templateRow = (page: Page, name: string): Locator =>
  table(page)
    .locator('tr:not([data-sub-row])')
    .filter({ has: page.getByRole('button', { name: `Open ${name}`, exact: true }) })
    .first();
const groupNames = (page: Page) =>
  table(page)
    .locator('tr:not([data-sub-row])')
    .evaluateAll((rows) =>
      rows.flatMap((row) => {
        const open = row.querySelector('button[aria-label^="Open "]');
        return open ? [open.getAttribute('aria-label')!.slice(5)] : [];
      }),
    );
/** Sorted by the page's own collator — Node's ICU and Chrome's can order punctuation apart. */
const sortedInPage = (page: Page, names: string[]) =>
  page.evaluate((list) => [...list].sort((a, b) => a.localeCompare(b)), names);

/** Hover a name, and read what the hover card draws: a render file, or the drawing of its boxes. */
async function hoverPicture(page: Page, trigger: Locator): Promise<string | null> {
  await page.mouse.move(...PARK);
  await page.waitForTimeout(400);
  // Centred, not edge-aligned: the gallery's sticky filter bar covers a row scrolled to the top.
  await trigger.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await trigger.hover({ timeout: 15_000 });
  const card = page.locator('[data-slot="hover-card-content"]').last();
  await card.waitFor({ timeout: 15_000 }).catch(() => undefined);
  for (const deadline = Date.now() + 15_000; Date.now() < deadline; ) {
    const kind = await card
      .evaluate((node) =>
        node.querySelector('img[alt$="last render"]')
          ? 'render image'
          : node.querySelector('video')
            ? 'render video'
            : node.querySelector('svg')
              ? 'wireframe'
              : null,
      )
      .catch(() => null);
    if (kind) return kind;
    await page.waitForTimeout(500);
  }
  return null;
}

async function run() {
  const found = await designImport();
  const hyperframes = await admin
    .schema('media')
    .from('assets')
    .select('id,title,origin_ref')
    .eq('brand_id', BRAND_ID)
    .eq('origin_ref->>kind', 'hyperframes')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

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
    // A red run says which read failed, not just which wait timed out.
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/api/'))
        note(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    });
    mkdirSync(SHOTS, { recursive: true });

    await page.goto(`${APP}/forge`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page
      .getByRole('heading', { level: 1, name: 'Forge' })
      .waitFor({ timeout: PAGE_TIMEOUT_MS });
    await openTab(page, 'Templates');
    await table(page)
      .getByRole('button', { name: /^Open / })
      .first()
      .waitFor({ timeout: 120_000 });

    // 1. Header sort.
    const header = (name: string) =>
      table(page)
        .locator('th')
        .filter({ has: page.getByRole('button', { name: `Sort by ${name}`, exact: true }) });
    const updatedFirst = await header('Updated').getAttribute('aria-sort');
    await header('Template').getByRole('button').click();
    const az = await groupNames(page);
    const azSort = await header('Template').getAttribute('aria-sort');
    await header('Template').getByRole('button').click();
    const za = await groupNames(page);
    check(
      'Templates: default sort is newest first, and the header says so',
      updatedFirst === 'descending',
      `Updated aria-sort ${updatedFirst}`,
    );
    // Ready is the first group; its rows run A→Z, then Z→A.
    const readyCount = Number(
      (
        await table(page)
          .getByRole('button', { name: /^Collapse Ready/ })
          .textContent()
      )?.match(/(\d+)\s*$/)?.[1] ?? 0,
    );
    const readyAz = az.slice(0, readyCount);
    const readyZa = za.slice(0, readyCount);
    const expected = await sortedInPage(page, readyAz);
    const sortedOk =
      readyCount > 1 &&
      JSON.stringify(readyAz) === JSON.stringify(expected) &&
      JSON.stringify([...readyZa].reverse()) === JSON.stringify(await sortedInPage(page, readyZa));
    check(
      'Templates: a header click sorts the group A→Z, a second click flips it',
      azSort === 'ascending' && sortedOk,
      sortedOk
        ? `${readyCount} ready rows · first ${az[0]} → ${za[0]}`
        : `A→Z ${readyAz.join(' | ')} · Z→A ${readyZa.join(' | ')}`,
    );
    await header('Updated').getByRole('button').click();

    // 2. Source: a design import reads as its file.
    if (!found) {
      skip('Source: a design import reads as its file', 'StarCraft has no published design import');
    } else {
      const row = templateRow(page, found.title);
      await row.waitFor({ timeout: 30_000 });
      const sourceCell = ((await row.getByRole('cell').nth(1).textContent()) ?? '').trim();
      check(
        `Source: the design import "${found.title}" reads as ${SOURCE_LABEL[found.source]}`,
        sourceCell.startsWith(SOURCE_LABEL[found.source]!),
        sourceCell,
      );
    }
    if (hyperframes.data) {
      const title = (hyperframes.data as { title: string }).title;
      await page.getByRole('combobox', { name: 'Filter by source type' }).click();
      await page.getByRole('option', { name: 'HyperFrames', exact: true }).click();
      const names = await groupNames(page);
      check(
        'Source: the HyperFrames export lists under HyperFrames',
        names.includes(title),
        names.join(' · '),
      );
      await page.getByRole('combobox', { name: 'Filter by source type' }).click();
      await page.getByRole('option', { name: 'All source types', exact: true }).click();
    } else {
      skip(
        'Source: the HyperFrames export lists under HyperFrames',
        'no StarCraft asset carries origin kind hyperframes yet (backfill not applied)',
      );
    }

    // 3. Hover pictures; variants as rows when the brand has any to show.
    const hoverName = found?.title ?? (await groupNames(page))[0]!;
    const primePicture = await hoverPicture(
      page,
      table(page).getByRole('button', { name: `Open ${hoverName}`, exact: true }),
    );
    check(
      `Hover: the template "${hoverName}" shows a picture`,
      primePicture !== null,
      primePicture ?? 'nothing drawn',
    );
    await page.mouse.move(...PARK);
    // An After Effects template's outputs are its AE comps, which Edit layers selects by name; a
    // design import edits one composed layer stack, so its outputs land on the editor as a whole.
    const expandable = table(page)
      .locator('tr:not([data-sub-row])')
      .filter({
        has: page.getByRole('button', { name: /^Show \d+ variants? of / }),
      });
    // "Bench · AEP ready render" is a registered After Effects template with three outputs, each an
    // AE comp. StarCraft Promo and the older bench uploads carry no file checksum, so the registry
    // never took them in and Edit layers has no revision to open — the editor says so.
    const promo = expandable.filter({
      has: page.getByRole('button', { name: 'Open Bench · AEP ready render', exact: true }),
    });
    const aeRow = (
      (await promo.count()) ? promo : expandable.filter({ hasText: 'After Effects' })
    ).first();
    const expand = ((await aeRow.count()) ? aeRow : expandable.first())
      .getByRole('button', { name: /^Show \d+ variants? of / })
      .first();
    if (!(await expand.isVisible().catch(() => false))) {
      for (const step of [
        'Variants: a template expands into rows of the table',
        'Hover: a variant shows a picture',
        'Edit: a variant opens on Edit layers',
      ])
        skip(step, 'no StarCraft template has outputs, published builds or named variants to nest');
    } else {
      const label = (await expand.getAttribute('aria-label')) ?? '';
      const [, count, parent] = label.match(/^Show (\d+) variants? of (.+)$/) ?? [];
      await expand.click();
      const subRows = table(page).locator('tr[data-sub-row]');
      await subRows.first().waitFor({ timeout: 15_000 });
      check(
        `Variants: "${parent}" expands into ${count} rows of the table`,
        (await subRows.count()) === Number(count),
        `${await subRows.count()} sub-rows`,
      );
      // The LAST output: the editor opens on the first comp anyway, so only another one proves Edit
      // chose it.
      const target = subRows.last();
      const subOpen = target.getByRole('button', { name: /^Open / });
      const subName = ((await subOpen.getAttribute('aria-label')) ?? '').slice(5);
      const subPicture = await hoverPicture(page, subOpen);
      check(
        `Hover: the variant "${subName}" shows a picture`,
        subPicture !== null,
        subPicture ?? 'nothing drawn',
      );
      await page.screenshot({ path: path.join(SHOTS, 'gallery-expanded.png'), fullPage: true });
      // Read before Edit: opening the detail takes the gallery off the page.
      const isOutput = (await target.textContent())?.includes('Output ·') ?? false;
      await page.mouse.move(...PARK);
      await target.getByRole('button', { name: `Edit ${subName}`, exact: true }).click();
      const editLayers = page.getByRole('tab', { name: 'Edit layers', exact: true });
      await editLayers.waitFor({ timeout: 60_000 });
      for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
        if ((await editLayers.getAttribute('aria-selected')) === 'true') break;
        await page.waitForTimeout(500);
      }
      check(
        `Edit: "${subName}" opens its template on Edit layers`,
        (await editLayers.getAttribute('aria-selected')) === 'true',
      );
      // An output's Edit lands on that composition; a build or named variant has its own source.
      const composition = page.getByRole('combobox', { name: 'Composition' });
      const landed = await composition
        .waitFor({ timeout: 120_000 })
        .then(() =>
          composition.evaluate((node) => {
            const select = node as HTMLSelectElement;
            return select.selectedOptions[0]?.textContent?.trim() ?? '';
          }),
        )
        .catch(() => null);
      if (isOutput)
        check(
          `Edit: the editor opens on the "${subName}" composition`,
          landed === subName,
          `Composition ${JSON.stringify(landed)}`,
        );
      else
        note(
          `edited a ${count === '1' ? 'single' : 'listed'} variant; editor composition ${landed}`,
        );
      await page.screenshot({ path: path.join(SHOTS, 'variant-edit-layers.png'), fullPage: true });
    }

    // 4. Render picker.
    await openTab(page, 'Render');
    const picker = page.getByRole('button', { name: 'Template', exact: true });
    await picker.waitFor({ timeout: 60_000 });
    for (const deadline = Date.now() + 120_000; Date.now() < deadline; ) {
      if (await picker.isEnabled()) break;
      await page.waitForTimeout(500);
    }
    await picker.click();
    const list = page.locator('[cmdk-list]');
    await list.waitFor({ timeout: 30_000 });
    const options = page.getByRole('option');
    const total = await options.count();
    const scroll = await list.evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));
    check(
      'Render: the picker lists every template in a list that scrolls',
      total > 7 && scroll.scrollHeight > scroll.clientHeight,
      `${total} templates · ${scroll.scrollHeight}px in ${scroll.clientHeight}px`,
    );
    const headings = await page
      .locator('[cmdk-group-heading]')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
    check(
      'Render: rows group by what each was authored in',
      headings.length > 1 && headings.includes('After Effects'),
      headings.join(' · '),
    );
    const search = page.getByRole('combobox', { name: 'Search templates' });
    const word = found?.title.split(/\s+/)[0] ?? 'bench';
    await search.fill(word);
    const narrowed = await options.allTextContents();
    check(
      `Render: search narrows to "${word}"`,
      narrowed.length > 0 &&
        narrowed.length < total &&
        narrowed.every((text) => text.toLowerCase().includes(word.toLowerCase())),
      `${narrowed.length} of ${total}`,
    );
    await search.fill('');

    const contracts: Array<{ url: string; at: number }> = [];
    page.on('request', (request) => {
      if (/\/renders\/templates\/[^/]+\/contract/.test(request.url()))
        contracts.push({ url: request.url(), at: Date.now() });
    });
    await search.press('ArrowDown');
    await search.press('ArrowDown');
    const highlighted =
      (await page.locator('[cmdk-item][data-selected="true"]').textContent()) ?? '';
    await page.waitForTimeout(1_500);
    const prefetched = contracts.length;
    const picked = Date.now();
    await search.press('Enter');
    // The toolbar shows Add only once the chosen template's contract is in — the grid is usable.
    const ready = page
      .getByRole('toolbar', { name: 'Render' })
      .getByRole('button', { name: 'Add', exact: true });
    await ready.waitFor({ timeout: 120_000 });
    const pickMs = Date.now() - picked;
    check(
      'Render: highlighting a template starts its contract read before the pick',
      prefetched > 0,
      `${prefetched} contract request(s) before Enter · highlighted ${highlighted.slice(0, 60)}`,
    );
    check(
      'Render: a highlighted pick is a usable grid quickly',
      pickMs < 3_000,
      `${pickMs} ms from Enter to the grid`,
    );
    note(`pick→grid ${pickMs} ms after a 1.5 s highlight`);
    await page.screenshot({ path: path.join(SHOTS, 'render-picked.png'), fullPage: true });
    note(`screenshots: ${SHOTS}`);
    note(
      'Coverage: sub-rows exercised are outputs; named registry variants are unit-tested only — production holds none, and a revision made here could never be removed.',
    );
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (failed)
      await browser
        ?.contexts()[0]
        ?.pages()[0]
        ?.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true })
        .catch(() => undefined);
    await browser?.close().catch(() => undefined);
    stopApp?.();
    await backend?.stop().catch(() => undefined);
    await admin.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  }
}

await run().catch((error: unknown) => {
  failed = true;
  console.error(error);
  rec.record(
    'the bench ran to its end',
    'FAIL',
    error instanceof Error ? error.message.split('\n')[0] : String(error),
  );
});
rec.print();
process.exit(failed ? 1 : 0);
