import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type EditorProjectV2,
  parseFrame,
  type VideoEditorAgentFrame,
  type VideoEditorOpInput,
  type VideoEditorOpName,
  type VideoEditorOpOutput,
  videoEditorAgentFrameSchema,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { prodSql } from '../../Continuum-Backend/scripts/_bench/managementSql';
import {
  connectMcp,
  type McpConnection,
  selectBrand,
  toolPayload,
} from '../../Continuum-Backend/scripts/_bench/mcp';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import {
  bandScore,
  captionBand,
  captionWindows,
  classifyFrames,
  decodeBand,
  decodeBandRgb,
  ffprobe,
  highlightMask,
  judgeWordTiming,
  type Probe,
  spokenWordPerFrame,
} from './video-editor-journey/frames';
import { openRenderProxy, type RenderProxy } from './video-editor-journey/renderProxy';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { removeAssets, removeProjects } from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// video-editor:e2e:bench — the Video Studio V1 deploy gate: ONE journey in a real browser,
// as the bench login on the bench brand, against PRODUCTION Supabase, a local Backend from
// this tree (every worker off) and a Next dev server:
//
//   /studio/video/new → drop a real speech+music recording → TYPE one Agent-tab turn
//   ("Cut the pauses, add captions, cut to the beat and make it TikTok.") → an add_text
//   made OUTSIDE the page through the real /mcp/v2 `video_editor` tool shows up live →
//   Export → TikTok renders on a DEPLOYED Render revision into a downloadable MP4 →
//   the burned captions are timed right, judged per frame against a captionMode 'none'
//   export of the same revision → net zero.
//
// Render: the revision given by --render-url (run.mjs puts it in VIDEO_EDITOR_RENDER_URL),
// reached through a loopback proxy carrying the operator's gcloud identity. The default is
// the no-traffic `styles` revision, which serves the compositor that reads caption words
// clip-relative; production traffic still serves the old one, which burns captions early.
//
// Source: "The Perfect Everyday Pink Lipstick", a 14 s bench-brand reel — speech with
// pauses over a continuous music bed — downloaded read-only and dropped as a new file.
// Writes, only under BENCH_SINK=library: one editor project, the Library asset the drop
// registers and the two exports — all deleted at exit, net zero asserted by id and name.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 2_700_000 });

const BENCH = 'video-editor:e2e:bench';
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const SOURCE_ASSET_ID =
  process.env.VIDEO_JOURNEY_SOURCE_ASSET ?? 'd308f33c-98fe-4ed1-9763-ea0a939cb546';
const RENDER_URL =
  process.env.VIDEO_EDITOR_RENDER_URL ??
  'https://styles---continuum-render-xhdlroxena-uw.a.run.app';
const PROMPT = 'Cut the pauses, add captions, cut to the beat and make it TikTok.';
const LIVE_EDIT_BUDGET_MS = 3_000;
const EXPORT_BUDGET_MS = 15 * 60_000;
const RUN = randomUUID().slice(0, 8);
const DROP_NAME = `bench-video-journey-${RUN}.mp4`;
const TITLE = `Everyday pink ${RUN}`;
/** A caption band that moved this much (fraction of glyph-strength pixels) is burned. */
const IN_WINDOW_MIN = 0.002;
/** Outside every window the band is the same picture, up to encoder noise. */
const OUT_WINDOW_MAX = 0.0005;
const OUT_WINDOW_MEAN_MAX = 2;

const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();
process.env.SUPABASE_URL = supabaseUrl;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const media = admin.schema('media');
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

// ── the Backend's doors, as the bench user ────────────────────────────────────────────

type Api = { base: string; token: string };
type Project = VideoEditorOpOutput<'get_project'> & { project: EditorProjectV2 };

async function runOp<N extends VideoEditorOpName>(
  api: Api,
  projectId: string,
  op: N,
  input: Omit<VideoEditorOpInput<N>, 'projectId'>,
): Promise<VideoEditorOpOutput<N>> {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}/ops/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${op} → ${response.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body) as VideoEditorOpOutput<N>;
}
const getProject = async (api: Api, projectId: string): Promise<Project> => {
  const read = await runOp(api, projectId, 'get_project', { full: true });
  if (!read.project) throw new Error('get_project full=true returned no project document');
  return read as Project;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await sleep(1_000);
    value = await read();
  }
  return value;
}

// ── the timeline, read ────────────────────────────────────────────────────────────────

const clipsOfKind = (project: EditorProjectV2, kind: string) =>
  project.tracks.flatMap((track) => track.clips.filter((clip) => clip.kind === kind));
const mainClips = (project: EditorProjectV2) => {
  const main = project.tracks
    .filter((track) => track.kind === 'video')
    .sort((left, right) => left.order - right.order)[0];
  return (main?.clips ?? [])
    .flatMap((clip) => (clip.kind === 'video' ? [clip] : []))
    .toSorted((left, right) => left.timelineStartSec - right.timelineStartSec);
};
const assetOf = (clip: { source?: unknown }) => {
  const source = clip.source as { sourceType?: string; assetId?: string } | undefined;
  return source?.sourceType === 'library_asset' ? (source.assetId ?? '') : '';
};

/**
 * Every picture boundary, told apart by what joins there. A beat cut SPLITS a clip, so the
 * source runs on across it; a pause cut joins two pieces with the pause removed between
 * them, so the source jumps. Only splits are claimed to sit on beats.
 */
function pictureBoundaries(project: EditorProjectV2) {
  const clips = mainClips(project);
  const splits: number[] = [];
  const joins: number[] = [];
  for (let index = 1; index < clips.length; index++) {
    const left = clips[index - 1];
    const right = clips[index];
    if (!left || !right) continue;
    const runsOn =
      assetOf(left) === assetOf(right) &&
      Math.abs(right.sourceInSec - (left.sourceInSec + left.durationSec * left.playbackRate)) <
        1e-3;
    (runsOn ? splits : joins).push(right.timelineStartSec);
  }
  return { splits, joins };
}

const clockSec = (label: string) => {
  const match = /\/\s*(\d+):(\d+(?:\.\d+)?)/.exec(label);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
};

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

// ── net zero, by id and name ──────────────────────────────────────────────────────────

async function brandAssetIds(): Promise<Set<string>> {
  const rows = await prodSql<{ id: string }>(
    `select id::text as id from media.assets where brand_id = '${BRAND}'`,
  );
  if (rows === null) throw new Error('net zero needs the Supabase management token');
  return new Set(rows.map((row) => row.id));
}
async function brandObjectNames(): Promise<Set<string>> {
  const rows = await prodSql<{ name: string }>(
    `select bucket_id || '/' || name as name from storage.objects where name like '${BRAND}/%'`,
  );
  if (rows === null) throw new Error('net zero needs the Supabase management token');
  return new Set(rows.map((row) => row.name));
}

async function awaitExport(api: Api, projectId: string, jobId: string) {
  const deadline = Date.now() + EXPORT_BUDGET_MS;
  let status = await runOp(api, projectId, 'export_status', { jobId });
  while ((status.state === 'queued' || status.state === 'running') && Date.now() < deadline) {
    await sleep(5_000);
    status = await runOp(api, projectId, 'export_status', { jobId });
  }
  return status;
}

const probeLine = (probe: Probe, timelineSec: number) =>
  `${probe.codec} ${probe.width}×${probe.height}, ${probe.frames} frames, picture ${probe.videoSec.toFixed(3)} s vs timeline ${timelineSec.toFixed(3)} s (Δ ${(Math.abs(probe.videoSec - timelineSec) * 30).toFixed(2)} frames)`;

test(BENCH, async ({ browser }) => {
  const sinkLibrary = process.env.BENCH_SINK === 'library';
  if (
    !check('Library sink enabled for the upload + export hops', sinkLibrary, 'BENCH_SINK=library')
  ) {
    printEnvelope();
    expect(sinkLibrary, 'run through the package script: the journey writes Library rows').toBe(
      true,
    );
    return;
  }
  const servers: Server[] = [];
  const createdProjects: string[] = [];
  const createdAssets: { id: string; storagePath: string }[] = [];
  const scratch = mkdtempSync(join(tmpdir(), 'video-journey-'));
  let proxy: RenderProxy | null = null;
  let mcp: McpConnection | null = null;
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let assetsBefore = new Set<string>();
  let objectsBefore = new Set<string>();
  const exercised = new Set<string>();
  try {
    assetsBefore = await brandAssetIds();
    objectsBefore = await brandObjectNames();
    note(
      `net zero baseline: ${assetsBefore.size} media.assets rows, ${objectsBefore.size} objects under ${BRAND}/`,
    );

    // ── Render revision, servers, identity ────────────────────────────────────────────
    proxy = await openRenderProxy(RENDER_URL);
    const health = await fetch(`${proxy.url}/health`).then(
      async (response) => ({ status: response.status, body: await response.text() }),
      (error: unknown) => ({ status: 0, body: String(error) }),
    );
    if (
      !check(
        'the given Render revision answers through the gcloud-identity proxy',
        health.status === 200,
        `${proxy.target} → ${health.status} ${health.body.slice(0, 160)}`,
      )
    )
      return;
    const fePort = await freePort();
    const backend = await bootBackend(`http://localhost:${fePort}`, {
      CONTINUUM_RENDER_SERVICE_URL: proxy.url,
    });
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url, '.next/video-journey-e2e');
    servers.push(frontend);
    note(
      `local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}; Render ${proxy.target}`,
    );
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

    // ── the source recording, read-only ───────────────────────────────────────────────
    const { data: source } = await media
      .from('assets')
      .select('bucket, storage_path, duration_ms, title')
      .eq('id', SOURCE_ASSET_ID)
      .eq('brand_id', BRAND)
      .single();
    const download = source
      ? await admin.storage.from(source.bucket).download(source.storage_path)
      : null;
    const bytes = download?.data ? Buffer.from(await download.data.arrayBuffer()) : null;
    if (
      !check(
        'existing bench-brand speech+music recording downloads (read-only)',
        Boolean(bytes),
        `${SOURCE_ASSET_ID} "${source?.title}" ${bytes?.length ?? 0} B`,
      ) ||
      !bytes
    )
      return;
    const sourceSec = (source?.duration_ms ?? 0) / 1_000;

    // ── 1. /studio/video/new, drop the recording ──────────────────────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
    await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
    const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
    createdProjects.push(projectId);
    await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
      timeout: 180_000,
    });
    await dropFile(page, page.locator('[aria-label="Timeline lanes"]:visible'), bytes, DROP_NAME);
    await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(1, {
      timeout: 180_000,
    });
    const dropped = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value.project).length === 1,
      30_000,
    );
    const droppedClip = mainClips(dropped.project)[0];
    const droppedAssetId = droppedClip ? assetOf(droppedClip) : '';
    const { data: droppedRow } = await media
      .from('assets')
      .select('id, storage_path, file_name, brand_id')
      .eq('id', droppedAssetId || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    if (droppedRow) createdAssets.push({ id: droppedRow.id, storagePath: droppedRow.storage_path });
    check(
      'drop: the recording uploads through the Library path onto V1 at 0 s, as long as its source',
      Boolean(
        droppedRow?.file_name === DROP_NAME &&
          droppedRow.brand_id === BRAND &&
          droppedClip?.timelineStartSec === 0 &&
          Math.abs(droppedClip.durationSec - sourceSec) < 0.15,
      ),
      `${projectId} · asset ${droppedAssetId} · clip ${droppedClip?.durationSec.toFixed(3)} s vs source ${sourceSec.toFixed(3)} s`,
    );
    exercised.add('drop');
    check(
      'the first drop offers the First-cut Brief, and it closes (this journey is not about first cuts)',
      await dismissBriefOffer(page),
    );
    const clock = page.locator('[data-testid="timeline-clock"]:visible');
    const clockBefore = clockSec(await clock.innerText());

    // ── 2. the Agent tab: one typed turn ──────────────────────────────────────────────
    await page.getByRole('tab', { name: 'Agent', exact: true }).filter({ visible: true }).click();
    const input = page.locator('[data-testid="editor-agent-input"]:visible');
    await input.click();
    await input.pressSequentially(PROMPT, { delay: 15 });
    const agentResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/ai-studio/video-projects/${projectId}/agent`) &&
        response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    const turnStarted = Date.now();
    await input.press('Enter');
    const stop = page.locator('[data-testid="editor-agent-stop"]:visible');
    await expect(stop).toHaveCount(1, { timeout: 30_000 });
    await expect(stop).toHaveCount(0, { timeout: 900_000 });
    const turnMs = Date.now() - turnStarted;
    const frames: VideoEditorAgentFrame[] = [];
    let unparsed = 0;
    for (const line of (await (await agentResponse).text()).split('\n')) {
      if (!line.trim()) continue;
      const frame = parseFrame(line, videoEditorAgentFrameSchema);
      if (frame) frames.push(frame);
      else unparsed += 1;
    }
    const tools = frames.flatMap((frame) => (frame.type === 'tool_result' ? [frame.data] : []));
    const okOps = new Set<string>(tools.filter((tool) => tool.ok).map((tool) => tool.op));
    const last = frames.at(-1);
    const turned = await getProject(api, projectId);
    check(
      'agent turn: the typed prompt streams to done and runs cut_silence, set_captions, beat_cut and set_format',
      unparsed === 0 &&
        frames[0]?.type === 'turn_start' &&
        last?.type === 'done' &&
        last.data.finalRevision === turned.revision &&
        ['cut_silence', 'set_captions', 'beat_cut', 'set_format'].every((op) => okOps.has(op)),
      `${(turnMs / 1000).toFixed(1)} s · ${frames.length} frames · ${tools.map((tool) => `${tool.op}${tool.ok ? '' : '✗'}`).join(', ')}${last?.type === 'error' ? ` · error ${last.data.message}` : ''}`,
    );
    for (const tool of tools)
      note(`agent chip: ${tool.op}${tool.ok ? '' : ' ✗'} — ${tool.summary}`);
    exercised.add('agent');

    const captionClips = clipsOfKind(turned.project, 'caption');
    const captionWords = captionClips.reduce(
      (sum, clip) => sum + (clip.kind === 'caption' ? clip.words.length : 0),
      0,
    );
    const beats = turned.markers.filter((marker) => marker.kind === 'beat').map((m) => m.timeSec);
    const frameSec = turned.project.frameRate.denominator / turned.project.frameRate.numerator;
    const { splits, joins } = pictureBoundaries(turned.project);
    const worstBeatFrames = Math.max(
      0,
      ...splits.map((cut) => Math.min(...beats.map((beat) => Math.abs(beat - cut))) / frameSec),
    );
    check(
      'get_project after the turn: shorter than before',
      turned.durationSec < dropped.durationSec - 0.2,
      `${dropped.durationSec.toFixed(3)} s → ${turned.durationSec.toFixed(3)} s`,
    );
    check(
      'get_project after the turn: a caption track with words',
      captionClips.length > 0 && captionWords > 0,
      `${captionClips.length} caption lines · ${captionWords} words`,
    );
    check(
      'get_project after the turn: every new beat cut within one frame of a beat marker',
      beats.length > 0 && splits.length > 0 && worstBeatFrames <= 1 + 1e-6,
      `${beats.length} beat markers · ${splits.length} beat cuts (worst ${worstBeatFrames.toFixed(3)} frames) · ${joins.length} pause joins (not claimed on beat)`,
    );
    check(
      'get_project after the turn: 1080×1920 TikTok canvas',
      turned.width === 1080 && turned.height === 1920 && turned.exportPresetId === 'tiktok',
      `${turned.width}×${turned.height} · preset ${turned.exportPresetId ?? 'none'}`,
    );

    const pageClips = await page.locator('[data-clip-kind="video"]:visible').count();
    const pageCaptions = await page.locator('[data-clip-kind="caption"]:visible').count();
    const pageBeats = await page.locator('[data-beat-tick]:visible').count();
    const clockAfter = clockSec(await clock.innerText());
    const formatLabel = await page
      .getByRole('button', { name: 'Format' })
      .filter({ visible: true })
      .innerText();
    const revisionLabel = await page
      .locator('[data-testid="project-revision"]:visible')
      .innerText();
    check(
      'the page shows the turn: shorter clock, the cut clips, caption lines, beat ticks, TikTok, the revision',
      clockAfter < clockBefore - 0.2 &&
        Math.abs(clockAfter - turned.durationSec) < 0.06 &&
        pageClips === mainClips(turned.project).length &&
        pageCaptions === captionClips.length &&
        pageBeats > 0 &&
        /TikTok/i.test(formatLabel) &&
        revisionLabel.includes(`Revision ${turned.revision}`),
      `clock ${clockBefore} → ${clockAfter} s · ${pageClips} video clips · ${pageCaptions} captions · ${pageBeats} beat ticks · "${formatLabel.trim()}" · ${revisionLabel.trim()}`,
    );

    // ── 3. add_text from OUTSIDE the page, through the real /mcp/v2 ───────────────────
    mcp = await connectMcp({ baseUrl: `${backend.url}/mcp/v2`, bearer: session.accessToken });
    await selectBrand(mcp.client, BRAND);
    const added = (await mcp.client.callTool(
      {
        name: 'video_editor',
        arguments: { action: 'add_text', projectId, kind: 'title', text: TITLE, startSec: 0 },
      },
      undefined,
      { timeout: 120_000 },
    )) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    const committedAt = Date.now();
    const addedPayload = toolPayload(added) as {
      status?: string;
      result?: { clipId?: string; commit?: { revision: number } };
    };
    check(
      '/mcp/v2 video_editor add_text (a title at 0 s) commits',
      !added.isError && addedPayload.status === 'ok' && Boolean(addedPayload.result?.clipId),
      `${addedPayload.status} clip ${addedPayload.result?.clipId} r${addedPayload.result?.commit?.revision}${added.isError ? ` ${added.content?.[0]?.text?.slice(0, 300)}` : ''}`,
    );
    let liveMs = Number.NaN;
    try {
      await expect(page.locator('[data-clip-kind="text"]:visible', { hasText: TITLE })).toHaveCount(
        1,
        { timeout: LIVE_EDIT_BUDGET_MS },
      );
      liveMs = Date.now() - committedAt;
    } catch {
      liveMs = Number.NaN;
    }
    check(
      `the MCP title appears in the open page within ${LIVE_EDIT_BUDGET_MS / 1000} s`,
      Number.isFinite(liveMs) && liveMs <= LIVE_EDIT_BUDGET_MS,
      Number.isFinite(liveMs) ? `${liveMs} ms` : 'not seen',
    );
    exercised.add('mcp');

    // ── 4. Export → TikTok, from the dialog ───────────────────────────────────────────
    await page
      .getByRole('button', { name: 'Export', exact: true })
      .filter({ visible: true })
      .click();
    const dialog = page.locator('[data-testid="video-studio-export-dialog"]:visible');
    await expect(dialog).toHaveCount(1, { timeout: 30_000 });
    await dialog.locator('[data-testid="export-preset-tiktok"]').click();
    const exportClicked = Date.now();
    await dialog.locator('[data-testid="export-start"]').click();
    let progressSeen = '';
    try {
      await expect(dialog.getByText(/^(Queued|Rendering)/)).toHaveCount(1, { timeout: 60_000 });
      progressSeen = await dialog.getByText(/^(Queued|Rendering)/).innerText();
    } catch {
      progressSeen = '';
    }
    const complete = dialog.locator('[data-testid="export-complete"]');
    const failedText = dialog.locator('.text-destructive');
    await expect(complete.or(failedText)).toHaveCount(1, { timeout: EXPORT_BUDGET_MS });
    const exportMs = Date.now() - exportClicked;
    const downloadLink = complete.getByRole('link', { name: /Download MP4/ });
    const exportedOk = (await complete.count()) === 1 && (await downloadLink.count()) === 1;
    check(
      'Export dialog: TikTok renders on the given Render revision to completed, with a download',
      exportedOk,
      `${(exportMs / 1000).toFixed(1)} s · progress seen "${progressSeen}"${exportedOk ? '' : ` · ${await failedText.allInnerTexts()}`}`,
    );
    const exported = await getProject(api, projectId);
    const { data: jobs } = await media
      .from('client_render_jobs')
      .select('id, state, result_asset_ids, created_at')
      .eq('source_id', projectId)
      .order('created_at');
    const exportAssetIds = (jobs ?? []).flatMap(
      (job) => (job as { result_asset_ids: string[] | null }).result_asset_ids ?? [],
    );
    for (const id of exportAssetIds) {
      const { data: row } = await media
        .from('assets')
        .select('id, storage_path')
        .eq('id', id)
        .maybeSingle();
      if (row) createdAssets.push({ id: row.id, storagePath: row.storage_path });
    }
    if (!exportedOk) return;
    exercised.add('export');

    const burnedPath = join(scratch, 'tiktok.mp4');
    const href = (await downloadLink.getAttribute('href')) ?? '';
    const downloadEvent = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
    await downloadLink.click();
    const saved = await downloadEvent;
    if (saved) await saved.saveAs(burnedPath);
    else writeFileSync(burnedPath, Buffer.from(await (await fetch(href)).arrayBuffer()));
    check(
      'Download MP4 downloads the file (and the editor stays open)',
      Boolean(saved) && /\/studio\/video\//.test(page.url()),
      saved
        ? `${saved.suggestedFilename()} · page ${new URL(page.url()).pathname}`
        : `no download event; page went to ${page.url().slice(0, 120)}`,
    );
    const burned = ffprobe(burnedPath);
    check(
      'the export is a 1080×1920 H.264 MP4 within one frame of the timeline',
      burned.codec === 'h264' &&
        burned.width === 1080 &&
        burned.height === 1920 &&
        Math.abs(burned.videoSec - exported.durationSec) <= frameSec + 1e-6,
      probeLine(burned, exported.durationSec),
    );

    // ── 5. caption timing, per frame, against a captionMode 'none' export ─────────────
    const bare = await runOp(api, projectId, 'export', { preset: 'tiktok', captionMode: 'none' });
    const bareStatus = await awaitExport(api, projectId, bare.jobId);
    const { data: bareJob } = await media
      .from('client_render_jobs')
      .select('result_asset_ids')
      .eq('id', bare.jobId)
      .maybeSingle();
    for (const id of (bareJob as { result_asset_ids: string[] | null } | null)?.result_asset_ids ??
      []) {
      const { data: row } = await media
        .from('assets')
        .select('id, storage_path')
        .eq('id', id)
        .maybeSingle();
      if (row && !createdAssets.some((asset) => asset.id === row.id))
        createdAssets.push({ id: row.id, storagePath: row.storage_path });
    }
    const afterBare = await getProject(api, projectId);
    check(
      "ops export captionMode 'none' of the same revision completes",
      bareStatus.state === 'completed' &&
        Boolean(bareStatus.downloadUrl) &&
        afterBare.revision === exported.revision,
      `job ${bare.jobId} ${bareStatus.state}${bareStatus.error ? ` — ${bareStatus.error}` : ''} · revision ${exported.revision} → ${afterBare.revision}`,
    );
    if (!bareStatus.downloadUrl) return;
    const barePath = join(scratch, 'tiktok-none.mp4');
    writeFileSync(barePath, Buffer.from(await (await fetch(bareStatus.downloadUrl)).arrayBuffer()));
    const bareProbe = ffprobe(barePath);

    const windows = captionWindows(exported.project);
    const band = captionBand(exported.project, burned.height);
    const withCaptions = decodeBand(burnedPath, burned.width, band);
    const without = decodeBand(barePath, bareProbe.width, band);
    const frameCount = Math.min(withCaptions.length, without.length);
    const fps = 1 / frameSec;
    const { inside, outside, beforeFirst } = classifyFrames(frameCount, fps, windows);
    const score = (index: number) =>
      bandScore(withCaptions[index] ?? new Uint8Array(), without[index] ?? new Uint8Array());
    const perWindow = inside.map((indices) =>
      indices.length === 0 ? null : Math.min(...indices.map((index) => score(index).strongFrac)),
    );
    const worstInside = Math.min(...perWindow.map((value) => value ?? 0));
    const worstWindow = perWindow.indexOf(worstInside);
    const outsideScores = outside.map((index) => ({ index, ...score(index) }));
    const worstOut = outsideScores.reduce(
      (worst, entry) => (entry.strongFrac > worst.strongFrac ? entry : worst),
      { index: -1, meanAbs: 0, strongFrac: 0 },
    );
    const worstOutMean = Math.max(0, ...outsideScores.map((entry) => entry.meanAbs));
    const worstBefore = Math.max(0, ...beforeFirst.map((index) => score(index).strongFrac));
    check(
      "the two exports decode frame for frame (same length, 1080×1920, captionMode 'none' within a frame of the timeline)",
      withCaptions.length === without.length &&
        bareProbe.width === 1080 &&
        bareProbe.height === 1920 &&
        Math.abs(bareProbe.videoSec - exported.durationSec) <= frameSec + 1e-6,
      `${withCaptions.length} vs ${without.length} frames · band rows ${band.top}–${band.top + band.height}`,
    );
    check(
      'burned captions: the caption band differs inside every caption window',
      windows.length > 0 &&
        perWindow.every((value) => value !== null) &&
        worstInside >= IN_WINDOW_MIN,
      `${windows.length} windows · worst in-window ${(worstInside * 100).toFixed(3)}% strong pixels (window ${worstWindow}: "${windows[worstWindow]?.text}" ${windows[worstWindow]?.startSec.toFixed(3)}–${windows[worstWindow]?.endSec.toFixed(3)} s) · floor ${(IN_WINDOW_MIN * 100).toFixed(2)}%`,
    );
    check(
      'burned captions: the band matches outside every caption window and before the first word',
      outside.length > 0 &&
        beforeFirst.length > 0 &&
        worstOut.strongFrac <= OUT_WINDOW_MAX &&
        worstOutMean <= OUT_WINDOW_MEAN_MAX,
      `${outside.length} outside frames (${beforeFirst.length} before the first word at ${windows[0]?.startSec.toFixed(3)} s) · worst out-of-window ${(worstOut.strongFrac * 100).toFixed(3)}% strong${worstOut.index >= 0 ? ` at frame ${worstOut.index} (${(worstOut.index / fps).toFixed(3)} s)` : ''}, mean |Δ| ≤ ${worstOutMean.toFixed(2)} · worst before-first ${(worstBefore * 100).toFixed(3)}% · ceilings ${(OUT_WINDOW_MAX * 100).toFixed(2)}% / ${OUT_WINDOW_MEAN_MAX}`,
    );
    exercised.add('captions');

    const spoken = spokenWordPerFrame(exported.project, frameCount, fps);
    if (!spoken.some(Boolean)) {
      note(
        "NOT EXERCISED: per-word caption timing — no caption line highlights its words (highlightMode is not 'word')",
      );
    } else {
      const rgb = decodeBandRgb(burnedPath, burned.width, band);
      const masks = spoken.map((_, index) =>
        highlightMask(
          rgb[index] ?? new Uint8Array(),
          withCaptions[index] ?? new Uint8Array(),
          without[index] ?? new Uint8Array(),
        ),
      );
      const timing = judgeWordTiming(spoken, masks);
      const worstOffset = timing.offsets.reduce(
        (worst, offset) => (Math.abs(offset) > Math.abs(worst) ? offset : worst),
        0,
      );
      const spread = [...new Set(timing.offsets)]
        .sort((left, right) => left - right)
        .map(
          (offset) =>
            `${offset > 0 ? '+' : ''}${offset}f×${timing.offsets.filter((o) => o === offset).length}`,
        )
        .join(' ');
      check(
        "burned captions: the highlight moves word by word within one frame of each word's time",
        timing.offsets.length > 0 &&
          timing.unseen === 0 &&
          Math.abs(worstOffset) <= 1 &&
          timing.darkWhileSpoken === 0 &&
          timing.litWhileSilent === 0,
        `${timing.offsets.length} word changes judged (worst ${worstOffset > 0 ? '+' : ''}${worstOffset} frames; ${spread}) · ${timing.unseen} with no jump · dark while spoken ${timing.darkWhileSpoken}/${timing.litFrames} · lit while silent ${timing.litWhileSilent}/${timing.silentFrames}${timing.off
          .slice(0, 3)
          .map(
            (entry) =>
              ` · ${entry.offset > 0 ? '+' : ''}${entry.offset}f at frame ${entry.frame} (${(entry.frame / fps).toFixed(3)} s) ${entry.from || '—'} → ${entry.to || '—'}, jumps ${entry.jumps.join('/')}`,
          )
          .join('')}${
          timing.dark.length
            ? ` · dark: ${timing.dark
                .slice(0, 6)
                .map((entry) => `frame ${entry.frame} ${entry.key} ${entry.px}px`)
                .join(', ')}`
            : ''
        }`,
      );
    }
    check(
      'no uncaught page errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | ') || 'none',
    );
    await context.close();
  } catch (error) {
    check(
      'bench ran to completion',
      false,
      error instanceof Error ? error.message.slice(0, 600) : String(error),
    );
  } finally {
    // ── 6. cleanup + net zero ─────────────────────────────────────────────────────────
    if (mcp) await mcp.close().catch(() => undefined);
    try {
      const { data: tagged } = await media
        .from('assets')
        .select('id, storage_path')
        .eq('brand_id', BRAND)
        .eq('file_name', DROP_NAME);
      for (const row of tagged ?? []) {
        if (!createdAssets.some((asset) => asset.id === row.id))
          createdAssets.push({ id: row.id, storagePath: row.storage_path });
      }
      for (const projectId of createdProjects) {
        const { data: jobs } = await media
          .from('client_render_jobs')
          .select('result_asset_ids')
          .eq('source_id', projectId);
        for (const job of (jobs ?? []) as Array<{ result_asset_ids: string[] | null }>) {
          for (const id of job.result_asset_ids ?? []) {
            if (createdAssets.some((asset) => asset.id === id)) continue;
            const { data: row } = await media
              .from('assets')
              .select('id, storage_path')
              .eq('id', id)
              .maybeSingle();
            if (row) createdAssets.push({ id: row.id, storagePath: row.storage_path });
          }
        }
        await media.from('client_render_jobs').delete().eq('source_id', projectId);
      }
      const removedProjects = await removeProjects(admin, BRAND, createdProjects);
      const removed = await removeAssets(admin, BRAND, createdAssets);
      note(
        `cleanup: ${removedProjects} project(s), ${removed.rows} asset row(s), ${removed.objects} storage object(s)`,
      );
      // Late writes (a poster, an export prefix) are caught by name against the baseline.
      await sleep(5_000);
      const strays = [...(await brandObjectNames())].filter((name) => !objectsBefore.has(name));
      const mine = strays.filter(
        (name) =>
          createdProjects.some((id) => name.includes(id)) ||
          createdAssets.some((asset) => name.includes(asset.id)),
      );
      for (const bucket of new Set(mine.map((name) => name.split('/')[0] ?? ''))) {
        await admin.storage
          .from(bucket)
          .remove(
            mine
              .filter((name) => name.startsWith(`${bucket}/`))
              .map((name) => name.slice(bucket.length + 1)),
          );
      }
      // The bench brand is shared: another session's bench can register assets while this
      // one runs. Every new row and object is attributed — to this run (must be none), to
      // another writer's new asset (named below), or to nobody (fails).
      const addedIds = [...(await brandAssetIds())].filter((id) => !assetsBefore.has(id));
      const addedRows =
        addedIds.length === 0
          ? []
          : ((await prodSql<{
              id: string;
              file_name: string | null;
              source: string | null;
              origin: string;
            }>(
              `select id::text as id, file_name, source::text as source, coalesce(origin_ref::text, '') as origin from media.assets where id in (${addedIds.map((id) => `'${id}'`).join(',')})`,
            )) ?? []);
      const ours = (text: string) =>
        text.includes(DROP_NAME) ||
        createdProjects.some((id) => text.includes(id)) ||
        createdAssets.some((asset) => text.includes(asset.id));
      const ourRows = addedRows.filter((row) => ours(`${row.id} ${row.file_name} ${row.origin}`));
      const foreignRows = addedRows.filter((row) => !ourRows.includes(row));
      const addedObjects = [...(await brandObjectNames())].filter(
        (name) => !objectsBefore.has(name),
      );
      const ourObjects = addedObjects.filter(ours);
      const foreignObjects = addedObjects.filter(
        (name) => !ours(name) && foreignRows.some((row) => name.includes(row.id)),
      );
      const unknownObjects = addedObjects.filter(
        (name) => !ourObjects.includes(name) && !foreignObjects.includes(name),
      );
      if (foreignRows.length > 0)
        note(
          `another writer on the bench brand during this run (not this bench's): ${foreignRows
            .map(
              (row) =>
                `${row.id} ${row.source}/${(/"kind": ?"([^"]+)"/.exec(row.origin) ?? [])[1] ?? 'unknown'} "${row.file_name}"`,
            )
            .join('; ')} with ${foreignObjects.length} object(s)`,
        );
      check(
        'net zero: no media.assets row from this run is left on the brand',
        ourRows.length === 0,
        `${assetsBefore.size} before · ${addedIds.length} added during the run, ${ourRows.length} traceable to this run [${ourRows.map((row) => row.id).join(', ')}] · this run made and removed ${createdAssets.length}`,
      );
      check(
        "net zero: no storage object from this run under the brand's prefix, and none unaccounted for",
        ourObjects.length === 0 && unknownObjects.length === 0,
        ourObjects.length + unknownObjects.length > 0
          ? `left: ${[...ourObjects, ...unknownObjects].slice(0, 6).join(', ')}`
          : `${objectsBefore.size} before · ${addedObjects.length} added, all under another writer's new asset${mine.length ? ` · ${mine.length} late object(s) of this run swept` : ''}`,
      );
      const { count: leftProjects } = await media
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in(
          'id',
          createdProjects.length > 0 ? createdProjects : ['00000000-0000-0000-0000-000000000000'],
        );
      check(
        'net zero: no editor project left',
        (leftProjects ?? 0) === 0,
        `projects ${createdProjects.join(', ') || 'none'}`,
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
    proxy?.stop();
    // A red run keeps its two MP4s (local temp files, never storage) to look at.
    if (rec.summary().fail > 0) note(`kept the exports for diagnosis in ${scratch}`);
    else rmSync(scratch, { recursive: true, force: true });
    const hops = {
      drop: 'the drop-in import',
      agent: 'the typed agent turn',
      mcp: 'the /mcp/v2 add_text live edit',
      export: 'the Export dialog render + download',
      captions: 'the per-frame caption timing judge',
    };
    const missed = Object.entries(hops).filter(([key]) => !exercised.has(key));
    note(
      `NOT EXERCISED${missed.length ? ` (this run stopped early): ${missed.map(([, label]) => label).join(', ')};` : ':'} the agent's Undo-this-turn button, @-mentions and suggestion chips (typed prompt only), the Library link in the Export dialog, fit=contain, and any Render but ${RENDER_URL}.`,
    );
  }
  const failures = printEnvelope();
  expect(failures, 'graded FAIL steps').toBe(0);
});
