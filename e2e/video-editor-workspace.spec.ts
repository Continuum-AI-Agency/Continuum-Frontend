import { randomUUID } from 'node:crypto';
import type { EditorProjectV2 } from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
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
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
/** Where the Backend keeps transcripts per version (its AI_STUDIO_BUCKET default). */
const KEPT_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
/** "Solicita tu Day Pass en Vivo 4047" — a 6.6 s Vivo 47 clip with its own speech. */
const SOURCE_ASSET_ID =
  process.env.VIDEO_WORKSPACE_SOURCE_ASSET ?? 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const LIVE_EDIT_BUDGET_MS = 3_000;
const RUN = randomUUID().slice(0, 8);
const DROP_NAME = `bench-video-workspace-${RUN}.mp4`;

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

/**
 * The first footage a page places offers the First-cut Brief (a modal). This journey is
 * not about first cuts, so it closes the offer — and reports whether it came.
 */
async function dismissBriefOffer(page: Page): Promise<boolean> {
  const brief = page.getByRole('dialog', { name: 'First cut' });
  try {
    await brief.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    return false;
  }
  await page.keyboard.press('Escape');
  await brief.waitFor({ state: 'hidden', timeout: 10_000 });
  return true;
}

test(BENCH, async ({ browser }) => {
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
    check(
      'the first drop offers the First-cut Brief, and it closes (this bench is not about first cuts)',
      await dismissBriefOffer(page),
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
      // The auto-offered Brief warms the drop's transcript, which the Backend keeps per version
      // (sourceMedia keptTranscriptPath) — named by version, so the asset deletes never reach it.
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
