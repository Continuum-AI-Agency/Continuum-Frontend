import { randomUUID } from 'node:crypto';
import type { EditorProjectV2, VideoEditorOpOutput } from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { prodSql } from '../../Continuum-Backend/scripts/_bench/managementSql';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import {
  brandObjectCount,
  objectsFor,
  removeAssets,
  removeProjects,
} from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// videoeditor:first-cut:e2e:bench — footage + goal → first cuts, in a real browser, as the
// bench login on the bench brand against PRODUCTION Supabase, a local Backend from this
// tree (every worker off) and a Next dev server.
//
//   /studio/video/new → drop real speech videos → the Brief opens by itself → dismissed,
//   it stays dismissed across a reload → the agent offers "First cut: 3 variants" → the
//   top-bar "First cut" and the ⌘K action both open it → '3 variants' + '30s hook' →
//   draft with visible progress → tabs A B C → tooltips carry each angle → Redraft reopens
//   the brief → switching to B opens the sibling project → every variant is 30 s ±15 %
//   with a caption track.
//
// Source media: existing bench-brand speech reels, read-only (downloaded, then dropped as
// new files). A cut counts a line once however many takes say it, so the footage has to
// hold 30 s of DIFFERENT lines: the six Vivo 47 testimonial reels do (~31–35 s, measured
// with the real STT); no single bench video does, and the lipstick/silver set holds ~24 s.
// Footage, plural, is the product's input anyway. Writes, only under BENCH_SINK=library:
// the Library assets the drop registers, the projects the draft makes (the blank one + its
// siblings) and the draft's job row — all deleted at exit, net-zero asserted.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 1_800_000 });

const BENCH = 'videoeditor:first-cut:e2e:bench';
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
/** Where the Backend keeps transcripts per version (its AI_STUDIO_BUCKET default). */
const KEPT_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
/** Six first-person Vivo 47 gym testimonials (Spanish), ~20 s each, each with its own lines. */
const SOURCE_ASSET_IDS = (
  process.env.FIRST_CUT_SOURCE_ASSETS ??
  [
    '9d01883c-05ce-4465-aa4d-88a7a048bb4c',
    '9e5ea821-519d-4f98-bb3f-2b9d60cd658b',
    'c677b4a5-a877-41b5-927a-4c9955c1b47b',
    'b3fd8380-9be7-4dd0-b219-bb44c82699c6',
    'a1b576b7-9cc0-468f-84e0-d01b585de761',
    '88e1654c-c537-4cfa-bc1f-3c342d556709',
  ].join(',')
).split(',');
const TARGET_SEC = 30;
const TOLERANCE = 0.15;
const DRAFT_BUDGET_MS = 15 * 60_000;
const RUN = randomUUID().slice(0, 8);
const DROP_PREFIX = `bench-first-cut-${RUN}-`;

const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();
process.env.SUPABASE_URL = supabaseUrl;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const rec = new Recorder(BENCH);
const results: { step: string; grade: 'PASS' | 'FAIL'; detail?: string }[] = [];
const notes: string[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();

function check(step: string, ok: boolean, detail?: string): boolean {
  rec.check(step, ok, detail);
  results.push({ step, grade: ok ? 'PASS' : 'FAIL', ...(detail ? { detail } : {}) });
  return ok;
}
function note(message: string): void {
  rec.note(message);
  notes.push(message);
}
function printEnvelope(): number {
  const counts = rec.summary();
  const exitCode = counts.fail > 0 ? 1 : 0;
  console.log(
    JSON.stringify({
      bench: BENCH,
      startedAt,
      durationMs: Date.now() - startedMs,
      results,
      notes,
      counts,
      exitCode,
    }),
  );
  return counts.fail;
}

type Api = { base: string; token: string };
const getProject = async (api: Api, projectId: string): Promise<EditorProjectV2> => {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}`, {
    headers: { Authorization: `Bearer ${api.token}` },
  });
  if (!response.ok) throw new Error(`get project ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { project: EditorProjectV2 }).project;
};
const postOp = async (api: Api, projectId: string, op: string, body: unknown) => {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}/ops/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
};
const visibleCount = (locator: Locator) => locator.filter({ visible: true }).count();
/** Clips cut from footage (video and audio tracks). */
const footageClips = (project: EditorProjectV2) =>
  project.tracks
    .filter((track) => track.kind === 'video' || track.kind === 'audio')
    .reduce((sum, track) => sum + track.clips.length, 0);

async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    value = await read();
  }
  return value;
}
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const JOB_ID = /^job_[0-9a-f]{32}$/;
/** The draft's job row on the shared plugin_mcp.jobs queue, and its STT's transient WAVs. */
const draftJobsLeft = async (jobIds: readonly string[]) => {
  if (jobIds.length === 0) return 0;
  const rows = await prodSql<{ count: number }>(
    `select count(*)::int as count from plugin_mcp.jobs where job_id in (${jobIds.map((id) => `'${id}'`).join(',')})`,
  );
  if (rows === null) throw new Error('job ledger needs the Supabase management token');
  return rows[0]?.count ?? 0;
};
const transientWavCount = async () => {
  const rows = await prodSql<{ count: number }>(
    `select count(*)::int as count from storage.objects where name like '${BRAND}/creative-ops/audio/caption-%'`,
  );
  return rows?.[0]?.count ?? Number.NaN;
};

/** Waits for a submitted draft to finish in the open dialog, sampling its progress. */
async function draftToSummary(page: Page, dialog: Locator) {
  const startedMs = Date.now();
  const phases = new Set<string>();
  let failure = '';
  const summary = dialog.getByTestId('brief-summary');
  while (Date.now() - startedMs < DRAFT_BUDGET_MS) {
    const phase = page.locator('[data-testid="brief-phase"]:visible');
    if ((await phase.count()) > 0) phases.add((await phase.innerText().catch(() => '')).trim());
    const alert = dialog.getByRole('alert');
    if ((await alert.count()) > 0) {
      failure = await alert.innerText();
      break;
    }
    if ((await summary.count()) > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const rows = await summary.locator('li[data-variant]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute('data-variant') ?? '',
      text: (node.textContent ?? '').trim(),
    })),
  );
  return {
    ms: Date.now() - startedMs,
    phases: [...phases].filter(Boolean),
    failure,
    summary: rows,
  };
}

/**
 * Drops real files on `target`. The bytes are served to the page from a bench-only route
 * rather than inlined as base64 — six reels are ~73 MB, too much to push through evaluate.
 */
async function dropFiles(
  page: Page,
  target: Locator,
  files: readonly { bytes: Buffer; name: string }[],
) {
  await page.route('**/__first-cut-bench/*', (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const file = files.find((candidate) => candidate.name === name);
    return file
      ? route.fulfill({ body: file.bytes, contentType: 'video/mp4' })
      : route.fulfill({ status: 404 });
  });
  const transfer = await page.evaluateHandle(
    async (names) => {
      const data = new DataTransfer();
      for (const name of names) {
        const blob = await (await fetch(`/__first-cut-bench/${encodeURIComponent(name)}`)).blob();
        data.items.add(new File([blob], name, { type: 'video/mp4' }));
      }
      return data;
    },
    files.map((file) => file.name),
  );
  await page.unroute('**/__first-cut-bench/*');
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

test(BENCH, async ({ browser }) => {
  const sinkLibrary = process.env.BENCH_SINK === 'library';
  if (!check('Library sink enabled for the upload hop', sinkLibrary, 'BENCH_SINK=library')) {
    printEnvelope();
    expect(sinkLibrary, 'run through the package script: the drop registers Library assets').toBe(
      true,
    );
    return;
  }
  const servers: Server[] = [];
  const createdProjects = new Set<string>();
  const createdAssets: { id: string; storagePath: string }[] = [];
  const briefIds = new Set<string>();
  const draftJobs = new Set<string>();
  let wavsBefore = Number.NaN;
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let brandObjectsBefore = Number.NaN;
  try {
    // The journey runs in its own function so a step that stops it early still reaches the
    // cleanup and the graded envelope below — a bare return here would skip both.
    await (async () => {
      brandObjectsBefore = await brandObjectCount(BRAND);
      wavsBefore = await transientWavCount();
      // ── servers + identity ────────────────────────────────────────────────────────────
      const fePort = await freePort();
      const backend = await bootBackend(`http://localhost:${fePort}`);
      servers.push(backend);
      const frontend = await bootFrontend(fePort, backend.url, '.next/video-first-cut-e2e');
      servers.push(frontend);
      note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
      session = await mintSessionBundleForEmail(OWNER_EMAIL);
      const api: Api = { base: backend.url, token: session.accessToken };

      const { data: preference } = await admin
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .select('active_brand_id')
        .eq('user_id', session.userId)
        .maybeSingle();
      previousActiveBrand =
        (preference as { active_brand_id?: string } | null)?.active_brand_id ?? null;
      await admin
        .schema('brand_profiles')
        .from('user_brand_preferences')
        .upsert(
          { user_id: session.userId, active_brand_id: BRAND, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );

      // ── the source reels, read-only ───────────────────────────────────────────────────
      const { data: sources } = await admin
        .schema('media')
        .from('assets')
        .select('id, bucket, storage_path')
        .in('id', SOURCE_ASSET_IDS)
        .eq('brand_id', BRAND);
      const files: { bytes: Buffer; name: string }[] = [];
      for (const [index, id] of SOURCE_ASSET_IDS.entries()) {
        const row = sources?.find((source) => source.id === id);
        const download = row
          ? await admin.storage.from(row.bucket).download(row.storage_path)
          : null;
        if (download?.data) {
          files.push({
            bytes: Buffer.from(await download.data.arrayBuffer()),
            name: `${DROP_PREFIX}${index}.mp4`,
          });
        }
      }
      if (
        !check(
          'existing bench-brand speech reels download (read-only)',
          files.length === SOURCE_ASSET_IDS.length,
          `${files.length}/${SOURCE_ASSET_IDS.length} reels, ${files.reduce((sum, file) => sum + file.bytes.length, 0)} B`,
        )
      )
        return;

      // ── open a blank edit ─────────────────────────────────────────────────────────────
      const context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1600, height: 1000 },
      });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      // The draft's job id, so its row on the shared jobs queue is deleted by id at exit.
      page.on('response', (response) => {
        if (!new URL(response.url()).pathname.endsWith('/ops/draft_cut')) return;
        void response
          .json()
          .then((body: { jobId?: unknown }) => {
            if (typeof body.jobId === 'string' && JOB_ID.test(body.jobId))
              draftJobs.add(body.jobId);
          })
          .catch(() => undefined);
      });
      await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
      await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
      const projectA = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
      createdProjects.add(projectA);
      await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
        timeout: 180_000,
      });

      // Recorded, not a stop: every step up to the submit still runs without the engine.
      const registered = await postOp(api, projectA, 'draft_cut_status', { jobId: 'probe' });
      check(
        'draft_cut is registered on the local Backend',
        !/not available yet|not_implemented/.test(registered.text),
        `draft_cut_status probe → ${registered.status} ${registered.text.slice(0, 160)}`,
      );

      const topBarButton = page.getByRole('button', { name: 'First cut', exact: true });
      check('the top bar has a "First cut" button', (await visibleCount(topBarButton)) === 1);

      // ── drop ONE reel onto the empty timeline: the Brief opens by itself ─────────────
      const dialog = page.locator('[data-testid="brief-dialog"]:visible');
      const lanes = () => page.locator('[aria-label="Timeline lanes"]:visible');
      const videoClips = page.locator('[data-clip-kind="video"]:visible');
      const [firstReel] = files;
      if (!firstReel) return;
      await dropFiles(page, lanes(), [{ bytes: firstReel.bytes, name: `${DROP_PREFIX}probe.mp4` }]);
      const dropMs = Date.now();
      let autoOpenMs = Number.NaN;
      try {
        await expect(dialog).toHaveCount(1, { timeout: 240_000 });
        autoOpenMs = Date.now() - dropMs;
      } catch {
        autoOpenMs = Number.NaN;
      }
      check(
        'the Brief dialog opens by itself when this page drops the first footage',
        Number.isFinite(autoOpenMs),
        Number.isFinite(autoOpenMs) ? `${autoOpenMs} ms after the drop` : 'never opened',
      );
      await expect(videoClips).toHaveCount(1, { timeout: 240_000 });

      // ── dismissed stays dismissed: empty the timeline, reload, drop again ────────────
      // The second drop is again the FIRST footage on an empty timeline, so only the
      // remembered dismissal can keep the Brief closed.
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await videoClips.first().click({ position: { x: 12, y: 20 } });
      await page.locator('body').press('Delete');
      const emptied = await until(
        () => getProject(api, projectA),
        (value) => footageClips(value) === 0,
        20_000,
      );
      await page.reload();
      await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
        timeout: 120_000,
      });
      await dropFiles(page, lanes(), files);
      await expect(videoClips).toHaveCount(files.length, { timeout: 240_000 });
      await settle(3_000);
      check(
        'dismissed stays dismissed: after a reload, a drop onto the emptied timeline does not reopen the Brief',
        footageClips(emptied) === 0 && (await dialog.count()) === 0,
        `footage before the drop: ${footageClips(emptied)} clip(s); dialog ${await dialog.count()}`,
      );
      // The Library carries no duration for these reels; the probed clips on the timeline do.
      const beforeA = await getProject(api, projectA);
      const footageSec = beforeA.tracks
        .filter((track) => track.kind === 'video')
        .flatMap((track) => track.clips)
        .reduce((sum, clip) => sum + clip.durationSec, 0);
      const { data: dropped } = await admin
        .schema('media')
        .from('assets')
        .select('id, storage_path')
        .eq('brand_id', BRAND)
        .like('file_name', `${DROP_PREFIX}%`);
      for (const row of dropped ?? [])
        createdAssets.push({ id: row.id, storagePath: row.storage_path });
      check(
        'every dropped reel uploads through the Library path onto the timeline',
        createdAssets.length === files.length + 1 && footageClips(beforeA) === files.length,
        `${createdAssets.length} assets (${files.length} reels + the probe), ${footageClips(beforeA)} clips, ${footageSec.toFixed(1)} s`,
      );

      // ── the agent offers the first cut ────────────────────────────────────────────────
      await page.getByRole('tab', { name: 'Agent', exact: true }).filter({ visible: true }).click();
      const agentChip = page.getByRole('button', { name: 'First cut: 3 variants', exact: true });
      await expect(agentChip.filter({ visible: true })).toHaveCount(1, { timeout: 15_000 });
      check(
        'the agent panel offers "First cut: 3 variants" for footage with no brief',
        (await visibleCount(agentChip)) === 1,
      );

      // ── both doors open it: the top-bar button and ⌘K ─────────────────────────────────
      await topBarButton.filter({ visible: true }).click();
      const byButton = await dialog
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      check('the top-bar "First cut" button opens the Brief', byButton);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Command palette' }).filter({ visible: true }).click();
      await page.getByPlaceholder('Search actions…').fill('First cut');
      const paletteItem = page.getByRole('option', { name: /First cut from a brief/ });
      const inPalette = await visibleCount(paletteItem);
      await paletteItem.filter({ visible: true }).first().click();
      const byPalette = await dialog
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      check(
        '⌘K has "First cut from a brief…" and it opens the Brief',
        inPalette === 1 && byPalette,
      );

      // ── '3 variants' + '30s hook' ─────────────────────────────────────────────────────
      const chip = (name: string) => dialog.getByRole('button', { name, exact: true });
      await chip('3 variants').click();
      await chip('30s hook').click();
      const text = await dialog.locator('#brief-text').inputValue();
      const pressed = await Promise.all(
        ['3 variants', '30s hook'].map((name) => chip(name).getAttribute('aria-pressed')),
      );
      const checkedRows = dialog.locator(
        '[data-testid="brief-footage"] [role="checkbox"][aria-checked="true"]',
      );
      await expect(checkedRows).toHaveCount(files.length, { timeout: 30_000 });
      check(
        'the goal chips set 3 variants of a 30 s hook, over every reel on the timeline',
        pressed.every((value) => value === 'true') &&
          /3 variants of a 30 s hook/.test(text) &&
          (await dialog.getByTestId('brief-length').innerText()).startsWith('30'),
        `"${text}" · chips ${pressed.join(',')} · footage ${await checkedRows.count()} checked`,
      );

      // ── draft, with visible progress, to a summary ───────────────────────────────────
      await dialog.getByTestId('brief-submit').click();
      const firstDraft = await draftToSummary(page, dialog);
      check(
        'drafting shows its progress (phase + bar)',
        firstDraft.phases.length > 0,
        firstDraft.phases.join(' → ') || 'no progress seen',
      );
      if (
        !check(
          'the draft ends in a summary: A B C, each with its length and angle',
          firstDraft.summary.map((row) => row.label).join('') === 'ABC' &&
            firstDraft.summary.every((row) => /\d/.test(row.text) && row.text.length > 12) &&
            !firstDraft.failure,
          `${firstDraft.summary.map((row) => row.text.slice(0, 70)).join(' | ') || 'no summary'} after ${(firstDraft.ms / 1000).toFixed(1)} s${firstDraft.failure ? ` · ${firstDraft.failure}` : ''}`,
        )
      )
        return;
      const tabs = page.locator('[data-testid="variant-switcher"]:visible [role="tab"]');
      await expect(tabs).toHaveCount(3, { timeout: 15_000 });
      const labels = await tabs.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-variant') ?? ''),
      );
      check('tabs A B C appear in the top bar', labels.join('') === 'ABC', labels.join(','));
      // "Open A" on the variant already open just closes the summary.
      await dialog.getByRole('button', { name: 'Open A', exact: true }).click();
      await expect(dialog).toHaveCount(0);

      // ── the variants, as persisted ────────────────────────────────────────────────────
      const listed = await postOp(api, projectA, 'list_variants', {});
      const variants = (JSON.parse(listed.text) as VideoEditorOpOutput<'list_variants'>).variants;
      for (const variant of variants) createdProjects.add(variant.projectId);
      const projects = await Promise.all(
        variants.map((variant) => getProject(api, variant.projectId)),
      );
      for (const project of projects) if (project.brief) briefIds.add(project.brief.briefId);
      const currentA = variants.find((variant) => variant.current);
      check(
        'list_variants: A (this project) plus two sibling projects from one brief',
        variants.length === 3 && currentA?.projectId === projectA && briefIds.size === 1,
        variants.map((variant) => `${variant.label}=${variant.projectId.slice(0, 8)}`).join(' '),
      );
      const selectedA = await visibleCount(
        page.locator('[data-testid="variant-switcher"] [data-variant="A"][aria-selected="true"]'),
      );
      check('the current variant (A) is highlighted', selectedA === 1);
      for (const project of projects) {
        const label = project.brief?.variantLabel ?? '?';
        const captionClips = project.tracks
          .filter((track) => track.kind === 'caption' && track.enabled)
          .reduce((sum, track) => sum + track.clips.length, 0);
        check(
          `variant ${label}: ${TARGET_SEC} s ±${TOLERANCE * 100}% with a caption track`,
          Math.abs(project.durationSec - TARGET_SEC) <= TARGET_SEC * TOLERANCE && captionClips > 0,
          `${project.durationSec.toFixed(2)} s · ${captionClips} caption clip(s) · angle "${project.brief?.angle ?? ''}"`,
        );
      }

      // ── angle tooltips ────────────────────────────────────────────────────────────────
      const variantB = variants.find((variant) => variant.label === 'B');
      const tabB = page.locator('[data-testid="variant-switcher"]:visible [data-variant="B"]');
      await tabB.hover();
      const tooltipText = await page
        .locator('[data-slot="tooltip-content"]:visible')
        .first()
        .innerText({ timeout: 5_000 })
        .catch(() => '');
      check(
        'hovering B shows its angle in a tooltip',
        Boolean(tooltipText) &&
          tooltipText.trim() === (variantB?.angle || variantB?.title || '').trim(),
        `"${tooltipText.slice(0, 120)}"`,
      );
      await page.mouse.move(5, 5);

      // ── switching to B opens the sibling project, same origin ─────────────────────────
      await tabB.click();
      const switched = await page
        .waitForURL(new RegExp(`/studio/video/${variantB?.projectId}\\?origin=library`), {
          timeout: 60_000,
        })
        .then(() => true)
        .catch(() => false);
      const selectedB = page.locator(
        '[data-testid="variant-switcher"]:visible [data-variant="B"][aria-selected="true"]',
      );
      await selectedB.waitFor({ timeout: 60_000 }).catch(() => undefined);
      const beforeB = variantB ? await getProject(api, variantB.projectId) : null;
      const shownRevision = await page
        .locator('[data-testid="project-revision"]:visible')
        .innerText()
        .catch(() => '');
      check(
        'switching to B navigates to the sibling project (origin kept), B highlighted',
        switched &&
          (await selectedB.count()) === 1 &&
          shownRevision.includes(`Revision ${beforeB?.revision}`),
        `${page.url().replace(frontend.url, '')} · ${shownRevision}`,
      );
      if (!variantB || !beforeB) return;

      // ── "Redraft all variants" from B, reopened from the top-bar indicator ────────────
      await page
        .getByRole('button', { name: 'Redraft all variants' })
        .filter({ visible: true })
        .click();
      await dialog.waitFor({ timeout: 10_000 }).catch(() => undefined);
      const redraftText = (await dialog.count())
        ? await dialog.locator('#brief-text').inputValue()
        : '';
      const redraftCount = (await dialog.count())
        ? await dialog
            .getByRole('button', { name: '3', exact: true })
            .getAttribute('aria-pressed')
            .catch(() => null)
        : null;
      check(
        '"Redraft all variants" reopens the Brief prefilled from the brief, 3 variants',
        redraftText === beforeB.brief?.text && redraftCount === 'true',
        `"${redraftText.slice(0, 80)}" · 3 pressed ${redraftCount}`,
      );
      await dialog.getByTestId('brief-submit').click();
      await page.locator('[data-testid="brief-phase"]:visible').waitFor({ timeout: 30_000 });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      const indicator = page.locator('[data-testid="draft-running"]:visible');
      const indicatorShown = (await indicator.count()) === 1;
      if (indicatorShown) await indicator.click();
      const reopened = await page
        .locator('[data-testid="brief-progress"]:visible, [data-testid="brief-summary"]:visible')
        .first()
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      check(
        'while a draft runs, the top-bar "Drafting…" indicator reopens the dialog on it',
        indicatorShown && reopened,
      );
      const redraft = await draftToSummary(page, dialog);
      const afterRedraftB = await getProject(api, variantB.projectId);
      // Undo from the completion toast, before it times out.
      const toastUndo = page
        .getByRole('dialog')
        .filter({ hasText: /first cuts? ready/i })
        .getByRole('button', { name: 'Undo', exact: true });
      const toastHadUndo = (await visibleCount(toastUndo)) > 0;
      if (toastHadUndo) await toastUndo.filter({ visible: true }).first().click();
      check(
        'the redraft ends in a summary: A B C',
        redraft.summary.map((row) => row.label).join('') === 'ABC' && !redraft.failure,
        `${redraft.summary.map((row) => row.text.slice(0, 50)).join(' | ')} after ${(redraft.ms / 1000).toFixed(1)} s${redraft.failure ? ` · ${redraft.failure}` : ''}`,
      );
      const relisted = (
        JSON.parse(
          (await postOp(api, variantB.projectId, 'list_variants', {})).text,
        ) as VideoEditorOpOutput<'list_variants'>
      ).variants;
      const relistedProjects = await Promise.all(
        relisted.map((variant) => getProject(api, variant.projectId)),
      );
      for (const project of relistedProjects) {
        createdProjects.add(project.projectId);
        if (project.brief) briefIds.add(project.brief.briefId);
      }
      const sameIds =
        relisted.length === 3 &&
        relisted.every(
          (variant) =>
            variants.find((first) => first.label === variant.label)?.projectId ===
            variant.projectId,
        );
      check(
        'Redraft from B rewrites the same three projects in place: same ids, labels A/B/C, one briefId',
        sameIds &&
          relisted.map((variant) => variant.label).join('') === 'ABC' &&
          briefIds.size === 1 &&
          relistedProjects.every((project) => project.brief?.briefId === [...briefIds][0]),
        `${relisted.map((variant) => `${variant.label}=${variant.projectId.slice(0, 8)}`).join(' ')} · briefIds ${briefIds.size}`,
      );

      // ── the toast's Undo restores B's timeline from before the redraft ────────────────
      const clipIds = (project: EditorProjectV2) =>
        project.tracks
          .flatMap((track) => track.clips.map((clip) => clip.id))
          .sort()
          .join(',');
      const undone = await until(
        () => getProject(api, variantB.projectId),
        (value) => value.revision > afterRedraftB.revision,
        20_000,
      );
      check(
        "the completion toast's Undo restores the pre-draft timeline (clips and length as before)",
        toastHadUndo &&
          clipIds(afterRedraftB) !== clipIds(beforeB) &&
          clipIds(undone) === clipIds(beforeB) &&
          Math.abs(undone.durationSec - beforeB.durationSec) < 0.001,
        `before ${footageClips(beforeB)} clips ${beforeB.durationSec.toFixed(2)} s · redraft rev ${afterRedraftB.revision} ${afterRedraftB.durationSec.toFixed(2)} s · undone rev ${undone.revision} ${footageClips(undone)} clips ${undone.durationSec.toFixed(2)} s`,
      );

      check(
        'no uncaught page errors',
        pageErrors.length === 0,
        pageErrors.slice(0, 3).join(' | ') || 'none',
      );
      note(
        `first draft ${(firstDraft.ms / 1000).toFixed(1)} s, redraft ${(redraft.ms / 1000).toFixed(1)} s, over ${footageSec.toFixed(1)} s of footage`,
      );
      note(
        'NOT EXERCISED here: recording and Library-picker imports (they place through the same addAsset path as the drop), the auto-open guards against an open dialog or a running agent turn, the footage HoverCard preview and the 20-source cap, a failed draft (its toast, the submit-error reset and the stop on a permanent 4xx are unit-tested in BriefDialog.test.tsx), the agent actually running draft_cut (the agent bench owns agent turns), export.',
      );
      await context.close();
    })();
  } catch (error) {
    check(
      'bench ran to completion',
      false,
      error instanceof Error ? error.message.slice(0, 500) : String(error),
    );
  } finally {
    // ── cleanup + net-zero ────────────────────────────────────────────────────────────
    try {
      // Siblings are found by the brief they share too, so a half-finished draft is caught.
      for (const briefId of briefIds) {
        const { data } = await admin
          .schema('media')
          .from('editor_projects')
          .select('id')
          .eq('brand_id', BRAND)
          .eq('document->brief->>briefId', briefId);
        for (const row of data ?? []) createdProjects.add(row.id);
      }
      const { data: tagged } = await admin
        .schema('media')
        .from('assets')
        .select('id, storage_path')
        .eq('brand_id', BRAND)
        .like('file_name', `${DROP_PREFIX}%`);
      for (const row of tagged ?? []) {
        if (!createdAssets.some((asset) => asset.id === row.id))
          createdAssets.push({ id: row.id, storagePath: row.storage_path });
      }
      // The Brief finishes cuts by default: a music bed it had to make is a Library asset
      // filed under the drafted project (a bed reused from before the run is left alone).
      const beds: string[] = [];
      for (const projectId of createdProjects) {
        const { data } = await admin
          .schema('media')
          .from('assets')
          .select('id, storage_path')
          .eq('brand_id', BRAND)
          .contains('origin_ref', { nodeId: `video-project:${projectId}` });
        for (const row of data ?? []) {
          beds.push(row.id);
          if (!createdAssets.some((asset) => asset.id === row.id))
            createdAssets.push({ id: row.id, storagePath: row.storage_path });
        }
      }
      const removedProjects = await removeProjects(admin, BRAND, [...createdProjects]);
      const jobIds = [...draftJobs];
      const removedJobs =
        jobIds.length === 0
          ? []
          : await prodSql(
              `delete from plugin_mcp.jobs where brand_id = '${BRAND}' and job_id in (${jobIds.map((id) => `'${id}'`).join(',')}) returning 1`,
            );
      // Opening the Brief warms each footage version's transcript, and the draft keeps it beside
      // the brand's media (Backend sourceMedia keptTranscriptPath) — this run's versions own them.
      const { data: versionRows } = await admin
        .schema('media')
        .from('asset_versions')
        .select('id')
        .in(
          'asset_id',
          createdAssets.length > 0
            ? createdAssets.map((asset) => asset.id)
            : ['00000000-0000-0000-0000-000000000000'],
        );
      const keptPaths = (versionRows ?? []).map(
        (row) => `${BRAND}/video-editor/transcripts/${row.id}.json`,
      );
      if (keptPaths.length > 0) await admin.storage.from(KEPT_BUCKET).remove(keptPaths);
      const removed = await removeAssets(admin, BRAND, createdAssets);
      note(
        `cleanup: ${removedProjects} project(s), ${removed.rows} asset row(s), ${removed.objects} storage object(s), ${removedJobs?.length ?? 0} draft job row(s)`,
      );
      await settle(5_000);
      const lateObjects = await objectsFor(BRAND, createdAssets);
      if (lateObjects.length > 0) await removeAssets(admin, BRAND, createdAssets);
      const { count: leftRows } = await admin
        .schema('media')
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', BRAND)
        .like('file_name', `${DROP_PREFIX}%`);
      const { count: leftBeds } = await admin
        .schema('media')
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .in('id', beds.length > 0 ? beds : ['00000000-0000-0000-0000-000000000000']);
      const leftObjects = (await objectsFor(BRAND, createdAssets)).length;
      const { count: leftProjects } = await admin
        .schema('media')
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in(
          'id',
          createdProjects.size > 0
            ? [...createdProjects]
            : ['00000000-0000-0000-0000-000000000000'],
        );
      const leftJobs = await draftJobsLeft(jobIds);
      const { data: keptLeft } = await admin.storage
        .from(KEPT_BUCKET)
        .list(`${BRAND}/video-editor/transcripts`, { limit: 1000 });
      const leftKept = (keptLeft ?? []).filter((object) =>
        keptPaths.some((path) => path.endsWith(`/${object.name}`)),
      ).length;
      check(
        'net zero: no media.assets rows (drops, music beds), storage objects, kept transcripts, projects or draft job rows left from this run',
        (leftRows ?? 0) === 0 &&
          (leftBeds ?? 0) === 0 &&
          leftObjects === 0 &&
          leftKept === 0 &&
          (leftProjects ?? 0) === 0 &&
          leftJobs === 0,
        `rows ${leftRows ?? 0}, music beds ${leftBeds ?? 0} of ${beds.length} made, objects ${leftObjects}, kept transcripts ${leftKept} of ${keptPaths.length}, projects ${leftProjects ?? 0}, jobs ${leftJobs} of ${jobIds.length} seen`,
      );
      note(
        `STT transient WAVs under ${BRAND}/creative-ops/audio/caption-*: ${wavsBefore} → ${await transientWavCount()} (removed per call by the draft; unattributable by name, so reported, not asserted)`,
      );
      note(
        `brand-prefix storage objects ${brandObjectsBefore} → ${await brandObjectCount(BRAND)} (other shells write this brand concurrently; the run's own objects are asserted above)`,
      );
    } catch (error) {
      check('cleanup', false, error instanceof Error ? error.message : String(error));
    }
    if (session && previousActiveBrand && previousActiveBrand !== BRAND) {
      await admin.schema('brand_profiles').from('user_brand_preferences').upsert(
        {
          user_id: session.userId,
          active_brand_id: previousActiveBrand,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    }
    for (const server of servers.reverse()) server.stop();
  }
  const failures = printEnvelope();
  expect(failures, 'graded FAIL steps').toBe(0);
});
