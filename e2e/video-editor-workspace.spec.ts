import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type EditorProjectV2,
  type EditorVideoClip,
  editorExportSettingsSchema,
  editorProjectResponseSchema,
  registerGeneratedAssetResponseSchema,
  registerVersionResponseSchema,
  TIMELINE_MEDIA_INPUT_HANDLE,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import type { DurableTimelineRequest } from './support/editorV2DurableRenderBenchEntry';
import { loadLocalSupabaseEnv, loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import {
  type GradedStep,
  ownedStorage,
  proveNetZero,
  removeProjects,
} from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// videoeditor:workspace:e2e:bench — the Video Studio Edit workspace, end to end, as the
// bench login on the bench brand against PRODUCTION Supabase, a local Backend from this
// tree (the /ops door is not deployed yet; every worker off) and a Next dev server.
//
//   open /studio/video/new → drop a real MP4 → it uploads through the Library path and
//   lands on V1 → trim by dragging the end handle → split with S → ripple-delete with ⌫
//   → duplicate from the clip's context menu → an /ops/apply_commands edit made OUTSIDE
//   the page shows up in it live.
//
// Source media: an existing short video on the bench brand, read-only (downloaded, then
// dropped as a new file). Writes, only under BENCH_SINK=library (the package script sets
// it; Playwright refuses unknown CLI flags, so the sink rides in the environment): one
// editor project and the one Library asset the drop registers — both deleted at exit,
// net-zero asserted.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 900_000 });

const GRAPH_JOURNEY = process.env.VIDEO_EDITOR_GRAPH_JOURNEY === '1';
const BENCH = GRAPH_JOURNEY ? 'video-editor:sources:e2e:bench' : 'videoeditor:workspace:e2e:bench';
const IMPORT_JOURNEY = GRAPH_JOURNEY || process.env.VIDEO_EDITOR_IMPORT_JOURNEY === '1';
const TIMELINE_JOURNEY = process.env.VIDEO_EDITOR_TIMELINE_JOURNEY === '1';
const INSPECTOR_JOURNEY =
  IMPORT_JOURNEY || TIMELINE_JOURNEY || process.env.VIDEO_EDITOR_INSPECTOR_JOURNEY === '1';
const FEATURE = GRAPH_JOURNEY ? 'f02' : IMPORT_JOURNEY ? 'f01' : TIMELINE_JOURNEY ? 'f05' : 'f06';
const BRAND =
  process.env.CONTINUUM_TEST_BRAND_ID ??
  (INSPECTOR_JOURNEY
    ? '00000000-0000-4000-8000-0000000000b2'
    : 'b411bba9-d09c-4892-9b86-5ff340ce64e5');
const OWNER_EMAIL = INSPECTOR_JOURNEY
  ? 'local@continuum.test'
  : (readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai');
/** "Solicita tu Day Pass en Vivo 4047" — a 6.6 s Vivo 47 clip with its own speech. */
const SOURCE_ASSET_ID =
  process.env.VIDEO_WORKSPACE_SOURCE_ASSET ?? 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const LIVE_EDIT_BUDGET_MS = 3_000;
const RUN = randomUUID().slice(0, 8);
const DROP_NAME = `bench-video-workspace-${RUN}.mp4`;

const { url: supabaseUrl, serviceRoleKey } = INSPECTOR_JOURNEY
  ? loadLocalSupabaseEnv()
  : loadProdSupabaseEnv();
process.env.SUPABASE_URL = supabaseUrl;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const rec = new Recorder(BENCH);
const results: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
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
function grade(step: GradedStep): void {
  rec.record(step.step, step.grade, step.detail);
  results.push(step);
}
/** The Recorder envelope, printed last so the factory runner can read the run. */
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
const mainClips = (project: EditorProjectV2) =>
  project.tracks
    .filter((track) => track.kind === 'video')
    .sort((left, right) => left.order - right.order)[0]
    ?.clips.toSorted((left, right) => left.timelineStartSec - right.timelineStartSec) ?? [];

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

async function dropFile(page: Page, target: Locator, bytes: Buffer, name: string) {
  const transfer = await page.evaluateHandle(
    ({ base64, fileName }) => {
      const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([raw], fileName, { type: 'video/mp4' }));
      return data;
    },
    { base64: bytes.toString('base64'), fileName: name },
  );
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

test(BENCH, async ({ browser }) => {
  test.skip(
    INSPECTOR_JOURNEY,
    'Original hosted Library-drop workspace activities are not exercised by the loopback f06 inspector case.',
  );
  const sinkLibrary = process.env.BENCH_SINK === 'library';
  if (!check('Library sink enabled for the upload hop', sinkLibrary, 'BENCH_SINK=library')) {
    printEnvelope();
    expect(sinkLibrary, 'run through the package script: the drop registers a Library asset').toBe(
      true,
    );
    return;
  }
  const servers: Server[] = [];
  const createdProjects: string[] = [];
  const createdAssets: { id: string; storagePath: string }[] = [];
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  try {
    // ── servers + identity ────────────────────────────────────────────────────────────
    const fePort = await freePort();
    const backend = await bootBackend(`http://localhost:${fePort}`);
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url);
    servers.push(frontend);
    note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
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

    // ── the source clip, read-only ────────────────────────────────────────────────────
    const { data: source } = await admin
      .schema('media')
      .from('assets')
      .select('bucket, storage_path, duration_ms')
      .eq('id', SOURCE_ASSET_ID)
      .eq('brand_id', BRAND)
      .single();
    const download = source
      ? await admin.storage.from(source.bucket).download(source.storage_path)
      : null;
    const bytes = download?.data ? Buffer.from(await download.data.arrayBuffer()) : null;
    if (
      !check(
        'existing bench-brand source video downloads (read-only)',
        Boolean(bytes),
        `${SOURCE_ASSET_ID} ${bytes?.length ?? 0} B`,
      ) ||
      !bytes
    )
      return;
    const sourceSec = (source?.duration_ms ?? 0) / 1_000;

    // ── open a blank edit ─────────────────────────────────────────────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const consoleLines: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        consoleLines.push(message.text().slice(0, 200));
    });
    await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
    await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
    const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
    createdProjects.push(projectId);
    const workspace = page.locator('[data-testid="video-studio-edit"]:visible');
    await expect(workspace).toHaveCount(1, { timeout: 180_000 });
    const blank = await getProject(api, projectId);
    check(
      '/studio/video/new opens a blank 1080×1920 project in Edit mode',
      blank.canvas.width === 1080 && blank.canvas.height === 1920 && blank.tracks.length === 0,
      `${projectId} ${blank.canvas.width}×${blank.canvas.height}, ${blank.tracks.length} tracks`,
    );
    const panels = await Promise.all(
      ['Media', 'Graph', 'Generate', 'Inspector', 'Agent'].map((name) =>
        page.getByRole('tab', { name, exact: true }).filter({ visible: true }).count(),
      ),
    );
    check(
      'layout: Media | Graph | Generate and Inspector | Agent docks',
      panels.every((count) => count === 1),
      panels.join(','),
    );

    // ── drop a real MP4 ───────────────────────────────────────────────────────────────
    const lanes = page.locator('[aria-label="Timeline lanes"]:visible');
    await dropFile(page, lanes, bytes, DROP_NAME);
    const videoClip = page.locator('[data-clip-kind="video"]:visible');
    await expect(videoClip).toHaveCount(1, { timeout: 180_000 });
    let project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 1,
      20_000,
    );
    const dropped = mainClips(project)[0];
    const sourceRef = dropped && 'source' in dropped ? dropped.source : undefined;
    const assetId = sourceRef?.sourceType === 'library_asset' ? sourceRef.assetId : '';
    const { data: assetRow } = await admin
      .schema('media')
      .from('assets')
      .select('id, storage_path, file_name, brand_id')
      .eq('id', assetId || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (assetRow) createdAssets.push({ id: assetRow.id, storagePath: assetRow.storage_path });
    check(
      'drop uploads through the Library path and places a V1 clip at the drop',
      Boolean(
        assetRow &&
          assetRow.file_name === DROP_NAME &&
          assetRow.brand_id === BRAND &&
          dropped?.timelineStartSec === 0,
      ),
      `asset ${assetId} file ${assetRow?.file_name}`,
    );
    check(
      'the clip is as long as the probed source',
      Boolean(dropped && Math.abs(dropped.durationSec - sourceSec) < 0.15),
      `clip ${dropped?.durationSec.toFixed(3)} s vs source ${sourceSec.toFixed(3)} s`,
    );

    const brief = page.locator('[data-testid="brief-dialog"]:visible');
    await expect(brief).toHaveCount(1);
    const offeredBrief = await brief.count();
    await page.keyboard.press('Escape');
    await expect(brief).toHaveCount(0);
    check(
      'first-footage Brief offer can be dismissed before manual editing',
      offeredBrief === 1 && (await brief.count()) === 0,
    );

    // ── trim by dragging the end handle ───────────────────────────────────────────────
    const handle = videoClip.locator('[data-trim-handle="end"]');
    const box = await handle.boundingBox();
    const clipBox = await videoClip.boundingBox();
    const pxPerSec = clipBox && dropped ? clipBox.width / dropped.durationSec : 60;
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - pxPerSec * 0.5, box.y + box.height / 2, {
        steps: 6,
      });
      await page.mouse.move(box.x + box.width / 2 - pxPerSec * 1.2, box.y + box.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
    }
    const beforeTrim = dropped?.durationSec ?? 0;
    project = await until(
      () => getProject(api, projectId),
      (value) => (mainClips(value)[0]?.durationSec ?? 0) < beforeTrim - 0.5,
      15_000,
    );
    const trimmed = mainClips(project)[0];
    check(
      'dragging the end handle trims the clip',
      Boolean(
        trimmed && trimmed.durationSec < beforeTrim - 0.5 && trimmed.durationSec > beforeTrim - 2,
      ),
      `${beforeTrim.toFixed(2)} s → ${trimmed?.durationSec.toFixed(2)} s`,
    );

    // ── split with S at 2 s ───────────────────────────────────────────────────────────
    const ruler = page.locator('[data-timeline-ruler]:visible');
    const rulerBox = await ruler.boundingBox();
    if (rulerBox)
      await page.mouse.click(rulerBox.x + pxPerSec * 2, rulerBox.y + rulerBox.height / 2);
    await page.locator('body').press('s');
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 2,
      15_000,
    );
    const halves = mainClips(project);
    check(
      'S splits the clip at the playhead',
      halves.length === 2 &&
        Math.abs((halves[0]?.durationSec ?? 0) - 2) < 0.1 &&
        Math.abs((halves[1]?.timelineStartSec ?? 0) - (halves[0]?.durationSec ?? 0)) < 0.001,
      halves
        .map((clip) => `${clip.timelineStartSec.toFixed(2)}+${clip.durationSec.toFixed(2)}`)
        .join(' | '),
    );

    // ── split again at 4 s: V1 is A | B | C ─────────────────────────────────────────────
    await page.locator('body').press('Escape');
    if (rulerBox)
      await page.mouse.click(rulerBox.x + pxPerSec * 4, rulerBox.y + rulerBox.height / 2);
    await page.locator('body').press('s');
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 3,
      15_000,
    );
    check(
      'a second S makes V1 three clips',
      mainClips(project).length === 3,
      mainClips(project)
        .map((clip) => `${clip.timelineStartSec.toFixed(2)}+${clip.durationSec.toFixed(2)}`)
        .join(' | '),
    );

    // ── two trims back to back, the first still saving ────────────────────────────────
    // Every save is held 900 ms, so the second drag is made on what the page still shows:
    // it must land on the project the first one left, not re-save the stale one.
    const [beforeA, , beforeC] = mainClips(project);
    await page.route('**/api/ai-studio/video-projects/*/commands', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue();
    });
    const dragEnd = async (clipId: string, bySec: number) => {
      const handle = await page
        .locator(`[data-clip-id="${clipId}"]:visible [data-trim-handle="end"]`)
        .boundingBox();
      if (!handle) return;
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + bySec * pxPerSec * 0.5, y, { steps: 4 });
      await page.mouse.move(x + bySec * pxPerSec, y, { steps: 4 });
      await page.mouse.up();
    };
    await dragEnd(beforeA?.id ?? '', -0.5);
    await dragEnd(beforeC?.id ?? '', -0.4);
    project = await until(
      () => getProject(api, projectId),
      (value) => {
        const [a, , c] = mainClips(value);
        return (
          Boolean(a && c) &&
          (a?.durationSec ?? 0) < (beforeA?.durationSec ?? 0) - 0.3 &&
          (c?.durationSec ?? 0) < (beforeC?.durationSec ?? 0) - 0.2
        );
      },
      20_000,
    );
    await page.unroute('**/api/ai-studio/video-projects/*/commands');
    const composed = mainClips(project);
    const packed = composed.every((clip, index) =>
      index === 0
        ? clip.timelineStartSec === 0
        : Math.abs(
            clip.timelineStartSec -
              ((composed[index - 1]?.timelineStartSec ?? 0) +
                (composed[index - 1]?.durationSec ?? 0)),
          ) < 0.001,
    );
    check(
      'two rapid trims compose: both land and V1 has no gap',
      composed.length === 3 &&
        packed &&
        Math.abs((composed[0]?.durationSec ?? 0) - ((beforeA?.durationSec ?? 0) - 0.5)) < 0.1 &&
        Math.abs((composed[2]?.durationSec ?? 0) - ((beforeC?.durationSec ?? 0) - 0.4)) < 0.1,
      composed
        .map((clip) => `${clip.timelineStartSec.toFixed(2)}+${clip.durationSec.toFixed(2)}`)
        .join(' | '),
    );

    // ── shift-click selects two clips ─────────────────────────────────────────────────
    const [clipA, clipB, clipC] = composed;
    await page
      .locator(`[data-clip-id="${clipA?.id}"]:visible`)
      .click({ position: { x: 12, y: 20 } });
    await page
      .locator(`[data-clip-id="${clipB?.id}"]:visible`)
      .click({ position: { x: 12, y: 20 }, modifiers: ['Shift'] });
    const selectedCount = await page
      .locator('[data-clip-kind="video"][aria-selected="true"]:visible')
      .count();
    check('shift-click selects two clips', selectedCount === 2, `${selectedCount} selected`);
    await page.locator('body').press('Escape');

    // ── an edit from OUTSIDE the page, live: a caption after the first cut ────────────
    const captionText = `Outside caption ${RUN}`;
    const captionStart = (clipB?.timelineStartSec ?? 0) + 1;
    const captionWords = [
      { text: 'Outside', startSec: 0.1, endSec: 0.35 },
      { text: 'caption', startSec: 0.4, endSec: 0.7 },
    ];
    const current = await getProject(api, projectId);
    const opResponse = await fetch(
      `${api.base}/api/ai-studio/video-projects/${projectId}/ops/apply_commands`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: current.revision,
          commands: [
            {
              commandType: 'add_track',
              track: {
                id: `captions-${RUN}`,
                name: 'Captions 1',
                order: 50,
                enabled: true,
                locked: false,
                muted: false,
                solo: false,
                kind: 'caption',
                clips: [],
              },
            },
            {
              commandType: 'upsert_clip',
              trackId: `captions-${RUN}`,
              clip: {
                id: `outside-${RUN}`,
                name: 'Outside caption',
                kind: 'caption',
                text: captionText,
                language: 'en',
                timelineStartSec: captionStart,
                durationSec: 0.8,
                enabled: true,
                locked: false,
                tags: [],
                words: captionWords,
                highlightMode: 'word',
                style: { fontFamily: 'Inter', fontSizePx: 72, fontWeight: 800, color: '#ffffff' },
              },
            },
          ],
        }),
      },
    );
    const committedAt = Date.now();
    const opBody = (await opResponse.json()) as { commit?: { revision: number } };
    check(
      'POST /ops/apply_commands from outside the page commits',
      opResponse.ok && Boolean(opBody.commit),
      `${opResponse.status} rev ${opBody.commit?.revision}`,
    );
    const outsideClip = page.locator('[data-clip-kind="caption"]:visible', {
      hasText: captionText,
    });
    let liveMs = Number.NaN;
    try {
      await expect(outsideClip).toHaveCount(1, { timeout: LIVE_EDIT_BUDGET_MS });
      liveMs = Date.now() - committedAt;
    } catch {
      liveMs = Number.NaN;
    }
    check(
      `the outside edit appears in the open page within ${LIVE_EDIT_BUDGET_MS / 1000} s`,
      Number.isFinite(liveMs) && liveMs <= LIVE_EDIT_BUDGET_MS,
      Number.isFinite(liveMs) ? `${liveMs} ms` : 'not seen',
    );
    const syncSamples = [liveMs];
    for (const sample of [2, 3]) {
      const beforeSync = await getProject(api, projectId);
      const cue = beforeSync.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === `outside-${RUN}`);
      if (!cue || cue.kind !== 'caption') throw new Error('Outside caption disappeared.');
      const text = `${captionText} sample ${sample}`;
      const response = await fetch(
        `${api.base}/api/ai-studio/video-projects/${projectId}/ops/apply_commands`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: beforeSync.revision,
            commands: [
              { commandType: 'upsert_clip', trackId: `captions-${RUN}`, clip: { ...cue, text } },
            ],
          }),
        },
      );
      const saved = (await response.json()) as { commit?: { revision: number } };
      const started = performance.now();
      await expect(
        page.locator('[data-clip-kind="caption"]:visible', { hasText: text }),
      ).toHaveCount(1, { timeout: LIVE_EDIT_BUDGET_MS });
      const elapsed = performance.now() - started;
      syncSamples.push(elapsed);
      await expect(page.locator('[data-testid="project-revision"]:visible')).toHaveText(
        `Revision ${saved.commit?.revision}`,
      );
      check(
        `live sync sample ${sample}: committed caption is visible`,
        response.ok,
        `${elapsed.toFixed(1)}ms after response`,
      );
    }
    note(`speed samples: ${JSON.stringify({ live_sync: syncSamples })}`);
    note(
      'live_sync measures successful commit-response to visible caption; save time is measured separately.',
    );

    // ── ripple delete A: V1 closes up and the caption after the cut follows ───────────
    await page
      .locator(`[data-clip-id="${clipA?.id}"]:visible`)
      .click({ position: { x: 12, y: 20 } });
    await page.locator('body').press('Delete');
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 2,
      15_000,
    );
    const remaining = mainClips(project);
    const caption = project.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === `outside-${RUN}`);
    const expectedCaptionStart = captionStart - (clipA?.durationSec ?? 0);
    check(
      '⌫ ripple-deletes and V1 closes the gap',
      remaining.length === 2 &&
        remaining[0]?.id === clipB?.id &&
        remaining[0]?.timelineStartSec === 0 &&
        remaining[1]?.id === clipC?.id,
      remaining.map((clip) => `${clip.id.slice(0, 8)}@${clip.timelineStartSec}`).join(','),
    );
    check(
      'the caption after the cut moves by the deleted time, words unchanged',
      Boolean(
        caption &&
          caption.kind === 'caption' &&
          Math.abs(caption.timelineStartSec - expectedCaptionStart) < 0.001 &&
          JSON.stringify(caption.words.map((word) => [word.text, word.startSec, word.endSec])) ===
            JSON.stringify(captionWords.map((word) => [word.text, word.startSec, word.endSec])),
      ),
      caption
        ? `start ${caption.timelineStartSec.toFixed(3)} (expected ${expectedCaptionStart.toFixed(3)})`
        : 'caption missing',
    );

    // ── the clip's context menu ───────────────────────────────────────────────────────
    await page
      .locator(`[data-clip-id="${clipB?.id}"]:visible`)
      .click({ button: 'right', position: { x: 12, y: 20 } });
    const menuItems = await page.getByRole('menuitem').filter({ visible: true }).allInnerTexts();
    await page
      .getByRole('menuitem', { name: /Duplicate/ })
      .filter({ visible: true })
      .click();
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 3,
      15_000,
    );
    const duplicated = mainClips(project);
    check(
      'clip ContextMenu → Duplicate lands a copy right after it',
      duplicated.length === 3 &&
        Math.abs((duplicated[1]?.timelineStartSec ?? 0) - (duplicated[0]?.durationSec ?? 0)) <
          0.001 &&
        duplicated[0]?.id === clipB?.id,
      `${duplicated
        .map((clip) => `${clip.timelineStartSec.toFixed(2)}+${clip.durationSec.toFixed(2)}`)
        .join(
          ' | ',
        )}${duplicated.length === 3 ? '' : ` · menu [${menuItems.join(', ')}] · console ${consoleLines.slice(-4).join(' ‖ ')}`}`,
    );

    // ── Space after a toolbar click plays; it never re-runs the button ─────────────────
    await page.locator('body').press('Escape');
    if (rulerBox)
      await page.mouse.click(rulerBox.x + pxPerSec * 1, rulerBox.y + rulerBox.height / 2);
    await page.getByRole('button', { name: 'Split at playhead' }).filter({ visible: true }).click();
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 4,
      15_000,
    );
    const afterButton = mainClips(project).length;
    await page.keyboard.press('Space');
    const playing = page.getByRole('button', { name: 'Pause preview' }).filter({ visible: true });
    let played = true;
    try {
      await expect(playing).toHaveCount(1, { timeout: 3_000 });
    } catch {
      played = false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const afterSpace = mainClips(await getProject(api, projectId)).length;
    check(
      'Space after clicking a toolbar button plays instead of re-running it',
      played && afterSpace === afterButton,
      `playing=${played}, clips ${afterButton} → ${afterSpace}`,
    );
    await page.keyboard.press('Space');

    const final = await getProject(api, projectId);
    const revisionLabel = await page
      .locator('[data-testid="project-revision"]:visible')
      .innerText();
    check(
      'the page shows the persisted revision',
      revisionLabel.includes(`Revision ${final.revision}`),
      `${revisionLabel} vs ${final.revision}`,
    );
    check(
      'no uncaught page errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | ') || 'none',
    );
    note(
      'NOT EXERCISED here: export render, agent chat, Graph/Generate panels (their shells bench them), recording (needs a device), quick ops (editor-ops bench), marquee, lane-crossing drag, ⌘K palette, copy/paste, stage transform handles and the Inspector (unit-tested only).',
    );
    await context.close();
  } catch (error) {
    check(
      'bench ran to completion',
      false,
      error instanceof Error ? error.message.slice(0, 500) : String(error),
    );
  } finally {
    // ── cleanup + net-zero ────────────────────────────────────────────────────────────
    try {
      // Late rows the register kicked off (poster, analysis) are found by the asset ids.
      const { data: tagged } = await admin
        .schema('media')
        .from('assets')
        .select('id, storage_path')
        .eq('brand_id', BRAND)
        .eq('file_name', DROP_NAME);
      for (const row of tagged ?? []) {
        if (!createdAssets.some((asset) => asset.id === row.id))
          createdAssets.push({ id: row.id, storagePath: row.storage_path });
      }
      // The run's storage, read from its rows while they exist (the transcript the Brief keeps
      // for the drop's version included), taken back and proven gone by owned id.
      const ledger = await ownedStorage(admin, BRAND, createdAssets);
      const netZero = await proveNetZero(admin, BRAND, {
        id: RUN,
        ledger,
        assets: createdAssets,
        projects: createdProjects,
      });
      for (const step of netZero.steps) grade(step);
      for (const line of netZero.notes) note(line);
      note(
        "brand-prefix storage object count not taken: the service role has no count over a storage prefix; the run's own objects are proven by owned path above",
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

test('workspace inspector: native transform, crop, gain and constant-speed render parity', async ({
  browser,
}) => {
  test.skip(
    !INSPECTOR_JOURNEY,
    'Set VIDEO_EDITOR_INSPECTOR_JOURNEY=1 for the full f06 loopback case.',
  );
  const folder =
    process.env.VIDEO_EDITOR_INSPECTOR_OUTPUT ?? join(tmpdir(), `video-inspector-${RUN}`);
  mkdirSync(folder, { recursive: true });
  const assert = (name: string, ok: boolean, detail?: string) => {
    check(name, ok, detail);
    expect(ok, name).toBe(true);
  };
  const servers: Server[] = [],
    ids: string[] = [];
  let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | undefined;
  let previousBrand: string | null | undefined,
    brandChanged = false;
  let owned:
    | {
        path: string;
        assetId?: string;
        receiptKey?: string;
        headPath?: string;
        versionReceiptKey?: string;
      }
    | undefined;
  const roomIds: string[] = [];
  const network: Array<Record<string, unknown>> = [];
  const timings: Array<{
    case: number;
    control: string;
    durationMs: number;
    resourceStart: number;
    responseEnd: number;
    revision: number;
  }> = [];
  try {
    note(
      GRAPH_JOURNEY
        ? 'f02 scope: actual Canvas session/binding, pinned Graph pool after authenticated Edge advances Library head, native hover preview/add, HTTP/store/network/undo/reload. Paid generation, GCS/export and currentproduction unexercised.'
        : IMPORT_JOURNEY
          ? `${FEATURE} scope: native pinned Media panel plus/context imports after the actual Library head advances; real Edge version reads, HTTP/store, network transfers, reload and undo. File-upload/recording Edge and GCS paths, native Export and current production unexercised.`
          : TIMELINE_JOURNEY
            ? 'f05 scope: native timeline edits, source intervals, frame grid, tracks/markers/snapping and waveform through local Library/HTTP/store. Original hosted upload/drop, native Export dialog and hosted Render unexercised.'
            : 'f06 scope: full native transform/crop/gain/constant-speed inspection, real loopback Library/HTTP/store, browser compositor. Original hosted upload/drop workspace case, native Export dialog and hosted Render are not exercised.',
    );
    if (IMPORT_JOURNEY) {
      const step = `${FEATURE} file upload/recording, paid generation, GCS, native Export and current production`;
      const detail =
        'Only normal Supabase pinned-media native/store/network imports are exercised.';
      rec.record(step, 'SKIP', detail);
      results.push({ step, grade: 'SKIP', detail });
    }
    const file = process.env.VIDEO_EDITOR_RECORDED_FIXTURE;
    if (!file) throw new Error('Inspector journey requires a real recorded MP4.');
    const bytes = readFileSync(file);
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height:format=duration',
          '-of',
          'json',
          file,
        ],
        { encoding: 'utf8' },
      ),
    ) as { streams: Array<{ width: number; height: number }>; format: { duration: string } };
    assert(
      'f06 recorded source has enough media and retained checksum',
      Number(probe.format.duration) >= (TIMELINE_JOURNEY ? 6.2 : 4.2),
      createHash('sha256').update(bytes).digest('hex'),
    );
    const port = await freePort(),
      backend = await bootBackend(`http://localhost:${port}`);
    servers.push(backend);
    const frontend = await bootFrontend(port, backend.url, '.next/video-workspace-inspector');
    servers.push(frontend);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const api: Api = { base: backend.url, token: session.accessToken };
    const { data: preference, error: prefError } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (prefError) throw prefError;
    previousBrand = preference ? preference.active_brand_id : undefined;
    const { error: prefSetError } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: session.userId, active_brand_id: BRAND, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (prefSetError) throw prefSetError;
    brandChanged = true;
    if (GRAPH_JOURNEY)
      writeFileSync(
        join(folder, 'cleanup-identity.json'),
        JSON.stringify(
          {
            userId: session.userId,
            previousBrand,
            sessionId: JSON.parse(
              Buffer.from(session.accessToken.split('.')[1]!, 'base64url').toString(),
            ).session_id,
          },
          null,
          2,
        ),
      );
    const { buildRegisterGeneratedAssetOperation } = await import(
      '../../Continuum-Backend/App/media/registerGeneratedAsset'
    );
    owned = { path: `${BRAND}/video-inspector-bench/${randomUUID()}/recorded.mp4` };
    const operation = buildRegisterGeneratedAssetOperation({
      brandId: BRAND,
      kind: 'video',
      bucket: 'media-library',
      storagePath: owned.path,
      fileName: `bench-inspector-${RUN}.mp4`,
      mimeType: 'video/mp4',
      createdBy: session.userId,
      width: probe.streams[0]?.width,
      height: probe.streams[0]?.height,
      durationMs: Math.round(Number(probe.format.duration) * 1000),
      sizeBytes: bytes.length,
      checksum: createHash('sha256').update(bytes).digest('hex'),
      source: 'canvas',
      operation: 'video_editor_local_fixture',
      originRef: { bench: BENCH, actualRecordedMedia: true },
    });
    const { error: uploadError } = await admin.storage
      .from('media-library')
      .upload(owned.path, bytes, { contentType: 'video/mp4' });
    if (uploadError) throw uploadError;
    owned.receiptKey = operation.idempotencyKey;
    const { data: receiptData, error: receiptError } = await admin
      .schema('media')
      .rpc('library_execute_operation', {
        p_action: operation.action,
        p_payload: { ...operation, actor: session.userId },
      });
    if (receiptError) throw receiptError;
    const receipt = registerGeneratedAssetResponseSchema.parse(receiptData);
    owned.assetId = receipt.assetId;
    assert('f06 exact recorded Library version is registered', receipt.status === 'created');
    const { data: signed, error: signError } = await admin.storage
      .from('media-library')
      .createSignedUrl(owned.path, 1800);
    if (signError || !signed) throw signError ?? new Error('Sign failed');
    context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    await context.grantPermissions(['local-network-access'], { origin: frontend.url });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const compositor = await context.newPage(),
      bundle = join(folder, 'compositor.js');
    execFileSync(
      'bun',
      [
        'build',
        'e2e/support/editorV2DurableRenderBenchEntry.ts',
        '--target=browser',
        '--outfile',
        bundle,
        '--define',
        `process.env=${JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL: backend.url })}`,
      ],
      { stdio: 'pipe' },
    );
    await compositor.route('**/inspector-compositor', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await compositor.goto(`${frontend.url}/inspector-compositor`);
    await compositor.addScriptTag({ content: readFileSync(bundle, 'utf8'), type: 'module' });
    await compositor.waitForFunction(() => Boolean(window.__editorV2DurableRenderBench));
    const post = async (id: string, op: string, args: Record<string, unknown>) => {
      const response = await fetch(`${api.base}/api/ai-studio/video-projects/${id}/ops/${op}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!response.ok) throw new Error(`${op}: ${response.status} ${await response.text()}`);
      return response.json();
    };
    let newerVersionId: string | undefined;
    if (IMPORT_JOURNEY) {
      owned.headPath = `${BRAND}/${receipt.assetId}/v2/newer-head.mp4`;
      const headFile = join(folder, 'newer-head.mp4');
      execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-ss',
          '2',
          '-i',
          file,
          '-t',
          '3',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          headFile,
        ],
        { timeout: 30_000 },
      );
      const headBytes = readFileSync(headFile);
      const { error } = await admin.storage
        .from('media-library')
        .upload(owned.headPath, headBytes, { contentType: 'video/mp4' });
      if (error) throw error;
      owned.versionReceiptKey = `import-head-${RUN}`;
      const response = await fetch(`${supabaseUrl}/functions/v1/library-creative-operations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${api.token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'register_asset_version',
          brandId: BRAND,
          assetId: receipt.assetId,
          baseVersionId: receipt.versionId,
          bucket: 'media-library',
          storagePath: owned.headPath,
          fileName: `newer-${RUN}.mp4`,
          mimeType: 'video/mp4',
          sizeBytes: headBytes.length,
          width: probe.streams[0]?.width,
          height: probe.streams[0]?.height,
          durationMs: 3000,
          checksum: createHash('sha256').update(headBytes).digest('hex'),
          integrityState: 'verified',
          idempotencyKey: owned.versionReceiptKey,
        }),
      });
      const body: unknown = await response.json();
      assert(
        `${FEATURE} actual authenticated Edge advances the real Library head`,
        response.ok,
        response.ok ? 'actual stored version registered' : JSON.stringify(body),
      );
      const version = registerVersionResponseSchema.parse(body);
      newerVersionId = version.versionId;
      assert(
        `${FEATURE} the newer actual stored version differs from the pin`,
        Boolean(newerVersionId && newerVersionId !== receipt.versionId),
      );
      writeFileSync(
        join(folder, 'versions.json'),
        JSON.stringify(
          {
            assetId: receipt.assetId,
            pinned: receipt.versionId,
            head: newerVersionId,
            recordedSha256: createHash('sha256').update(bytes).digest('hex'),
            headSha256: createHash('sha256').update(headBytes).digest('hex'),
            sizeBytes: bytes.length,
            headSizeBytes: headBytes.length,
          },
          null,
          2,
        ),
      );
    }
    if (IMPORT_JOURNEY) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const inFlight = new Map<string, Record<string, unknown>>();
      cdp.on('Network.responseReceived', ({ requestId, response }) => {
        const path = new URL(response.url).pathname;
        if (!path.includes(owned!.path) && !path.includes(owned!.headPath!)) return;
        const row = {
          path,
          status: response.status,
          range: response.headers['content-range'] ?? response.headers['Content-Range'] ?? null,
          fromDiskCache: response.fromDiskCache ?? false,
          fromServiceWorker: response.fromServiceWorker ?? false,
          mimeType: response.mimeType,
          encodedDataLength: 0,
          finished: false,
        };
        network.push(row);
        inFlight.set(requestId, row);
      });
      cdp.on('Network.dataReceived', ({ requestId, encodedDataLength }) => {
        const row = inFlight.get(requestId);
        if (row) row.dataEncodedBytes = Number(row.dataEncodedBytes ?? 0) + encodedDataLength;
      });
      cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
        const row = inFlight.get(requestId);
        if (row) Object.assign(row, { encodedDataLength, finished: true });
      });
      cdp.on('Network.loadingFailed', ({ requestId, errorText, canceled }) => {
        const row = inFlight.get(requestId);
        if (row) Object.assign(row, { errorText, canceled });
      });
    }
    const video = (project: EditorProjectV2): EditorVideoClip => {
      const c = mainClips(project)[0];
      if (!c || c.kind !== 'video') throw new Error('Missing video');
      return c;
    };
    const pcm = (path: string): Float32Array[] => {
      const channelCount = Number(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'a:0',
            '-show_entries',
            'stream=channels',
            '-of',
            'csv=p=0',
            path,
          ],
          { encoding: 'utf8', timeout: 20_000 },
        ).trim(),
      );
      if (![1, 2].includes(channelCount)) throw new Error(`Expected mono or stereo audio: ${path}`);
      const b = execFileSync(
        'ffmpeg',
        ['-v', 'error', '-i', path, '-vn', '-ar', '48000', '-f', 'f32le', 'pipe:1'],
        { maxBuffer: 30_000_000, timeout: 30_000 },
      );
      const samples = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      const channels = Array.from(
        { length: channelCount },
        () => new Float32Array(samples.length / channelCount),
      );
      for (let i = 0; i < samples.length; i++)
        channels[i % channelCount]![Math.floor(i / channelCount)] = samples[i]!;
      return channels;
    };
    const sourcePcm = pcm(file);
    const sourceAt = (time: number, channel: number) => {
      const n = time * 48000,
        lo = Math.floor(n),
        mix = n - lo,
        source = sourcePcm[Math.min(channel, sourcePcm.length - 1)]!;
      return (source[lo] ?? 0) * (1 - mix) + (source[lo + 1] ?? 0) * mix;
    };
    const request = (project: EditorProjectV2): DurableTimelineRequest => ({
      project,
      inputs: [
        {
          sourceId: video(project).id,
          sourceAssetId: receipt.assetId,
          sourceRevision: receipt.versionId,
          storage: { bucket: 'media-library', path: owned!.path },
          url: signed.signedUrl,
        },
      ],
    });
    for (const [index, values] of [
      {
        background: '#17384d',
        scale: 0.85,
        rotate: 10,
        gain: 0.6,
        speed: 1.25,
        crop: [0.1, 0.05, 0.15, 0.1],
      },
      {
        background: '#e5c9a3',
        scale: 1.1,
        rotate: -15,
        gain: 0.8,
        speed: 1.5,
        crop: [0.05, 0.15, 0.1, 0.05],
      },
      {
        background: '#000000',
        scale: 0.75,
        rotate: 30,
        gain: 0.35,
        speed: 0.75,
        crop: [0.15, 0.1, 0.05, 0.15],
      },
    ].entries()) {
      await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
      await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
      const id = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1];
      if (!id) throw new Error('Missing project');
      ids.push(id);
      await expect(page.getByTestId('video-studio-edit')).toBeVisible({ timeout: 180_000 });
      const blank = await getProject(api, id);
      await post(id, 'apply_commands', {
        expectedRevision: blank.revision,
        commands: [
          {
            commandType: 'set_project_metadata',
            canvas: {
              ...blank.canvas,
              width: 360,
              height: 640,
              backgroundColor: values.background,
            },
          },
          {
            commandType: 'set_export_settings',
            exportSettings: editorExportSettingsSchema.parse({
              ...blank.exportSettings,
              width: 360,
              height: 640,
              frameRate: { numerator: 30, denominator: 1 },
            }),
          },
          {
            commandType: 'add_track',
            track: {
              id: 'video',
              name: 'Recorded',
              kind: 'video',
              order: 0,
              clips: [
                {
                  id: 'recorded',
                  kind: 'video',
                  timelineStartSec: 0,
                  durationSec: 4,
                  source: {
                    sourceType: 'library_asset',
                    assetId: receipt.assetId,
                    renditionId: receipt.versionId,
                  },
                  sourceInSec: 0.2,
                  playbackRate: TIMELINE_JOURNEY ? values.speed : 1,
                  transform: { scaleX: -0.9, scaleY: 0.75, anchorX: 0.25, anchorY: 0.75 },
                  audioEnabled: true,
                  volume: 1,
                },
              ],
            },
          },
        ],
      });
      if (IMPORT_JOURNEY && !GRAPH_JOURNEY && index === 2) {
        const seeded = await getProject(api, id);
        await post(id, 'apply_commands', {
          expectedRevision: seeded.revision,
          commands: [
            {
              commandType: 'add_track',
              track: {
                id: 'other-version',
                name: 'Stored alternate',
                kind: 'video',
                order: 1,
                enabled: false,
                muted: true,
                clips: [
                  {
                    id: 'other-version',
                    name: 'Other stored version',
                    kind: 'video',
                    timelineStartSec: 0,
                    durationSec: 1,
                    source: {
                      sourceType: 'library_asset',
                      assetId: receipt.assetId,
                      renditionId: newerVersionId!,
                    },
                    sourceInSec: 0,
                    playbackRate: 1,
                    audioEnabled: false,
                  },
                ],
              },
            },
          ],
        });
      }
      if (GRAPH_JOURNEY) {
        const nodeId = `graph-editor-${RUN}-${index}`;
        const { data: room, error: roomError } = await admin
          .schema('brand_profiles')
          .from('canvas_rooms')
          .insert({
            brand_profile_id: BRAND,
            name: `graph-bench-${RUN}-${index}`,
            created_by: session.userId,
          })
          .select('id')
          .single();
        if (roomError || !room) throw roomError ?? new Error('Missing canvas room');
        roomIds.push(room.id);
        const absentPin = randomUUID();
        const sources = [
          receipt.versionId,
          ...(index === 2 ? [newerVersionId!] : index === 1 ? [absentPin] : []),
        ].map((versionId, n) => ({
          id: `graph-source-${RUN}-${index}-${n}`,
          type: 'video',
          position: { x: 0, y: n * 200 },
          data: {
            label: n ? 'Actual newer version' : 'Pinned recorded source',
            assetId: receipt.assetId,
            assetVersionId: versionId,
            bucket: 'media-library',
            sourcePath: n ? owned!.headPath! : owned!.path,
            fileName: n ? 'newer-head.mp4' : 'recorded.mp4',
          },
        }));
        const { error: graphError } = await admin
          .schema('brand_profiles')
          .from('canvas_sessions')
          .insert({
            brand_profile_id: BRAND,
            room_id: room.id,
            nodes: [
              ...sources,
              {
                id: nodeId,
                type: 'timelineEditor',
                position: { x: 500, y: 0 },
                data: { label: 'Actual editor', items: [] },
              },
            ],
            edges: sources.map((source) => ({
              id: `edge-${source.id}`,
              source: source.id,
              target: nodeId,
              targetHandle: TIMELINE_MEDIA_INPUT_HANDLE,
            })),
          });
        if (graphError) throw graphError;
        const { error: bindingError } = await admin
          .schema('media')
          .from('editor_project_bindings')
          .insert({
            brand_id: BRAND,
            project_id: id,
            binding_type: 'canvas_node',
            external_id: nodeId,
          });
        if (bindingError) throw bindingError;
        const pool = (await post(id, 'get_pool', {})) as { assets: VideoEditorPoolAsset[] };
        if (index === 1)
          check(
            'f02 absent explicit Graph pin never falls back to head',
            pool.assets.filter((asset) => asset.origin === 'graph').length === 1 &&
              !pool.assets.some(
                (asset) => asset.versionId === absentPin || asset.versionId === newerVersionId,
              ),
          );

        writeFileSync(
          join(folder, `graph-${index}-pool.json`),
          JSON.stringify(
            {
              nodeId,
              sources,
              pool: { assets: pool.assets.map(({ thumbnailUrl: _url, ...asset }) => asset) },
            },
            null,
            2,
          ),
        );
        check(
          `f02 case ${index}: actual Graph pool retains saved source pins`,
          sources
            .filter((source) => source.data.assetVersionId !== absentPin)
            .every((source) =>
              pool.assets.some(
                (asset) =>
                  asset.origin === 'graph' &&
                  asset.assetId === receipt.assetId &&
                  asset.versionId === source.data.assetVersionId,
              ),
            ),
          JSON.stringify(
            pool.assets.map(({ assetId, versionId, origin }) => ({ assetId, versionId, origin })),
          ),
        );
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      const clip = page.locator('[data-clip-id="recorded"]:visible');
      await expect(clip).toBeVisible({ timeout: 30_000 });
      const clipBox = await clip.boundingBox();
      if (!clipBox) throw new Error('Clip box absent');
      await clip.click({ position: { x: clipBox.width * 0.1, y: clipBox.height / 2 } });
      let project = await getProject(api, id);
      if (IMPORT_JOURNEY) {
        const initial = project;
        let graphLoadMs = 0;
        if (GRAPH_JOURNEY) {
          const at = await page.evaluate(() => performance.now());
          await page.getByRole('tab', { name: 'Graph', exact: true }).click();
          await expect(
            page
              .locator(`[data-pool-section="graph"] [data-pool-asset="${receipt.assetId}"]`)
              .first(),
          ).toBeVisible();
          graphLoadMs = (await page.evaluate(() => performance.now())) - at;
        }
        const bin = GRAPH_JOURNEY
          ? page
              .locator(`[data-pool-section="graph"] [data-pool-asset="${receipt.assetId}"]`)
              .first()
          : page.locator(
              `[data-bin-asset="${receipt.assetId}"][data-bin-version="${receipt.versionId}"]`,
            );
        await expect(bin).toBeVisible();
        if (GRAPH_JOURNEY && index === 2) {
          const cards = page.locator(
            `[data-pool-section="graph"] [data-pool-asset="${receipt.assetId}"]`,
          );
          assert(
            'f02 same-asset Graph pins remain two distinct native cards',
            (await cards.count()) === 2 &&
              (await cards.evaluateAll(
                (elements, versions) =>
                  elements.every(
                    (element, i) => element.getAttribute('data-pool-version') === versions[i],
                  ),
                [receipt.versionId, newerVersionId!],
              )),
          );
        }
        if (index === 2 && !GRAPH_JOURNEY) {
          const bins = page.locator(`[data-bin-asset="${receipt.assetId}"]`);
          assert(
            `${FEATURE} two pins of one asset remain distinct native media cards`,
            (await bins.count()) === 2,
          );
          const olderSrc = await bin.locator('video').getAttribute('src');
          const newerSrc = await page
            .locator(
              `[data-bin-asset="${receipt.assetId}"][data-bin-version="${newerVersionId}"] video`,
            )
            .getAttribute('src');
          assert(
            `${FEATURE} each native media card previews its own actual stored version`,
            Boolean(olderSrc?.includes(owned!.path) && newerSrc?.includes(owned!.headPath!)),
          );
          await expect
            .poll(
              () =>
                page
                  .locator(`[data-bin-asset="${receipt.assetId}"] video`)
                  .evaluateAll((videos) =>
                    videos.every((v) => (v as HTMLVideoElement).readyState >= 1),
                  ),
              { timeout: 30_000 },
            )
            .toBe(true);
        }
        // Wait for the native preview's actual source read, never seed a preview URL.
        await expect
          .poll(() => network.filter((n) => String(n.path).includes(owned!.path)).length, {
            timeout: 30_000,
          })
          .toBeGreaterThan(0);
        if (GRAPH_JOURNEY) {
          await bin.hover();
          const hoverVideo = page.locator('[data-slot="hover-card-content"] video:visible');
          const shown = await hoverVideo.waitFor({ state: 'visible', timeout: 6000 }).then(
            () => true,
            () => false,
          );
          const src = shown ? await hoverVideo.getAttribute('src') : null;
          check(
            `f02 case ${index}: native Graph hover reads the saved stored version`,
            Boolean(src?.includes(owned!.path)),
            src ? new URL(src).pathname : 'No playable hover preview',
          );
          if (shown)
            await expect
              .poll(() => hoverVideo.evaluate((v) => (v as HTMLVideoElement).readyState), {
                timeout: 10000,
              })
              .toBeGreaterThanOrEqual(1);
          await page.mouse.move(500, 80);
        }
        const beforeDownloads = network.length;
        const control = GRAPH_JOURNEY
          ? index === 1
            ? 'Graph context at playhead'
            : 'Graph plus'
          : ['bin plus', 'context at playhead', 'context new track'][index]!;
        if (index === 0 || (GRAPH_JOURNEY && index === 2)) await bin.hover();
        else {
          await bin.click({ button: 'right' });
          await expect(
            page.getByRole('menuitem', {
              name: GRAPH_JOURNEY || index === 1 ? 'Add at playhead' : 'Add on a new track',
              exact: true,
            }),
          ).toBeVisible();
        }
        await page.evaluate(() =>
          window.addEventListener(
            'click',
            () => {
              (window as unknown as { __importAt: number }).__importAt = performance.now();
            },
            { capture: true, once: true },
          ),
        );
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${id}/ops/add_clip`) &&
            r.request().method() === 'POST',
        );
        if (index === 0 || (GRAPH_JOURNEY && index === 2))
          await bin.getByRole('button', { name: /Add .* at the playhead/ }).click();
        else
          await page
            .getByRole('menuitem', {
              name: GRAPH_JOURNEY || index === 1 ? 'Add at playhead' : 'Add on a new track',
              exact: true,
            })
            .click();
        const response = await responsePromise;
        assert(
          `${FEATURE} case ${index}: ${control} actual op succeeds`,
          response.status() === 200,
          response.status() === 200 ? 'real HTTP200' : await response.text(),
        );
        const output = (await response.json()) as {
          clipId: string;
          trackId: string;
          commit: { revision: number };
        };
        await expect(page.locator(`[data-clip-id="${output.clipId}"]:visible`)).toBeVisible();
        if (GRAPH_JOURNEY) {
          const stage = page.getByTestId('edit-stage').locator('video').first();
          await expect
            .poll(
              () =>
                stage.evaluate(
                  (video, path) =>
                    (video as HTMLVideoElement).currentSrc.includes(path) &&
                    (video as HTMLVideoElement).readyState >= 2 &&
                    (video as HTMLVideoElement).videoWidth > 0,
                  owned!.path,
                ),
              { timeout: 10000 },
            )
            .toBe(true);
          assert(`f02 case ${index}: native timeline displays the pinned stored source`, true);
        }
        const timing = await page.evaluate(() => ({
          durationMs: performance.now() - (window as unknown as { __importAt: number }).__importAt,
          resourceStart: 0,
          responseEnd: performance.now(),
        }));
        const timingComponents = { graphLoadMs, nativeAddMs: timing.durationMs };
        if (GRAPH_JOURNEY) timing.durationMs += graphLoadMs;
        timings.push({ case: index, control, ...timing, revision: output.commit.revision });
        project = await getProject(api, id);
        const added = project.tracks.flatMap((t) => t.clips).find((c) => c.id === output.clipId);
        check(
          `${FEATURE} case ${index}: ${control} preserves the pinned version instead of the newer head`,
          Boolean(
            added &&
              'source' in added &&
              added.source.sourceType === 'library_asset' &&
              added.source.assetId === receipt.assetId &&
              added.source.renditionId === receipt.versionId,
          ),
          JSON.stringify({
            expected: receipt.versionId,
            newerVersionId,
            actual: added && 'source' in added ? added.source : null,
          }),
        );
        check(
          `${FEATURE} case ${index}: ${control} uses the pinned version duration`,
          Boolean(
            added &&
              Math.abs(
                added.durationSec -
                  (index === 2 && !GRAPH_JOURNEY
                    ? Math.min(initial.durationSec, Number(probe.format.duration))
                    : Number(probe.format.duration)),
              ) <=
                1 / 30,
          ),
          JSON.stringify({
            expected:
              index === 2 && !GRAPH_JOURNEY
                ? Math.min(initial.durationSec, Number(probe.format.duration))
                : Number(probe.format.duration),
            actual: added?.durationSec,
            newTrackIsBoundedByMain: index === 2 && !GRAPH_JOURNEY,
          }),
        );
        assert(
          `${FEATURE} case ${index}: ${control} makes exactly one native revision`,
          project.revision === initial.revision + 1 && output.commit.revision === project.revision,
        );
        await page.waitForTimeout(1000);
        const transfers = network.slice(beforeDownloads);
        check(
          `${FEATURE} case ${index}: ${control} does not download the newer head`,
          !transfers.some((n) => String(n.path).includes(owned!.headPath!)),
          JSON.stringify(transfers),
        );
        const duplicateFullDownloads = transfers.filter(
          (n) =>
            !n.fromDiskCache &&
            !n.fromServiceWorker &&
            Math.max(Number(n.encodedDataLength), Number(n.dataEncodedBytes ?? 0)) >= bytes.length,
        );
        check(
          `${FEATURE} case ${index}: ${control} does not repeat a full pinned source download`,
          duplicateFullDownloads.length === 0,
          JSON.stringify(duplicateFullDownloads),
        );
        writeFileSync(
          join(folder, `import-${index}-readback.json`),
          JSON.stringify(
            { initial, after: project, output, timing, timingComponents, transfers },
            null,
            2,
          ),
        );
        writeFileSync(join(folder, `import-${index}-native.png`), await page.screenshot());
        const undoResponse = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${id}/timeline/restore`) &&
            r.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await undoResponse;
        const undone = await getProject(api, id);
        assert(
          `${FEATURE} case ${index}: native undo restores exact pinned tracks and duration`,
          JSON.stringify(undone.tracks) === JSON.stringify(initial.tracks) &&
            undone.durationSec === initial.durationSec,
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-clip-id="recorded"]:visible')).toBeVisible();
        assert(
          `${FEATURE} case ${index}: pin and exact original tracks survive reload`,
          JSON.stringify((await getProject(api, id)).tracks) === JSON.stringify(initial.tracks),
        );
        if (GRAPH_JOURNEY && index === 2) {
          await page.getByRole('tab', { name: 'Graph', exact: true }).click();
          const newerCard = page.locator(
            `[data-pool-section="graph"] [data-pool-asset="${receipt.assetId}"][data-pool-version="${newerVersionId}"]`,
          );
          await expect(newerCard).toBeVisible();
          await newerCard.hover();
          const newerHover = page.locator('[data-slot="hover-card-content"] video:visible');
          await expect(newerHover).toBeVisible();
          await expect
            .poll(() => newerHover.evaluate((v) => (v as HTMLVideoElement).readyState))
            .toBeGreaterThanOrEqual(1);
          assert(
            'f02 newer Graph card previews its own actual stored bytes',
            Boolean((await newerHover.getAttribute('src'))?.includes(owned!.headPath!)),
          );
          await page.mouse.move(500, 80);
          const beforeNewer = await getProject(api, id);
          const beforeProbe = await admin
            .schema('media')
            .from('asset_versions')
            .select('duration_ms,media_info')
            .eq('id', newerVersionId!)
            .single();
          if (beforeProbe.error) throw beforeProbe.error;
          assert(
            'f02 newer stored version starts without primed duration or probe',
            beforeProbe.data.duration_ms === null && beforeProbe.data.media_info === null,
          );
          const request = page.waitForResponse(
            (r) =>
              r.url().endsWith(`/video-projects/${id}/ops/add_clip`) &&
              r.request().method() === 'POST',
          );
          const start = await page.evaluate(() => performance.now());
          await newerCard.getByRole('button', { name: /Add .* at the playhead/ }).click();
          const response = await request;
          if (response.status() !== 200) {
            const { probeLibraryVersion } = await import(
              '../../Continuum-Backend/App/media/mediaProbe/probeVersion'
            );
            const diagnosis = await probeLibraryVersion(newerVersionId!, admin).then(
              (result) => ({ state: result.state }),
              (error: unknown) => ({
                error: error instanceof Error ? error.message : String(error),
              }),
            );
            writeFileSync(
              join(folder, 'newer-probe-diagnosis.json'),
              JSON.stringify(diagnosis, null, 2),
            );
          }
          assert(
            'f02 newer Graph version with missing metadata is natively placeable',
            response.status() === 200,
            response.status() === 200 ? 'real HTTP200' : await response.text(),
          );
          const result = (await response.json()) as {
            clipId: string;
            commit: { revision: number };
          };
          await expect(page.locator(`[data-clip-id="${result.clipId}"]:visible`)).toBeVisible();
          const stage = page.getByTestId('edit-stage').locator('video').first();
          await expect
            .poll(
              () =>
                stage.evaluate(
                  (video, path) =>
                    (video as HTMLVideoElement).currentSrc.includes(path) &&
                    (video as HTMLVideoElement).readyState >= 2 &&
                    (video as HTMLVideoElement).videoWidth > 0,
                  owned!.headPath!,
                ),
              { timeout: 10000 },
            )
            .toBe(true);
          assert('f02 native timeline displays the actual newer stored source', true);
          const ms = (await page.evaluate(() => performance.now())) - start;
          timings.push({
            case: index,
            control: 'Graph newer plus with real cold probe',
            durationMs: ms,
            resourceStart: 0,
            responseEnd: 0,
            revision: result.commit.revision,
          });
          const newer = await getProject(api, id);
          const added = newer.tracks
            .flatMap((track) => track.clips)
            .find((clip) => clip.id === result.clipId);
          const decodedFrames = JSON.parse(
            execFileSync(
              'ffprobe',
              [
                '-v',
                'error',
                '-show_frames',
                '-show_entries',
                'frame=best_effort_timestamp_time,duration_time,media_type',
                '-of',
                'json',
                join(folder, 'newer-head.mp4'),
              ],
              { encoding: 'utf8' },
            ),
          ) as {
            frames: Array<{
              best_effort_timestamp_time?: string;
              duration_time?: string;
              media_type?: string;
            }>;
          };
          const actualDuration = Math.max(
            ...decodedFrames.frames.map(
              (frame) =>
                Number(frame.best_effort_timestamp_time ?? 0) + Number(frame.duration_time ?? 0),
            ),
          );
          writeFileSync(
            join(folder, 'newer-decoded-frames.json'),
            JSON.stringify(decodedFrames, null, 2),
          );
          writeFileSync(
            join(folder, 'newer-before-assertions.json'),
            JSON.stringify(
              { before: beforeNewer, after: newer, result, actualDuration, durationMs: ms, added },
              null,
              2,
            ),
          );
          assert(
            'f02 newer Graph add retains its own version and actual source duration',
            Boolean(
              added &&
                'source' in added &&
                added.source.sourceType === 'library_asset' &&
                added.source.renditionId === newerVersionId &&
                Math.abs(added.durationSec - actualDuration) <= 1 / 30,
            ),
            JSON.stringify({ actualDuration, added }),
          );
          assert(
            'f02 newer Graph add makes exactly one revision',
            newer.revision === beforeNewer.revision + 1 &&
              newer.revision === result.commit.revision,
          );
          const afterProbe = await admin
            .schema('media')
            .from('asset_versions')
            .select('duration_ms,width,height,media_info')
            .eq('id', newerVersionId!)
            .single();
          if (afterProbe.error) throw afterProbe.error;
          assert(
            'f02 native newer add probes and persists real technical metadata',
            afterProbe.data.duration_ms > 0 &&
              afterProbe.data.width === probe.streams[0]?.width &&
              afterProbe.data.height === probe.streams[0]?.height &&
              Boolean(afterProbe.data.media_info?.probedAt),
          );
          writeFileSync(
            join(folder, 'newer-readback.json'),
            JSON.stringify(
              {
                before: beforeNewer,
                after: newer,
                result,
                actualDuration,
                durationMs: ms,
                beforeProbe: beforeProbe.data,
                afterProbe: afterProbe.data,
              },
              null,
              2,
            ),
          );
          await page.getByRole('button', { name: 'Play preview', exact: true }).click();
          await expect
            .poll(() => stage.evaluate((video) => (video as HTMLVideoElement).currentTime), {
              timeout: 10000,
            })
            .toBeGreaterThan(0.15);
          await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
          assert('f02 newer stored source plays through the native timeline', true);
          writeFileSync(join(folder, 'newer-native.png'), await page.screenshot());
          const undo = page.waitForResponse(
            (r) =>
              r.url().endsWith(`/video-projects/${id}/timeline/restore`) &&
              r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: 'Undo', exact: true }).click();
          await undo;
          const restored = await getProject(api, id);
          assert(
            'f02 newer native add is exactly undoable',
            JSON.stringify(restored.tracks) === JSON.stringify(beforeNewer.tracks) &&
              restored.durationSec === beforeNewer.durationSec,
          );
        }
        continue;
      }
      const commitPointerEdit = async (
        label: string,
        event = 'pointerup',
        action: () => Promise<unknown> = () => page.mouse.up(),
      ) => {
        const before = project;
        await page.evaluate(
          (event) =>
            window.addEventListener(
              event,
              () => {
                (window as unknown as { __inspectorCommitAt: number }).__inspectorCommitAt =
                  performance.now();
              },
              { capture: true, once: true },
            ),
          event,
        );
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${id}/commands`) && r.request().method() === 'POST',
          { timeout: 20_000 },
        );
        await action();
        const response = await responsePromise;
        await response.finished();
        assert(
          `${FEATURE} case ${index}: ${label} control saves successfully`,
          response.status() === 200,
        );
        const saved = editorProjectResponseSchema.parse(await response.json());
        const timing = await page.evaluate((url) => {
          const start = (window as unknown as { __inspectorCommitAt: number }).__inspectorCommitAt;
          const entry = performance
            .getEntriesByName(url)
            .filter((e) => e.startTime >= start - 0.5)
            .at(-1) as PerformanceResourceTiming | undefined;
          if (!entry) throw new Error('Save timing entry missing');
          return {
            durationMs: entry.responseEnd - start,
            resourceStart: entry.startTime,
            responseEnd: entry.responseEnd,
          };
        }, response.url());
        assert(
          `${FEATURE} case ${index}: ${label} save timing is retained`,
          Number.isFinite(timing.durationMs) && timing.durationMs > 0,
        );
        timings.push({ case: index, control: label, ...timing, revision: saved.project.revision });
        project = await getProject(api, id);
        assert(
          `${FEATURE} case ${index}: ${label} acknowledgement matches persisted revision`,
          project.revision === saved.project.revision &&
            (!TIMELINE_JOURNEY || project.revision === before.revision + 1),
        );
      };
      if (TIMELINE_JOURNEY) {
        const initial = project;
        const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
        const aligned = (sec: number) => near(sec * 30, Math.round(sec * 30));
        const spans = (p: EditorProjectV2) =>
          mainClips(p).map((c) => {
            if (c.kind !== 'video') throw new Error('Non-video main clip');
            return {
              id: c.id,
              source: c.source,
              sourceIn: c.sourceInSec,
              sourceOut: c.sourceInSec + c.durationSec * c.playbackRate,
              rate: c.playbackRate,
            };
          });
        const invariant = (label: string) => {
          const clips = mainClips(project);
          assert(
            `f05 case ${index}: ${label} main sequence is packed and frame-aligned`,
            clips.every(
              (c, i) =>
                aligned(c.timelineStartSec) &&
                aligned(c.durationSec) &&
                near(
                  c.timelineStartSec,
                  i ? clips[i - 1]!.timelineStartSec + clips[i - 1]!.durationSec : 0,
                ),
            ),
            JSON.stringify(
              clips.map((c) => ({ start: c.timelineStartSec, duration: c.durationSec })),
            ),
          );
          writeFileSync(
            join(folder, `timeline-${index}-${label}.json`),
            JSON.stringify(project, null, 2),
          );
        };
        const frameTimes = JSON.parse(
          execFileSync(
            'ffprobe',
            [
              '-v',
              'error',
              '-select_streams',
              'v:0',
              '-show_frames',
              '-show_entries',
              'stream=time_base:frame=best_effort_timestamp',
              '-of',
              'json',
              file,
            ],
            { encoding: 'utf8' },
          ),
        ) as {
          frames: Array<{ best_effort_timestamp: number }>;
          streams: Array<{ time_base: string }>;
        };
        const [timeNum, timeDen] = frameTimes.streams[0]!.time_base.split('/').map(Number);
        const thumbWidth = Math.max(
          1,
          Math.round((64 * probe.streams[0]!.width) / probe.streams[0]!.height),
        );
        const referenceFrame = async (sec: number) => {
          const frame = frameTimes.frames.findLastIndex(
            (f) => (f.best_effort_timestamp * timeNum!) / timeDen! <= sec + 1e-9,
          );
          if (frame < 0) throw new Error('No independent source frame at requested timestamp');
          const png = execFileSync('ffmpeg', [
            '-v',
            'error',
            '-i',
            file,
            '-vf',
            `select='eq(n,${frame})'`,
            '-frames:v',
            '1',
            '-f',
            'image2pipe',
            '-vcodec',
            'png',
            'pipe:1',
          ]);
          writeFileSync(join(folder, `source-frame-${frame}.png`), png);
          // Canvas sources use a different native resize path from PNG images. Normalize
          // independent FFmpeg pixels through the real preview's canvas/JPEG format.
          const url = await page.evaluate(
            async ({ url, width }) => {
              const image = new Image();
              image.src = url;
              await image.decode();
              const full = document.createElement('canvas');
              full.width = image.naturalWidth;
              full.height = image.naturalHeight;
              full.getContext('2d')!.drawImage(image, 0, 0);
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = 64;
              canvas.getContext('2d')!.drawImage(full, 0, 0, width, 64);
              return canvas.toDataURL('image/jpeg', 0.6);
            },
            { url: `data:image/png;base64,${png.toString('base64')}`, width: thumbWidth },
          );
          return execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              'pipe:0',
              '-frames:v',
              '1',
              '-pix_fmt',
              'rgb24',
              '-f',
              'rawvideo',
              'pipe:1',
            ],
            { input: Buffer.from(url.split(',')[1]!, 'base64') },
          );
        };
        const compareFilmstrips = async (label: string) => {
          for (const c of mainClips(project)) {
            if (c.kind !== 'video') throw new Error('Expected recorded video');
            const block = page.locator(`[data-clip-id="${c.id}"]:visible`);
            const box = await block.boundingBox();
            if (!box || box.width <= 60) continue; // Native UI deliberately hides narrow filmstrips.
            const count = Math.max(1, Math.min(8, Math.round(box.width / 80)));
            const span = c.durationSec * c.playbackRate;
            const times = Array.from(
              { length: count },
              (_, n) => c.sourceInSec + (span * (n + 0.5)) / count,
            );
            const references = await Promise.all(times.map(referenceFrame));
            const wrong = await Promise.all(
              times.map((_, n) =>
                referenceFrame((Number(probe.format.duration) * (n + 0.5)) / count),
              ),
            );
            const meanError = (a: Buffer, b: Buffer) =>
              a.length === b.length && a.length === thumbWidth * 64 * 3
                ? a.reduce((sum, value, n) => sum + Math.abs(value - b[n]!), 0) / a.length
                : Infinity;
            const controls = wrong.map((v, n) => meanError(v, references[n]!));
            assert(
              `f05 case ${index}: ${label} filmstrip whole-source control is distinguishable`,
              Math.max(...controls) > 12,
              JSON.stringify({ times, controls }),
            );
            const images = block.locator('img');
            await expect(images).toHaveCount(count, { timeout: 30_000 });
            const decode = (urls: string[]) =>
              urls.map((url) =>
                execFileSync(
                  'ffmpeg',
                  [
                    '-v',
                    'error',
                    '-i',
                    'pipe:0',
                    '-frames:v',
                    '1',
                    '-pix_fmt',
                    'rgb24',
                    '-f',
                    'rawvideo',
                    'pipe:1',
                  ],
                  { input: Buffer.from(url.split(',')[1] ?? '', 'base64') },
                ),
              );
            const urls = await until(
              () =>
                images.evaluateAll((elements) =>
                  elements.map((img) => (img as HTMLImageElement).src),
                ),
              (urls) =>
                urls.length === count &&
                decode(urls).every((pixels, n) => meanError(pixels, references[n]!) < 12),
              15_000,
            );
            const actual = decode(urls);
            const errors = actual.map((pixels, n) => meanError(pixels, references[n]!));
            const prefix = `timeline-${index}-filmstrip-${label}-${c.id}`;
            for (const [n, url] of urls.entries()) {
              writeFileSync(
                join(folder, `${prefix}-${n}.jpg`),
                Buffer.from(url.split(',')[1]!, 'base64'),
              );
              writeFileSync(join(folder, `${prefix}-${n}-reference.rgb`), references[n]!);
              writeFileSync(join(folder, `${prefix}-${n}-whole-source.rgb`), wrong[n]!);
            }
            writeFileSync(
              join(folder, `${prefix}.json`),
              JSON.stringify(
                {
                  clip: c,
                  times,
                  width: thumbWidth,
                  height: 64,
                  errors,
                  controls,
                  gate: 'every mean RGB error <12; at least one whole-source control error >12',
                },
                null,
                2,
              ),
            );
            assert(
              `f05 case ${index}: ${label} filmstrip pixels match retained source frames`,
              errors.length === count && errors.every((v) => v < 12),
              JSON.stringify({ times, errors }),
            );
          }
        };
        await compareFilmstrips('initial');
        const snapping = page.getByRole('button', { name: 'Toggle snapping', exact: true });
        if ((await snapping.getAttribute('aria-pressed')) === 'true') await snapping.click();
        const px = clipBox.width / video(initial).durationSec;
        const drag = async (target: Locator, delta: number, label: string) => {
          const box = await target.boundingBox();
          if (!box) throw new Error(`Missing ${label} pointer geometry`);
          const x = box.x + box.width / 2,
            y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + delta * px, y, { steps: 8 });
          await commitPointerEdit(label);
        };
        await drag(clip.locator('[data-trim-handle="end"]'), -0.427, 'end-trim');
        assert(
          `f05 case ${index}: end trim preserves source start, identity and rate`,
          near(video(project).sourceInSec, video(initial).sourceInSec) &&
            JSON.stringify(video(project).source) === JSON.stringify(video(initial).source) &&
            video(project).playbackRate === values.speed &&
            Math.abs(video(project).durationSec - (4 - 0.427)) < 1 / 30,
        );
        invariant('end-trim');
        await compareFilmstrips('end-trim');
        const ended = project;
        await drag(clip.locator('[data-trim-handle="start"]'), 0.223, 'start-trim');
        assert(
          `f05 case ${index}: start trim conserves the retained source end`,
          near(spans(project)[0]!.sourceOut, spans(ended)[0]!.sourceOut) &&
            near(
              video(project).sourceInSec,
              video(ended).sourceInSec +
                (video(ended).durationSec - video(project).durationSec) * values.speed,
            ),
        );
        invariant('start-trim');
        await compareFilmstrips('start-trim');
        const seek = async (sec: number) => {
          await page.keyboard.press('Escape');
          const ruler = page.locator('[data-timeline-ruler]:visible');
          const box = await ruler.boundingBox();
          if (!box) throw new Error('Ruler missing');
          await ruler.click({ position: { x: sec * px, y: box.height / 2 } });
        };
        await seek(1.113);
        const trimmed = spans(project)[0]!;
        await commitPointerEdit('split', 'keydown', () => page.locator('body').press('s'));
        const pieces = spans(project);
        assert(
          `f05 case ${index}: split partitions the exact retained source interval`,
          pieces.length === 2 &&
            near(pieces[0]!.sourceIn, trimmed.sourceIn) &&
            near(pieces[0]!.sourceOut, pieces[1]!.sourceIn) &&
            near(pieces[1]!.sourceOut, trimmed.sourceOut) &&
            pieces.every(
              (c) =>
                c.rate === values.speed &&
                JSON.stringify(c.source) === JSON.stringify(trimmed.source),
            ),
        );
        invariant('split');
        await compareFilmstrips('split');
        await drag(page.locator(`[data-clip-id="${pieces[0]!.id}"]:visible`), 3, 'reorder');
        assert(
          `f05 case ${index}: native reorder preserves both complete source spans`,
          JSON.stringify(spans(project)) === JSON.stringify([pieces[1], pieces[0]]),
        );
        invariant('reorder');
        await compareFilmstrips('reorder');
        const beforeDelete = spans(project);
        await page
          .locator(`[data-clip-id="${beforeDelete[0]!.id}"]:visible`)
          .click({ position: { x: 12, y: 20 } });
        await commitPointerEdit('ripple-delete', 'pointerup', () =>
          page.getByRole('button', { name: 'Ripple delete selection', exact: true }).click(),
        );
        assert(
          `f05 case ${index}: ripple deletion preserves the surviving source span`,
          JSON.stringify(spans(project)) === JSON.stringify(beforeDelete.slice(1)),
        );
        invariant('ripple-delete');
        await compareFilmstrips('ripple-delete');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await compareFilmstrips('reloaded');
        await seek(0.713);
        await commitPointerEdit('marker', 'keydown', () => page.locator('body').press('m'));
        const marker = project.markers.at(-1);
        assert(
          `f05 case ${index}: marker is saved on the project frame grid`,
          Boolean(marker && aligned(marker.timeSec) && Math.abs(marker.timeSec - 0.713) < 1 / 30),
        );
        await expect(page.locator('[data-timeline-ruler] [aria-label="Marker"]')).toHaveCount(1);
        if ((await snapping.getAttribute('aria-pressed')) === 'false') await snapping.click();
        await seek(marker!.timeSec + 2 / px);
        const beforeSnap = spans(project)[0]!;
        await commitPointerEdit('marker-snap-split', 'keydown', () =>
          page.locator('body').press('s'),
        );
        assert(
          `f05 case ${index}: ruler snaps within two pixels of saved marker`,
          near(mainClips(project)[0]!.durationSec, marker!.timeSec) &&
            near(spans(project)[0]!.sourceIn, beforeSnap.sourceIn) &&
            near(spans(project).at(-1)!.sourceOut, beforeSnap.sourceOut),
        );
        invariant('marker-snap-split');
        for (const kind of ['Video', 'Audio']) {
          await page.getByRole('button', { name: 'Track', exact: true }).click();
          await commitPointerEdit(`add-${kind}-track`, 'pointerup', () =>
            page.getByRole('menuitem', { name: `${kind} track`, exact: true }).click(),
          );
          assert(
            `f05 case ${index}: native ${kind} track is stored`,
            project.tracks.filter((t) => t.kind === kind.toLowerCase()).length ===
              (kind === 'Video' ? 2 : 1),
          );
        }
        const audioTrack = project.tracks.find((t) => t.kind === 'audio')!;
        await post(id, 'apply_commands', {
          expectedRevision: project.revision,
          commands: [
            {
              commandType: 'upsert_clip',
              trackId: audioTrack.id,
              clip: {
                id: 'recorded-waveform',
                kind: 'audio',
                timelineStartSec: 0,
                durationSec: project.durationSec,
                source: video(project).source,
                sourceInSec: [0.7, 3.4, 10.95][index],
                playbackRate: values.speed,
                volume: 0.5,
              },
            },
          ],
        });
        project = await getProject(api, id);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const compareWaveforms = async (label: string) => {
          for (const audio of project.tracks.flatMap((t) => (t.kind === 'audio' ? t.clips : []))) {
            if (audio.kind !== 'audio') throw new Error('Expected audio clip');
            const waveform = page.locator(`[data-clip-id="${audio.id}"] svg path`);
            await expect(waveform).toBeVisible({ timeout: 30_000 });
            const reference = sourcePcm[0]!;
            const span = audio.durationSec * audio.playbackRate;
            const peaks = Array.from({ length: 60 }, (_, bucket) => {
              let peak = 0;
              for (
                let n = Math.ceil((audio.sourceInSec + (bucket * span) / 60) * 48000 - 1e-6);
                n < Math.ceil((audio.sourceInSec + ((bucket + 1) * span) / 60) * 48000 - 1e-6);
                n++
              )
                peak = Math.max(peak, Math.abs(reference[n] ?? 0));
              return Math.min(1, peak);
            });
            const valuesOf = (path: string | null) =>
              [...(path ?? '').matchAll(/L \d+ ([\d.]+)/g)]
                .slice(0, 60)
                .map((m) => (10 - Number(m[1])) / 10);
            const matches = (path: string | null) => {
              const values = valuesOf(path);
              const signal = peaks.reduce((sum, p) => sum + p, 0);
              const error = peaks.reduce(
                (sum, p, n) => sum + Math.abs(p - (values[n] ?? Infinity)),
                0,
              );
              return (
                values.length === 60 &&
                signal > 1e-9 &&
                error / signal < 0.1 &&
                values.every((v, n) => Math.abs(v - peaks[n]!) < 0.01)
              );
            };
            const path = await until(() => waveform.getAttribute('d'), matches, 15_000);
            const values = valuesOf(path);
            const maxError = Math.max(
              ...peaks.map((p, n) => Math.abs(p - (values[n] ?? Infinity))),
            );
            const relativeError =
              peaks.reduce((sum, p, n) => sum + Math.abs(p - (values[n] ?? Infinity)), 0) /
              peaks.reduce((sum, p) => sum + p, 0);
            writeFileSync(
              join(folder, `timeline-${index}-waveform-${label}-${audio.id}.json`),
              JSON.stringify({ audio, path, values, peaks, maxError, relativeError }, null, 2),
            );
            assert(
              `f05 case ${index}: ${label} waveform matches the retained source window`,
              matches(path),
              JSON.stringify({
                sourceIn: audio.sourceInSec,
                span,
                values,
                peaks,
                maxError,
                relativeError,
              }),
            );
          }
        };
        await compareWaveforms('initial');
        if ((await snapping.getAttribute('aria-pressed')) === 'true') await snapping.click();
        const beforeAudioTrim = project.tracks.flatMap((t) =>
          t.kind === 'audio' ? t.clips : [],
        )[0]!;
        await drag(
          page.locator('[data-clip-id="recorded-waveform"] [data-trim-handle="start"]'),
          0.137,
          'audio-start-trim',
        );
        const afterAudioTrim = project.tracks.flatMap((t) =>
          t.kind === 'audio' ? t.clips : [],
        )[0]!;
        assert(
          `f05 case ${index}: audio trim preserves the retained source end`,
          beforeAudioTrim.kind === 'audio' &&
            afterAudioTrim.kind === 'audio' &&
            near(
              beforeAudioTrim.sourceInSec +
                beforeAudioTrim.durationSec * beforeAudioTrim.playbackRate,
              afterAudioTrim.sourceInSec + afterAudioTrim.durationSec * afterAudioTrim.playbackRate,
            ),
        );
        await compareWaveforms('trimmed');
        await seek(0.6);
        await page
          .locator('[data-clip-id="recorded-waveform"]:visible')
          .click({ position: { x: 12, y: 20 } });
        await commitPointerEdit('audio-split', 'keydown', () => page.locator('body').press('s'));
        assert(
          `f05 case ${index}: native audio split produces two independent windows`,
          project.tracks.flatMap((t) => (t.kind === 'audio' ? t.clips : [])).length === 2,
        );
        await compareWaveforms('split');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await compareWaveforms('reloaded');
        writeFileSync(join(folder, `timeline-${index}-native.png`), await page.screenshot());
        const reloaded = await getProject(api, id);
        assert(
          `f05 case ${index}: reload preserves all tracks, clips and markers`,
          JSON.stringify(reloaded) === JSON.stringify(project),
        );
        await post(id, 'undo', { toRevision: initial.revision });
        const undone = await getProject(api, id);
        assert(
          `f05 case ${index}: complete undo restores the initial source, tracks and markers`,
          JSON.stringify(undone.tracks) === JSON.stringify(initial.tracks) &&
            JSON.stringify(undone.markers) === JSON.stringify(initial.markers),
        );
        continue;
      }
      const setSlider = async (label: string, value: number) => {
        const group = page.getByRole('group', { name: label, exact: true });
        const slider = group.getByRole('slider');
        const control = group.locator('[data-slot="slider-track"]');
        await control.scrollIntoViewIfNeeded();
        const bounds = await slider.evaluate((element) => ({
          min: Number(
            element instanceof HTMLInputElement
              ? element.min
              : element.getAttribute('aria-valuemin'),
          ),
          max: Number(
            element instanceof HTMLInputElement
              ? element.max
              : element.getAttribute('aria-valuemax'),
          ),
          html: element.outerHTML,
        }));
        const { min, max } = bounds;
        writeFileSync(
          join(folder, `case-${index}-${label.replaceAll(' ', '-')}-slider.json`),
          JSON.stringify(bounds, null, 2),
        );
        assert(
          `${FEATURE} case ${index}: ${label} native slider has valid bounds`,
          Number.isFinite(min) && Number.isFinite(max) && max > min,
        );
        const thumbControl = group.locator('[data-slot="slider-thumb"]');
        await thumbControl.hover();
        const box = await control.locator('..').boundingBox();
        const thumb = await thumbControl.boundingBox();
        if (!box || !thumb) throw new Error(`No ${label} control or thumb`);
        const pointerHit = await page.evaluate(
          ({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            return {
              label: element?.closest('[data-slot="slider"]')?.getAttribute('aria-label'),
              thumb: Boolean(element?.closest('[data-slot="slider-thumb"]')),
            };
          },
          { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 },
        );
        writeFileSync(
          join(folder, `case-${index}-${label.replaceAll(' ', '-')}-slider.json`),
          JSON.stringify({ ...bounds, box, thumb, pointerHit }, null, 2),
        );
        assert(
          `${FEATURE} case ${index}: ${label} thumb is reachable`,
          pointerHit.label === label && pointerHit.thumb,
        );
        await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + thumb.width / 2 + ((value - min) / (max - min)) * (box.width - thumb.width),
          box.y + box.height / 2,
          { steps: 4 },
        );
        await expect
          .poll(async () => Number(await slider.getAttribute('aria-valuenow')), { timeout: 1000 })
          .toBeCloseTo(value, 6);
        await commitPointerEdit(label);
      };
      await setSlider('Scale', values.scale);
      await setSlider('Rotate', values.rotate);
      for (const [edge, value] of ['left', 'top', 'right', 'bottom'].map(
        (edge, i) => [edge, values.crop[i]!] as const,
      ))
        await setSlider(`Crop ${edge}`, value);
      await setSlider('Volume', values.gain);
      const frameBox = await page.getByTestId('stage-transform-box').locator('..').boundingBox();
      const moveBox = await page
        .getByRole('button', { name: 'Move selected clip', exact: true })
        .boundingBox();
      if (!frameBox || !moveBox) throw new Error('Native position handle missing');
      const from = {
        x:
          (Math.max(moveBox.x, frameBox.x) +
            Math.min(moveBox.x + moveBox.width, frameBox.x + frameBox.width)) /
          2,
        y:
          (Math.max(moveBox.y, frameBox.y) +
            Math.min(moveBox.y + moveBox.height, frameBox.y + frameBox.height)) /
          2,
      };
      const hit = await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
        from,
      );
      writeFileSync(
        join(folder, `case-${index}-position-pointer.json`),
        JSON.stringify({ frameBox, moveBox, from, hit }, null, 2),
      );
      assert(
        `f06 case ${index}: position handle is reachable`,
        hit === 'Move selected clip',
        JSON.stringify({ from, hit }),
      );
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + frameBox.width * 0.04, from.y - frameBox.height * 0.02, {
        steps: 4,
      });
      await commitPointerEdit('Position');
      await setSlider('Speed', values.speed);
      const c = video(project);
      assert(
        `f06 case ${index}: native inspector fields and source span persist`,
        Math.abs(c.transform.scaleX + values.scale) < 0.026 &&
          Math.abs(c.transform.scaleY - (values.scale * 0.75) / 0.9) < 0.026 &&
          Math.abs(c.transform.rotationDeg - values.rotate) < 2.6 &&
          Math.abs(c.volume! - values.gain) < 0.026 &&
          Math.abs(c.playbackRate - values.speed) < 0.026 &&
          Math.abs(c.durationSec * c.playbackRate - 4) < 0.001 &&
          c.sourceInSec === 0.2 &&
          c.transform.anchorX === 0.25 &&
          c.transform.anchorY === 0.75 &&
          Math.abs(c.transform.position.x - 0.54) < 0.003 &&
          Math.abs(c.transform.position.y - 0.48) < 0.003 &&
          Object.values(c.crop).every((v, i) => Math.abs(v - values.crop[i]!) < 0.006),
        JSON.stringify(c),
      );
      writeFileSync(join(folder, `case-${index}-readback.json`), JSON.stringify(project, null, 2));
      await page.reload();
      await expect(clip).toBeVisible({ timeout: 30_000 });
      assert(
        `f06 case ${index}: inspector state survives reload`,
        JSON.stringify(video(await getProject(api, id))) === JSON.stringify(c),
      );
      const rendered = await compositor.evaluate(
        (input) => window.__editorV2DurableRenderBench.renderTimeline(input),
        request(project),
      );
      const output = join(folder, `case-${index}.mp4`);
      writeFileSync(output, Buffer.from(rendered.base64, 'base64'));
      assert(
        `f06 case ${index}: rendered duration follows constant speed`,
        Math.abs(rendered.durationSec - c.durationSec) < 1 / 30 + 0.001 &&
          rendered.width === 360 &&
          rendered.height === 640,
      );
      const pictures = [];
      const backgroundRgb = [1, 3, 5].map((offset) =>
        Number.parseInt(values.background.slice(offset, offset + 2), 16),
      );
      for (const time of [0.4, 1.2, 2.2]) {
        const ruler = page.locator('[data-timeline-ruler]:visible');
        const rb = await ruler.boundingBox();
        const cb = await clip.boundingBox();
        if (!rb || !cb) throw new Error('Seek geometry missing');
        await ruler.click({ position: { x: (time * cb.width) / c.durationSec, y: rb.height / 2 } });
        const nativeCanvas = page.getByTestId('media-effect-preview').first();
        await expect
          .poll(async () => Number(await nativeCanvas.getAttribute('data-time-sec')))
          .toBeCloseTo(time, 2);
        await expect
          .poll(async () => Number(await nativeCanvas.getAttribute('data-source-sec')))
          .toBeCloseTo(c.sourceInSec + time * c.playbackRate, 2);
        const videoElement = page.getByTestId('edit-stage').locator('video').first();
        await expect
          .poll(() => videoElement.evaluate((v) => v.currentTime))
          .toBeCloseTo(c.sourceInSec + time * c.playbackRate, 2);
        const frame = videoElement.locator('..'),
          png = join(folder, `case-${index}-native-${time}.png`);
        writeFileSync(png, await frame.screenshot());
        const native = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            png,
            '-vf',
            'scale=360:640',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
          ],
          { maxBuffer: 4_000_000, timeout: 20_000 },
        );
        const encoded = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-ss',
            String(time),
            '-i',
            output,
            '-frames:v',
            '1',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
          ],
          { maxBuffer: 4_000_000, timeout: 20_000 },
        );
        const error =
          native.reduce((sum, v, i) => sum + Math.abs(v - encoded[i]!), 0) / native.length;
        assert(
          `f06 case ${index}: native and encoded frames at ${time}s contain visible media`,
          [native, encoded].every(
            (pixels) =>
              pixels.filter((v, i) => Math.abs(v - backgroundRgb[i % 3]!) > 32).length > 1000,
          ),
        );
        const backgroundErrors = [native, encoded].map((pixels) => {
          let difference = 0;
          for (let y = 16; y < 24; y++)
            for (let x = 16; x < 24; x++)
              for (let channel = 0; channel < 3; channel++)
                difference += Math.abs(
                  pixels[(y * 360 + x) * 3 + channel]! - backgroundRgb[channel]!,
                );
          return difference / (8 * 8 * 3);
        });
        assert(
          `f06 case ${index}: stored canvas background matches native and encoded plate at ${time}s`,
          project.canvas.backgroundColor === values.background &&
            backgroundErrors.every((value) => value < 4),
          JSON.stringify({ color: values.background, backgroundErrors }),
        );
        pictures.push({ time, error, backgroundErrors });
      }
      assert(
        `f06 case ${index}: transform and asymmetric crop preview match encoded picture`,
        pictures.every((p) => p.error < 12),
        JSON.stringify(pictures),
      );
      const preview = await compositor.evaluate(
        (input) => window.__editorV2DurableRenderBench.previewTimelineAudio(input),
        request(project),
      );
      const nativePcm = preview.channelsBase64.map((encoded, channel) => {
        const raw = Buffer.from(encoded, 'base64');
        writeFileSync(join(folder, `case-${index}-preview-channel-${channel}.f32`), raw);
        return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      });
      const encodedPcm = pcm(output);
      assert(
        `f06 case ${index}: preview and export retain both audio channels`,
        preview.sampleRate === 48000 && nativePcm.length === 2 && encodedPcm.length === 2,
      );
      const audioErrors = [nativePcm, encodedPcm].flatMap((channels, outputIndex) =>
        channels.map((audio, channel) => {
          let energy = 0,
            error = 0;
          for (const sec of [0.4, 1.2, 2.2])
            for (let n = 0; n < 1920; n++) {
              const at = sec + n / 48000,
                expected = sourceAt(c.sourceInSec + at * c.playbackRate, channel) * c.volume!;
              energy += expected ** 2;
              error += ((audio[Math.round(at * 48000)] ?? 0) - expected) ** 2;
            }
          return {
            output: outputIndex === 0 ? 'preview' : 'export',
            channel,
            energy,
            relativeError: error / energy,
          };
        }),
      );
      assert(
        `f06 case ${index}: native gain and speed audio match source and encoded output`,
        audioErrors.every((a) => a.energy > 1e-12 && a.relativeError < 0.05),
        JSON.stringify(audioErrors),
      );
      writeFileSync(
        join(folder, `case-${index}-parity.json`),
        JSON.stringify(
          {
            pictures,
            audioErrors,
            rendered: {
              durationSec: rendered.durationSec,
              width: rendered.width,
              height: rendered.height,
            },
          },
          null,
          2,
        ),
      );
      await post(id, 'undo', { toRevision: project.revision - 1 });
      const undone = await getProject(api, id);
      assert(
        `f06 case ${index}: inspector speed is undoable without losing crop or gain`,
        video(undone).playbackRate === 1 &&
          JSON.stringify(video(undone).crop) === JSON.stringify(c.crop) &&
          video(undone).volume === c.volume,
      );
    }
    assert('f06 native page has no uncaught errors', errors.length === 0, errors.join(' | '));
  } catch (error) {
    check('f06 journey completed', false, error instanceof Error ? error.message : String(error));
  } finally {
    note(
      `speed samples: ${JSON.stringify({ [GRAPH_JOURNEY ? 'graph_pool' : IMPORT_JOURNEY ? 'import' : TIMELINE_JOURNEY ? 'timeline' : 'inspector']: timings.map((t) => t.durationMs) })}`,
    );
    note(
      `${FEATURE} native ${IMPORT_JOURNEY ? 1000 : 200}ms gate: ${timings.length >= 3 && timings.every((t) => t.durationMs <= (IMPORT_JOURNEY ? 1000 : 200)) ? 'PASS' : 'OPEN'}; every sample retained, no excluded slow saves`,
    );
    writeFileSync(join(folder, 'save-timings.json'), JSON.stringify(timings, null, 2));
    if (IMPORT_JOURNEY) {
      check(
        `${FEATURE} every full native import and refresh passes1000ms`,
        timings.length === (GRAPH_JOURNEY ? 4 : 3) &&
          timings.every((t) => t.durationMs > 0 && t.durationMs <= 1000),
      );
      writeFileSync(join(folder, 'network.json'), JSON.stringify(network, null, 2));
    }
    if (TIMELINE_JOURNEY)
      check(
        'f05 every representative native save passes200ms',
        timings.length >= 3 && timings.every((t) => t.durationMs > 0 && t.durationMs <= 200),
      );
    await context?.close();
    try {
      await removeProjects(admin, BRAND, ids);
      if (ids.length) {
        const { count, error } = await admin
          .schema('media')
          .from('editor_projects')
          .select('id', { count: 'exact', head: true })
          .in('id', ids);
        const { count: revisions, error: revError } = await admin
          .schema('media')
          .from('editor_project_revisions')
          .select('project_id', { count: 'exact', head: true })
          .in('project_id', ids);
        assert(
          'f06 owned projects and revisions removed',
          !error && !revError && count === 0 && revisions === 0,
        );
      }
      if (roomIds.length) {
        const sessions = admin.schema('brand_profiles').from('canvas_sessions');
        const { error: sessionError } = await sessions
          .delete()
          .eq('brand_profile_id', BRAND)
          .in('room_id', roomIds);
        const { error: roomError } = await admin
          .schema('brand_profiles')
          .from('canvas_rooms')
          .delete()
          .eq('brand_profile_id', BRAND)
          .in('id', roomIds);
        const { count, error: countError } = await sessions
          .select('room_id', { count: 'exact', head: true })
          .in('room_id', roomIds);
        assert(
          'f02 owned Canvas sessions and rooms removed',
          !sessionError && !roomError && !countError && count === 0,
          JSON.stringify({ sessionError, roomError, countError, count }),
        );
      }
      if (session && brandChanged) {
        const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
        const { error } =
          previousBrand === undefined
            ? await prefs.delete().eq('user_id', session.userId)
            : await prefs.upsert(
                {
                  user_id: session.userId,
                  active_brand_id: previousBrand,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' },
              );
        assert('f06 bench preference restored', !error);
      }
      if (session) {
        const { error } = await admin.auth.admin.signOut(session.accessToken, 'local');
        assert('f06 owned session revoked', !error);
      }
      if (owned) {
        const { error: storageError } = await admin.storage
          .from('media-library')
          .remove([owned.path, ...(owned.headPath ? [owned.headPath] : [])]);
        const { error: assetError } = owned.assetId
          ? await admin
              .schema('media')
              .from('assets')
              .delete()
              .eq('id', owned.assetId)
              .eq('brand_id', BRAND)
          : { error: null };
        assert('f06 owned media removed', !storageError && !assetError);
        if (owned.versionReceiptKey) {
          assert(
            `${FEATURE} version receipt key is safe`,
            /^import-head-[a-f0-9]{8}$/.test(owned.versionReceiptKey),
          );
          const left = execFileSync(
            'docker',
            [
              'exec',
              'supabase_db_continuum',
              'psql',
              '-U',
              'postgres',
              '-d',
              'postgres',
              '-v',
              'ON_ERROR_STOP=1',
              '-Atc',
              `delete from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${owned.versionReceiptKey}'; select count(*) from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${owned.versionReceiptKey}';`,
            ],
            { encoding: 'utf8', stdio: 'pipe' },
          );
          assert(
            `${FEATURE} owned version receipt removed`,
            left.trim().split('\n').at(-1) === '0',
          );
        }
        if (owned.receiptKey) {
          assert(
            'f06 owned receipt identity is safe',
            /^generated:[a-f0-9]{64}$/.test(owned.receiptKey) && /^[a-f0-9-]{36}$/.test(BRAND),
          );
          const left = execFileSync(
            'docker',
            [
              'exec',
              'supabase_db_continuum',
              'psql',
              '-U',
              'postgres',
              '-d',
              'postgres',
              '-v',
              'ON_ERROR_STOP=1',
              '-Atc',
              `delete from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${owned.receiptKey}'; select count(*) from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${owned.receiptKey}';`,
            ],
            { stdio: 'pipe', encoding: 'utf8' },
          );
          assert('f06 owned receipt removed', left.trim().split('\n').at(-1) === '0');
        }
      }
    } catch (error) {
      check('f06 cleanup', false, error instanceof Error ? error.message : String(error));
    }
    for (const server of servers.reverse()) server.stop();
  }
  const failures = printEnvelope();
  writeFileSync(
    join(folder, 'summary.json'),
    JSON.stringify({ bench: BENCH, results, notes, counts: rec.summary() }, null, 2),
  );
  expect(failures, 'graded FAIL steps').toBe(0);
});
