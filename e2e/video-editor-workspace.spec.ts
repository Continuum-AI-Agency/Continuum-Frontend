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
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import type { DurableTimelineRequest } from './support/editorV2DurableRenderBenchEntry';
import { loadLocalSupabaseEnv, loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import {
  brandObjectCount,
  objectsFor,
  removeAssets,
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

const BENCH = 'videoeditor:workspace:e2e:bench';
const INSPECTOR_JOURNEY = process.env.VIDEO_EDITOR_INSPECTOR_JOURNEY === '1';
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
  let brandObjectsBefore = Number.NaN;
  try {
    brandObjectsBefore = await brandObjectCount(BRAND);
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
      const removedProjects = await removeProjects(admin, BRAND, createdProjects);
      const removed = await removeAssets(admin, BRAND, createdAssets);
      note(
        `cleanup: ${removedProjects} project(s), ${removed.rows} asset row(s), ${removed.objects} storage object(s)`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const lateObjects = await objectsFor(BRAND, createdAssets);
      if (lateObjects.length > 0) await removeAssets(admin, BRAND, createdAssets);
      const { count: leftRows } = await admin
        .schema('media')
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', BRAND)
        .eq('file_name', DROP_NAME);
      const leftObjects = (await objectsFor(BRAND, createdAssets)).length;
      const { count: leftProjects } = await admin
        .schema('media')
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in(
          'id',
          createdProjects.length > 0 ? createdProjects : ['00000000-0000-0000-0000-000000000000'],
        );
      check(
        'net zero: no media.assets rows, storage objects or projects left from this run',
        (leftRows ?? 0) === 0 && leftObjects === 0 && (leftProjects ?? 0) === 0,
        `rows ${leftRows ?? 0}, objects ${leftObjects}, projects ${leftProjects ?? 0}`,
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
  let owned: { path: string; assetId?: string; receiptKey?: string } | undefined;
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
      'f06 scope: full native transform/crop/gain/constant-speed inspection, real loopback Library/HTTP/store, browser compositor. Original hosted upload/drop workspace case, native Export dialog and hosted Render are not exercised.',
    );
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
      Number(probe.format.duration) >= 4.2,
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
                  playbackRate: 1,
                  transform: { scaleX: -0.9, scaleY: 0.75, anchorX: 0.25, anchorY: 0.75 },
                  audioEnabled: true,
                  volume: 1,
                },
              ],
            },
          },
        ],
      });
      await page.reload();
      const clip = page.locator('[data-clip-id="recorded"]:visible');
      await expect(clip).toBeVisible({ timeout: 30_000 });
      const clipBox = await clip.boundingBox();
      if (!clipBox) throw new Error('Clip box absent');
      await clip.click({ position: { x: clipBox.width * 0.1, y: clipBox.height / 2 } });
      let project = await getProject(api, id);
      const commitPointerEdit = async (label: string) => {
        await page.evaluate(() =>
          window.addEventListener(
            'pointerup',
            () => {
              (window as unknown as { __inspectorCommitAt: number }).__inspectorCommitAt =
                performance.now();
            },
            { capture: true, once: true },
          ),
        );
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${id}/commands`) && r.request().method() === 'POST',
          { timeout: 20_000 },
        );
        await page.mouse.up();
        const response = await responsePromise;
        await response.finished();
        assert(`f06 case ${index}: ${label} control saves successfully`, response.status() === 200);
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
          `f06 case ${index}: ${label} save timing is retained`,
          Number.isFinite(timing.durationMs) && timing.durationMs > 0,
        );
        timings.push({ case: index, control: label, ...timing, revision: saved.project.revision });
        project = await getProject(api, id);
        assert(
          `f06 case ${index}: ${label} acknowledgement matches persisted revision`,
          project.revision === saved.project.revision,
        );
      };
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
          `f06 case ${index}: ${label} native slider has valid bounds`,
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
          `f06 case ${index}: ${label} thumb is reachable`,
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
    note(`speed samples: ${JSON.stringify({ inspector: timings.map((t) => t.durationMs) })}`);
    note(
      `f06 inspector 200ms gate: ${timings.length >= 3 && timings.every((t) => t.durationMs <= 200) ? 'PASS' : 'OPEN'}; every sample retained, no excluded slow saves`,
    );
    writeFileSync(join(folder, 'save-timings.json'), JSON.stringify(timings, null, 2));
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
          .remove([owned.path]);
        const { error: assetError } = owned.assetId
          ? await admin
              .schema('media')
              .from('assets')
              .delete()
              .eq('id', owned.assetId)
              .eq('brand_id', BRAND)
          : { error: null };
        assert('f06 owned media removed', !storageError && !assetError);
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
