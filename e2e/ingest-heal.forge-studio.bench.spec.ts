import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { readFontNames } from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import { STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:ingest-heal — the three client packages that stopped on 2026-09-21, driven through the
// real Forge page in a real Chrome against the LOCAL backend and production data.
//
//   CERTIFICADO  fonts LOOSE beside the zip (hashed names) are stored from the same drop, and a
//                fresh upload's PARSE row refreshes without a reload
//   KAMAY        fonts INSIDE the zip: "Fix problems" finds them; the 43 per-comp questions
//                render grouped; the Activity trail names what happened; wireframe hovers name
//                the layer
//   LEVI'S       Poppins cuts from Google Fonts via "Fix problems"; the two 9:16 formats read
//                as two different comps
//
// Each template is opened the way a person reopens one: by dropping its file again, which
// Forge answers "Already in Forge" and opens. Fonts are reset to the run's starting state before
// each case (same brand, so a face healed by one case would pre-satisfy the next), and every
// row, object and trail line this run wrote is removed by id at the end.
//
// NOT exercised: the forge engine's new binding. The local backend talks to the DEPLOYED forge,
// which does not have it yet, so "Fix problems" re-planning the build is graded as what the
// deployed forge answered — recorded, not hidden.
//
//   FORGE_STUDIO_LIVE=1 FORGE_STUDIO_API_URL=http://localhost:4010 \
//     bunx playwright test --config playwright.forge-studio.config.ts e2e/ingest-heal.forge-studio.bench.spec.ts
// ---------------------------------------------------------------------------

const { serviceRoleKey } = loadProdSupabaseEnv();
const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const OWNER_EMAIL = 'duane@continuumai.agency';
const DOWNLOADS = process.env.FORGE_HEAL_FILES ?? join(homedir(), 'Downloads');
const WORK = join(tmpdir(), `forge-ingest-heal-${Date.now()}`);

const KAMAY = { assetId: '25079e97-091e-42eb-988e-f6f993878207', zip: 'KAMAY_SPONSORS_1.3.zip' };
const CERTIFICADO = {
  assetId: '8c1f40b5-2fcc-4985-b1d9-4f9d3ad5e405',
  zip: '767a4e8a80ae5993de44cfb4b4c9e8f9.zip',
};
const LEVIS = {
  assetId: '59c20a1a-62e6-4b9c-b5cc-4551bf7803cf',
  zip: '8810d17803764c4cb5952c1ef5c3d83b.zip',
};
const CERTIFICADO_FACES = ['PlusJakartaSans-Bold', 'PlusJakartaSans-Medium', 'Sora-SemiBold'];

type Grade = { step: string; grade: 'PASS' | 'FAIL' | 'SKIP' | 'NOTE'; detail: string };
const grades: Grade[] = [];
const record = (step: string, grade: Grade['grade'], detail: string) => {
  grades.push({ step, grade, detail });
  console.log(`[forge:ingest-heal] ${grade} ${step} — ${detail}`);
};

const admin = () =>
  createClient(PROD_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let session: MintedSession | null = null;
let fontsBefore = new Set<string>();
let eventsBefore = new Set<string>();
let manifest: Uint8Array | null = null;
const MANIFEST_PATH = `${STARCRAFT_BRAND_ID}/fonts/manifest.json`;
const created: { assetId: string | null; storagePath: string | null } = {
  assetId: null,
  storagePath: null,
};

type FontRow = { id: string; storage_bucket: string; storage_path: string };

async function fontRows(): Promise<FontRow[]> {
  const { data, error } = await admin()
    .schema('media')
    .from('fonts')
    .select('id, storage_bucket, storage_path')
    .or(`brand_id.eq.${STARCRAFT_BRAND_ID},brand_id.is.null`);
  if (error) throw new Error(`font read: ${error.message}`);
  return data as FontRow[];
}

async function eventIds(): Promise<Set<string>> {
  const { data, error } = await admin()
    .schema('media')
    .from('template_source_events')
    .select('id')
    .eq('brand_id', STARCRAFT_BRAND_ID);
  if (error) throw new Error(`event read: ${error.message}`);
  return new Set((data ?? []).map((row) => row.id as string));
}

/** Every face this run stored, gone, and the brand's font manifest as it was. */
async function resetFonts(): Promise<number> {
  const db = admin();
  const extra = (await fontRows()).filter((row) => !fontsBefore.has(row.id));
  for (const row of extra) {
    await db.storage.from(row.storage_bucket).remove([row.storage_path]);
    const { error } = await db.schema('media').from('fonts').delete().eq('id', row.id);
    if (error) throw new Error(`font delete: ${error.message}`);
  }
  const bucket = db.storage.from('brand-docs');
  const { error } = manifest
    ? await bucket.upload(MANIFEST_PATH, Buffer.from(manifest), {
        contentType: 'application/json',
        upsert: true,
      })
    : await bucket.remove([MANIFEST_PATH]);
  if (error) throw new Error(`manifest restore: ${error.message}`);
  return extra.length;
}

/** The client's loose font files for these faces, found by the name inside each file. */
function looseFonts(faces: readonly string[]): string[] {
  const found = new Map<string, string>();
  for (const file of readdirSync(DOWNLOADS).filter((name) => /\.(ttf|otf)$/i.test(name))) {
    const path = join(DOWNLOADS, file);
    const name = readFontNames(new Uint8Array(readFileSync(path)))?.postScriptName;
    if (name && faces.includes(name) && !found.has(name)) found.set(name, path);
  }
  return [...found.values()];
}

/** A copy of a package with one extra file, so the drop is an upload rather than a reopen. */
function freshCopy(zip: string): string {
  mkdirSync(WORK, { recursive: true });
  const path = join(WORK, `CERTIFICADO-heal-${Date.now()}.zip`);
  copyFileSync(join(DOWNLOADS, zip), path);
  const marker = join(WORK, 'forge-ingest-heal.txt');
  writeFileSync(marker, `${Date.now()}\n`);
  const zipped = spawnSync('zip', ['-j', '-q', path, marker]);
  if (zipped.status !== 0) throw new Error(`zip exited ${zipped.status}`);
  return path;
}

/**
 * Hand the drop target real bytes. A PATH makes Playwright stream the file in and the `change`
 * React listens for never arrives (the intake bench measured it) — so buffers, always.
 */
async function drop(page: Page, paths: string[]): Promise<void> {
  await page.getByLabel('Project files').setInputFiles(
    paths.map((path) => ({
      name: basename(path),
      mimeType: path.endsWith('.zip') ? 'application/zip' : 'font/ttf',
      buffer: readFileSync(path),
    })),
  );
}

async function openForge(page: Page): Promise<void> {
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 180_000,
  });
  // A RENDERED card, not just the input: the input ships in the server HTML and a file set
  // before hydration fires a `change` no React handler hears.
  await expect(page.getByRole('list', { name: 'Templates' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 60_000 });
}

/** Reopen a template the way a person does: drop its file; Forge says it has it and opens it. */
async function dropAndOpen(page: Page, files: string[]): Promise<void> {
  await drop(page, files);
  await expect(page.getByRole('list', { name: 'Checks' })).toBeVisible({ timeout: 120_000 });
}

const checkRow = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Checks' })
    .getByRole('listitem')
    .filter({ has: page.locator('.font-mono', { hasText: new RegExp(`^${name}$`) }) });

const fact = (page: Page, label: string) =>
  page
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

async function openDetail(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('button', { name: `${name} details` });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

type RunRow = {
  state: string;
  needs: Array<{ kind: string }> | null;
  findings?: Array<{ code?: string; why?: string }> | null;
};

/**
 * The template's forge run after Fix, followed until it stops by itself again — draft_ready, a
 * failure, or another needs_input — or the deadline. It starts parked at needs_input, so only a
 * stop AFTER it was seen moving counts.
 */
async function followRun(
  assetId: string,
  timeoutMs = 600_000,
): Promise<RunRow & { moved: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let moved = false;
  let last: RunRow = { state: 'unknown', needs: null };
  while (Date.now() < deadline) {
    const { data } = await admin()
      .schema('media')
      .from('template_source_runs')
      .select('state, needs, findings')
      .eq('asset_id', assetId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    last = (data as RunRow | null) ?? last;
    if (last.state !== 'needs_input') moved = true;
    if (
      moved &&
      ['draft_ready', 'review_ready', 'published', 'failed', 'needs_input'].includes(last.state)
    ) {
      return { ...last, moved };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return { ...last, moved };
}

async function gradeRun(name: string, assetId: string): Promise<void> {
  const run = await followRun(assetId);
  const needs = run.needs ?? [];
  // Row 1 is graded on its own: a draft whose seed row NocoBase refused still reaches
  // draft_ready, and reading only the state is how that went unnoticed once already.
  const refused = (run.findings ?? []).find((finding) => finding.code === 'ROW_WRITE_FAILED');
  record(
    `${name} · row 1 (the designer's own values and footage) is written`,
    refused ? 'FAIL' : 'PASS',
    refused?.why ?? 'written',
  );
  record(
    `${name} · the build reaches a draft with nothing to answer`,
    run.state === 'draft_ready' && needs.length === 0 ? 'PASS' : 'FAIL',
    `run ${run.moved ? 'moved' : 'never moved'} → ${run.state}; ${needs.length} need(s)${needs.length ? ` (${[...new Set(needs.map((need) => need.kind))].join(', ')})` : ''}`,
  );
}

const formatChips = (page: Page) => page.locator('[aria-label="Format"] button').allTextContents();

async function runNeeds(
  assetId: string,
): Promise<Array<{ slot?: { label?: string; type?: string } }>> {
  const db = admin().schema('media');
  const { data: source } = await db
    .from('template_sources')
    .select('forge_run_id')
    .eq('asset_id', assetId)
    .single();
  const { data: run } = await db
    .from('template_source_runs')
    .select('needs')
    .eq('run_id', source?.forge_run_id)
    .single();
  return (
    (run?.needs as Array<{ kind: string; slot?: { label?: string; type?: string } }>) ?? []
  ).filter((need) => need.kind === 'mapping');
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (!LIVE) return;
  session = await mintSessionBundleForEmail(OWNER_EMAIL);
  const [, payload] = session.accessToken.split('.');
  const { sub, session_id } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const { error } = await admin().schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: sub,
      session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`session brand pin: ${error.message}`);
  fontsBefore = new Set((await fontRows()).map((row) => row.id));
  eventsBefore = await eventIds();
  const { data } = await admin().storage.from('brand-docs').download(MANIFEST_PATH);
  manifest = data ? new Uint8Array(await data.arrayBuffer()) : null;
});

test.afterAll(async () => {
  if (!LIVE) return;
  const db = admin();
  try {
    const fonts = await resetFonts();
    if (created.assetId) {
      if (created.storagePath) await db.storage.from('media-source').remove([created.storagePath]);
      await db.schema('media').from('template_sources').delete().eq('asset_id', created.assetId);
      await db.schema('media').from('assets').delete().eq('id', created.assetId);
    }
    const events = [...(await eventIds())].filter((id) => !eventsBefore.has(id));
    if (events.length)
      await db.schema('media').from('template_source_events').delete().in('id', events);
    const left = (await fontRows()).filter((row) => !fontsBefore.has(row.id)).length;
    record(
      'cleanup by id',
      left === 0 ? 'PASS' : 'FAIL',
      `${fonts} font row(s), ${events.length} trail row(s), fresh asset ${created.assetId ?? 'none'}; ${left} left`,
    );
  } catch (error) {
    record('cleanup by id', 'FAIL', error instanceof Error ? error.message : String(error));
  }
  if (session) await db.auth.admin.signOut(session.accessToken, 'local').catch(() => undefined);
  const counts = grades.reduce(
    (acc, g) => ({ ...acc, [g.grade]: (acc[g.grade] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  console.log(JSON.stringify({ bench: 'forge:ingest-heal · live', results: grades, counts }));
});

test.describe
  .serial('Forge ingest heals itself — the three client packages, LIVE', () => {
    test.skip(!LIVE, 'runs with FORGE_STUDIO_LIVE=1 against a local backend');

    test('CERTIFICADO · loose fonts beside a fresh zip are stored, and PARSE refreshes by itself', async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      if (!session) throw new Error('no minted session');
      await resetFonts();
      const fonts = looseFonts(CERTIFICADO_FACES);
      expect(fonts, `loose fonts in ${DOWNLOADS}`).toHaveLength(3);
      const zip = freshCopy(CERTIFICADO.zip);
      const fileName = zip.slice(zip.lastIndexOf('/') + 1);

      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await openForge(page);
      await drop(page, [zip, ...fonts]);
      await expect(page.getByText(/^Fonts added: /)).toBeVisible({ timeout: 60_000 });
      record(
        'loose hashed fonts stored from the drop',
        'PASS',
        (await page.getByText(/^Fonts added: /).textContent()) ?? '',
      );

      // The upload itself: a new asset, found by its own file name, owned by this run.
      const deadline = Date.now() + 180_000;
      while (!created.assetId && Date.now() < deadline) {
        const { data } = await admin()
          .schema('media')
          .from('asset_versions')
          .select('asset_id, storage_path')
          .eq('file_name', fileName)
          .limit(1);
        if (data?.[0]) {
          created.assetId = data[0].asset_id as string;
          created.storagePath = data[0].storage_path as string;
        } else await page.waitForTimeout(2_000);
      }
      expect(created.assetId, 'fresh upload landed').toBeTruthy();

      // Reopen it by dropping the same bytes — as soon as the list knows it — and watch PARSE.
      await expect(async () => {
        await drop(page, [zip]);
        await expect(page.getByRole('list', { name: 'Checks' })).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 120_000 });
      const parseText = (await checkRow(page, 'Parse').textContent()) ?? '';
      if (parseText.includes('Not opened yet')) {
        await expect(checkRow(page, 'Parse')).toContainText('Read ', { timeout: 120_000 });
        record(
          'PARSE was pending when opened and refreshed without a reload',
          'PASS',
          'Not opened yet → Read …',
        );
      } else {
        record(
          'PARSE refresh',
          'SKIP',
          `the parse had landed before the page opened: "${parseText.slice(0, 80)}"`,
        );
      }
      await expect(fact(page, 'Fonts')).toHaveText('3', { timeout: 60_000 });
      record('FONTS green for the loose-font template', 'PASS', 'Fonts: 3, none missing');
      await context.close();
    });

    test('KAMAY SPONSORS · Fix takes the fonts out of the zip; questions grouped; trail and hovers', async ({
      browser,
    }) => {
      test.setTimeout(900_000);
      if (!session) throw new Error('no minted session');
      await resetFonts();
      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await openForge(page);
      await dropAndOpen(page, [join(DOWNLOADS, KAMAY.zip)]);

      await expect(checkRow(page, 'Parse')).toContainText('Read 9 variables', { timeout: 60_000 });
      await expect(fact(page, 'Fonts')).toHaveText('3 · 3 missing', { timeout: 60_000 });

      // Wireframe hovers name the layer, not an internal key.
      // It opens on a format with boxes, not on a precomp the parse listed first.
      await expect(page.locator('svg rect > title').first()).toBeAttached({ timeout: 30_000 });
      const titles = await page.locator('svg rect > title').allTextContents();
      // Text layers carry no box until the parse machine holds the face, so only measured layers
      // are drawn; every one drawn must be named by its layer, never by an internal key.
      record(
        'wireframe hovers name the layer',
        titles.length > 0 && titles.every((title) => !/^(text|image|video|color)__/i.test(title))
          ? 'PASS'
          : 'FAIL',
        titles.join(' | '),
      );

      // The 43 per-comp questions, grouped by field.
      const needs = await runNeeds(KAMAY.assetId);
      const groups = new Set(needs.map((need) => `${need.slot?.label}\u0000${need.slot?.type}`))
        .size;
      await openDetail(page, 'Build');
      const rows = page.getByRole('list', { name: 'Questions' }).getByRole('listitem');
      await expect(rows).toHaveCount(groups);
      record(
        'questions grouped by field',
        groups < needs.length ? 'PASS' : 'FAIL',
        `${needs.length} needs → ${groups} questions`,
      );

      // Fix: the package's own fonts.
      await page.getByRole('button', { name: 'Fix problems' }).click();
      await expect(page.getByText(/^Fonts found: /)).toBeVisible({ timeout: 120_000 });
      await expect(fact(page, 'Fonts')).toHaveText('3', { timeout: 60_000 });
      record(
        'Fix took the three faces from the zip',
        'PASS',
        (await page.getByText(/^Fonts found: /).textContent()) ?? '',
      );
      // The file was read again with the fonts: only the real deliveries, and text is drawn.
      await expect(page.locator('svg rect > title', { hasText: '· text' }).first()).toBeAttached({
        timeout: 60_000,
      });
      const kamayChips = await formatChips(page);
      record(
        'KAMAY · formats are the SPONSOR deliveries only; text layers are drawn',
        kamayChips.length > 0 &&
          kamayChips.every((chip) => chip.startsWith('9:16') || chip.startsWith('16:9'))
          ? 'PASS'
          : 'FAIL',
        kamayChips.join(' | '),
      );
      await gradeRun('KAMAY', KAMAY.assetId);

      // The trail says what happened, through the real route.
      await page
        .getByRole('button', { name: /^Activity/ })
        .first()
        .click();
      await expect(page.getByRole('list', { name: 'Template activity' })).toContainText(
        'from the uploaded package',
        { timeout: 30_000 },
      );
      record(
        'Activity names the package heal',
        'PASS',
        'fonts · Took … from the uploaded package.',
      );
      await context.close();
    });

    test("LEVI'S · Fix fetches Poppins from Google Fonts; the two 9:16 comps are told apart", async ({
      browser,
    }) => {
      test.setTimeout(900_000);
      if (!session) throw new Error('no minted session');
      await resetFonts();
      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await openForge(page);
      await dropAndOpen(page, [join(DOWNLOADS, LEVIS.zip)]);

      await expect(fact(page, 'Fonts')).toHaveText('4 · 3 missing', { timeout: 60_000 });
      const labels = (await page.locator('[aria-label="Format"] button').allTextContents()).filter(
        (text) => text.startsWith('9:16'),
      );
      record(
        'two 9:16 comps read as two chips',
        labels.length >= 2 && new Set(labels).size === labels.length ? 'PASS' : 'FAIL',
        labels.join(' | ') || 'no 9:16 chips',
      );

      await page.getByRole('button', { name: 'Fix problems' }).click();
      await expect(page.getByText(/^Fonts found: /)).toBeVisible({ timeout: 120_000 });
      await expect(fact(page, 'Fonts')).toHaveText('4', { timeout: 60_000 });
      record(
        'Fix fetched Poppins from Google Fonts',
        'PASS',
        (await page.getByText(/^Fonts found: /).textContent()) ?? '',
      );
      await expect(async () => {
        const chips = await formatChips(page);
        expect(chips.some((chip) => chip.startsWith('1:1'))).toBe(true);
      }).toPass({ timeout: 60_000 });
      const levisChips = await formatChips(page);
      record(
        "LEVI'S · 9:16, 1:1 and 16:9 are formats; TEXT is not",
        ['9:16', '1:1', '16:9'].every((ratio) =>
          levisChips.some((chip) => chip.startsWith(ratio)),
        ) && !levisChips.some((chip) => /TEXT$/.test(chip))
          ? 'PASS'
          : 'FAIL',
        levisChips.join(' | '),
      );
      await gradeRun("LEVI'S", LEVIS.assetId);
      await context.close();
    });

    test('CERTIFICADO · fonts added on the template when it complains; Fix measures the text and builds', async ({
      browser,
    }) => {
      test.setTimeout(900_000);
      if (!session) throw new Error('no minted session');
      await resetFonts();
      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await openForge(page);
      // Reopen it with its original bytes, then fix the fonts where the template complains: the
      // Fonts check's own "Add font files", with the client's hashed .ttf files.
      await dropAndOpen(page, [join(DOWNLOADS, CERTIFICADO.zip)]);
      await expect(fact(page, 'Fonts')).toHaveText('3 · 3 missing', { timeout: 60_000 });
      await openDetail(page, 'Fonts');
      await expect(page.getByRole('button', { name: 'Add font files' })).toBeVisible();
      await page.getByLabel('Font files').setInputFiles(
        looseFonts(CERTIFICADO_FACES).map((path) => ({
          name: basename(path),
          mimeType: 'font/ttf',
          buffer: readFileSync(path),
        })),
      );
      // Graded by what the template says afterwards, not by a toast: a dev server recompiling for
      // another session's edit reloads the page mid-run, and the toast goes with it.
      await expect(async () => {
        if (!(await page.getByRole('list', { name: 'Checks' }).isVisible())) {
          await dropAndOpen(page, [join(DOWNLOADS, CERTIFICADO.zip)]);
        }
        await expect(fact(page, 'Fonts')).toHaveText('3', { timeout: 5_000 });
      }).toPass({ timeout: 120_000 });
      const { data: stored } = await admin()
        .schema('media')
        .from('fonts')
        .select('postscript_name, family')
        .eq('brand_id', STARCRAFT_BRAND_ID)
        .in('postscript_name', CERTIFICADO_FACES);
      record(
        'CERTIFICADO · fonts uploaded on the template itself, from the Fonts check',
        (stored ?? []).length === CERTIFICADO_FACES.length ? 'PASS' : 'FAIL',
        (stored ?? []).map((row) => `${row.postscript_name} (as ${row.family})`).join(', '),
      );
      // Adding the fonts reads the file again by itself; Fix is only pressed if still offered.
      const fix = page.getByRole('button', { name: 'Fix problems' });
      if (await fix.isVisible()) await fix.click();
      await expect(async () => {
        if (!(await page.getByRole('list', { name: 'Checks' }).isVisible())) {
          await dropAndOpen(page, [join(DOWNLOADS, CERTIFICADO.zip)]);
        }
        await expect(page.locator('svg rect > title', { hasText: '· text' }).first()).toBeAttached({
          timeout: 5_000,
        });
      }).toPass({ timeout: 120_000 });
      const textTitles = await page
        .locator('svg rect > title', { hasText: '· text' })
        .allTextContents();
      record(
        'CERTIFICADO · text measured with the loose fonts and drawn',
        textTitles.length > 0 ? 'PASS' : 'FAIL',
        textTitles.join(' | '),
      );
      await gradeRun('CERTIFICADO', CERTIFICADO.assetId);
      await context.close();
    });
  });
