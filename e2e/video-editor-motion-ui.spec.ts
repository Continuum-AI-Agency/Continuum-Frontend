import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type EditorClip,
  type EditorProjectV2,
  editorCaptionWordSchema,
  editorExportSettingsSchema,
  editorProjectV2Schema,
  numericKeysForProperty,
  parentPositionDelta,
  positionKeysForProperty,
  registerGeneratedAssetResponseSchema,
  sampleNumericTrack,
  samplePositionTrack,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import type { DurableTimelineRequest } from './support/editorV2DurableRenderBenchEntry';
import { loadLocalSupabaseEnv, loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import {
  captionBand,
  decodeBandRgb,
  highlightMask,
  judgeWordTiming,
  spokenWordPerFrame,
} from './video-editor-journey/frames';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { removeProjects } from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// videoeditor:motion:e2e:bench — the Video Studio motion UI, end to end, as the bench login
// on the bench brand against PRODUCTION Supabase, a local Backend from this tree (every
// worker off) and a Next dev server.
//
//   /studio/video/new → two cuts of an existing bench video land on V1 through /ops/add_clip
//   → the Text tab places a Hook title at the playhead → the In picker switches it to
//   Bounce → clip A takes the Pop preset → a position keyframe is added at the playhead,
//   eased with a bezier, dragged a second later and deleted with ⌫ → the seam between A and
//   B takes a crossfade → clip B takes a VHS look and its strength is lowered → a Media
//   card dragged onto V1 lands through add_clip → an /ops/add_text made OUTSIDE the page
//   shows up in it live.
//
// Every step is asserted on the persisted project, read back through the Backend. Source
// media: one existing bench-brand video, read-only; add_clip reuses it, so the run
// registers no Library asset. Writes: one editor project (and its revisions), deleted at
// exit, net-zero asserted by id.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 900_000 });

const BENCH = 'videoeditor:motion:e2e:bench';
const KEYFRAME_JOURNEY = process.env.VIDEO_EDITOR_KEYFRAME_JOURNEY === '1';
const KEYFRAME_HOLD_JOURNEY = process.env.VIDEO_EDITOR_KEYFRAME_HOLD_JOURNEY === '1';
const KEYFRAME_LOCAL = KEYFRAME_JOURNEY || KEYFRAME_HOLD_JOURNEY;
const LOCAL_CURVE_JOURNEY = process.env.VIDEO_EDITOR_CURVE_JOURNEY_LOCAL === '1';
const SPEECH_JOURNEY = process.env.VIDEO_EDITOR_SPEECH_JOURNEY === '1';
const ANIMATED_SPEECH_JOURNEY = process.env.VIDEO_EDITOR_ANIMATED_SPEECH_JOURNEY === '1';
const COLLAGE_JOURNEY = process.env.VIDEO_EDITOR_COLLAGE_JOURNEY === '1';
const TEXT_JOURNEY = process.env.VIDEO_EDITOR_TEXT_JOURNEY === '1';
const PARENT_JOURNEY = process.env.VIDEO_EDITOR_PARENT_JOURNEY === '1';
const PARENT_RANGE_JOURNEY = process.env.VIDEO_EDITOR_PARENT_RANGE_JOURNEY === '1';
const CAPTION_JOURNEY = process.env.VIDEO_EDITOR_CAPTION_JOURNEY === '1';
const NESTED_JOURNEY = process.env.VIDEO_EDITOR_NESTED_JOURNEY === '1';
const NESTED_AUDIO_JOURNEY = process.env.VIDEO_EDITOR_NESTED_AUDIO_JOURNEY === '1';
const STAGE_JOURNEY = process.env.VIDEO_EDITOR_STAGE_JOURNEY === '1';
const NESTED_CONTROLS_JOURNEY = process.env.VIDEO_EDITOR_NESTED_CONTROLS_JOURNEY === '1';
const BRAND =
  process.env.CONTINUUM_TEST_BRAND_ID ??
  (LOCAL_CURVE_JOURNEY
    ? '00000000-0000-4000-8000-0000000000b2'
    : 'b411bba9-d09c-4892-9b86-5ff340ce64e5');
const OWNER_EMAIL = LOCAL_CURVE_JOURNEY
  ? 'local@continuum.test'
  : (readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai');
/** "Solicita tu Day Pass en Vivo 4047" — a 6.6 s Vivo 47 clip on the bench brand. */
const SOURCE_ASSET_ID =
  process.env.VIDEO_MOTION_SOURCE_ASSET ?? 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const CUT_SEC = 3;
const LIVE_EDIT_BUDGET_MS = 3_000;
const STEP_MS = 20_000;
const RUN = randomUUID().slice(0, 8);
const HOOK_LINE = `Motion bench ${RUN}`;
const OUTSIDE_LINE = `Outside ${RUN}`;
const WORKFLOW_NAME = `Workflow ${RUN}`;
const WORKFLOW_PROMPT = 'Make the current edit YouTube.';

const { url: supabaseUrl, serviceRoleKey } = LOCAL_CURVE_JOURNEY
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
const postOp = async (api: Api, projectId: string, op: string, body: unknown) => {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}/ops/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
};

async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = STEP_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    value = await read();
  }
  return value;
}

const mainClips = (project: EditorProjectV2) =>
  project.tracks
    .filter((track) => track.kind === 'video')
    .sort((left, right) => left.order - right.order)[0]
    ?.clips.toSorted((left, right) => left.timelineStartSec - right.timelineStartSec) ?? [];
const clipById = (project: EditorProjectV2, id: string): EditorClip | undefined =>
  project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === id);
const textClips = (project: EditorProjectV2) =>
  project.tracks
    .filter((track) => track.kind === 'text')
    .flatMap((track) => track.clips)
    .filter((clip): clip is Extract<EditorClip, { kind: 'text' }> => clip.kind === 'text');
const keyframesOf = (clip: EditorClip | undefined) =>
  clip && 'keyframes' in clip ? clip.keyframes : [];
const sourceOf = (clip: EditorClip | undefined) =>
  clip && 'source' in clip && clip.source.sourceType === 'library_asset'
    ? clip.source.assetId
    : undefined;
const near = (value: number | undefined, target: number, tolerance: number) =>
  value !== undefined && Math.abs(value - target) <= tolerance;

/** Seek by clicking the ruler at `sec`; the default zoom is read off a clip's width. */
async function seek(page: Page, pxPerSec: number, sec: number) {
  const ruler = page.locator('[data-timeline-ruler]:visible');
  const box = await ruler.boundingBox();
  if (!box) throw new Error('ruler not visible');
  await ruler.click({ position: { x: pxPerSec * sec, y: box.height / 2 } });
  await expect
    .poll(async () => {
      const clock = await page.locator('[data-testid="timeline-clock"]:visible').innerText();
      const match = /^(\d+):([\d.]+)/.exec(clock);
      return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
    })
    .toBeCloseTo(sec, 1);
}
async function selectClip(page: Page, clipId: string, fraction = 0.5) {
  const clip = page.locator(`[data-clip-id="${clipId}"]:visible`);
  const box = await clip.boundingBox();
  if (!box) throw new Error(`Clip ${clipId} is not visible`);
  // Click inside the block; an overlapping layer can cover its center.
  await clip.click({ position: { x: box.width * fraction, y: box.height / 2 }, timeout: STEP_MS });
}
const visible = (locator: Locator) => locator.filter({ visible: true });
/** Whether a locator reaches `count` visible matches in time — never throws. */
const shows = (locator: Locator, count = 1, timeout = 10_000) =>
  expect(visible(locator))
    .toHaveCount(count, { timeout })
    .then(() => true)
    .catch(() => false);

test(BENCH, async ({ browser }) => {
  test.skip(
    LOCAL_CURVE_JOURNEY,
    'The original hosted motion UI suite is not covered by the local retained-curve journey.',
  );
  const servers: Server[] = [];
  const createdProjects: string[] = [];
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  try {
    // ── servers + identity ────────────────────────────────────────────────────────────
    const hostedFrontend = process.env.VIDEO_EDITOR_FRONTEND_URL;
    let frontendUrl: string;
    let backendUrl: string;
    if (hostedFrontend) {
      frontendUrl = hostedFrontend;
      backendUrl = process.env.VIDEO_EDITOR_BACKEND_URL ?? 'https://api.trycontinuum.ai';
      const version = await fetch(`${frontendUrl}/api/system/version?bench=${RUN}`, {
        cache: 'no-store',
      });
      const { sha } = (await version.json()) as { sha?: string };
      if (!version.ok || !sha || !/^[0-9a-f]{7,40}$/.test(sha))
        throw new Error('Hosted Frontend revision unavailable');
      note(`verified hosted Frontend revision: ${sha}`);
    } else {
      const fePort = await freePort();
      const backend = await bootBackend(`http://localhost:${fePort}`);
      servers.push(backend);
      const frontend = await bootFrontend(fePort, backend.url);
      servers.push(frontend);
      frontendUrl = frontend.url;
      backendUrl = backend.url;
      note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
    }
    process.env.PLAYWRIGHT_BASE_URL = frontendUrl;
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const api: Api = { base: backendUrl, token: session.accessToken };

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

    // ── a blank edit, then two cuts of a bench video from outside ─────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${frontendUrl}/studio/video/new`, { timeout: 300_000 });
    await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
    const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
    createdProjects.push(projectId);
    await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
      timeout: 180_000,
    });

    const cutA = await postOp(api, projectId, 'add_clip', {
      assetId: SOURCE_ASSET_ID,
      atSec: 0,
      durationSec: CUT_SEC,
    });
    const cutB = await postOp(api, projectId, 'add_clip', {
      assetId: SOURCE_ASSET_ID,
      atSec: CUT_SEC,
      sourceInSec: CUT_SEC,
      durationSec: CUT_SEC,
    });
    let project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 2,
    );
    const [clipA, clipB] = mainClips(project);
    if (
      !check(
        '/ops/add_clip places two 3 s cuts of an existing bench video on V1',
        cutA.status === 200 &&
          cutB.status === 200 &&
          Boolean(clipA && clipB) &&
          near(clipA?.durationSec, CUT_SEC, 0.01) &&
          near(clipB?.timelineStartSec, CUT_SEC, 0.01) &&
          sourceOf(clipA) === SOURCE_ASSET_ID,
        `${cutA.status}/${cutB.status} ${cutA.status === 200 ? '' : cutA.text.slice(0, 200)} · ${mainClips(
          project,
        )
          .map((clip) => `${clip.timelineStartSec}+${clip.durationSec}`)
          .join(' | ')}`,
      ) ||
      !clipA ||
      !clipB
    ) {
      await context.close();
      return;
    }
    await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(2, {
      timeout: 15_000,
    });
    const clipBox = await page.locator(`[data-clip-id="${clipA.id}"]:visible`).boundingBox();
    const pxPerSec = clipBox ? clipBox.width / clipA.durationSec : 60;

    // ── Text tab: a Hook title at the playhead ────────────────────────────────────────
    await seek(page, pxPerSec, 0.5);
    await visible(page.getByRole('tab', { name: 'Text', exact: true })).click();
    await shows(page.locator('[data-text-template]'), 8);
    const cards = await visible(page.locator('[data-text-template]')).count();
    await visible(page.getByLabel('Line', { exact: true })).fill(HOOK_LINE);
    await visible(page.getByRole('button', { name: 'Add Hook title' })).click();
    project = await until(
      () => getProject(api, projectId),
      (value) => textClips(value).length > 0,
    );
    const hook = textClips(project)[0];
    check(
      'Text tab: 8 template cards; Hook title lands at the playhead with its line, pop in, top third',
      cards === 8 &&
        Boolean(hook) &&
        hook?.text.toLowerCase() === HOOK_LINE.toLowerCase() &&
        hook?.animationIn === 'pop' &&
        near(hook?.timelineStartSec, 0.5, 0.05) &&
        near(hook?.transform.position.y, 0.3, 0.01) &&
        near(hook?.transform.position.x, 0.5, 0.01),
      hook
        ? `${cards} cards · "${hook.text}" in=${hook.animationIn} @${hook.timelineStartSec.toFixed(2)}s pos ${hook.transform.position.x},${hook.transform.position.y}`
        : `${cards} cards · no text clip`,
    );
    if (!hook) {
      await context.close();
      return;
    }
    const hookSelected = await shows(
      page.locator(`[data-clip-id="${hook.id}"][aria-selected="true"]`),
    );
    const pickerShown = await shows(page.locator('[data-testid="text-animation-picker"]'));
    check(
      'the placed title is selected and its animation picker is in the Inspector',
      hookSelected && pickerShown,
      `selected ${hookSelected}, picker ${pickerShown}`,
    );

    // ── In picker: Bounce ─────────────────────────────────────────────────────────────
    await visible(page.getByRole('button', { name: 'In: Bounce' })).click();
    project = await until(
      () => getProject(api, projectId),
      (value) => textClips(value).find((clip) => clip.id === hook.id)?.animationIn === 'bounce',
    );
    const bounced = textClips(project).find((clip) => clip.id === hook.id);
    check(
      'the In picker writes animationIn = bounce, out kept',
      bounced?.animationIn === 'bounce' && bounced?.animationOut === hook.animationOut,
      `in=${bounced?.animationIn} out=${bounced?.animationOut}`,
    );

    // ── the stage draws the title with the export's renderer, only while it is live ───
    const paintedStageText = () =>
      page.evaluate(() => {
        const canvas = [
          ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="stage-text"]'),
        ].find((node) => node.getClientRects().length > 0);
        const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let index = 3; index < (data?.length ?? 0); index += 4) {
          if ((data?.[index] ?? 0) > 0) painted += 1;
        }
        return painted;
      });
    await seek(page, pxPerSec, 2);
    await page.waitForTimeout(300);
    const duringTitle = await paintedStageText();
    await seek(page, pxPerSec, 4.5);
    await page.waitForTimeout(300);
    const afterTitle = await paintedStageText();
    check(
      'the stage paints the title while it is on screen and nothing after it',
      duringTitle > 1_000 && afterTitle === 0,
      `${duringTitle} px at 2 s, ${afterTitle} px at 4.5 s`,
    );

    // ── clip A: Pop preset ────────────────────────────────────────────────────────────
    await selectClip(page, clipA.id);
    await visible(page.locator('[data-motion-preset="pop"]')).click();
    project = await until(
      () => getProject(api, projectId),
      (value) => keyframesOf(clipById(value, clipA.id)).length > 0,
    );
    const popKeys = keyframesOf(clipById(project, clipA.id));
    const scaleKeys = popKeys.filter((key) => key.property === 'transform.scaleX');
    check(
      'Motion ▸ Pop keys scale and opacity over the first 0.35 s of clip A',
      scaleKeys.length === 3 &&
        popKeys.some((key) => key.property === 'transform.opacity') &&
        popKeys.every((key) => key.timeSec <= 0.35 + 1e-6),
      popKeys.map((key) => `${key.property.slice(10)}@${key.timeSec}`).join(' '),
    );

    // ── keyframe lane: add at the playhead, bezier, move, delete ──────────────────────
    await seek(page, pxPerSec, 1);
    await visible(page.getByRole('button', { name: 'Add Position keyframe' })).click();
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        keyframesOf(clipById(value, clipA.id)).some((key) => key.property === 'transform.position'),
    );
    const added = keyframesOf(clipById(project, clipA.id)).find(
      (key) => key.property === 'transform.position',
    );
    check(
      'the lane keys position at the playhead (1 s into clip A)',
      near(added?.timeSec, 1, 0.05),
      `${added?.timeSec} = ${JSON.stringify(added?.value)}`,
    );

    await visible(
      page.locator('[data-testid="keyframe-editor"]').getByRole('button', {
        name: 'Ease out',
      }),
    ).click();
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        keyframesOf(clipById(value, clipA.id)).some(
          (key) => key.property === 'transform.position' && key.interpolation === 'bezier',
        ),
    );
    const eased = keyframesOf(clipById(project, clipA.id)).find(
      (key) => key.property === 'transform.position',
    );
    check(
      'the easing editor makes it a bezier with control points',
      eased?.interpolation === 'bezier' && Boolean(eased?.easing),
      `${eased?.interpolation} ${JSON.stringify(eased?.easing)}`,
    );

    const positionKey = visible(
      page.locator('[data-keyframe-track="position"] [data-keyframe-time]'),
    );
    // The easing editor sits below the lane; bring the row back before measuring it.
    await positionKey.scrollIntoViewIfNeeded();
    const track = await visible(page.locator('[data-keyframe-track="position"]')).boundingBox();
    const keyBox = await positionKey.boundingBox();
    if (track && keyBox) {
      const x = keyBox.x + keyBox.width / 2;
      const y = keyBox.y + keyBox.height / 2;
      const perSec = track.width / clipA.durationSec;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + perSec * 0.5, y, { steps: 5 });
      await page.mouse.move(x + perSec, y, { steps: 5 });
      await page.mouse.up();
    }
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        keyframesOf(clipById(value, clipA.id)).some(
          (key) => key.property === 'transform.position' && key.timeSec > 1.5,
        ),
    );
    const moved = keyframesOf(clipById(project, clipA.id)).filter(
      (key) => key.property === 'transform.position',
    );
    check(
      'dragging the key along its row moves it ~1 s later, easing kept',
      moved.length === 1 &&
        near(moved[0]?.timeSec, 2, 0.15) &&
        moved[0]?.interpolation === 'bezier',
      moved.map((key) => `${key.timeSec}/${key.interpolation}`).join(' '),
    );

    await positionKey.focus();
    await page.keyboard.press('Delete');
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        !keyframesOf(clipById(value, clipA.id)).some(
          (key) => key.property === 'transform.position',
        ),
    );
    check(
      '⌫ on the focused key deletes it — and only it: clip A and its Pop keys stay',
      !keyframesOf(clipById(project, clipA.id)).some(
        (key) => key.property === 'transform.position',
      ) &&
        mainClips(project).length === 2 &&
        keyframesOf(clipById(project, clipA.id)).length === popKeys.length,
      `${mainClips(project).length} clips, ${keyframesOf(clipById(project, clipA.id)).length} keys`,
    );

    // ── the seam between A and B: crossfade ───────────────────────────────────────────
    await visible(page.locator(`[data-seam="${clipA.id}"]`)).click();
    const popover = visible(page.locator('[data-testid="transition-popover"]'));
    await popover.locator('[data-transition-type="crossfade"]').click();
    await popover.getByRole('button', { name: 'Apply' }).click();
    project = await until(
      () => getProject(api, projectId),
      (value) => value.transitions.length > 0,
    );
    const crossfade = project.transitions[0];
    check(
      'the seam popover puts a 0.5 s crossfade between A and B',
      project.transitions.length === 1 &&
        crossfade?.fromClipId === clipA.id &&
        crossfade?.toClipId === clipB.id &&
        crossfade?.transitionType === 'crossfade' &&
        near(crossfade?.durationSec, 0.5, 0.01),
      JSON.stringify(project.transitions.map((row) => [row.transitionType, row.durationSec])),
    );

    // ── clip B: VHS at a strength ─────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await selectClip(page, clipB.id);
    await visible(page.locator('[data-look="vhs"]')).click();
    const vhsOf = (value: EditorProjectV2) => {
      const clip = clipById(value, clipB.id);
      return clip && 'effects' in clip
        ? clip.effects.find((effect) => effect.effectId === 'vhs')
        : undefined;
    };
    project = await until(
      () => getProject(api, projectId),
      (value) => Boolean(vhsOf(value)),
    );
    const vhs = vhsOf(project);
    check(
      'Look ▸ VHS gives clip B the effect instance at the default strength',
      vhs?.effectType === 'video_filter' && near(Number(vhs?.parameters.amount), 0.6, 0.001),
      JSON.stringify(vhs),
    );
    const strength = visible(
      page.getByRole('group', { name: 'VHS strength', exact: true }).getByRole('slider'),
    );
    await strength.focus();
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
    project = await until(
      () => getProject(api, projectId),
      (value) => near(Number(vhsOf(value)?.parameters.amount), 0.4, 0.001),
    );
    check(
      'lowering the strength slider re-applies VHS at 40 %',
      near(Number(vhsOf(project)?.parameters.amount), 0.4, 0.001) &&
        (clipById(project, clipB.id) as { effects?: unknown[] })?.effects?.filter(
          (effect) => (effect as { effectId?: string }).effectId === 'vhs',
        ).length === 1,
      JSON.stringify(vhsOf(project)?.parameters),
    );

    await visible(page.locator('[data-look="vintage"]')).click();
    const vintageOf = (value: EditorProjectV2) => {
      const clip = clipById(value, clipB.id);
      return clip && 'effects' in clip
        ? clip.effects.find((effect) => effect.effectId === 'vintage')
        : undefined;
    };
    await until(
      () => getProject(api, projectId),
      (value) => Boolean(vintageOf(value)),
    );
    const vintageStrength = visible(
      page.getByRole('group', { name: 'Vintage strength', exact: true }).getByRole('slider'),
    );
    await vintageStrength.focus();
    await page.keyboard.press('Home');
    project = await until(
      () => getProject(api, projectId),
      (value) => vintageOf(value)?.mix === 0,
    );
    check(
      'Vintage intensity is adjustable to zero through the real Inspector',
      vintageOf(project)?.mix === 0,
    );

    // ── a Media card dragged onto V1 lands through add_clip ───────────────────────────
    await visible(page.getByRole('tab', { name: 'Media', exact: true })).click();
    const card = visible(page.locator(`[data-bin-asset="${SOURCE_ASSET_ID}"]`)).first();
    const mainLane = visible(
      page.locator(`[data-lane-id="${project.tracks.find((t) => t.kind === 'video')?.id}"]`),
    );
    const laneBox = await mainLane.boundingBox();
    const endPx = pxPerSec * project.durationSec + 30;
    let placedRequest = false;
    page.on('request', (request) => {
      if (request.url().includes('/ops/add_clip')) placedRequest = true;
    });
    await card.dragTo(mainLane, {
      targetPosition: { x: Math.min(endPx, (laneBox?.width ?? endPx) - 5), y: 20 },
    });
    project = await until(
      () => getProject(api, projectId),
      (value) => mainClips(value).length === 3,
    );
    const placed = mainClips(project).at(-1);
    const before = mainClips(project).at(-2);
    const packedAfter = (before?.timelineStartSec ?? 0) + (before?.durationSec ?? 0);
    check(
      'dragging a Media card onto V1 places it at the end through /ops/add_clip',
      placedRequest &&
        mainClips(project).length === 3 &&
        sourceOf(placed) === SOURCE_ASSET_ID &&
        near(placed?.timelineStartSec, packedAfter, 0.01),
      `${placedRequest ? 'add_clip' : 'no add_clip request'} · ${mainClips(project)
        .map((clip) => `${clip.timelineStartSec}+${clip.durationSec.toFixed(2)}`)
        .join(' | ')}`,
    );

    // The menus must issue a new edit; an existing Pop/VHS/crossfade is not proof.
    for (const door of ['palette', 'context menu'] as const) {
      for (const action of [
        { group: 'Animate', label: 'Pop', palette: 'Animate: Pop', op: 'animate_clip' },
        { group: 'Look', label: 'VHS', palette: 'Look: VHS', op: 'apply_effect' },
        {
          group: 'Transition',
          label: 'Crossfade into next',
          palette: 'Transition: Crossfade into next clip',
          op: 'add_transition',
        },
      ]) {
        await selectClip(page, clipA.id);
        const beforeMenu = await getProject(api, projectId);
        const response = page.waitForResponse(
          (value) =>
            value.request().method() === 'POST' && value.url().endsWith(`/ops/${action.op}`),
        );
        if (door === 'palette') {
          await page.getByRole('button', { name: 'Command palette', exact: true }).click();
          await page.getByPlaceholder('Search actions…').fill(action.palette);
          await page.getByRole('option', { name: action.palette, exact: true }).click();
        } else {
          await page.locator(`[data-clip-id="${clipA.id}"]:visible`).click({ button: 'right' });
          await page.getByRole('menuitem', { name: action.group, exact: true }).hover();
          await page.getByRole('menuitem', { name: action.label, exact: true }).click();
        }
        const saved = await response;
        project = await getProject(api, projectId);
        const updated = clipById(project, clipA.id);
        const matches =
          action.op === 'animate_clip'
            ? keyframesOf(updated).some((key) => key.property === 'transform.scaleX')
            : action.op === 'apply_effect'
              ? updated &&
                'effects' in updated &&
                updated.effects.some((effect) => effect.effectId === 'vhs')
              : project.transitions.some(
                  (value) => value.fromClipId === clipA.id && value.transitionType === 'crossfade',
                );
        check(
          `${door}: ${action.group} commits its requested edit`,
          saved.ok() && project.revision === beforeMenu.revision + 1 && Boolean(matches),
          `${saved.status()} · revision ${beforeMenu.revision} → ${project.revision}`,
        );
      }
    }

    // ── an edit from OUTSIDE the page, live ───────────────────────────────────────────
    await seek(page, pxPerSec, 0);
    await selectClip(page, clipA.id);
    await page.keyboard.down('Shift');
    await selectClip(page, clipB.id);
    await page.keyboard.up('Shift');
    await visible(page.getByRole('button', { name: 'Collage', exact: false })).click();
    const collageRequest = page.waitForResponse((response) =>
      response.url().includes('/ops/collage'),
    );
    await page.getByRole('menuitem', { name: 'Film strips', exact: true }).click();
    const collageResponse = await collageRequest;
    project = await until(
      () => getProject(api, projectId),
      (value) => value.tracks.some((track) => track.kind === 'overlay' && track.name === 'Collage'),
    );
    const panels =
      project.tracks.find((track) => track.kind === 'overlay' && track.name === 'Collage')?.clips ??
      [];
    check(
      'Collage menu places the two selected real sources in film strips',
      collageResponse.ok() &&
        panels.length === 2 &&
        panels.every(
          (clip) => clip.kind === 'overlay' && clip.crop.top > 0 && clip.crop.bottom > 0,
        ),
    );

    await selectClip(page, clipA.id);
    for (const [label, expected] of [
      ['Volume', 0.65],
      ['Fade in', 0.4],
      ['Fade out', 0.6],
    ] as const) {
      const field = visible(
        page.getByRole('group', { name: label, exact: true }).getByRole('slider'),
      );
      await expect(field).toHaveCount(1, { timeout: STEP_MS });
      await field.focus();
      await field.press('Home');
      const steps = label === 'Volume' ? 13 : label === 'Fade in' ? 4 : 6;
      for (let step = 0; step < steps; step += 1) await field.press('ArrowRight');
      const property =
        label === 'Volume' ? 'volume' : label === 'Fade in' ? 'fadeInSec' : 'fadeOutSec';
      project = await until(
        () => getProject(api, projectId),
        (value) => {
          const clip = clipById(value, clipA.id);
          return clip?.kind === 'video' && near(clip[property], expected, 0.001);
        },
      );
      check(
        `video audio: ${label} survives a fresh store read`,
        clipById(project, clipA.id)?.kind === 'video',
      );
    }
    await seek(page, pxPerSec, 1.25);
    const videoAdded = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/${projectId}/commands`) && response.request().method() === 'POST',
    );
    await visible(page.getByRole('button', { name: 'Add Volume keyframe' })).click();
    expect((await videoAdded).ok()).toBe(true);
    const videoGain = visible(page.getByTestId('keyframe-editor')).getByLabel('Volume', {
      exact: true,
    });
    const videoSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/${projectId}/commands`) && response.request().method() === 'POST',
    );
    await videoGain.fill('0.35');
    await videoGain.press('Tab');
    expect((await videoSaved).ok()).toBe(true);
    project = await getProject(api, projectId);
    check(
      'video audio: gain key coexists with visual motion and preserves the pinned source',
      keyframesOf(clipById(project, clipA.id)).some(
        (key) => key.property === 'audio.volume' && key.value === 0.35,
      ) &&
        keyframesOf(clipById(project, clipA.id)).some(
          (key) => key.property === 'transform.scaleX',
        ) &&
        sourceOf(clipById(project, clipA.id)) === SOURCE_ASSET_ID,
    );

    const audioId = `volume-${RUN}`;
    const audioTrack = `audio-${RUN}`;
    const audioSeed = await postOp(api, projectId, 'apply_commands', {
      expectedRevision: project.revision,
      commands: [
        {
          commandType: 'add_track',
          track: {
            id: audioTrack,
            name: 'Volume automation',
            kind: 'audio',
            order: Math.max(...project.tracks.map((track) => track.order)) + 1,
            clips: [
              {
                id: audioId,
                kind: 'audio',
                timelineStartSec: 0,
                durationSec: CUT_SEC,
                source: 'source' in clipA ? clipA.source : undefined,
                volume: 1,
              },
            ],
          },
        },
      ],
    });
    check(
      'audio automation: existing Library source lands on its audio track',
      audioSeed.status === 200,
      audioSeed.text.slice(0, 100),
    );
    await expect(page.locator(`[data-clip-id="${audioId}"]:visible`)).toHaveCount(1, {
      timeout: STEP_MS,
    });
    await selectClip(page, audioId);
    check(
      'audio automation: Volume lane shown without visual channels',
      (await shows(page.getByRole('button', { name: 'Add Volume keyframe' }))) &&
        (await visible(page.getByRole('button', { name: 'Add Position keyframe' })).count()) === 0,
    );
    const automationSaveMs: number[] = [];
    const automationPhases: {
      inputToRequestMs: number;
      requestToHeadersMs: number;
      requestToBodyMs: number;
      serverTiming: string | null;
    }[] = [];
    for (const [atSec, gain] of [
      [0.25, 0.25],
      [1.25, 0.6],
      [2.25, 0.9],
    ]) {
      await seek(page, pxPerSec, atSec);
      const added = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/${projectId}/commands`) &&
          response.request().method() === 'POST',
      );
      await visible(page.getByRole('button', { name: 'Add Volume keyframe' })).click();
      expect((await added).ok()).toBe(true);
      const beforeValue = await getProject(api, projectId);
      const field = visible(page.getByTestId('keyframe-editor')).getByLabel('Volume', {
        exact: true,
      });
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/${projectId}/commands`) &&
          response.request().method() === 'POST',
      );
      const dispatched = page
        .waitForRequest(
          (request) =>
            request.url().endsWith(`/${projectId}/commands`) && request.method() === 'POST',
        )
        .then(() => performance.now());
      const started = performance.now();
      await field.fill(String(gain));
      await field.press('Tab');
      const response = await saved;
      automationSaveMs.push(performance.now() - started);
      const dispatchedAt = await dispatched;
      await response.finished();
      const timing = response.request().timing();
      automationPhases.push({
        inputToRequestMs: dispatchedAt - started,
        requestToHeadersMs: timing.responseStart - timing.requestStart,
        requestToBodyMs: timing.responseEnd - timing.requestStart,
        serverTiming: await response.headerValue('server-timing'),
      });
      project = await getProject(api, projectId);
      check(
        `audio automation: ${gain} gain at ${atSec}s survives a fresh read`,
        response.ok() &&
          project.revision === beforeValue.revision + 1 &&
          keyframesOf(clipById(project, audioId)).some(
            (key) =>
              key.property === 'audio.volume' &&
              near(key.timeSec, atSec, 0.05) &&
              key.value === gain,
          ),
      );
    }
    note(`speed samples: ${JSON.stringify({ volume_control_save: automationSaveMs })}`);
    note(`save phases: ${JSON.stringify(automationPhases)}`);
    const settledRevision = project.revision;
    await page.waitForTimeout(350);
    project = await getProject(api, projectId);
    check(
      'numeric commit cancels its settling timer without a duplicate revision',
      project.revision === settledRevision,
    );
    const beforeDeselect = project.revision;
    await visible(page.getByTestId('keyframe-editor'))
      .getByLabel('Volume', { exact: true })
      .fill('0.75');
    await selectClip(page, clipA.id);
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        keyframesOf(clipById(value, audioId)).some(
          (key) =>
            key.property === 'audio.volume' && near(key.timeSec, 2.25, 0.05) && key.value === 0.75,
        ),
      STEP_MS,
    );
    await page.waitForTimeout(350);
    project = await getProject(api, projectId);
    check(
      'deselecting a numeric edit keeps its latest value in exactly one revision',
      project.revision === beforeDeselect + 1 &&
        keyframesOf(clipById(project, audioId)).some(
          (key) =>
            key.property === 'audio.volume' && near(key.timeSec, 2.25, 0.05) && key.value === 0.75,
        ),
    );
    await selectClip(page, audioId);
    await visible(
      page.getByRole('button', { name: 'Volume keyframe at 2.25 s', exact: true }),
    ).click();
    check(
      'save phase timings cover input dispatch, response body and server work',
      automationPhases.length === 3 &&
        automationPhases.every(
          (phase) =>
            phase.inputToRequestMs >= 0 &&
            phase.requestToHeadersMs >= 0 &&
            phase.requestToBodyMs >= phase.requestToHeadersMs &&
            Boolean(phase.serverTiming),
        ),
    );
    await visible(page.getByTestId('keyframe-editor'))
      .getByRole('button', { name: 'Ease out' })
      .click();
    project = await until(
      () => getProject(api, projectId),
      (value) =>
        keyframesOf(clipById(value, audioId)).some(
          (key) => near(key.timeSec, 2.25, 0.05) && key.interpolation === 'bezier',
        ),
    );
    check(
      'audio automation: easing is persisted on the volume key',
      keyframesOf(clipById(project, audioId)).some(
        (key) =>
          key.property === 'audio.volume' && key.interpolation === 'bezier' && Boolean(key.easing),
      ),
    );
    const volumeKey = visible(page.getByRole('button', { name: 'Volume keyframe at 2.25 s' }));
    await volumeKey.focus();
    await page.keyboard.press('Delete');
    project = await until(
      () => getProject(api, projectId),
      (value) => keyframesOf(clipById(value, audioId)).length === 2,
    );
    check(
      'audio automation: deleting a key preserves the source and other keys',
      keyframesOf(clipById(project, audioId)).length === 2 &&
        sourceOf(clipById(project, audioId)) === SOURCE_ASSET_ID,
    );

    const outside = await postOp(api, projectId, 'add_text', {
      text: OUTSIDE_LINE,
      startSec: 4,
      durationSec: 1,
    });
    const committedAt = Date.now();
    let liveMs = Number.NaN;
    try {
      await expect(
        page.locator('[data-clip-kind="text"]:visible', { hasText: new RegExp(OUTSIDE_LINE, 'i') }),
      ).toHaveCount(1, { timeout: LIVE_EDIT_BUDGET_MS });
      liveMs = Date.now() - committedAt;
    } catch {
      liveMs = Number.NaN;
    }
    check(
      `an /ops/add_text from outside appears in the open page within ${LIVE_EDIT_BUDGET_MS / 1000} s`,
      outside.status === 200 && Number.isFinite(liveMs),
      `${outside.status} · ${Number.isFinite(liveMs) ? `${liveMs} ms` : 'not seen'}`,
    );

    const final = await getProject(api, projectId);
    const revisionLabel = await visible(
      page.locator('[data-testid="project-revision"]'),
    ).innerText();
    check(
      'the page shows the persisted revision',
      revisionLabel.includes(`Revision ${final.revision}`),
      `${revisionLabel} vs ${final.revision}`,
    );
    await visible(page.getByRole('tab', { name: 'Agent', exact: true })).click();
    await visible(page.getByTestId('editor-agent-input')).fill(WORKFLOW_PROMPT);
    await visible(page.getByRole('button', { name: 'Saved workflows', exact: true })).click();
    await page.getByRole('textbox', { name: 'Workflow name' }).fill(WORKFLOW_NAME);
    const workflowSaved = page.waitForResponse((response) =>
      response.url().includes('/ops/save_workflow'),
    );
    await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
    check(
      'workflow UI saves instructions without editing the project',
      (await workflowSaved).ok() && (await getProject(api, projectId)).revision === final.revision,
    );
    await page.keyboard.press('Escape');
    await page.reload();
    await visible(page.getByRole('tab', { name: 'Agent', exact: true })).click();
    await visible(page.getByRole('button', { name: 'Saved workflows', exact: true })).click();
    await page.getByRole('button', { name: WORKFLOW_NAME, exact: true }).click();
    check(
      'workflow UI reloads persisted instructions into the current edit prompt',
      (await visible(page.getByTestId('editor-agent-input')).inputValue()) === WORKFLOW_PROMPT &&
        (await getProject(api, projectId)).revision === final.revision,
    );
    check(
      'no uncaught page errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | ') || 'none',
    );
    note(
      'NOT EXERCISED here: export of the new animations (videoeditor:motion:render:bench and the Render hop), template drag onto the timeline (the click path is benched; the drag payload is unit-tested), spring easing. Menu checks exercise Animate, Look and Transition through both doors; they do not cover every palette action.',
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
      const { error: workflowCleanupError } = await admin
        .schema('brand_profiles')
        .from('canvas_workflows')
        .delete()
        .eq('brand_profile_id', BRAND)
        .eq('name', `Video Studio: ${WORKFLOW_NAME}`);
      const { count: workflowLeft } = await admin
        .schema('brand_profiles')
        .from('canvas_workflows')
        .select('id', { count: 'exact', head: true })
        .eq('brand_profile_id', BRAND)
        .eq('name', `Video Studio: ${WORKFLOW_NAME}`);
      check(
        'workflow UI removes its disposable saved prompt',
        !workflowCleanupError && workflowLeft === 0,
      );
      const removed = await removeProjects(admin, BRAND, createdProjects);
      const ids = createdProjects.length > 0 ? createdProjects : [randomUUID()];
      const { count: leftProjects } = await admin
        .schema('media')
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in('id', ids);
      const { count: leftRevisions } = await admin
        .schema('media')
        .from('editor_project_revisions')
        .select('project_id', { count: 'exact', head: true })
        .in('project_id', ids);
      const { count: runAssets } = await admin
        .schema('media')
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', BRAND)
        .ilike('file_name', `%${RUN}%`);
      note(`cleanup: ${removed} project(s)`);
      check(
        'net zero: no project, revision or Library asset left from this run',
        (leftProjects ?? 0) === 0 && (leftRevisions ?? 0) === 0 && (runAssets ?? 0) === 0,
        `projects ${leftProjects ?? 0}, revisions ${leftRevisions ?? 0}, assets ${runAssets ?? 0}`,
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

test('retained project journey: native splits and deletes preserve stored picture and gain', async ({
  browser,
}) => {
  test.skip(
    process.env.VIDEO_EDITOR_CURVE_JOURNEY !== '1',
    'Set VIDEO_EDITOR_CURVE_JOURNEY=1 for the disposable real-store journey.',
  );
  const proof = createBenchRecorder(
    COLLAGE_JOURNEY
      ? 'videoeditor:motion:e2e:bench:collage'
      : KEYFRAME_LOCAL
        ? BENCH
        : STAGE_JOURNEY
          ? 'videoeditor:motion:e2e:bench:stage-handles'
          : NESTED_CONTROLS_JOURNEY
            ? 'videoeditor:motion:e2e:bench:composition-controls'
            : NESTED_AUDIO_JOURNEY
              ? 'videoeditor:motion:e2e:bench:retained-nested-audio'
              : NESTED_JOURNEY
                ? 'videoeditor:motion:e2e:bench:retained-nested'
                : CAPTION_JOURNEY
                  ? 'videoeditor:motion:e2e:bench:retained-captions'
                  : SPEECH_JOURNEY
                    ? ANIMATED_SPEECH_JOURNEY
                      ? 'videoeditor:motion:e2e:bench:animated-speech-jumps'
                      : 'videoeditor:motion:e2e:bench:speech-jumps'
                    : PARENT_JOURNEY
                      ? 'videoeditor:motion:e2e:bench:retained-parent'
                      : TEXT_JOURNEY
                        ? 'videoeditor:motion:e2e:bench:retained-text'
                        : 'videoeditor:motion:e2e:bench:retained-project',
    [],
  );
  proof.notes.push(
    `store target: ${LOCAL_CURVE_JOURNEY ? 'local loopback Supabase, existing authorization migration' : 'hosted designated bench store'}`,
  );
  const servers: Server[] = [];
  const ids: string[] = [];
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let previousBrand: string | null | undefined;
  let brandChanged = false;
  let localSource: { path: string; assetId?: string; receiptKey?: string } | null = null;
  const ownedSources: Array<{ path: string; assetId?: string; receiptKey?: string }> = [];
  let transcriptPath: string | null = null;
  let sourceWords: Array<{ text: string; startSec: number; endSec: number }> = [];
  const folder =
    process.env.VIDEO_EDITOR_CURVE_JOURNEY_OUTPUT ??
    join(tmpdir(), `video-editor-curve-journey-${RUN}`);
  mkdirSync(folder, { recursive: true });
  const assert = (name: string, ok: boolean, detail?: string) => {
    proof.record(name, ok ? 'PASS' : 'FAIL', detail);
    expect(ok, `${name}${detail ? `: ${detail}` : ''}`).toBe(true);
  };
  try {
    if (
      COLLAGE_JOURNEY &&
      (!LOCAL_CURVE_JOURNEY ||
        KEYFRAME_LOCAL ||
        SPEECH_JOURNEY ||
        TEXT_JOURNEY ||
        PARENT_JOURNEY ||
        NESTED_JOURNEY)
    )
      throw new Error('Collage journey requires the loopback recording without other modes.');
    if (
      KEYFRAME_LOCAL &&
      (!LOCAL_CURVE_JOURNEY || SPEECH_JOURNEY || TEXT_JOURNEY || PARENT_JOURNEY || NESTED_JOURNEY)
    )
      throw new Error(
        'Keyframe proof requires the loopback recording without other journey modes.',
      );
    if (KEYFRAME_JOURNEY && KEYFRAME_HOLD_JOURNEY) throw new Error('Select one keyframe journey.');
    if (STAGE_JOURNEY && !NESTED_CONTROLS_JOURNEY)
      throw new Error('Stage journey requires composition controls.');
    if (NESTED_CONTROLS_JOURNEY && !NESTED_AUDIO_JOURNEY)
      throw new Error('Composition controls journey requires the real nested audio journey.');
    if (NESTED_AUDIO_JOURNEY && (!NESTED_JOURNEY || !LOCAL_CURVE_JOURNEY))
      throw new Error('Nested audio journey requires nested mode and the loopback store.');
    if (CAPTION_JOURNEY && (!TEXT_JOURNEY || !PARENT_JOURNEY || SPEECH_JOURNEY))
      throw new Error(
        'Caption motion journey requires the text and parent journeys, without speech mode.',
      );
    if (NESTED_JOURNEY && (!TEXT_JOURNEY || !PARENT_JOURNEY || SPEECH_JOURNEY))
      throw new Error('Nested journey requires the text and parent journeys, without speech mode.');
    if (ANIMATED_SPEECH_JOURNEY && (!SPEECH_JOURNEY || TEXT_JOURNEY || PARENT_JOURNEY))
      throw new Error('Animated speech requires the loopback speech journey only.');
    if (SPEECH_JOURNEY && !LOCAL_CURVE_JOURNEY)
      throw new Error('Speech journey fixtures are loopback-only.');
    const fePort = await freePort();
    const backend = await bootBackend(
      `http://localhost:${fePort}`,
      SPEECH_JOURNEY ? { AI_STUDIO_BUCKET: 'brand-profile-assets' } : {},
    );
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url, '.next/video-curve-journey-e2e');
    servers.push(frontend);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const api: Api = { base: backend.url, token: session.accessToken };
    const { data: preference, error: preferenceError } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (preferenceError) throw preferenceError;
    previousBrand = preference ? preference.active_brand_id : undefined;
    const { error: brandError } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: session.userId, active_brand_id: BRAND, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (brandError) throw brandError;
    brandChanged = true;
    let assetId = '8e14e8ab-fc86-4fe5-a6bb-64de70d5e553';
    let versionId = '9616fdc0-c811-4017-b97e-4445fd41492c';
    if (LOCAL_CURVE_JOURNEY) {
      const file = process.env.VIDEO_EDITOR_RECORDED_FIXTURE;
      if (!file)
        throw new Error(
          'Local journey requires VIDEO_EDITOR_RECORDED_FIXTURE with real recorded MP4 bytes.',
        );
      const bytes = readFileSync(file);
      const { buildRegisterGeneratedAssetOperation } = await import(
        '../../Continuum-Backend/App/media/registerGeneratedAsset'
      );
      localSource = { path: `${BRAND}/video-editor-bench/${randomUUID()}/recorded-curves.mp4` };
      ownedSources.push(localSource);
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
      const operation = buildRegisterGeneratedAssetOperation({
        brandId: BRAND,
        kind: 'video',
        bucket: 'media-library',
        storagePath: localSource.path,
        fileName: `bench-recorded-curves-${RUN}.mp4`,
        mimeType: 'video/mp4',
        createdBy: session.userId,
        width: probe.streams[0]?.width,
        height: probe.streams[0]?.height,
        durationMs: Math.round(Number(probe.format.duration) * 1000),
        sizeBytes: bytes.length,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        source: 'canvas',
        operation: 'video_editor_local_fixture',
        originRef: { bench: 'retained_curves', actualRecordedMedia: true },
      });
      const { error: uploadError } = await admin.storage
        .from('media-library')
        .upload(localSource.path, bytes, { contentType: 'video/mp4' });
      if (uploadError) throw uploadError;
      localSource.receiptKey = operation.idempotencyKey;
      // The pure builder + RPC register a real exact version, without the Outcome
      // helper's automatic video-analysis call. This branch is loopback-only.
      const { data, error: registerError } = await admin
        .schema('media')
        .rpc('library_execute_operation', {
          p_action: operation.action,
          p_payload: { ...operation, actor: session.userId },
        });
      if (registerError) throw registerError;
      const receipt = registerGeneratedAssetResponseSchema.parse(data);
      assetId = receipt.assetId;
      versionId = receipt.versionId;
      localSource.assetId = assetId;
      assert(
        'actual recorded fixture registers in local Library with an exact version',
        receipt.status === 'created',
      );
      if (SPEECH_JOURNEY) {
        const transcriptFile = process.env.VIDEO_EDITOR_SPEECH_TRANSCRIPT;
        if (!transcriptFile)
          throw new Error('Speech journey requires an existing real transcript.');
        assert(
          'real NASA recording matches the frozen fixture checksum',
          createHash('sha256').update(bytes).digest('hex') ===
            '59c4807dc9c32bfbd2d97e7bfd400373ccc4eaa14ee14f3ba7f5aa88914cdc51',
        );
        const cached = JSON.parse(readFileSync(transcriptFile, 'utf8')) as {
          setId: string;
          sources: Array<{
            versionId: string;
            durationSec: number;
            language: string;
            words: unknown[];
          }>;
        };
        const source = cached.sources?.[0];
        assert(
          'cached real transcript covers the exact source without a new STT call',
          cached.setId === 'nasa-melvin' &&
            source?.versionId === 'fixture:nasa-ksc-122210-itow-melvin@59c4807dc9c3' &&
            source.durationSec >= Number(probe.format.duration) - 0.01 &&
            Array.isArray(source.words) &&
            source.words.length > 0,
        );
        if (!source) throw new Error('Real transcript source missing.');
        sourceWords = source.words.map((word) => editorCaptionWordSchema.parse(word));
        transcriptPath = `${BRAND}/video-editor/transcripts/${versionId}.json`;
        const { error } = await admin.storage.from('brand-profile-assets').upload(
          transcriptPath,
          JSON.stringify({
            ranges: [
              {
                startSec: 0,
                endSec: source.durationSec,
                words: sourceWords,
                language: source.language,
              },
            ],
          }),
          { contentType: 'application/json' },
        );
        if (error) throw error;
        proof.notes.push(
          `Existing transcript SHA256: ${createHash('sha256').update(readFileSync(transcriptFile)).digest('hex')}; actual silence detection remains exercised.`,
        );
      }
    }
    const { data: version, error: versionError } = await admin
      .schema('media')
      .from('asset_versions')
      .select('bucket, storage_path')
      .eq('id', versionId)
      .eq('asset_id', assetId)
      .single();
    if (versionError || !version) throw versionError ?? new Error('Pinned recording missing');
    const { data: signed, error: signedError } = await admin.storage
      .from(version.bucket)
      .createSignedUrl(version.storage_path, 1800);
    if (signedError || !signed) throw signedError ?? new Error('Recording sign failed');
    const sourceResponse = await fetch(signed.signedUrl);
    assert(
      'signed exact recording is readable over real storage HTTP',
      sourceResponse.ok,
      `status ${sourceResponse.status}, origin ${new URL(signed.signedUrl).origin}`,
    );
    await sourceResponse.body?.cancel();
    context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    if (LOCAL_CURVE_JOURNEY)
      await context.grantPermissions(['local-network-access'], { origin: frontend.url });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    // The existing durable render entry consumes the exact stored document. Calling only
    // renderTimeline keeps all MP4s local; its upload/job helpers are never invoked.
    const bundle = join(tmpdir(), `video-editor-curve-compositor-${RUN}.js`);
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
    const compositor = await context.newPage();
    compositor.on('requestfailed', (request) =>
      proof.notes.push(
        `browser media request failed: ${new URL(request.url()).origin} ${request.failure()?.errorText}`,
      ),
    );
    await compositor.route('**/curve-compositor', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await compositor.goto(`${frontend.url}/curve-compositor`);
    await compositor.addScriptTag({ content: readFileSync(bundle, 'utf8'), type: 'module' });
    await compositor.waitForFunction(() => Boolean(window.__editorV2DurableRenderBench));
    const mediaVersions = new Map([
      [versionId, { bucket: version.bucket, path: version.storage_path, url: signed.signedUrl }],
    ]);
    const inputOf = (clip: EditorClip) => {
      if (!('source' in clip) || clip.source.sourceType !== 'library_asset') return [];
      const media = mediaVersions.get(clip.source.renditionId!);
      if (!media && COLLAGE_JOURNEY) throw new Error('Unregistered collage source version');
      const bound = media ?? {
        bucket: version.bucket,
        path: version.storage_path,
        url: signed.signedUrl,
      };
      return [
        {
          sourceId: clip.id,
          sourceAssetId: clip.source.assetId,
          sourceRevision: clip.source.renditionId!,
          storage: { bucket: bound.bucket, path: bound.path },
          url: bound.url,
        },
      ];
    };
    const render = async (project: EditorProjectV2, path: string, frameTimeSec?: number) => {
      const request: DurableTimelineRequest = {
        project,
        ...(frameTimeSec === undefined ? {} : { frameTimeSec }),
        inputs: [
          ...project.tracks,
          ...project.nestedSequences.flatMap((sequence) => sequence.tracks),
        ].flatMap((track) => track.clips.flatMap(inputOf)),
      };
      const result = await compositor.evaluate(
        (input) => window.__editorV2DurableRenderBench.renderTimeline(input),
        request,
      );
      writeFileSync(path, Buffer.from(result.base64, 'base64'));
      return result;
    };
    const previewChannels = async (project: EditorProjectV2, fromSec = 0) => {
      const request: DurableTimelineRequest = {
        project,
        inputs: [
          ...project.tracks,
          ...project.nestedSequences.flatMap((sequence) => sequence.tracks),
        ].flatMap((track) => track.clips.flatMap(inputOf)),
      };
      const result = await compositor.evaluate(
        ({ request, fromSec }) =>
          window.__editorV2DurableRenderBench.previewTimelineAudio(request, fromSec),
        { request, fromSec },
      );
      return result.channelsBase64.map((channel) => {
        const bytes = Buffer.from(channel, 'base64');
        return new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      });
    };
    const previewAudio = async (project: EditorProjectV2, fromSec = 0, channel = 0) =>
      (await previewChannels(project, fromSec))[channel]!;
    const summary = [];
    const commandResponses: Array<{ status: number; body: string }> = [];
    page.on('response', async (response) => {
      if (/\/video-projects\/[^/]+\/commands$/.test(response.url()))
        commandResponses.push({
          status: response.status(),
          body: (await response.text()).slice(0, 800),
        });
    });
    if (COLLAGE_JOURNEY) {
      const fixture = process.env.VIDEO_EDITOR_RECORDED_FIXTURE!;
      assert(
        'collage uses the frozen real NASA recording',
        createHash('sha256').update(readFileSync(fixture)).digest('hex') ===
          '59c4807dc9c32bfbd2d97e7bfd400373ccc4eaa14ee14f3ba7f5aa88914cdc51',
      );
      const { buildRegisterGeneratedAssetOperation } = await import(
        '../../Continuum-Backend/App/media/registerGeneratedAsset'
      );
      const photos = [];
      for (const [index, image] of [
        { sec: 248, crop: '600:338:100:56', width: 600, height: 338 },
        { sec: 138, crop: '338:338:231:56', width: 338, height: 338 },
      ].entries()) {
        const file = join(folder, `recorded-photo-${index}.png`);
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-ss',
          String(image.sec),
          '-i',
          fixture,
          '-vf',
          `crop=${image.crop}`,
          '-frames:v',
          '1',
          '-y',
          file,
        ]);
        const bytes = readFileSync(file),
          owned = {
            path: `${BRAND}/video-editor-bench/${randomUUID()}/photo.png`,
            assetId: undefined as string | undefined,
            receiptKey: undefined as string | undefined,
          };
        ownedSources.push(owned);
        const operation = buildRegisterGeneratedAssetOperation({
          brandId: BRAND,
          kind: 'image',
          bucket: 'media-library',
          storagePath: owned.path,
          fileName: `bench-recorded-photo-${RUN}-${index}.png`,
          mimeType: 'image/png',
          createdBy: session.userId,
          width: image.width,
          height: image.height,
          sizeBytes: bytes.length,
          checksum: createHash('sha256').update(bytes).digest('hex'),
          source: 'canvas',
          operation: 'video_editor_local_fixture',
          originRef: {
            bench: 'collage',
            actualRecordedMedia: true,
            sourceRecordingSha256:
              '59c4807dc9c32bfbd2d97e7bfd400373ccc4eaa14ee14f3ba7f5aa88914cdc51',
            sourceSec: image.sec,
            crop: image.crop,
          },
        });
        const uploaded = await admin.storage
          .from('media-library')
          .upload(owned.path, bytes, { contentType: 'image/png' });
        if (uploaded.error) throw uploaded.error;
        owned.receiptKey = operation.idempotencyKey;
        const registered = await admin.schema('media').rpc('library_execute_operation', {
          p_action: operation.action,
          p_payload: { ...operation, actor: session.userId },
        });
        if (registered.error) throw registered.error;
        const receipt = registerGeneratedAssetResponseSchema.parse(registered.data);
        owned.assetId = receipt.assetId;
        const signedImage = await admin.storage
          .from('media-library')
          .createSignedUrl(owned.path, 1800);
        if (signedImage.error || !signedImage.data)
          throw signedImage.error ?? new Error('Photo URL missing');
        mediaVersions.set(receipt.versionId, {
          bucket: 'media-library',
          path: owned.path,
          url: signedImage.data.signedUrl,
        });
        // Raw ffmpeg RGB ignores this recording's PNG transfer profile. Normalize
        // through an independent browser image decode before spatial comparisons.
        const normalized = await compositor.evaluate(async (url) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Reference canvas unavailable');
          ctx.drawImage(bitmap, 0, 0);
          const bytes = new Uint8Array(
            await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
          );
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 32768)
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          bitmap.close();
          return { width: canvas.width, height: canvas.height, base64: btoa(binary) };
        }, signedImage.data.signedUrl);
        const referenceFile = join(folder, `recorded-photo-${index}-srgb.png`);
        writeFileSync(referenceFile, Buffer.from(normalized.base64, 'base64'));
        assert(
          `photo ${index} independent decode retains exact dimensions`,
          normalized.width === image.width && normalized.height === image.height,
        );
        photos.push({
          ...image,
          file,
          referenceFile,
          assetId: receipt.assetId,
          versionId: receipt.versionId,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        assert(
          `actual recorded photo ${index} registers an exact local Library version`,
          receipt.status === 'created',
        );
      }
      writeFileSync(join(folder, 'recorded-photos.json'), JSON.stringify(photos, null, 2));
      const decode = (file: string, width: number, height: number, sec?: number) =>
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            ...(sec === undefined ? [] : ['-ss', String(sec)]),
            '-i',
            file,
            '-frames:v',
            '1',
            '-vf',
            `scale=${width}:${height},format=rgb24`,
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          { maxBuffer: 4 * 1024 * 1024 },
        );
      const pcm = (file: string, channel: number) => {
        const bytes = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            file,
            '-vn',
            '-af',
            `pan=mono|c0=c${channel}`,
            '-ar',
            '48000',
            '-f',
            'f32le',
            'pipe:1',
          ],
          { maxBuffer: 4 * 1024 * 1024 },
        );
        return new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      };
      const mae = (a: Uint8Array, b: Uint8Array) =>
        a.length === b.length && a.length > 0
          ? a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) / a.length
          : Infinity;
      const audioError = (actual: Float32Array, expected: Float32Array) => {
        let energy = 0,
          error = 0;
        for (let n = 0; n < expected.length; n++) {
          energy += expected[n]! ** 2;
          error += ((actual[n] ?? 0) - expected[n]!) ** 2;
        }
        return {
          energy,
          relativeError: error / energy,
          lengthMatches: actual.length === expected.length,
        };
      };
      const sourceFrames = new Map<string, string>();
      const editTimings = [];
      const comparisons = [];
      for (const [format, width, height] of [
        ['portrait', 324, 576],
        ['landscape', 576, 324],
        ['square', 576, 576],
      ] as const) {
        await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
        await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
        const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1];
        if (!projectId) throw new Error('Collage project missing');
        ids.push(projectId);
        const initial = await getProject(api, projectId);
        const source = { sourceType: 'library_asset', assetId, renditionId: versionId };
        const seeded = await postOp(api, projectId, 'apply_commands', {
          expectedRevision: initial.revision,
          commands: [
            {
              commandType: 'add_track',
              track: {
                id: 'main',
                name: 'Real interview',
                kind: 'video',
                order: 0,
                clips: [
                  {
                    id: 'interview',
                    kind: 'video',
                    timelineStartSec: 0,
                    sourceInSec: 64.7,
                    durationSec: 5,
                    audioEnabled: true,
                    source,
                    keyframes: [
                      {
                        id: 'gain:a',
                        property: 'audio.volume',
                        timeSec: 0,
                        value: 0.4,
                        interpolation: 'linear',
                      },
                      {
                        id: 'gain:b',
                        property: 'audio.volume',
                        timeSec: 5,
                        value: 0.8,
                        interpolation: 'linear',
                      },
                    ],
                  },
                ],
              },
            },
            {
              commandType: 'add_track',
              track: {
                id: 'movie-pool',
                name: 'Ocean source',
                kind: 'video',
                order: 1,
                enabled: false,
                clips: [
                  {
                    id: 'ocean',
                    kind: 'video',
                    timelineStartSec: 0,
                    sourceInSec: 138,
                    durationSec: 5,
                    audioEnabled: false,
                    source,
                  },
                ],
              },
            },
            ...photos.map((photo, index) => ({
              commandType: 'add_track',
              track: {
                id: `photo-pool-${index}`,
                name: `Real photo ${index + 1}`,
                kind: 'overlay',
                order: 2 + index,
                enabled: false,
                clips: [
                  {
                    id: `photo-${index}`,
                    kind: 'overlay',
                    mediaKind: 'image',
                    timelineStartSec: 0,
                    durationSec: 5,
                    source: {
                      sourceType: 'library_asset',
                      assetId: photo.assetId,
                      renditionId: photo.versionId,
                    },
                  },
                ],
              },
            })),
            ...initial.tracks.map((track) => ({ commandType: 'remove_track', trackId: track.id })),
            {
              commandType: 'set_project_metadata',
              canvas: { ...initial.canvas, width, height },
              durationSec: 5,
            },
            {
              commandType: 'set_export_settings',
              exportSettings: editorExportSettingsSchema.parse({
                ...initial.exportSettings,
                width,
                height,
                frameRate: { numerator: 30, denominator: 1 },
                captionMode: 'none',
                videoBitrateKbps: 2500,
                audioBitrateKbps: 128,
              }),
            },
          ],
        });
        assert(
          `${format}: real videos and stills persist through the editor store`,
          seeded.status === 200,
          seeded.text.slice(0, 300),
        );
        const baseline = await getProject(api, projectId),
          baselineFilm = join(folder, `${format}-baseline.mp4`);
        await render(baseline, baselineFilm);
        const baselinePcm = [pcm(baselineFilm, 0), pcm(baselineFilm, 1)];
        const baselinePreview = [...(await previewChannels(baseline))];
        const outsideRefs = [];
        for (const at of [0.2, 4.8]) {
          const path = join(folder, `${format}-outside-${at}.png`);
          await render(baseline, path, at);
          outsideRefs.push({ at, path });
        }
        for (const bad of [
          { clipIds: ['interview', 'interview'], layout: 'stack', atSec: 0.5 },
          { clipIds: ['interview', 'missing'], layout: 'stack', atSec: 0.5 },
          { clipIds: ['interview', 'ocean', 'photo-0'], layout: 'grid', atSec: 0.5 },
          { clipIds: ['interview', 'photo-0'], layout: 'stack', atSec: 5 },
          { clipIds: ['interview', 'photo-0'], layout: 'stack', atSec: 0.5, durationSec: 4.7 },
        ]) {
          const beforeBad = await getProject(api, projectId);
          const rejected = await postOp(api, projectId, 'collage', bad);
          const afterBad = await getProject(api, projectId);
          assert(
            `${format}: invalid collage ${JSON.stringify(bad)} never commits`,
            rejected.status >= 400 && JSON.stringify(afterBad) === JSON.stringify(beforeBad),
            rejected.text.slice(0, 250),
          );
        }
        for (const properties of [{ reverse: true }, { playbackRate: 2 }]) {
          const original = await getProject(api, projectId),
            movie = clipById(original, 'ocean');
          if (!movie || movie.kind !== 'video') throw new Error('Input video missing');
          const setup = await postOp(api, projectId, 'apply_commands', {
            expectedRevision: original.revision,
            commands: [
              {
                commandType: 'upsert_clip',
                trackId: 'movie-pool',
                clip: { ...movie, ...properties },
              },
            ],
          });
          assert(`${format}: unsupported input fixture persists`, setup.status === 200);
          const beforeBad = await getProject(api, projectId);
          const rejected = await postOp(api, projectId, 'collage', {
            clipIds: ['interview', 'ocean'],
            layout: 'stack',
            atSec: 0.5,
          });
          assert(
            `${format}: reverse/speed collage never commits`,
            rejected.status >= 400 &&
              JSON.stringify(await getProject(api, projectId)) === JSON.stringify(beforeBad),
          );
          const undo = await postOp(api, projectId, 'undo', { toRevision: original.revision });
          assert(
            `${format}: unsupported-source fixture undo restores original inputs`,
            undo.status === 200 &&
              JSON.stringify((await getProject(api, projectId)).tracks) ===
                JSON.stringify(original.tracks),
          );
        }
        const originalIds = ['interview', 'ocean', 'photo-0', 'photo-1'];
        for (const [layout, count] of [
          ['stack', 2],
          ['stack', 3],
          ['stack', 4],
          ['side_by_side', 2],
          ['side_by_side', 3],
          ['side_by_side', 4],
          ['grid', 4],
        ] as const) {
          const clipIds =
            count === 2 ? [originalIds[0]!, originalIds[2]!] : originalIds.slice(0, count);
          const atSec = layout === 'stack' ? 0.5 : layout === 'side_by_side' ? 1 : 1.5;
          const tag = `${format}-${layout}-${count}`,
            before = await getProject(api, projectId);
          await page.reload();
          await expect(page.locator('[data-clip-id="interview"]:visible')).toHaveCount(1, {
            timeout: 30_000,
          });
          const mainBox = await page.locator('[data-clip-id="interview"]:visible').boundingBox();
          if (!mainBox) throw new Error('Main clip is not visible');
          const pxPerSec = mainBox.width / 5;
          const snapping = page.getByRole('button', { name: 'Toggle snapping', exact: true });
          if ((await snapping.getAttribute('aria-pressed')) === 'true') await snapping.click();
          await seek(page, pxPerSec, atSec);
          await selectClip(page, clipIds[0]!);
          await page.keyboard.down('Shift');
          for (const clipId of clipIds.slice(1)) await selectClip(page, clipId);
          await page.keyboard.up('Shift');
          await visible(page.getByRole('button', { name: 'Collage', exact: false })).click();
          const pending = page.waitForResponse(
            (r) => r.request().method() === 'POST' && r.url().endsWith(`/${projectId}/ops/collage`),
          );
          await page.evaluate(() =>
            window.addEventListener(
              'pointerup',
              () => {
                (window as unknown as { __collageCommitAt: number }).__collageCommitAt =
                  performance.now();
              },
              { once: true, capture: true },
            ),
          );
          await page
            .getByRole('menuitem', {
              name:
                layout === 'stack'
                  ? 'Film strips'
                  : layout === 'side_by_side'
                    ? 'Side by side'
                    : 'Four-panel grid',
              exact: true,
            })
            .click();
          const response = await pending;
          await response.finished();
          assert(
            `${tag}: native collage commits successfully`,
            response.ok(),
            (await response.text()).slice(0, 400),
          );
          const durationMs = await page.evaluate((url) => {
            const start = (window as unknown as { __collageCommitAt: number }).__collageCommitAt;
            const resource = performance
              .getEntriesByName(url)
              .filter((e) => e.startTime >= start - 0.5)
              .at(-1) as PerformanceResourceTiming | undefined;
            if (!resource || !Number.isFinite(start))
              throw new Error('Collage commit timing missing');
            return resource.responseEnd - start;
          }, response.url());
          editTimings.push({ tag, durationMs });
          const edited = await getProject(api, projectId),
            track = edited.tracks.find((t) => t.name === 'Collage');
          if (!track || track.kind !== 'overlay') throw new Error('Collage panels missing');
          const columns = layout === 'side_by_side' ? count : layout === 'grid' ? 2 : 1,
            rows = layout === 'stack' ? count : layout === 'grid' ? 2 : 1;
          const panels = track.clips;
          assert(
            `${tag}: selected sources fill the requested cells in one atomic revision`,
            edited.revision === before.revision + 1 &&
              panels.length === count &&
              panels.every((panel, index) => {
                const sourceClip = clipById(before, clipIds[index]!);
                return (
                  sourceClip &&
                  'source' in sourceClip &&
                  JSON.stringify(panel.source) === JSON.stringify(sourceClip.source) &&
                  panel.mediaKind === (sourceClip.kind === 'video' ? 'video' : 'image') &&
                  near(panel.timelineStartSec, atSec, 1e-5) &&
                  panel.durationSec === 3 &&
                  near(panel.transform.position.x, ((index % columns) + 0.5) / columns, 1e-5) &&
                  near(panel.transform.position.y, (Math.floor(index / columns) + 0.5) / rows, 1e-5)
                );
              }),
          );
          assert(
            `${tag}: collage preserves every original track, source span, gain key and total duration`,
            edited.durationSec === before.durationSec &&
              JSON.stringify(edited.tracks.filter((t) => t.id !== track.id)) ===
                JSON.stringify(before.tracks),
          );
          writeFileSync(
            join(folder, `${tag}.json`),
            JSON.stringify(
              { before, edited, request: response.request().postDataJSON(), durationMs },
              null,
              2,
            ),
          );
          await page.reload();
          const reloaded = await getProject(api, projectId);
          assert(
            `${tag}: reload retains the complete collage document`,
            JSON.stringify(reloaded.tracks) === JSON.stringify(edited.tracks),
          );
          const film = join(folder, `${tag}.mp4`);
          await render(reloaded, film);
          const meta = JSON.parse(
            execFileSync(
              'ffprobe',
              [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_entries',
                'stream=width,height,nb_frames,avg_frame_rate:format=duration',
                '-of',
                'json',
                film,
              ],
              { encoding: 'utf8' },
            ),
          ) as {
            streams: Array<{
              width: number;
              height: number;
              nb_frames: string;
              avg_frame_rate: string;
            }>;
            format: { duration: string };
          };
          assert(
            `${tag}: encoded film has all150 frames at exact five-second duration`,
            meta.streams[0]?.width === width &&
              meta.streams[0]?.height === height &&
              Number(meta.streams[0]?.nb_frames) === 150 &&
              meta.streams[0]?.avg_frame_rate === '30/1' &&
              near(Number(meta.format.duration), 5, 1e-5),
          );
          const audioErrors = baselinePcm.map((expected, channel) =>
            audioError(pcm(film, channel), expected),
          );
          assert(
            `${tag}: encoded stereo sound is continuous and unchanged by picture panels`,
            audioErrors.every((e) => e.energy > 1e-6 && e.lengthMatches && e.relativeError < 0.02),
            JSON.stringify(audioErrors),
          );
          const previewErrors = [];
          const actualPreview = await previewChannels(edited);
          for (const channel of [0, 1])
            previewErrors.push(audioError(actualPreview[channel]!, baselinePreview[channel]!));
          assert(
            `${tag}: native stereo sound retains the original automated gain`,
            previewErrors.every(
              (e) => e.energy > 1e-6 && e.lengthMatches && e.relativeError < 0.02,
            ),
            JSON.stringify(previewErrors),
          );
          for (const ref of outsideRefs) {
            const actual = join(folder, `${tag}-outside-${ref.at}.png`);
            await render(edited, actual, ref.at);
            assert(
              `${tag} ${ref.at}s: collage changes no picture outside its active window`,
              readFileSync(actual).equals(readFileSync(ref.path)),
            );
          }
          for (const local of [0.5, 1.5, 2.5]) {
            const images = [];
            for (const id of clipIds) {
              const original = clipById(before, id);
              if (!original || !('source' in original))
                throw new Error('Reference picture missing');
              if (original.kind === 'overlay') {
                const photo = photos.find((p) => p.assetId === original.source.assetId);
                if (!photo) throw new Error('Reference still missing');
                images.push(photo.referenceFile);
              } else if (original.kind === 'video') {
                const key = `${original.source.renditionId}:${original.sourceInSec}:${local}`;
                let path = sourceFrames.get(key);
                if (!path) {
                  path = join(folder, `source-${original.id}-${local}.png`);
                  const control = structuredClone(before);
                  control.canvas = { ...control.canvas, width: 800, height: 450 };
                  control.exportSettings = { ...control.exportSettings, width: 800, height: 450 };
                  control.tracks = [
                    {
                      ...before.tracks[0]!,
                      kind: 'video',
                      clips: [
                        {
                          ...original,
                          id: 'reference',
                          timelineStartSec: 0,
                          durationSec: 5,
                          keyframes: [],
                          keyframeOffsetSec: 0,
                          audioEnabled: false,
                        },
                      ],
                    },
                  ];
                  await render(control, path, local);
                  sourceFrames.set(key, path);
                }
                images.push(path);
              }
            }
            const reference = join(folder, `${tag}-${local}-reference.png`),
              wrongReference = join(folder, `${tag}-${local}-swapped.png`);
            const physicalReference = (files: string[], target: string) => {
              const w = width / columns,
                h = height / rows;
              const filters = files.map(
                (_, i) =>
                  `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[p${i}]`,
              );
              filters.push(
                `${files.map((_, i) => `[p${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % columns) * w}_${Math.floor(i / columns) * h}`).join('|')}[out]`,
              );
              execFileSync('ffmpeg', [
                '-v',
                'error',
                '-filter_complex_threads',
                '1',
                ...files.flatMap((file) => ['-i', file]),
                '-filter_complex',
                filters.join(';'),
                '-map',
                '[out]',
                '-frames:v',
                '1',
                '-y',
                target,
              ]);
            };
            physicalReference(images, reference);
            physicalReference([images[1]!, images[0]!, ...images.slice(2)], wrongReference);
            const actual = decode(film, width, height, atSec + local),
              expected = decode(reference, width, height),
              wrong = decode(wrongReference, width, height);
            const error = mae(actual, expected),
              wrongError = mae(actual, wrong);
            if (tag === 'portrait-stack-2' && local === 0.5) {
              const rawProfile = join(folder, 'raw-photo-profile-control.png');
              physicalReference([images[0]!, photos[0]!.file], rawProfile);
              const raw = decode(rawProfile, width, height);
              const from = ((width * height) / 2) * 3;
              const rawCellError = mae(actual.subarray(from), raw.subarray(from));
              assert(
                'independent picture oracle rejects the unconverted video-profile PNG',
                rawCellError > 8,
                JSON.stringify({ rawCellError }),
              );
            }
            const cells = panels.map((_, i) => {
              let energy = 0,
                delta = 0;
              const w = width / columns,
                h = height / rows,
                x0 = (i % columns) * w,
                y0 = Math.floor(i / columns) * h;
              for (let y = y0; y < y0 + h; y++)
                for (let x = x0; x < x0 + w; x++)
                  for (let c = 0; c < 3; c++) {
                    const offset = (y * width + x) * 3 + c;
                    energy += expected[offset]!;
                    delta += Math.abs(actual[offset]! - expected[offset]!);
                  }
              return { energy, error: delta / (w * h * 3) };
            });
            assert(
              `${tag} ${local}s: every decoded cell matches an independent center-fill reference`,
              error < 8 && cells.every((c) => c.energy > 10000 && c.error < 8),
              JSON.stringify({ error, cells }),
            );
            assert(
              `${tag} ${local}s: the physical oracle rejects swapped sources`,
              wrongError > error + 4,
              JSON.stringify({ error, wrongError }),
            );
            const snap = page.getByRole('button', { name: 'Toggle snapping', exact: true });
            if ((await snap.getAttribute('aria-pressed')) === 'true') await snap.click();
            await seek(page, pxPerSec, atSec + local);
            let videoIndex = 1;
            for (const panel of panels)
              if (panel.mediaKind === 'video') {
                const element = page.getByTestId('edit-stage').locator('video').nth(videoIndex++);
                await expect
                  .poll(() => element.evaluate((v) => v.readyState))
                  .toBeGreaterThanOrEqual(2);
                await expect
                  .poll(() => element.evaluate((v) => v.currentTime))
                  .toBeCloseTo(panel.sourceInSec + local, 2);
              }
            const native = join(folder, `${tag}-${local}-native.png`);
            writeFileSync(
              native,
              await page
                .getByTestId('edit-stage')
                .locator('video')
                .first()
                .locator('..')
                .screenshot(),
            );
            const nativeError = mae(decode(native, width, height), expected);
            assert(
              `${tag} ${local}s: native collage framing matches the physical reference`,
              nativeError < 12,
              JSON.stringify({ nativeError }),
            );
            comparisons.push({ tag, local, error, wrongError, nativeError, cells });
          }
          const undone = await postOp(api, projectId, 'undo', { toRevision: before.revision }),
            restored = await getProject(api, projectId);
          assert(
            `${tag}: one undo removes every panel and restores all source tracks`,
            undone.status === 200 &&
              JSON.stringify(restored.tracks) === JSON.stringify(before.tracks) &&
              restored.durationSec === before.durationSec,
          );
          summary.push({ tag, before, edited, audioErrors, previewErrors, durationMs });
        }
      }
      writeFileSync(
        join(folder, 'collage-results.json'),
        JSON.stringify({ editTimings, comparisons, photos }, null, 2),
      );
      proof.notes.push(
        `speed samples: ${JSON.stringify({ collage_save: editTimings.map((sample) => sample.durationMs) })}`,
      );
      proof.notes.push(
        `All native collage pointer-release→response-end samples: ${JSON.stringify(editTimings.map((s) => s.durationMs))}`,
      );
      assert(
        'all21 native collage saves meet the one-second local editor-operation ceiling',
        editTimings.length === 21 &&
          editTimings.every((s) => s.durationMs > 0 && s.durationMs <= 1000),
      );
    }
    for (const interpolation of !SPEECH_JOURNEY
      ? []
      : ANIMATED_SPEECH_JOURNEY
        ? (['hold', 'linear', 'bezier', 'spring'] as const)
        : ([undefined] as const)) {
      const speechFolder = interpolation ? join(folder, interpolation) : folder;
      mkdirSync(speechFolder, { recursive: true });
      await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
      await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
      const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1];
      if (!projectId) throw new Error('New speech project URL missing');
      ids.push(projectId);
      const initial = await getProject(api, projectId);
      // Start/end between complete cached words; an already-truncated source word
      // cannot establish preservation by the subsequent jump operation.
      const sourceInSec = 64.7;
      const durationSec = 11.3;
      const seeded = await postOp(api, projectId, 'apply_commands', {
        expectedRevision: initial.revision,
        commands: [
          {
            commandType: 'add_track',
            track: {
              id: 'interview',
              kind: 'video',
              name: 'Real NASA interview',
              order: 0,
              clips: [
                {
                  id: 'speaker',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec,
                  durationSec,
                  audioEnabled: true,
                  ...(interpolation
                    ? {
                        keyframeOffsetSec: 2.3,
                        keyframes: [
                          ...['transform.opacity', 'audio.volume'].flatMap((property) => [
                            {
                              id: `${property}:a`,
                              property,
                              timeSec: 2.3,
                              value: property === 'audio.volume' ? 0.25 : 0.65,
                              interpolation,
                              ...(interpolation === 'bezier'
                                ? {
                                    easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
                                    expression: 'wiggle(0.7, 0.03)',
                                  }
                                : {}),
                              ...(interpolation === 'spring'
                                ? { spring: { bounce: 0.4 }, expression: 'loop' }
                                : {}),
                            },
                            {
                              id: `${property}:b`,
                              property,
                              timeSec: 5.3,
                              value: property === 'audio.volume' ? 0.85 : 0.9,
                              interpolation: 'linear',
                            },
                          ]),
                          {
                            id: 'position:a',
                            property: 'transform.position',
                            timeSec: 2.3,
                            value: { x: 0.42, y: 0.45 },
                            interpolation,
                            ...(interpolation === 'bezier'
                              ? { easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } }
                              : {}),
                            ...(interpolation === 'spring' ? { spring: { bounce: 0.4 } } : {}),
                          },
                          {
                            id: 'position:b',
                            property: 'transform.position',
                            timeSec: 5.3,
                            value: { x: 0.58, y: 0.55 },
                            interpolation: 'linear',
                          },
                        ],
                      }
                    : {}),
                  source: { sourceType: 'library_asset', assetId, renditionId: versionId },
                },
              ],
            },
          },
          ...initial.tracks.map((track) => ({ commandType: 'remove_track', trackId: track.id })),
          {
            commandType: 'set_project_metadata',
            canvas: { ...initial.canvas, width: 640, height: 640 },
            durationSec,
          },
          {
            commandType: 'set_export_settings',
            exportSettings: editorExportSettingsSchema.parse({
              ...initial.exportSettings,
              width: 640,
              height: 640,
              frameRate: { numerator: 30, denominator: 1 },
              videoBitrateKbps: 2500,
              audioBitrateKbps: 128,
            }),
          },
          {
            commandType: 'set_markers',
            markers: Array.from({ length: Math.floor(durationSec * 2) + 1 }, (_, i) => ({
              id: `beat:${i}`,
              kind: 'beat',
              label: `Beat ${i + 1}`,
              timeSec: i / 2,
              beatIndex: i,
            })),
          },
        ],
      });
      assert(
        'real interview and explicit beat grid persist',
        seeded.status === 200,
        seeded.text.slice(0, 200),
      );
      await page.reload();
      await expect(page.locator('[data-clip-id="speaker"]:visible')).toHaveCount(1, {
        timeout: 30_000,
      });
      const captionStarted = performance.now();
      await visible(page.getByRole('button', { name: 'Auto-captions', exact: true })).click();
      const captioned = await until(
        () => getProject(api, projectId),
        (p) => p.tracks.some((t) => t.kind === 'caption' && t.clips.length > 0),
      );
      proof.notes.push(
        `Native Auto-captions wall time including UI/store readback: ${performance.now() - captionStarted}ms`,
      );
      const wordsOf = (project: EditorProjectV2) =>
        project.tracks
          .filter((track) => track.kind === 'caption')
          .flatMap((track): EditorClip[] => track.clips)
          .flatMap((clip) =>
            clip.kind === 'caption'
              ? clip.words.map((word) => ({
                  text: word.text,
                  startSec: clip.timelineStartSec + word.startSec,
                  endSec: clip.timelineStartSec + word.endSec,
                }))
              : [],
          )
          .sort((a, b) => a.startSec - b.startSec);
      const expectedWords = sourceWords
        .filter((word) => word.endSec > sourceInSec && word.startSec < sourceInSec + durationSec)
        .map((word) => ({
          text: word.text,
          startSec: Math.max(0, word.startSec - sourceInSec),
          endSec: Math.min(durationSec, word.endSec - sourceInSec),
        }));
      const captionWords = wordsOf(captioned);
      writeFileSync(
        join(speechFolder, 'caption-input-readback.json'),
        JSON.stringify(
          { sourceInSec, durationSec, expectedWords, captionWords, captioned },
          null,
          2,
        ),
      );
      assert(
        'native auto-captions retain all cached real words and source-relative timing',
        captionWords.length === expectedWords.length &&
          captionWords.every((word, index) => {
            const expected = expectedWords[index]!;
            return (
              word.text === expected.text &&
              near(word.startSec, expected.startSec, 1e-5) &&
              near(word.endSec, expected.endSec, 1e-5)
            );
          }),
        JSON.stringify({ expected: expectedWords.length, actual: captionWords.length }),
      );
      const bareSettings = { ...captioned.exportSettings, captionMode: 'none' as const };
      const bare = await postOp(api, projectId, 'apply_commands', {
        expectedRevision: captioned.revision,
        commands: [{ commandType: 'set_export_settings', exportSettings: bareSettings }],
      });
      assert('baseline caption-free export settings persist', bare.status === 200);
      const before = await getProject(api, projectId);
      const baselinePath = join(speechFolder, 'speech-baseline.mp4');
      await render(before, baselinePath);
      await page.reload();
      await expect(page.locator('[data-clip-id="speaker"]:visible')).toHaveCount(1, {
        timeout: 30_000,
      });
      await selectClip(page, 'speaker');
      const jumpStarted = performance.now();
      const jumpResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith(`/${projectId}/ops/beat_cut`),
      );
      await visible(page.getByRole('button', { name: 'Quick cuts', exact: true })).click();
      const jumped = await jumpResponse;
      assert(
        `${interpolation ?? 'plain'}: native Quick cuts accepts the interview`,
        jumped.ok(),
        (await jumped.text()).slice(0, 500),
      );
      const edited = await until(
        () => getProject(api, projectId),
        (p) => p.revision > before.revision,
      );
      proof.notes.push(
        `Native speech jump wall time including UI/store readback: ${performance.now() - jumpStarted}ms`,
      );
      const clips = mainClips(edited).filter((clip) => clip.kind === 'video');
      assert(
        'native Quick cuts makes real source jumps in one atomic revision',
        clips.length > 1 &&
          edited.revision === before.revision + 1 &&
          edited.durationSec < before.durationSec,
        JSON.stringify({
          clips: clips.length,
          revisions: [before.revision, edited.revision],
          commandResponses,
          pageErrors,
        }),
      );
      const removed = clips.slice(1).map((clip, i) => ({
        startSec: clips[i]!.sourceInSec + clips[i]!.durationSec,
        endSec: clip.sourceInSec,
      }));
      const shift = (sourceTime: number) =>
        removed.reduce(
          (total, range) =>
            total + Math.max(0, Math.min(sourceTime, range.endSec) - range.startSec),
          0,
        );
      const rebased = wordsOf(edited);
      writeFileSync(
        join(speechFolder, 'speech-jump-readback.json'),
        JSON.stringify({ expectedWords, rebased, before, edited, removed }, null, 2),
      );
      assert(
        'every real spoken word survives with unchanged duration and ripple-correct captions',
        rebased.length === expectedWords.length &&
          rebased.every((word, index) => {
            const expected = expectedWords[index]!;
            const moved = shift(expected.startSec + sourceInSec);
            return (
              word.text === expected.text &&
              near(word.startSec, expected.startSec - moved, 1e-5) &&
              near(word.endSec, expected.endSec - moved, 1e-5)
            );
          }),
        `${rebased.length} retained words; removed ${JSON.stringify(removed)}`,
      );
      assert(
        'no source jump cuts through a transcript word or its 80ms breathing room',
        removed.every((range) =>
          expectedWords.every(
            (word) =>
              range.endSec <= sourceInSec + word.startSec - 0.08 + 1e-5 ||
              range.startSec >= sourceInSec + word.endSec + 0.08 - 1e-5,
          ),
        ),
      );
      assert(
        'source jumps remain frame-aligned, gapless, and on output half-beats',
        clips.every(
          (clip, index) =>
            near(clip.timelineStartSec * 30, Math.round(clip.timelineStartSec * 30), 1e-4) &&
            near(clip.durationSec * 30, Math.round(clip.durationSec * 30), 1e-4) &&
            (!index ||
              (near(
                clip.timelineStartSec,
                clips[index - 1]!.timelineStartSec + clips[index - 1]!.durationSec,
                1e-5,
              ) &&
                Math.abs(clip.timelineStartSec - Math.round(clip.timelineStartSec * 4) / 4) <=
                  1 / 60 + 1e-5)),
        ),
      );
      await page.reload();
      await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(clips.length, {
        timeout: 30_000,
      });
      const reloaded = await getProject(api, projectId);
      assert(
        'reload retains the exact cut and caption tracks',
        JSON.stringify(reloaded.tracks) === JSON.stringify(edited.tracks),
      );
      const editedPath = join(speechFolder, 'speech-edited-bare.mp4');
      await render(reloaded, editedPath);
      const pcm = (file: string) => {
        const bytes = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-f',
          'f32le',
          'pipe:1',
        ]);
        return new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      };
      const baselinePcm = pcm(baselinePath),
        actualPcm = pcm(editedPath);
      let delta = 0,
        energy = 0,
        testedWords = 0;
      for (const [index, word] of expectedWords.entries()) {
        if (word.endSec - word.startSec < 0.04) continue;
        const center = (word.startSec + word.endSec) / 2;
        const outputCenter = (rebased[index]!.startSec + rebased[index]!.endSec) / 2;
        for (let i = -160; i < 160; i++) {
          const expected = baselinePcm[Math.round(center * 16000) + i] ?? 0;
          const actual = actualPcm[Math.round(outputCenter * 16000) + i] ?? 0;
          delta += (actual - expected) ** 2;
          energy += expected ** 2;
        }
        testedWords++;
      }
      assert(
        'independent decoded speech PCM preserves every measured word',
        testedWords > 20 && energy > 1e-6 && delta / energy < 0.02,
        JSON.stringify({ testedWords, relativePcmError: delta / energy }),
      );
      const frame = (file: string, sec: number) =>
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-ss',
            String(sec),
            '-i',
            file,
            '-frames:v',
            '1',
            '-vf',
            'scale=640:640,format=rgb24',
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          { maxBuffer: 2 * 1024 * 1024 },
        );
      const frameErrors = clips.flatMap((clip) =>
        (interpolation ? [1 / 3, 2 / 3] : [0.5]).map((fraction) => {
          const outputSec =
            Math.floor((clip.timelineStartSec + clip.durationSec * fraction) * 30) / 30 + 1 / 60;
          const sourceSec = outputSec - clip.timelineStartSec + clip.sourceInSec - sourceInSec;
          const got = frame(editedPath, outputSec),
            expected = frame(baselinePath, sourceSec);
          return got.length && got.length === expected.length
            ? got.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) / got.length
            : Infinity;
        }),
      );
      assert(
        'independent decoded picture follows each retained speech source span',
        frameErrors.every((error) => error < 4),
        JSON.stringify(frameErrors),
      );
      const nativeSamples = [],
        previewErrors = [];
      if (interpolation) {
        const original = mainClips(before)[0];
        if (!original || original.kind !== 'video') throw new Error('Animated source missing');
        assert(
          `${interpolation}: every retained picture keeps authored keys and original clock`,
          clips.every(
            (clip) =>
              JSON.stringify(clip.keyframes) === JSON.stringify(original.keyframes) &&
              near(clip.keyframeOffsetSec, 2.3 + clip.sourceInSec - sourceInSec, 1e-5),
          ),
        );
        const snapping = page.getByRole('button', { name: 'Toggle snapping', exact: true });
        if ((await snapping.getAttribute('aria-pressed')) === 'true') await snapping.click();
        const block = await page.locator(`[data-clip-id="${clips[0]!.id}"]:visible`).boundingBox();
        if (!block) throw new Error('Animated retained clip is not visible');
        const pxPerSec = block.width / clips[0]!.durationSec;
        for (const clip of clips)
          for (const fraction of [1 / 3, 2 / 3]) {
            const at = Math.floor((clip.timelineStartSec + clip.durationSec * fraction) * 30) / 30;
            const sourceLocal = at - clip.timelineStartSec + clip.sourceInSec - sourceInSec;
            const position = samplePositionTrack(
              positionKeysForProperty(original.keyframes),
              sourceLocal,
              original.transform.position,
              original.keyframeOffsetSec,
            );
            const opacity = sampleNumericTrack(
              numericKeysForProperty(original.keyframes, 'transform.opacity'),
              sourceLocal,
              original.transform.opacity,
              original.keyframeOffsetSec,
            );
            await seek(page, pxPerSec, at);
            const element = page.getByTestId('edit-stage').locator('video').first();
            const native = () =>
              element.evaluate(
                (v, expected) => {
                  const style = getComputedStyle(v),
                    m = new DOMMatrix(style.transform);
                  return {
                    error: Math.max(
                      Math.abs(m.e - (expected.position.x - 0.5) * v.clientWidth),
                      Math.abs(m.f - (expected.position.y - 0.5) * v.clientHeight),
                      Math.abs(Number(style.opacity) - expected.opacity) / 0.003,
                    ),
                    sourceTime: v.currentTime,
                  };
                },
                { position, opacity },
              );
            await expect.poll(async () => (await native()).error).toBeLessThanOrEqual(1);
            await expect
              .poll(async () => (await native()).sourceTime)
              .toBeCloseTo(sourceInSec + sourceLocal, 2);
            nativeSamples.push({ at, sourceLocal, position, opacity, ...(await native()) });
            writeFileSync(
              join(speechFolder, `native-${nativeSamples.length}.png`),
              await element.locator('..').screenshot(),
            );
          }
        assert(
          `${interpolation}: native picture samples retain source, motion and expression phase`,
          nativeSamples.length === clips.length * 2 &&
            nativeSamples.every((sample) => sample.error <= 1),
        );
        for (const channel of [0, 1]) {
          const baseline = await previewAudio(before, 0, channel),
            actual = await previewAudio(edited, 0, channel);
          writeFileSync(
            join(speechFolder, `preview-before-${channel}.f32`),
            Buffer.from(baseline.buffer),
          );
          writeFileSync(
            join(speechFolder, `preview-after-${channel}.f32`),
            Buffer.from(actual.buffer),
          );
          let energy = 0,
            error = 0;
          for (const [index, word] of expectedWords.entries()) {
            if (word.endSec - word.startSec < 0.04) continue;
            const center = (word.startSec + word.endSec) / 2,
              outputCenter = (rebased[index]!.startSec + rebased[index]!.endSec) / 2;
            for (let i = -480; i < 480; i++) {
              const wanted = baseline[Math.round(center * 48000) + i] ?? 0;
              error += ((actual[Math.round(outputCenter * 48000) + i] ?? 0) - wanted) ** 2;
              energy += wanted ** 2;
            }
          }
          previewErrors.push({ channel, energy, relativeError: error / energy });
        }
        assert(
          `${interpolation}: native stereo gain retains every measured spoken-word phase`,
          previewErrors.every((sample) => sample.energy > 1e-6 && sample.relativeError < 0.02),
          JSON.stringify(previewErrors),
        );
      }
      const burn = await postOp(api, projectId, 'apply_commands', {
        expectedRevision: reloaded.revision,
        commands: [
          {
            commandType: 'set_export_settings',
            exportSettings: { ...reloaded.exportSettings, captionMode: 'burn_in' },
          },
        ],
      });
      assert(
        'caption-burn export settings persist without editing the timeline',
        burn.status === 200,
      );
      const burnedProject = await getProject(api, projectId);
      assert(
        'caption burn consumes the same persisted speech and caption tracks',
        JSON.stringify(burnedProject.tracks) === JSON.stringify(edited.tracks),
      );
      const burnedPath = join(speechFolder, 'speech-edited-captions.mp4');
      await render(burnedProject, burnedPath);
      const encoded = JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-count_frames',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=duration,nb_read_frames,avg_frame_rate',
            '-of',
            'json',
            burnedPath,
          ],
          { encoding: 'utf8' },
        ),
      ) as { streams: Array<{ duration: string; nb_read_frames: string; avg_frame_rate: string }> };
      assert(
        'encoded speech export has every 30fps timeline frame and exact duration',
        encoded.streams[0]?.avg_frame_rate === '30/1' &&
          Number(encoded.streams[0]?.nb_read_frames) ===
            Math.round(burnedProject.durationSec * 30) &&
          near(Number(encoded.streams[0]?.duration), burnedProject.durationSec, 1e-5),
        JSON.stringify(encoded),
      );
      const band = captionBand(burnedProject, 640);
      const burnedFrames = decodeBandRgb(burnedPath, 640, band),
        bareFrames = decodeBandRgb(editedPath, 640, band);
      assert(
        'burned and bare exports have the same frame count',
        burnedFrames.length === bareFrames.length && burnedFrames.length > 0,
      );
      const wordTiming = judgeWordTiming(
        spokenWordPerFrame(burnedProject, burnedFrames.length, 30),
        burnedFrames.map((frame, i) => highlightMask(frame, bareFrames[i]!)),
      );
      assert(
        'exported caption highlights follow rebased real speech within one frame',
        wordTiming.offsets.length > 10 &&
          wordTiming.off.length === 0 &&
          wordTiming.unseen === 0 &&
          wordTiming.darkWhileSpoken === 0 &&
          wordTiming.litWhileSilent === 0,
        JSON.stringify(wordTiming),
      );
      const undo = await postOp(api, projectId, 'undo', { toRevision: before.revision });
      const restored = await getProject(api, projectId);
      assert(
        'one undo restores the original speech timeline and all captions',
        undo.status === 200 &&
          JSON.stringify(restored.tracks) === JSON.stringify(before.tracks) &&
          JSON.stringify(restored.markers) === JSON.stringify(before.markers) &&
          near(restored.durationSec, before.durationSec, 1e-5),
      );
      summary.push({
        fixture: 'nasa-melvin',
        interpolation,
        nativeSamples,
        previewErrors,
        sourceInSec,
        durationSec,
        before,
        edited,
        burnedProject,
        removed,
        testedWords,
        pcmRelativeError: delta / energy,
        frameErrors,
        wordTiming,
      });
    }
    for (const interpolation of SPEECH_JOURNEY || COLLAGE_JOURNEY
      ? []
      : KEYFRAME_LOCAL
        ? (['linear'] as const)
        : (['hold', 'linear', 'bezier', 'spring'] as const)) {
      await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
      await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
      const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1];
      if (!projectId) throw new Error('New project URL missing');
      ids.push(projectId);
      await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
        timeout: 180_000,
      });
      const initial = await getProject(api, projectId);
      const keys = ['transform.opacity', 'audio.volume'].flatMap((property) => [
        {
          id: `${property}:a`,
          property,
          timeSec: 0.5,
          value: 0.3,
          interpolation,
          ...(interpolation === 'bezier'
            ? { easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, expression: 'wiggle(0.7, 0.05)' }
            : {}),
          ...(interpolation === 'spring' ? { spring: { bounce: 0.7 }, expression: 'loop' } : {}),
        },
        { id: `${property}:b`, property, timeSec: 3.5, value: 0.8, interpolation: 'linear' },
      ]);
      const seeded = await postOp(api, projectId, 'apply_commands', {
        expectedRevision: initial.revision,
        commands: [
          {
            commandType: 'add_track',
            track: {
              id: `curve-${interpolation}`,
              kind: 'video',
              name: 'Recorded curves',
              order: 0,
              clips: [
                {
                  id: `source-${interpolation}`,
                  kind: 'video',
                  timelineStartSec: 0,
                  durationSec: 4,
                  source: { sourceType: 'library_asset', assetId, renditionId: versionId },
                  ...(KEYFRAME_LOCAL ? { sourceInSec: 64.7 } : {}),
                  volume: 0.6,
                  fadeInSec: 3,
                  fadeOutSec: 3,
                  ...(PARENT_JOURNEY ? { parentClipId: `driver-${interpolation}` } : {}),
                  keyframes: PARENT_JOURNEY
                    ? [
                        ...keys,
                        {
                          id: 'move-a',
                          property: 'transform.position',
                          timeSec: 0,
                          value: { x: 0.5, y: 0.5 },
                          interpolation: 'linear',
                        },
                        {
                          id: 'move-b',
                          property: 'transform.position',
                          timeSec: 4,
                          value: { x: 0.62, y: 0.5 },
                          interpolation: 'linear',
                        },
                      ]
                    : keys,
                },
              ],
            },
          },
          ...(TEXT_JOURNEY
            ? [
                {
                  commandType: 'add_track',
                  track: {
                    id: `titles-${interpolation}`,
                    kind: 'text',
                    name: 'Retained title',
                    order: 1,
                    clips: [
                      {
                        id: `title-${interpolation}`,
                        kind: 'text',
                        timelineStartSec: 0,
                        durationSec: 4,
                        text: 'KEEP THE CLOCK',
                        ...(PARENT_JOURNEY ? { parentClipId: `source-${interpolation}` } : {}),
                        style: {
                          fontFamily: 'Arial',
                          fontSizePx: 64,
                          fontWeight: 700,
                          color: '#ffffff',
                        },
                        transform: { position: { x: 0.5, y: 0.3, unit: 'normalized' } },
                        animationIn: {
                          hold: 'typewriter',
                          linear: 'slideLeft',
                          bezier: 'wordPop',
                          spring: 'blurIn',
                        }[interpolation],
                        animationOut: 'wipe',
                        keyframes: keys.filter((key) => key.property === 'transform.opacity'),
                      },
                    ],
                  },
                },
              ]
            : []),
          ...(CAPTION_JOURNEY
            ? [
                {
                  commandType: 'add_track',
                  track: {
                    id: `captions-${interpolation}`,
                    name: 'Retained captions',
                    kind: 'caption',
                    order: 3,
                    clips: [0, 1, 2, 3].map((index) => ({
                      id: `caption-${interpolation}-${index}`,
                      kind: 'caption',
                      timelineStartSec: index,
                      durationSec: 1,
                      text: 'BEAT',
                      language: 'en',
                      words: [{ text: 'BEAT', startSec: 0.1, endSec: 0.9, emphasis: true }],
                      parentClipId: `source-${interpolation}`,
                      highlightMode: 'word',
                      highlightColor: '#ff00ff',
                      style: {
                        fontFamily: 'Arial',
                        fontSizePx: 64,
                        fontWeight: 700,
                        color: '#ffffff',
                      },
                      transform: {
                        position: { x: 0.4, y: 0.75, unit: 'normalized' },
                        scaleX: 1.1,
                        scaleY: 0.9,
                        rotationDeg: 5,
                        opacity: 0.65,
                      },
                    })),
                  },
                },
              ]
            : []),
          ...(PARENT_JOURNEY
            ? [
                {
                  commandType: 'add_track',
                  track: {
                    id: `driver-track-${interpolation}`,
                    name: 'Parent clock driver',
                    kind: 'text',
                    order: 2,
                    enabled: false,
                    clips: [
                      {
                        id: `driver-${interpolation}`,
                        kind: 'text',
                        text: 'MOTION',
                        timelineStartSec: 0.5,
                        durationSec: 1,
                        enabled: false,
                        style: {
                          fontFamily: 'Arial',
                          fontSizePx: 64,
                          fontWeight: 700,
                          color: '#ffffff',
                        },
                        keyframes: [
                          {
                            id: 'driver-a',
                            property: 'transform.position',
                            timeSec: 0,
                            value: { x: 0.5, y: 0.5 },
                            interpolation: 'bezier',
                            easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
                            expression: 'wiggle(0.7, 0.02)',
                          },
                          {
                            id: 'driver-b',
                            property: 'transform.position',
                            timeSec: 3,
                            value: { x: 0.5, y: 0.6 },
                            interpolation: 'linear',
                          },
                        ],
                      },
                    ],
                  },
                },
              ]
            : []),
          ...initial.tracks.map((track) => ({ commandType: 'remove_track', trackId: track.id })),
          {
            commandType: 'set_project_metadata',
            canvas: {
              ...initial.canvas,
              width: KEYFRAME_LOCAL ? 640 : 360,
              height: KEYFRAME_LOCAL ? 360 : 640,
            },
            durationSec: 4,
          },
          {
            commandType: 'set_export_settings',
            exportSettings: editorExportSettingsSchema.parse({
              ...initial.exportSettings,
              width: KEYFRAME_LOCAL ? 640 : 360,
              height: KEYFRAME_LOCAL ? 360 : 640,
              frameRate: { numerator: 30, denominator: 1 },
              videoBitrateKbps: 1500,
              audioBitrateKbps: 128,
              ...(CAPTION_JOURNEY ? { captionMode: 'burn_in' } : {}),
            }),
          },
        ],
      });
      assert(
        `${interpolation}: actual recording and curve keys persist`,
        seeded.status === 200,
        seeded.status === 200 ? undefined : seeded.text.slice(0, 400),
      );
      const before = await getProject(api, projectId);
      // Start native editing from a real document reload. This journey certifies
      // durable edits/composition, not external-write Realtime delivery.
      await page.reload();
      await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(1, {
        timeout: 20_000,
      });
      const original = mainClips(before)[0];
      if (!original) throw new Error('Original clip missing');
      const baselinePath = join(folder, `${interpolation}-baseline.mp4`);
      await render(before, baselinePath);
      const box = await page.locator(`[data-clip-id="${original.id}"]:visible`).boundingBox();
      if (!box) throw new Error('Original clip not visible');
      const pxPerSec = box.width / 4;
      if (KEYFRAME_JOURNEY) {
        const editTimings: Array<{
          label: string;
          durationMs: number;
          revision: number;
          serverTiming: string | null;
        }> = [];
        const edit = async (
          label: string,
          action: () => Promise<unknown>,
          event: 'pointerup' | 'blur' | 'keydown' = 'pointerup',
        ) => {
          const old = await getProject(api, projectId);
          await page.evaluate((event) => {
            const capture = (e: Event) => {
              if (e instanceof KeyboardEvent && !['ArrowRight', 'Delete'].includes(e.key)) return;
              (window as unknown as { __keyframeCommitAt: number }).__keyframeCommitAt =
                performance.now();
              window.removeEventListener(event, capture, true);
            };
            window.addEventListener(event, capture, true);
          }, event);
          const pending = page.waitForResponse(
            (r) => r.request().method() === 'POST' && r.url().endsWith(`/${projectId}/commands`),
          );
          await action();
          const response = await pending;
          await response.finished();
          const body = (await response.json()) as { project?: unknown };
          const saved = editorProjectV2Schema.parse(body.project);
          const timing = await page.evaluate((url) => {
            const start = (window as unknown as { __keyframeCommitAt: number }).__keyframeCommitAt;
            const resource = performance
              .getEntriesByName(url)
              .filter((e) => e.startTime >= start - 0.5)
              .at(-1) as PerformanceResourceTiming | undefined;
            if (!resource || !Number.isFinite(start))
              throw new Error('Native keyframe save timing missing');
            return resource.responseEnd - start;
          }, response.url());
          const persisted = await getProject(api, projectId);
          assert(
            `f22 ${label}: one native revision acknowledges the exact stored edit`,
            response.ok() &&
              saved.revision === old.revision + 1 &&
              persisted.revision === saved.revision &&
              JSON.stringify(saved.tracks) === JSON.stringify(persisted.tracks),
          );
          assert(
            `f22 ${label}: release-to-response-end timing retained`,
            Number.isFinite(timing) && timing > 0,
          );
          editTimings.push({
            label,
            durationMs: timing,
            revision: saved.revision,
            serverTiming: response.headers()['server-timing'] ?? null,
          });
          writeFileSync(
            join(folder, 'keyframe-save-timings.json'),
            JSON.stringify(editTimings, null, 2),
          );
          await page.waitForTimeout(250);
          assert(
            `f22 ${label}: settling does not create a duplicate revision`,
            (await getProject(api, projectId)).revision === saved.revision,
          );
          return persisted;
        };
        const easingAt = (choice: string, u: number) => {
          if (choice === 'Hold') return 1;
          if (choice === 'Linear') return u;
          if (choice === 'Spring') {
            const bounce = 0.15,
              d = Math.log(50) * (1.15 - 0.65 * bounce),
              w = 2 * Math.PI * (0.75 + 2.25 * bounce);
            return (1 - Math.exp(-d * u) * Math.cos(w * u)) / (1 - Math.exp(-d) * Math.cos(w));
          }
          const [x1, y1, x2, y2] = choice === 'Back' ? [0.34, 1.56, 0.64, 1] : [0, 0, 0.58, 1];
          const bezier = (t: number, a: number, b: number) =>
            3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
          let lo = 0,
            hi = 1;
          for (let i = 0; i < 40; i++) {
            const t = (lo + hi) / 2;
            if (bezier(t, x1, x2) < u) lo = t;
            else hi = t;
          }
          return bezier((lo + hi) / 2, y1, y2);
        };
        const decode = (file: string, time?: number) =>
          execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-threads',
              '1',
              '-i',
              file,
              ...(time === undefined ? [] : ['-vf', `select=eq(n\\,${Math.round(time * 30)})`]),
              '-frames:v',
              '1',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              'pipe:1',
            ],
            { maxBuffer: 4_000_000 },
          );
        const mae = (a: Buffer, b: Buffer) =>
          a.length === b.length
            ? a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length
            : Infinity;
        const moments = (pixels: Buffer) => {
          let energy = 0,
            x = 0,
            y = 0;
          for (let i = 0; i < pixels.length; i += 3) {
            const w = pixels[i]! + pixels[i + 1]! + pixels[i + 2]!,
              p = i / 3;
            energy += w;
            x += w * ((p % 640) + 0.5);
            y += w * (Math.floor(p / 640) + 0.5);
          }
          return { energy, x: x / energy, y: y / energy };
        };
        const pcm = (file: string, channel: number) => {
          const raw = execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              file,
              '-vn',
              '-af',
              `pan=mono|c0=c${channel}`,
              '-ar',
              '48000',
              '-f',
              'f32le',
              'pipe:1',
            ],
            { maxBuffer: 4_000_000 },
          );
          return new Float32Array(
            raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
          );
        };
        const sourceRaw = execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            process.env.VIDEO_EDITOR_RECORDED_FIXTURE!,
            '-ss',
            '64.7',
            '-t',
            '4',
            '-vn',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-f',
            'f32le',
            'pipe:1',
          ],
          { maxBuffer: 4_000_000 },
        );
        writeFileSync(join(folder, 'f22-source-audio.f32'), sourceRaw);
        const sourcePcm = new Float32Array(
          sourceRaw.buffer.slice(sourceRaw.byteOffset, sourceRaw.byteOffset + sourceRaw.byteLength),
        );
        const cases = [
          {
            label: 'Position',
            properties: ['transform.position'],
            initial: { x: 0.35, y: 0.4 },
            a: { x: 0.4, y: 0.45 },
            b: { x: 0.6, y: 0.55 },
            fields: [
              ['X', '0.4'],
              ['Y', '0.45'],
            ],
          },
          {
            label: 'Scale',
            properties: ['transform.scaleX', 'transform.scaleY'],
            initial: 0.35,
            a: 0.4,
            b: 0.65,
            fields: [['Scale', '0.4']],
          },
          {
            label: 'Rotation',
            properties: ['transform.rotationDeg'],
            initial: -8,
            a: -12,
            b: 14,
            fields: [['Rotation', '-12']],
          },
          {
            label: 'Opacity',
            properties: ['transform.opacity'],
            initial: 0.45,
            a: 0.55,
            b: 0.75,
            fields: [['Opacity', '0.55']],
          },
          {
            label: 'Volume',
            properties: ['audio.volume'],
            initial: 0.3,
            a: 0.4,
            b: 0.8,
            fields: [['Volume', '0.4']],
          },
        ] as const;
        const comparisons: unknown[] = [];
        for (const c of cases)
          for (const [choiceIndex, choice] of [
            'Linear',
            'Hold',
            'Ease out',
            'Back',
            'Spring',
          ].entries()) {
            const tag = `${c.label}-${choice.replaceAll(' ', '-')}`,
              offset = choice === 'Back' ? 7.5 : 0;
            const old = await getProject(api, projectId),
              video = mainClips(old)[0];
            if (!video || video.kind !== 'video') throw new Error('Matrix recorded video missing');
            const seededClip = {
              ...video,
              keyframeOffsetSec: offset,
              fadeInSec: 0,
              fadeOutSec: 0,
              volume: 0.7,
              transform: {
                ...video.transform,
                position: { x: 0.5, y: 0.5, unit: 'normalized' },
                scaleX: 0.45,
                scaleY: 0.45,
                rotationDeg: 0,
                opacity: 0.75,
              },
              keyframes: c.properties.flatMap((property) => [
                {
                  id: `${property}-a`,
                  property,
                  timeSec: 0.5 + offset,
                  value: c.initial,
                  interpolation: 'linear',
                },
                {
                  id: `${property}-b`,
                  property,
                  timeSec: 3.5 + offset,
                  value: c.b,
                  interpolation: 'linear',
                },
              ]),
            };
            const seeded = await postOp(api, projectId, 'apply_commands', {
              expectedRevision: old.revision,
              commands: [
                {
                  commandType: 'upsert_clip',
                  trackId: old.tracks.find((t) => t.clips.some((v) => v.id === video.id))!.id,
                  clip: seededClip,
                },
              ],
            });
            assert(
              `f22 ${tag}: actual recorded source and retained clock seed`,
              seeded.status === 200,
              seeded.status === 200 ? undefined : seeded.text.slice(0, 400),
            );
            await page.reload();
            await selectClip(page, video.id);
            await visible(
              page.getByRole('button', { name: `${c.label} keyframe at 0.50 s`, exact: true }),
            ).click();
            const editor = visible(page.getByTestId('keyframe-editor'));
            for (const [field, value] of c.fields) {
              const input = editor.getByLabel(field, { exact: true });
              await input.fill(value);
              await edit(`${tag} ${field} value`, () => input.press('Tab'), 'blur');
            }
            const edited = await edit(`${tag} easing`, () =>
              editor.getByRole('button', { name: choice, exact: true }).click(),
            );
            const keyed = mainClips(edited)[0];
            if (!keyed || keyed.kind !== 'video') throw new Error('Matrix edited video missing');
            const expectedInterpolation =
              choice === 'Hold'
                ? 'hold'
                : choice === 'Spring'
                  ? 'spring'
                  : ['Back', 'Ease out'].includes(choice)
                    ? 'bezier'
                    : 'linear';
            assert(
              `f22 ${tag}: typed key values and easing preserve both linked scale axes and source`,
              keyed.sourceInSec === 64.7 &&
                keyed.durationSec === 4 &&
                keyed.keyframeOffsetSec === offset &&
                JSON.stringify(keyed.source) === JSON.stringify(video.source) &&
                keyed.keyframes.filter((k) => k.timeSec === 0.5 + offset).length ===
                  c.properties.length &&
                keyed.keyframes
                  .filter((k) => k.timeSec === 0.5 + offset)
                  .every(
                    (k) =>
                      JSON.stringify(k.value) === JSON.stringify(c.a) &&
                      k.interpolation === expectedInterpolation,
                  ),
            );
            writeFileSync(join(folder, `${tag}.json`), JSON.stringify(edited, null, 2));
            const film = join(folder, `${tag}.mp4`);
            await render(edited, film);
            const meta = JSON.parse(
              execFileSync(
                'ffprobe',
                [
                  '-v',
                  'error',
                  '-select_streams',
                  'v:0',
                  '-show_entries',
                  'stream=width,height,nb_frames,avg_frame_rate:format=duration',
                  '-of',
                  'json',
                  film,
                ],
                { encoding: 'utf8' },
              ),
            ) as {
              streams: Array<{
                width: number;
                height: number;
                nb_frames: string;
                avg_frame_rate: string;
              }>;
              format: { duration: string };
            };
            assert(
              `f22 ${tag}: actual browser export contains 120 recorded frames at exact duration`,
              meta.streams[0]?.width === 640 &&
                meta.streams[0]?.height === 360 &&
                Number(meta.streams[0]?.nb_frames) === 120 &&
                meta.streams[0]?.avg_frame_rate === '30/1' &&
                Math.abs(Number(meta.format.duration) - 4) < 1e-5,
            );
            for (const sec of [1, 2, 3]) {
              const u = (sec - 0.5) / 3,
                k = easingAt(choice, u);
              const value =
                typeof c.a === 'number' && typeof c.b === 'number'
                  ? c.a + (c.b - c.a) * k
                  : { x: 0.4 + 0.2 * k, y: 0.45 + 0.1 * k };
              const control = structuredClone(edited),
                fixed = mainClips(control)[0];
              if (!fixed || fixed.kind !== 'video')
                throw new Error('Matrix static reference missing');
              fixed.keyframes = [];
              fixed.keyframeOffsetSec = 0;
              if (c.label === 'Position' && typeof value === 'object')
                fixed.transform.position = { ...value, unit: 'normalized' };
              else if (c.label === 'Scale' && typeof value === 'number') {
                fixed.transform.scaleX = value;
                fixed.transform.scaleY = value;
              } else if (c.label === 'Rotation' && typeof value === 'number')
                fixed.transform.rotationDeg = value;
              else if (c.label === 'Opacity' && typeof value === 'number')
                fixed.transform.opacity = value;
              else if (c.label === 'Volume' && typeof value === 'number') fixed.volume = value;
              const reference = join(folder, `${tag}-${sec}-reference.png`),
                image = await render(control, reference, sec);
              assert(
                `f22 ${tag} ${sec}s: independent static physical reference is full PNG`,
                image.contentType === 'image/png' && image.width === 640 && image.height === 360,
              );
              const a = decode(film, sec),
                b = decode(reference),
                actual = moments(a),
                expected = moments(b),
                error = mae(a, b),
                distance = Math.hypot(actual.x - expected.x, actual.y - expected.y),
                energyError = Math.abs(actual.energy - expected.energy) / expected.energy;
              assert(
                `f22 ${tag} ${sec}s: encoded motion matches independent easing and physical transform`,
                a.length === 640 * 360 * 3 &&
                  error <= 2 &&
                  actual.energy > 10000 &&
                  expected.energy > 10000 &&
                  distance <= 2 &&
                  energyError <= 0.1,
                JSON.stringify({ value, k, error, distance, energyError }),
              );
              await seek(page, pxPerSec, sec);
              const element = page.getByTestId('edit-stage').locator('video').first();
              const nativeError = async () =>
                element.evaluate((v, t) => {
                  const s = getComputedStyle(v),
                    m = new DOMMatrix(s.transform),
                    r = (t.rotationDeg * Math.PI) / 180;
                  return Math.max(
                    Math.abs(m.a - Math.cos(r) * t.scaleX) / 0.002,
                    Math.abs(m.b - Math.sin(r) * t.scaleX) / 0.002,
                    Math.abs(m.c + Math.sin(r) * t.scaleY) / 0.002,
                    Math.abs(m.d - Math.cos(r) * t.scaleY) / 0.002,
                    Math.abs(m.e - (t.position.x - 0.5) * v.clientWidth),
                    Math.abs(m.f - (t.position.y - 0.5) * v.clientHeight),
                    Math.abs(Number(s.opacity) - t.opacity) / 0.003,
                  );
                }, fixed.transform);
              await expect.poll(nativeError).toBeLessThanOrEqual(1);
              await expect
                .poll(() => element.evaluate((v) => v.currentTime))
                .toBeCloseTo(64.7 + sec, 2);
              writeFileSync(
                join(folder, `${tag}-${sec}-native.png`),
                await element.locator('..').screenshot(),
              );
              assert(
                `f22 ${tag} ${sec}s: native transform and source clock match physical values`,
                (await nativeError()) <= 1,
              );
              comparisons.push({ tag, sec, k, value, error, distance, energyError });
            }
            if (c.label === 'Volume') {
              const errors = [];
              for (const channel of [0, 1]) {
                const encoded = pcm(film, channel),
                  native = await previewAudio(edited, 0, channel);
                writeFileSync(
                  join(folder, `${tag}-native-${channel}.f32`),
                  Buffer.from(native.buffer),
                );
                for (const [index, audio] of [native, encoded].entries()) {
                  let energy = 0,
                    error = 0;
                  for (const sec of [1, 2, 3])
                    for (let n = 0; n < 1920; n++) {
                      const at = sec + n / 48000,
                        gain = 0.4 + 0.4 * easingAt(choice, (at - 0.5) / 3),
                        expected = (sourcePcm[Math.round(at * 48000) * 2 + channel] ?? 0) * gain;
                      energy += expected ** 2;
                      error += ((audio[Math.round(at * 48000)] ?? 0) - expected) ** 2;
                    }
                  errors.push({
                    channel,
                    output: index === 0 ? 'native Web Audio' : 'encoded AAC',
                    energy,
                    relativeError: error / energy,
                  });
                }
              }
              assert(
                `f22 ${tag}: native and encoded stereo gain follow independently decoded recorded audio`,
                errors.every((e) => e.energy > 1e-9 && e.relativeError < 0.05),
                JSON.stringify(errors),
              );
              comparisons.push({ tag, audioErrors: errors });
            }
            const reloaded = await getProject(api, projectId);
            assert(
              `f22 ${tag}: fresh read retains all authored keys`,
              JSON.stringify(reloaded.tracks) === JSON.stringify(edited.tracks),
            );
            if (choiceIndex === 0) {
              await seek(page, pxPerSec, 2);
              const added = await edit(`${c.label} add`, () =>
                visible(
                  page.getByRole('button', { name: `Add ${c.label} keyframe`, exact: true }),
                ).click(),
              );
              assert(
                `f22 ${c.label}: native add retains local and original clock`,
                keyframesOf(clipById(added, video.id)).filter(
                  (k) =>
                    (c.properties as readonly string[]).includes(k.property) &&
                    Math.abs(k.timeSec - 2 - offset) < 1e-6,
                ).length === c.properties.length,
              );
              let diamond = visible(
                page.getByRole('button', { name: `${c.label} keyframe at 2.00 s`, exact: true }),
              );
              await diamond.focus();
              const nudged = await edit(
                `${c.label} nudge`,
                () => diamond.press('ArrowRight'),
                'keydown',
              );
              assert(
                `f22 ${c.label}: native arrow nudges one frame without moving the clip`,
                keyframesOf(clipById(nudged, video.id)).filter(
                  (k) =>
                    (c.properties as readonly string[]).includes(k.property) &&
                    Math.abs(k.timeSec - (2 + 1 / 30) - offset) < 0.001,
                ).length === c.properties.length && mainClips(nudged)[0]?.timelineStartSec === 0,
              );
              diamond = visible(
                page.getByRole('button', { name: `${c.label} keyframe at 2.03 s`, exact: true }),
              );
              const row = await diamond.locator('..').boundingBox(),
                box = await diamond.boundingBox();
              if (!row || !box) throw new Error('Keyframe drag geometry missing');
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.down();
              await page.mouse.move(row.x + (row.width * 2.5) / 4, box.y + box.height / 2, {
                steps: 5,
              });
              const dragged = await edit(`${c.label} drag`, () => page.mouse.up());
              assert(
                `f22 ${c.label}: native drag retains one key per channel property`,
                keyframesOf(clipById(dragged, video.id)).filter(
                  (k) =>
                    (c.properties as readonly string[]).includes(k.property) &&
                    Math.abs(k.timeSec - 2.5 - offset) < 0.015,
                ).length === c.properties.length,
              );
              const moving = keyframesOf(clipById(dragged, video.id)).find(
                (k) =>
                  (c.properties as readonly string[]).includes(k.property) &&
                  Math.abs(k.timeSec - 2.5 - offset) < 0.015,
              );
              if (!moving) throw new Error('Dragged key missing');
              diamond = visible(
                page.getByRole('button', {
                  name: `${c.label} keyframe at ${(moving.timeSec - offset).toFixed(2)} s`,
                  exact: true,
                }),
              );
              await diamond.focus();
              const removed = await edit(
                `${c.label} delete`,
                () => diamond.press('Delete'),
                'keydown',
              );
              assert(
                `f22 ${c.label}: native delete restores the exact pre-gesture keys`,
                JSON.stringify(mainClips(removed)[0]?.keyframes) ===
                  JSON.stringify(keyed.keyframes) && mainClips(removed).length === 1,
              );
            }
          }
        const undo = await postOp(api, projectId, 'undo', { toRevision: before.revision }),
          restored = await getProject(api, projectId);
        assert(
          'f22 persisted undo restores the complete original matrix timeline',
          undo.status === 200 && JSON.stringify(restored.tracks) === JSON.stringify(before.tracks),
        );
        await page.reload();
        assert(
          'f22 native reload sees the restored durable keys',
          JSON.stringify((await getProject(api, projectId)).tracks) ===
            JSON.stringify(before.tracks),
        );
        proof.notes.push(
          `speed samples: ${JSON.stringify({ keyframe_save: editTimings.map((t) => t.durationMs) })}`,
        );
        writeFileSync(
          join(folder, 'keyframe-matrix-results.json'),
          JSON.stringify({ comparisons, editTimings }, null, 2),
        );
        summary.push({ fixture: 'NASA recorded Library', cases: 25, comparisons, editTimings });
        proof.record(
          'f22 native Export dialog, physical device audio, arbitrary expressions/3D/nested combinations, agent and production remain open',
          'SKIP',
        );
        continue;
      }
      if (KEYFRAME_HOLD_JOURNEY) {
        await selectClip(page, original.id);
        await visible(
          page.getByRole('button', { name: 'Opacity keyframe at 0.50 s', exact: true }),
        ).click();
        const editor = visible(page.getByTestId('keyframe-editor'));
        const save = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(`/${projectId}/commands`),
        );
        const started = performance.now();
        await editor.getByRole('button', { name: 'Hold', exact: true }).click();
        const response = await save;
        await response.finished();
        const saveMs = performance.now() - started;
        const held = await getProject(api, projectId);
        const heldClip = clipById(held, original.id);
        assert(
          'hold lane: native preset persists exactly one authorized revision',
          response.ok() &&
            held.revision === before.revision + 1 &&
            keyframesOf(heldClip).some(
              (key) =>
                key.property === 'transform.opacity' &&
                key.timeSec === 0.5 &&
                key.interpolation === 'hold',
            ),
        );
        const path = await editor
          .getByRole('img', { name: 'Easing curve' })
          .locator('path')
          .getAttribute('d');
        const points = [...(path ?? '').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((match) => [
          Number(match[1]),
          Number(match[2]),
        ]);
        const graphCorrect = points.length > 2 && points.every((point) => point[1] === 16);
        writeFileSync(
          join(folder, 'hold-easing-path.json'),
          JSON.stringify({ path, points, graphCorrect, saveMs, held }, null, 2),
        );
        const actualPath = join(folder, 'hold-edited.mp4');
        await render(held, actualPath);
        const controls = new Map<number, string>();
        for (const alpha of [1, 0.3, 0.8]) {
          const control = structuredClone(held);
          const clip = mainClips(control)[0];
          if (!clip || clip.kind !== 'video') throw new Error('Hold reference video missing');
          clip.keyframes = clip.keyframes.filter((key) => key.property !== 'transform.opacity');
          clip.transform.opacity = alpha;
          const path = join(folder, `hold-static-${alpha}.mp4`);
          await render(control, path);
          controls.set(alpha, path);
        }
        const frame = (file: string, sec: number) =>
          execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-threads',
              '1',
              '-i',
              file,
              '-vf',
              `select=eq(n\\,${Math.round(sec * 30)})`,
              '-frames:v',
              '1',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              'pipe:1',
            ],
            { maxBuffer: 4_000_000 },
          );
        const mae = (a: Buffer, b: Buffer) =>
          a.length === b.length
            ? a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) / a.length
            : Infinity;
        const samples = [];
        for (const sec of [0.2, 0.5, 0.8, 2.5, 3.5, 3.7]) {
          // The documented Figma Hold jumps to the arriving value at the departing key.
          const alpha = sec < 0.5 ? 1 : 0.8;
          await seek(page, pxPerSec, sec);
          const video = page.getByTestId('edit-stage').locator('video').first();
          await expect
            .poll(() => video.evaluate((v) => Number(getComputedStyle(v).opacity)))
            .toBeCloseTo(alpha, 3);
          await expect.poll(() => video.evaluate((v) => v.currentTime)).toBeCloseTo(64.7 + sec, 2);
          writeFileSync(
            join(folder, `hold-native-${sec}.png`),
            await video.locator('..').screenshot(),
          );
          const actual = frame(actualPath, sec),
            expected = frame(controls.get(alpha)!, sec),
            opposite = frame(controls.get(0.3)!, sec);
          const error = mae(actual, expected),
            wrong = mae(actual, opposite);
          assert(
            `hold lane: decoded output at ${sec}s matches the documented immediate Hold value`,
            actual.length === 360 * 640 * 3 && error <= 2 && wrong >= 8 && error < wrong / 4,
            JSON.stringify({ alpha, error, wrong }),
          );
          samples.push({ sec, alpha, error, wrong });
        }
        await page.reload();
        await expect(page.locator(`[data-clip-id="${original.id}"]:visible`)).toHaveCount(1);
        const reloaded = await getProject(api, projectId);
        assert(
          'hold lane: authored keys survive native reload without changing the source',
          JSON.stringify(reloaded.tracks) === JSON.stringify(held.tracks),
        );
        const undo = await postOp(api, projectId, 'undo', { toRevision: before.revision });
        const restored = await getProject(api, projectId);
        assert(
          'hold lane: persisted undo restores the original linear keys exactly',
          undo.status === 200 && JSON.stringify(restored.tracks) === JSON.stringify(before.tracks),
        );
        summary.push({
          fixture: 'actual recorded media',
          before,
          held,
          samples,
          graphCorrect,
          saveMs,
        });
        proof.notes.push(
          `hold preset save samples: ${JSON.stringify([saveMs])}; one sample only, not a frozen Speed award.`,
        );
        assert(
          'hold lane: native easing diagram matches immediate Hold at its first tick',
          graphCorrect,
          path ?? 'missing path',
        );
        proof.record(
          'hold lane: other easing modes, channels, gestures, all-sample speed, native Export, agent and production remain open',
          'SKIP',
        );
        continue;
      }
      const titlePreview = async (sec: number, label: string) => {
        await seek(page, pxPerSec, sec);
        const canvas = page.getByTestId('stage-text');
        await expect
          .poll(async () => Number(await canvas.getAttribute('data-playhead-sec')))
          .toBeCloseTo(sec, 3);
        const url = await canvas.evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL('image/png'),
        );
        const png = Buffer.from(url.split(',')[1]!, 'base64');
        const pngPath = join(folder, `${interpolation}-native-${label}.png`);
        writeFileSync(pngPath, png);
        return execFileSync(
          'ffmpeg',
          ['-v', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
          { maxBuffer: 4_000_000, timeout: 20_000 },
        );
      };
      const baselineTitles: Buffer[] = [];
      if (TEXT_JOURNEY) {
        for (const [index, sec] of [0.2, 0.7, 2.2, 2.7].entries())
          baselineTitles.push(await titlePreview(sec, `baseline-${index}`));
      }
      if (CAPTION_JOURNEY) {
        const centroid = (pixels: Buffer, channels: 3 | 4) => {
          let mass = 0,
            x = 0,
            y = 0;
          for (let row = 320; row < 640; row++)
            for (let col = 0; col < 360; col++) {
              const at = (row * 360 + col) * channels;
              // Isolate this fixture's magenta caption, excluding white titles and picture.
              const strength = Math.min(
                pixels[at]! - pixels[at + 1]!,
                pixels[at + 2]! - pixels[at + 1]!,
              );
              if (strength < 60) continue;
              const weight = strength * (channels === 4 ? pixels[at + 3]! / 255 : 1);
              mass += weight;
              x += weight * col;
              y += weight * row;
            }
          return { mass, x: x / mass, y: y / mass };
        };
        const positions = baselineTitles.map((pixels) => centroid(pixels, 4));
        assert(
          `${interpolation}: native caption canvas paints visible inherited motion`,
          positions.every((position) => position.mass > 0) &&
            Math.hypot(positions[1]!.x - positions[0]!.x, positions[1]!.y - positions[0]!.y) > 0.5,
          JSON.stringify(positions),
        );
        const parity = [0.2, 0.7, 2.2, 2.7].map((sec, index) => {
          const pixels = execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-ss',
              String(sec),
              '-i',
              baselinePath,
              '-frames:v',
              '1',
              '-f',
              'rawvideo',
              '-pix_fmt',
              'rgb24',
              'pipe:1',
            ],
            { maxBuffer: 4_000_000 },
          );
          const encoded = centroid(pixels, 3),
            native = positions[index]!;
          return {
            sec,
            native,
            encoded,
            distance: Math.hypot(encoded.x - native.x, encoded.y - native.y),
          };
        });
        assert(
          `${interpolation}: independently decoded caption placement matches the native preview within one pixel`,
          parity.every(({ encoded, distance }) => encoded.mass > 0 && distance <= 1),
          JSON.stringify(parity),
        );
      }
      for (const sec of [1, 2, 3]) {
        await page.bringToFront();
        await page.keyboard.press('Escape');
        await seek(page, pxPerSec, sec);
        proof.notes.push(
          JSON.stringify(
            await page.evaluate(
              (sec) => ({
                seekSec: sec,
                clock: document.querySelector('[data-testid="timeline-clock"]')?.textContent,
                modals: [
                  ...document.querySelectorAll(
                    '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-slot="sheet-content"],[role="dialog"][aria-modal="true"]',
                  ),
                ].map((node) => ({
                  visible: node.getClientRects().length > 0,
                  text: node.textContent?.slice(0, 160),
                })),
              }),
              sec,
            ),
          ),
        );
        await page.locator('body').press('s');
        const split = await until(
          () => getProject(api, projectId),
          (value) => mainClips(value).length === sec + 1,
        );
        assert(
          `${interpolation}: native split at ${sec}s commits`,
          mainClips(split).length === sec + 1,
          JSON.stringify({
            revision: split.revision,
            clips: mainClips(split).map((clip) => ({
              id: clip.id,
              start: clip.timelineStartSec,
              duration: clip.durationSec,
            })),
            commandResponses,
            pageErrors,
          }),
        );
      }
      for (const sourceInSec of [3, 1]) {
        const current = await getProject(api, projectId);
        const clip = mainClips(current).find(
          (item) => 'sourceInSec' in item && Math.abs(item.sourceInSec - sourceInSec) < 1 / 60,
        );
        if (!clip) throw new Error(`Retained source span ${sourceInSec} missing`);
        await selectClip(page, clip.id);
        if (TEXT_JOURNEY) {
          const title = textClips(current)
            .filter((item) => item.enabled)
            .find((item) => near(item.timelineStartSec, clip.timelineStartSec, 1 / 60));
          if (!title) throw new Error('Matching text piece missing');
          await page
            .locator(`[data-clip-id="${title.id}"]:visible`)
            .click({ modifiers: ['Shift'] });
        }
        if (CAPTION_JOURNEY) {
          const caption = current.tracks
            .flatMap((track) => (track.kind === 'caption' ? track.clips : []))
            .find((item) => near(item.timelineStartSec, clip.timelineStartSec, 1 / 60));
          if (!caption) throw new Error('Matching caption piece missing');
          await page
            .locator(`[data-clip-id="${caption.id}"]:visible`)
            .click({ modifiers: ['Shift'] });
        }
        await visible(
          page.getByRole('button', { name: 'Ripple delete selection', exact: true }),
        ).click();
        const deleted = await until(
          () => getProject(api, projectId),
          (value) => mainClips(value).length === mainClips(current).length - 1,
        );
        assert(
          `${interpolation}: native delete of source ${sourceInSec}s commits`,
          mainClips(deleted).length === mainClips(current).length - 1,
        );
      }
      await page.reload();
      await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(2, {
        timeout: 30_000,
      });
      const edited = await getProject(api, projectId);
      const retained = mainClips(edited);
      assert(
        `${interpolation}: reload preserves full keys and retained source clock`,
        retained.length === 2 &&
          retained.every(
            (clip) => JSON.stringify(keyframesOf(clip)) === JSON.stringify(keyframesOf(original)),
          ) &&
          near(retained[1]?.keyframeOffsetSec, 2, 1 / 60) &&
          'sourceInSec' in retained[1]! &&
          near(retained[1].sourceInSec, 2, 1 / 60) &&
          edited.revision === before.revision + 5,
      );
      assert(
        `${interpolation}: reload retains both authored fade ramps and their original clock`,
        retained.every(
          (clip, index) =>
            clip.kind === 'video' &&
            clip.fadeInSec === 3 &&
            clip.fadeOutSec === 3 &&
            clip.audioFadeClock?.durationSec === 4 &&
            near(clip.audioFadeClock.offsetSec, index * 2, 1e-6),
        ),
      );
      if (TEXT_JOURNEY) {
        const titles = textClips(edited)
          .filter((item) => item.enabled)
          .toSorted((a, b) => a.timelineStartSec - b.timelineStartSec);
        assert(
          `${interpolation}: deleting matching picture and text ranges ripples each lane once`,
          titles.length === 2 &&
            titles.every((title, index) => near(title.timelineStartSec, index, 1e-6)),
        );
        assert(
          `${interpolation}: reload retains title animation and opacity clocks independently`,
          titles.every(
            (title, index) =>
              title.textAnimationClock?.durationSec === 4 &&
              near(title.textAnimationClock.offsetSec, index * 2, 1e-6) &&
              near(title.keyframeOffsetSec ?? 0, index * 2, 1e-6),
          ),
        );
      }
      if (CAPTION_JOURNEY) {
        const captions = edited.tracks.flatMap((track) =>
          track.kind === 'caption' ? track.clips : [],
        );
        assert(
          `${interpolation}: reload retains two caption ranges, word emphasis and ancestor bindings`,
          captions.length === 2 &&
            captions.every(
              (clip, index) =>
                near(clip.timelineStartSec, index, 1e-6) &&
                clip.words[0]?.emphasis === true &&
                near(clip.words[0].startSec, 0.1, 1e-6) &&
                near(clip.words[0].endSec, 0.9, 1e-6) &&
                (clip.parentMotionBinding?.ancestors.length ?? 0) > 0,
            ),
        );
      }
      if (TEXT_JOURNEY) {
        const previewErrors = [];
        for (const [index, sec] of [0.2, 0.7, 1.2, 1.7].entries()) {
          const got = await titlePreview(sec, `edited-${index}`);
          const expected = baselineTitles[index]!;
          const maxError =
            got.length === expected.length
              ? got.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i]!)), 0)
              : Infinity;
          const painted = expected.some((value, i) => i % 4 === 3 && value > 0);
          previewErrors.push({ maxError, painted });
        }
        assert(
          `${interpolation}: native title canvas preserves original pixels at retained times`,
          previewErrors.every(({ maxError, painted }) => painted && maxError <= 1),
          JSON.stringify(previewErrors),
        );
      }
      const actualPath = join(folder, `${interpolation}-edited.mp4`);
      const rendered = await render(edited, actualPath);
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=avg_frame_rate,width,height',
            '-of',
            'json',
            actualPath,
          ],
          { encoding: 'utf8' },
        ),
      ) as { streams: Array<{ avg_frame_rate: string; width: number; height: number }> };
      assert(
        `${interpolation}: stored export settings control encoded size and frame rate`,
        probe.streams[0]?.avg_frame_rate === '30/1' &&
          probe.streams[0]?.width === 360 &&
          probe.streams[0]?.height === 640,
      );
      const frame = (file: string, sec: number) =>
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-ss',
            String(sec),
            '-i',
            file,
            '-frames:v',
            '1',
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
          ],
          { maxBuffer: 4_000_000 },
        );
      const errors = [0.25, 0.75, 1.25, 1.75].map((sec) => {
        const got = frame(actualPath, sec),
          expected = frame(baselinePath, sec < 1 ? sec : sec + 1);
        if (got.length !== expected.length || got.length === 0) return Infinity;
        return (
          got.reduce((sum, value, index) => sum + Math.abs(value - expected[index]!), 0) /
          got.length
        );
      });
      assert(
        `${interpolation}: same stored revision composes source-correct frames`,
        errors.every((value) => value < 4) && near(rendered.durationSec, 2, 1 / 30),
        JSON.stringify(errors),
      );
      const pcm = (file: string, channel: number) => {
        const bytes = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-f',
          'f32le',
          'pipe:1',
        ]);
        return new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      };
      const expected = pcm(baselinePath),
        got = pcm(actualPath);
      let delta = 0,
        energy = 0;
      for (const sec of [0.25, 0.75, 1.25, 1.75])
        for (let i = 0; i < 640; i++) {
          const a = got[Math.round(sec * 16000) + i] ?? 0;
          const b = expected[Math.round((sec < 1 ? sec : sec + 1) * 16000) + i] ?? 0;
          delta += (a - b) ** 2;
          energy += b ** 2;
        }
      assert(
        `${interpolation}: independent PCM retains source gain and phase`,
        energy > 1e-6 && delta / energy < 0.02,
        `relative PCM error ${delta / energy}`,
      );
      const originalPreview = await previewAudio(before),
        editedPreview = await previewAudio(edited),
        seekPreview = await previewAudio(edited, 1.1);
      const previewErrors = [0, 1.1].map((fromSec) => {
        const actual = fromSec === 0 ? editedPreview : seekPreview;
        let error = 0,
          energy = 0;
        for (const sec of [0.25, 0.75, 1.25, 1.75].filter((time) => time >= fromSec))
          for (let sample = 0; sample < 1920; sample++) {
            const got = actual[Math.round((sec - fromSec) * 48000) + sample] ?? 0;
            const expected =
              originalPreview[Math.round((sec < 1 ? sec : sec + 1) * 48000) + sample] ?? 0;
            error += (got - expected) ** 2;
            energy += expected ** 2;
          }
        return energy > 1e-6 ? error / energy : Infinity;
      });
      assert(
        `${interpolation}: native Web Audio preview and seek retain the original fade envelope`,
        previewErrors.every((error) => error < 0.02),
        JSON.stringify(previewErrors),
      );
      if (PARENT_JOURNEY) {
        const drivers =
          edited.tracks.find((track) => track.id === `driver-track-${interpolation}`)?.clips ?? [];
        assert(
          `${interpolation}: live ancestor remains editable without copied fallback curves`,
          drivers.length > 0 &&
            retained.every((clip) =>
              clip.parentMotionBinding?.ancestors.every(
                (ancestor) => ancestor.fallback === undefined,
              ),
            ),
        );
        await selectClip(page, drivers[0]!.id);
        for (const driver of drivers.slice(1))
          await page
            .locator(`[data-clip-id="${driver.id}"]:visible`)
            .click({ modifiers: ['Shift'] });
        await page.locator(`[data-clip-id="${drivers[0]!.id}"]:visible`).click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Delete, leave gap', exact: true }).click();
        const withoutParent = await until(
          () => getProject(api, projectId),
          (value) =>
            value.tracks.find((track) => track.id === `driver-track-${interpolation}`)?.clips
              .length === 0,
        );
        assert(
          `${interpolation}: native complete ancestor removal retains full fallback motion`,
          mainClips(withoutParent).every(
            (clip) =>
              !clip.parentClipId &&
              clip.parentMotionBinding?.ancestors.every(
                (ancestor) => ancestor.fallback?.keyframes.length === 2,
              ),
          ),
        );
        await page.reload();
        await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(2, {
          timeout: 30_000,
        });
        const reloadedParentRemoval = await getProject(api, projectId);
        assert(
          `${interpolation}: reload preserves the exact parent-removal document`,
          JSON.stringify(reloadedParentRemoval.tracks) === JSON.stringify(withoutParent.tracks),
        );
        const removedPreviewErrors = [];
        for (const [index, sec] of [0.2, 0.7, 1.2, 1.7].entries()) {
          const actual = await titlePreview(sec, `parent-removed-${index}`);
          const expected = baselineTitles[index]!;
          removedPreviewErrors.push(
            actual.length === expected.length
              ? actual.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i]!)), 0)
              : Infinity,
          );
        }
        assert(
          `${interpolation}: native title pixels survive complete ancestor removal`,
          removedPreviewErrors.every((error) => error <= 1),
          JSON.stringify(removedPreviewErrors),
        );
        const parentRemovedPath = join(folder, `${interpolation}-parent-removed.mp4`);
        await render(reloadedParentRemoval, parentRemovedPath);
        const removedFrameErrors = [0.25, 0.75, 1.25, 1.75].map((sec) => {
          const actual = frame(parentRemovedPath, sec),
            expected = frame(actualPath, sec);
          return actual.length && actual.length === expected.length
            ? actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) /
                actual.length
            : Infinity;
        });
        assert(
          `${interpolation}: encoded picture survives complete ancestor removal`,
          removedFrameErrors.every((error) => error < 4),
          JSON.stringify(removedFrameErrors),
        );
        writeFileSync(
          join(folder, `${interpolation}-parent-removal-readback.json`),
          JSON.stringify(
            { project: reloadedParentRemoval, removedPreviewErrors, removedFrameErrors },
            null,
            2,
          ),
        );
      }
      const undo = await postOp(api, projectId, 'undo', { toRevision: before.revision });
      const restored = await getProject(api, projectId);
      assert(
        `${interpolation}: undo restores the complete original timeline`,
        undo.status === 200 && JSON.stringify(restored.tracks) === JSON.stringify(before.tracks),
      );
      if (PARENT_RANGE_JOURNEY) {
        const cut = await postOp(api, projectId, 'cut_ranges', {
          ranges: [
            { startSec: 1, endSec: 2 },
            { startSec: 3, endSec: 4 },
          ],
          ripple: true,
        });
        assert(
          `${interpolation}: automatic range cut commits through the real HTTP operation`,
          cut.status === 200,
        );
        const planned = await getProject(api, projectId);
        assert(
          `${interpolation}: automatic multi-track cut is one atomic revision`,
          planned.revision === restored.revision + 1 &&
            near(planned.durationSec, 2, 1e-6) &&
            mainClips(planned).length === 2,
        );
        await page.reload();
        await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(2, {
          timeout: 30_000,
        });
        const nativeErrors = [];
        for (const [index, sec] of [0.2, 0.7, 1.2, 1.7].entries()) {
          const actual = await titlePreview(sec, `range-cut-${index}`),
            expected = baselineTitles[index]!;
          nativeErrors.push(
            actual.length === expected.length
              ? actual.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i]!)), 0)
              : Infinity,
          );
        }
        assert(
          `${interpolation}: automatic range cut preserves original native title pixels`,
          nativeErrors.every((error) => error <= 1),
          JSON.stringify(nativeErrors),
        );
        const rangePath = join(folder, `${interpolation}-range-cut.mp4`);
        await render(planned, rangePath);
        const frameErrors = [0.25, 0.75, 1.25, 1.75].map((sec) => {
          const actual = frame(rangePath, sec),
            expected = frame(actualPath, sec);
          return actual.length && actual.length === expected.length
            ? actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) /
                actual.length
            : Infinity;
        });
        assert(
          `${interpolation}: automatic range cut matches native-cut encoded frames`,
          frameErrors.every((error) => error < 4),
          JSON.stringify(frameErrors),
        );
        writeFileSync(
          join(folder, `${interpolation}-range-cut-readback.json`),
          JSON.stringify({ project: planned, nativeErrors, frameErrors }, null, 2),
        );
        const rangeUndo = await postOp(api, projectId, 'undo', { toRevision: restored.revision });
        const rangeRestored = await getProject(api, projectId);
        assert(
          `${interpolation}: one undo restores the automatic cut and parent bindings`,
          rangeUndo.status === 200 &&
            JSON.stringify(rangeRestored.tracks) === JSON.stringify(before.tracks),
        );
        const marked = await postOp(api, projectId, 'apply_commands', {
          expectedRevision: rangeRestored.revision,
          commands: [
            {
              commandType: 'set_markers',
              markers: [0, 1, 2, 3].map((timeSec, beatIndex) => ({
                id: `beat:${beatIndex}`,
                kind: 'beat',
                timeSec,
                beatIndex,
                label: `Beat ${beatIndex + 1}`,
              })),
            },
          ],
        });
        assert(
          `${interpolation}: supplied beat grid persists without analysis or provider calls`,
          marked.status === 200,
        );
        const beatBefore = await getProject(api, projectId);
        const beat = await postOp(api, projectId, 'beat_cut', {
          mode: 'cut_on_beat',
          everyNBeats: 1,
        });
        assert(
          `${interpolation}: real beat-split operation commits one revision`,
          beat.status === 200,
        );
        const beatProject = await getProject(api, projectId);
        assert(
          `${interpolation}: beat splits preserve exact source spans and timeline duration`,
          beatProject.revision === beatBefore.revision + 1 &&
            near(beatProject.durationSec, 4, 1e-6) &&
            mainClips(beatProject).length === 4 &&
            mainClips(beatProject).every(
              (clip, index) =>
                'sourceInSec' in clip &&
                near(clip.sourceInSec, index, 1e-6) &&
                near(clip.timelineStartSec, index, 1e-6) &&
                near(clip.durationSec, 1, 1e-6),
            ),
        );
        await page.reload();
        await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(4, {
          timeout: 30_000,
        });
        const beatNativeErrors = [];
        for (const [index, sec] of [0.2, 0.7, 2.2, 2.7].entries()) {
          const actual = await titlePreview(sec, `beat-split-${index}`),
            expected = baselineTitles[index]!;
          beatNativeErrors.push(
            actual.length === expected.length
              ? actual.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i]!)), 0)
              : Infinity,
          );
        }
        assert(
          `${interpolation}: beat splits preserve original native title pixels`,
          beatNativeErrors.every((error) => error <= 1),
          JSON.stringify(beatNativeErrors),
        );
        const beatPath = join(folder, `${interpolation}-beat-split.mp4`);
        await render(beatProject, beatPath);
        const beatFrameErrors = [0.25, 0.75, 2.25, 2.75].map((sec) => {
          const actual = frame(beatPath, sec),
            expected = frame(baselinePath, sec);
          return actual.length && actual.length === expected.length
            ? actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) /
                actual.length
            : Infinity;
        });
        assert(
          `${interpolation}: beat splits preserve original encoded motion`,
          beatFrameErrors.every((error) => error < 4),
          JSON.stringify(beatFrameErrors),
        );
        const beatPcm = pcm(beatPath);
        let beatDelta = 0,
          beatEnergy = 0;
        for (const sec of [0.25, 0.75, 2.25, 2.75])
          for (let i = 0; i < 640; i++) {
            const sample = Math.round(sec * 16000) + i;
            const actual = beatPcm[sample] ?? 0,
              reference = expected[sample] ?? 0;
            beatDelta += (actual - reference) ** 2;
            beatEnergy += reference ** 2;
          }
        assert(
          `${interpolation}: beat splits preserve independently decoded audio gain and phase`,
          beatEnergy > 1e-6 && beatDelta / beatEnergy < 0.02,
          String(beatDelta / beatEnergy),
        );
        writeFileSync(
          join(folder, `${interpolation}-beat-split-readback.json`),
          JSON.stringify(
            {
              project: beatProject,
              beatNativeErrors,
              beatFrameErrors,
              pcmError: beatDelta / beatEnergy,
            },
            null,
            2,
          ),
        );
        const beatUndo = await postOp(api, projectId, 'undo', {
          toRevision: rangeRestored.revision,
        });
        const beatRestored = await getProject(api, projectId);
        assert(
          `${interpolation}: undo restores the entire beat edit and its temporary marker grid`,
          beatUndo.status === 200 &&
            JSON.stringify(beatRestored.tracks) === JSON.stringify(before.tracks) &&
            JSON.stringify(beatRestored.markers) === JSON.stringify(before.markers),
        );
      }
      if (NESTED_JOURNEY) {
        const sequenceId = `nested-child-${interpolation}`;
        const instanceId = `nested-instance-${interpolation}`;
        const repeatedInstanceId = `${instanceId}-audio-repeat`;
        const nestedTrackId = `nested-track-${interpolation}`;
        const driver = before.tracks
          .flatMap((track) => track.clips)
          .find((clip) => clip.id === `driver-${interpolation}`);
        if (!driver || driver.kind !== 'text') throw new Error('Nested clock driver missing');
        const nestedSetup = await postOp(api, projectId, 'apply_commands', {
          expectedRevision: (await getProject(api, projectId)).revision,
          commands: [
            {
              commandType: 'set_nested_sequence',
              sequence: {
                id: sequenceId,
                name: 'Recorded nested child',
                durationSec: 4,
                canvas: { ...before.canvas, width: 640, height: 360 },
                tracks: [
                  {
                    id: `${sequenceId}-picture`,
                    name: 'Child picture',
                    kind: NESTED_AUDIO_JOURNEY ? 'video' : 'overlay',
                    order: 0,
                    clips: [
                      {
                        id: `${sequenceId}-video`,
                        ...(NESTED_AUDIO_JOURNEY
                          ? {
                              kind: 'video',
                              playbackRate: 0.75,
                              audioEnabled: true,
                              volume: 0.5,
                              fadeInSec: 2.5,
                              fadeOutSec: 2.5,
                            }
                          : { kind: 'overlay', mediaKind: 'video' }),
                        timelineStartSec: 0,
                        durationSec: 4,
                        source: { sourceType: 'library_asset', assetId, renditionId: versionId },
                        sourceInSec: NESTED_AUDIO_JOURNEY ? 0.2 : 0,
                        parentClipId: `${sequenceId}-driver`,
                        keyframes: [
                          ...keys.filter((key) => key.property === 'transform.opacity'),
                          ...(NESTED_AUDIO_JOURNEY
                            ? [
                                {
                                  id: 'child-gain-0',
                                  property: 'audio.volume',
                                  timeSec: 0,
                                  value: 0.25,
                                  interpolation: 'linear',
                                },
                                {
                                  id: 'child-gain-4',
                                  property: 'audio.volume',
                                  timeSec: 4,
                                  value: 0.75,
                                  interpolation: 'linear',
                                },
                              ]
                            : []),
                        ],
                      },
                    ],
                  },
                  {
                    id: `${sequenceId}-titles`,
                    name: 'Child title',
                    kind: 'text',
                    order: 1,
                    clips: [
                      {
                        id: `${sequenceId}-title`,
                        kind: 'text',
                        timelineStartSec: 0,
                        durationSec: 4,
                        text: 'NEST',
                        parentClipId: `${sequenceId}-video`,
                        transform: { position: { x: 0.5, y: 0.65, unit: 'normalized' } },
                        style: {
                          fontFamily: 'Arial',
                          fontSizePx: 52,
                          fontWeight: 700,
                          color: '#ff00ff',
                        },
                      },
                    ],
                  },
                  {
                    id: `${sequenceId}-driver-track`,
                    name: 'Child driver',
                    kind: 'text',
                    order: 2,
                    enabled: false,
                    clips: [{ ...driver, id: `${sequenceId}-driver` }],
                  },
                  ...(NESTED_AUDIO_JOURNEY
                    ? [
                        {
                          id: `${sequenceId}-audio`,
                          name: 'Child bed',
                          kind: 'audio',
                          order: 3,
                          clips: [
                            {
                              id: `${sequenceId}-bed`,
                              kind: 'audio',
                              timelineStartSec: 1,
                              durationSec: 2,
                              source: {
                                sourceType: 'library_asset',
                                assetId,
                                renditionId: versionId,
                              },
                              sourceInSec: 1,
                              playbackRate: 0.8,
                              volume: 0.18,
                              fadeInSec: 0.4,
                              fadeOutSec: 0.4,
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            },
            {
              commandType: 'add_track',
              track: {
                id: nestedTrackId,
                name: 'Nested picture and title',
                kind: 'nested_sequence',
                order: 4,
                clips: [
                  {
                    id: instanceId,
                    kind: 'nested_sequence',
                    sequenceId,
                    timelineStartSec: 0.5,
                    durationSec: 3,
                    sourceInSec: 0.25,
                    playbackRate: 1.1,
                    audioEnabled: NESTED_AUDIO_JOURNEY,
                    parentClipId: original.id,
                    transform: {
                      position: { x: 0.55, y: 0.6, unit: 'normalized' },
                      scaleX: 0.8,
                      scaleY: 0.75,
                      rotationDeg: 12,
                      opacity: 0.7,
                    },
                    keyframes: [
                      ...(NESTED_AUDIO_JOURNEY
                        ? [
                            {
                              id: 'group-gain-0',
                              property: 'audio.volume',
                              timeSec: 0,
                              value: 0.4,
                              interpolation: 'linear',
                            },
                            {
                              id: 'group-gain-3',
                              property: 'audio.volume',
                              timeSec: 3,
                              value: 0.8,
                              interpolation: 'linear',
                            },
                          ]
                        : []),
                      {
                        id: 'nest-rotate-a',
                        property: 'transform.rotationDeg',
                        timeSec: 0,
                        value: 12,
                        interpolation,
                        ...(interpolation === 'bezier'
                          ? { easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } }
                          : {}),
                        ...(interpolation === 'spring' ? { spring: { bounce: 0.7 } } : {}),
                      },
                      {
                        id: 'nest-rotate-b',
                        property: 'transform.rotationDeg',
                        timeSec: 3,
                        value: 25,
                        interpolation: 'linear',
                      },
                    ],
                  },
                  ...(NESTED_AUDIO_JOURNEY
                    ? [
                        {
                          id: repeatedInstanceId,
                          kind: 'nested_sequence',
                          sequenceId,
                          timelineStartSec: 1.5,
                          durationSec: 1.6,
                          sourceInSec: 1.2,
                          playbackRate: 0.8,
                          audioEnabled: true,
                          transform: { opacity: 0 },
                          keyframes: [
                            {
                              id: 'repeat-gain',
                              property: 'audio.volume',
                              timeSec: 0,
                              value: 0.35,
                              interpolation: 'linear',
                            },
                          ],
                        },
                      ]
                    : []),
                ],
              },
            },
            ...(NESTED_AUDIO_JOURNEY
              ? [
                  {
                    commandType: 'set_track_state',
                    trackId: before.tracks.find((track) =>
                      track.clips.some((clip) => clip.id === original.id),
                    )!.id,
                    muted: true,
                  },
                ]
              : []),
          ],
        });
        assert(
          `${interpolation}: actual nested media, title and independent clocks persist`,
          nestedSetup.status === 200,
          nestedSetup.status === 200 ? undefined : nestedSetup.text.slice(0, 400),
        );
        const nestedBefore = await getProject(api, projectId);
        await page.reload();
        await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(1, {
          timeout: 30_000,
        });
        const nestedBaselinePath = join(folder, `${interpolation}-nested-baseline.mp4`);
        await render(nestedBefore, nestedBaselinePath);
        const samples = [0.8, 1.3, 2.3, 3.2];
        const nativeNested = async (project: EditorProjectV2, sec: number, label: string) => {
          const snapping = page.getByRole('button', { name: 'Toggle snapping', exact: true });
          if ((await snapping.getAttribute('aria-pressed')) === 'true') await snapping.click();
          await seek(page, pxPerSec, sec);
          const instance = project.tracks
            .flatMap((track) => (track.kind === 'nested_sequence' ? track.clips : []))
            .find(
              (clip) =>
                sec >= clip.timelineStartSec && sec < clip.timelineStartSec + clip.durationSec,
            );
          if (!instance) throw new Error('Active nested instance missing');
          const canvas = page
            .getByTestId(`nested-preview-${instance.id}`)
            .getByTestId('stage-text');
          await expect
            .poll(async () => Number(await canvas.getAttribute('data-playhead-sec')))
            .toBeCloseTo(
              instance.sourceInSec + (sec - instance.timelineStartSec) * instance.playbackRate,
              3,
            );
          const frameElement = page
            .getByTestId('edit-stage')
            .locator('video')
            .first()
            .locator('..');
          const png = await frameElement.screenshot();
          const pngPath = join(folder, `${interpolation}-nested-native-${label}.png`);
          writeFileSync(pngPath, png);
          return execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              pngPath,
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
        };
        const magentaCenter = (pixels: Buffer) => {
          let mass = 0,
            x = 0,
            y = 0;
          for (let row = 0; row < 640; row++)
            for (let col = 0; col < 360; col++) {
              const at = (row * 360 + col) * 3;
              const strength = Math.min(
                pixels[at]! - pixels[at + 1]!,
                pixels[at + 2]! - pixels[at + 1]!,
              );
              if (strength < 60) continue;
              mass += strength;
              x += strength * col;
              y += strength * row;
            }
          return { mass, x: x / mass, y: y / mass };
        };
        const nestedParity = [];
        for (const [index, sec] of samples.entries()) {
          const native = magentaCenter(await nativeNested(nestedBefore, sec, `baseline-${index}`));
          const encoded = magentaCenter(frame(nestedBaselinePath, sec));
          nestedParity.push({
            sec,
            native,
            encoded,
            distance: Math.hypot(native.x - encoded.x, native.y - encoded.y),
          });
        }
        assert(
          `${interpolation}: nested native picture/title placement matches decoded export`,
          nestedParity.every(
            ({ native, encoded, distance }) => native.mass > 0 && encoded.mass > 0 && distance < 3,
          ),
          JSON.stringify(nestedParity),
        );
        const transparentErrors = samples.map((sec) => {
          const actual = frame(nestedBaselinePath, sec),
            reference = frame(baselinePath, sec);
          const count = 360 * 64 * 3;
          return (
            actual
              .subarray(0, count)
              .reduce((sum, value, i) => sum + Math.abs(value - reference[i]!), 0) / count
          );
        });
        assert(
          `${interpolation}: nested transparent canvas preserves uncovered recorded picture`,
          transparentErrors.every((error) => error < 4),
          JSON.stringify(transparentErrors),
        );
        await selectClip(page, instanceId, NESTED_AUDIO_JOURNEY ? 0.2 : 0.5);
        await seek(page, pxPerSec, 2);
        await page.locator('body').press('s');
        const splitNested = await until(
          () => getProject(api, projectId),
          (project) =>
            project.tracks.find((track) => track.id === nestedTrackId)?.clips.length ===
            (NESTED_AUDIO_JOURNEY ? 3 : 2),
        );
        const pieces = splitNested.tracks
          .flatMap((track) =>
            track.id === nestedTrackId && track.kind === 'nested_sequence' ? track.clips : [],
          )
          .filter((clip) => clip.id !== repeatedInstanceId)
          .toSorted((left, right) => left.timelineStartSec - right.timelineStartSec);
        assert(
          `${interpolation}: native nested split retains child source and host keyframe clocks`,
          pieces.length === 2 &&
            near(pieces[1]?.sourceInSec, 1.9, 1e-6) &&
            near(pieces[1]?.keyframeOffsetSec, 1.5, 1e-6) &&
            JSON.stringify(splitNested.nestedSequences) ===
              JSON.stringify(nestedBefore.nestedSequences),
        );
        await page.reload();
        await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(1, {
          timeout: 30_000,
        });
        const nestedAfter = await getProject(api, projectId);
        const nestedEditedPath = join(folder, `${interpolation}-nested-split.mp4`);
        await render(nestedAfter, nestedEditedPath);
        const retainedErrors = samples.map((sec) => {
          const actual = frame(nestedEditedPath, sec),
            reference = frame(nestedBaselinePath, sec);
          return (
            actual.reduce((sum, value, i) => sum + Math.abs(value - reference[i]!), 0) /
            actual.length
          );
        });
        assert(
          `${interpolation}: reload and nested split preserve encoded group frames`,
          retainedErrors.every((error) => error < 4),
          JSON.stringify(retainedErrors),
        );
        const retainedNative = [];
        for (const [index, sec] of samples.entries()) {
          const native = magentaCenter(await nativeNested(nestedAfter, sec, `split-${index}`));
          const expected = nestedParity[index]!.native;
          retainedNative.push(Math.hypot(native.x - expected.x, native.y - expected.y));
        }
        assert(
          `${interpolation}: native nested split preserves the original child/group placement`,
          retainedNative.every((error) => error < 1),
          JSON.stringify(retainedNative),
        );
        const nestedAudioProof = [];
        let repeatReference: ((sec: number) => number) | undefined;
        if (NESTED_AUDIO_JOURNEY) {
          const floats = (bytes: Buffer) =>
            new Float32Array(
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            );
          const decodeAudio = (file: string) =>
            floats(
              execFileSync(
                'ffmpeg',
                [
                  '-v',
                  'error',
                  '-i',
                  file,
                  '-vn',
                  '-af',
                  'pan=mono|c0=c0',
                  '-ar',
                  '48000',
                  '-f',
                  'f32le',
                  'pipe:1',
                ],
                { maxBuffer: 8_000_000 },
              ),
            );
          const sourceAudio = decodeAudio(process.env.VIDEO_EDITOR_RECORDED_FIXTURE!);
          const sourceAt = (sec: number) => {
            const at = sec * 48000,
              index = Math.floor(at),
              fraction = at - index;
            return (
              (sourceAudio[index] ?? 0) * (1 - fraction) + (sourceAudio[index + 1] ?? 0) * fraction
            );
          };
          // Independent source PCM and analytic author curves, without the editor's projection or mixer.
          const oracleAt = (sec: number, repeatOnly = false) => {
            let sum = 0;
            for (const group of [
              {
                start: 0.5,
                duration: 3,
                source: 0.25,
                rate: 1.1,
                gain: (local: number) => 0.4 + (0.4 * local) / 3,
              },
              { start: 1.5, duration: 1.6, source: 1.2, rate: 0.8, gain: () => 0.35 },
            ]) {
              if (repeatOnly && group.start !== 1.5) continue;
              const local = sec - group.start;
              if (local < 0 || local >= group.duration) continue;
              const child = group.source + local * group.rate;
              const videoGain =
                (0.25 + (0.5 * child) / 4) *
                Math.min(1, child / 2.5) *
                Math.min(1, (4 - child) / 2.5);
              let sound = sourceAt(0.2 + child * 0.75) * videoGain;
              if (child >= 1 && child < 3)
                sound +=
                  sourceAt(1 + (child - 1) * 0.8) *
                  0.18 *
                  Math.min(1, (child - 1) / 0.4) *
                  Math.min(1, (3 - child) / 0.4);
              sum += sound * group.gain(local);
            }
            return sum;
          };
          repeatReference = (sec) => oracleAt(sec, true);
          const compare = (
            actual: Float32Array,
            expected: (sec: number) => number,
            fromSec = 0,
          ) => {
            let error = 0,
              energy = 0;
            for (const sec of [0.8, 1.3, 1.8, 2.3, 2.8, 3.2].filter((sec) => sec >= fromSec))
              for (let sample = 0; sample < 1920; sample++) {
                const time = sec + sample / 48000;
                const reference = expected(time);
                const got = actual[Math.round((time - fromSec) * 48000)] ?? 0;
                energy += reference ** 2;
                error += (got - reference) ** 2;
              }
            return { energy, relativeError: energy > 1e-6 ? error / energy : Infinity };
          };
          const originalAudio = decodeAudio(nestedBaselinePath),
            splitAudio = decodeAudio(nestedEditedPath);
          const originalNativeAudio = await previewAudio(nestedBefore),
            splitNativeAudio = await previewAudio(nestedAfter);
          const seekNativeAudio = await previewAudio(nestedAfter, 1.1);
          writeFileSync(
            join(folder, `${interpolation}-nested-audio-preview.f32`),
            Buffer.from(originalNativeAudio.buffer),
          );
          writeFileSync(
            join(folder, `${interpolation}-nested-audio-split-preview.f32`),
            Buffer.from(splitNativeAudio.buffer),
          );
          writeFileSync(
            join(folder, `${interpolation}-nested-audio-seek-preview.f32`),
            Buffer.from(seekNativeAudio.buffer),
          );
          const oracleErrors = [
            compare(originalAudio, oracleAt),
            compare(originalNativeAudio, oracleAt),
          ];
          assert(
            `${interpolation}: nested video and bed audio match independent source PCM, rates, fades and multiplying host gains`,
            oracleErrors.every((result) => result.relativeError < 0.05),
            JSON.stringify(oracleErrors),
          );
          const retainedAudio = compare(
            splitAudio,
            (sec) => originalAudio[Math.round(sec * 48000)] ?? 0,
          );
          const retainedNativeAudio = compare(
            splitNativeAudio,
            (sec) => originalNativeAudio[Math.round(sec * 48000)] ?? 0,
          );
          const seekAudio = compare(
            seekNativeAudio,
            (sec) => originalNativeAudio[Math.round(sec * 48000)] ?? 0,
            1.1,
          );
          assert(
            `${interpolation}: native nested split, reload and seek retain child and repeated-instance sound`,
            [retainedAudio, retainedNativeAudio, seekAudio].every(
              (result) => result.relativeError < 0.02,
            ),
            JSON.stringify({ retainedAudio, retainedNativeAudio, seekAudio }),
          );
          const silenceEnergy = [originalAudio, originalNativeAudio].map((audio) => {
            let energy = 0,
              count = 0;
            for (const sec of [0, 3.8])
              for (let sample = 0; sample < 4800; sample++) {
                energy += (audio[Math.round(sec * 48000) + sample] ?? 0) ** 2;
                count++;
              }
            return energy / count;
          });
          assert(
            `${interpolation}: nested sound is silent outside its mapped host windows`,
            silenceEnergy.every((energy) => energy < 1e-8),
            JSON.stringify(silenceEnergy),
          );
          nestedAudioProof.push({
            oracleErrors,
            retainedAudio,
            retainedNativeAudio,
            seekAudio,
            silenceEnergy,
          });
        }
        if (NESTED_CONTROLS_JOURNEY) {
          const composition = (project: EditorProjectV2) => {
            const clip = clipById(project, instanceId);
            if (clip?.kind !== 'nested_sequence') throw new Error('Missing composition instance');
            return clip;
          };
          await postOp(api, projectId, 'undo', { toRevision: nestedBefore.revision });
          await page.reload();
          await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(2, {
            timeout: 30_000,
          });
          await selectClip(page, instanceId, 0.2);
          const inspector = page.getByTestId('composition-inspector');
          await expect(inspector).toBeVisible();
          await expect(inspector.locator('[data-channel="volume"]')).toBeVisible();
          await expect(
            inspector.getByRole('textbox', { name: 'Rotation', exact: true }),
          ).toBeDisabled();
          const number = async (label: string, value: number) => {
            const field = inspector.getByRole('textbox', { name: label, exact: true });
            await field.fill(String(value));
            await field.press('Tab');
          };
          await number('Position X', 0.58);
          await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && near(c.transform.position.x, 0.58, 0.001);
            },
          );
          await number('Scale X', 0.9);
          await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && near(c.transform.scaleX, 0.9, 0.001);
            },
          );
          const opacity = inspector
            .getByRole('group', { name: 'Opacity', exact: true })
            .getByRole('slider');
          await opacity.focus();
          await opacity.press('Home');
          for (let i = 0; i < 15; i++) await opacity.press('ArrowRight');
          const transformed = await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && near(c.transform.opacity, 0.75, 0.001);
            },
          );
          assert(
            `${interpolation}: native composition geometry preserves rotation keys and parent`,
            JSON.stringify(composition(transformed).keyframes) ===
              JSON.stringify(composition(nestedBefore).keyframes) &&
              clipById(transformed, instanceId)?.parentClipId === original.id,
          );
          await number('Speed', 2.2);
          const sped = await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && near(c.playbackRate, 2.2, 0.001);
            },
          );
          const spedClip = clipById(sped, instanceId);
          assert(
            `${interpolation}: native composition speed retains child source span and all curves`,
            spedClip?.kind === 'nested_sequence' &&
              near(spedClip.durationSec, 1.5, 0.001) &&
              spedClip.keyframes.every((key, i) =>
                near(key.timeSec, composition(nestedBefore).keyframes[i]!.timeSec / 2, 0.001),
              ) &&
              JSON.stringify(sped.nestedSequences) === JSON.stringify(nestedBefore.nestedSequences),
          );
          await number('Source start', 0.47);
          const trimmed = await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && near(c.sourceInSec, 0.47, 0.001);
            },
          );
          const trimmedClip = clipById(trimmed, instanceId);
          assert(
            `${interpolation}: native child source trim advances the retained own clock`,
            trimmedClip?.kind === 'nested_sequence' &&
              near(trimmedClip.timelineStartSec, 0.6, 0.001) &&
              near(trimmedClip.durationSec, 1.4, 0.001) &&
              near(trimmedClip.keyframeOffsetSec ?? 0, 0.1, 0.001),
          );
          await number('Source end', 3.44);
          const endTrimmed = await until(
            () => getProject(api, projectId),
            (p) => near(composition(p).durationSec, 1.35, 0.001),
          );
          assert(
            `${interpolation}: native child end trim retains source start and clocks`,
            near(composition(endTrimmed).sourceInSec, 0.47, 0.001) &&
              near(composition(endTrimmed).keyframeOffsetSec ?? 0, 0.1, 0.001),
          );
          const speedOp = await postOp(api, projectId, 'set_speed', {
            clipId: instanceId,
            rate: 1.1,
            expectedRevision: endTrimmed.revision,
          });
          let commandSped = await getProject(api, projectId);
          assert(
            `${interpolation}: agent composition speed preserves other instances, main track and child`,
            speedOp.status === 200 &&
              clipById(commandSped, instanceId)?.kind === 'nested_sequence' &&
              near(clipById(commandSped, instanceId)!.durationSec, 2.7, 0.001) &&
              JSON.stringify(clipById(commandSped, repeatedInstanceId)) ===
                JSON.stringify(clipById(trimmed, repeatedInstanceId)) &&
              JSON.stringify(commandSped.tracks[0]) === JSON.stringify(trimmed.tracks[0]) &&
              JSON.stringify(commandSped.nestedSequences) ===
                JSON.stringify(trimmed.nestedSequences),
          );
          await page.reload();
          await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(2, {
            timeout: 30_000,
          });
          await selectClip(page, instanceId, 0.2);
          await seek(page, pxPerSec, 1.3);
          const gainKeysBefore = composition(commandSped).keyframes.filter(
            (key) => key.property === 'audio.volume',
          ).length;
          await page
            .getByTestId('composition-inspector')
            .getByRole('button', { name: 'Add Volume keyframe', exact: true })
            .click();
          commandSped = await until(
            () => getProject(api, projectId),
            (p) =>
              composition(p).keyframes.filter((key) => key.property === 'audio.volume').length ===
              gainKeysBefore + 1,
          );
          assert(
            `${interpolation}: native composition lane authors gain at the retained playhead`,
            composition(commandSped).keyframes.some(
              (key) => key.property === 'audio.volume' && near(key.timeSec, 0.9, 0.001),
            ),
          );
          await page.reload();
          await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(2, {
            timeout: 30_000,
          });
          const controlPath = join(folder, `${interpolation}-composition-controls.mp4`);
          await render(commandSped, controlPath);
          const controlParity = [];
          for (const [index, sec] of [0.8, 1.3, 2.3, 3.2].entries()) {
            const native = magentaCenter(await nativeNested(commandSped, sec, `controls-${index}`));
            const encoded = magentaCenter(frame(controlPath, sec));
            controlParity.push({
              sec,
              native,
              encoded,
              distance: Math.hypot(native.x - encoded.x, native.y - encoded.y),
            });
          }
          assert(
            `${interpolation}: native composition control edits match decoded export placement`,
            controlParity.every((p) => p.native.mass > 0 && p.encoded.mass > 0 && p.distance < 3),
            JSON.stringify(controlParity),
          );
          if (STAGE_JOURNEY) {
            const stageOriginal = commandSped;
            const setup = await postOp(api, projectId, 'apply_commands', {
              expectedRevision: stageOriginal.revision,
              commands: [
                {
                  commandType: 'upsert_clip',
                  trackId: nestedTrackId,
                  clip: {
                    ...composition(stageOriginal),
                    transform: { ...composition(stageOriginal).transform, scaleX: -0.9 },
                    keyframes: [
                      ...composition(stageOriginal).keyframes,
                      {
                        id: 'stage-pos-a',
                        property: 'transform.position',
                        timeSec: 0,
                        value: { x: 0.55, y: 0.6 },
                        interpolation: 'linear',
                        expression: 'loop',
                      },
                      {
                        id: 'stage-pos-b',
                        property: 'transform.position',
                        timeSec: 1,
                        value: { x: 0.6, y: 0.6 },
                        interpolation: 'linear',
                        expression: 'wiggle(0.25, 0.015)',
                      },
                      {
                        id: 'stage-scale-a',
                        property: 'transform.scaleX',
                        timeSec: 0,
                        value: -0.9,
                        interpolation: 'linear',
                      },
                      {
                        id: 'stage-scale-b',
                        property: 'transform.scaleX',
                        timeSec: 2.7,
                        value: -0.8,
                        interpolation: 'linear',
                      },
                    ],
                  },
                },
              ],
            });
            assert(
              `${interpolation}: stage expression/flip setup persists`,
              setup.status === 200,
              setup.text.slice(0, 200),
            );
            let stageProject = await getProject(api, projectId);
            await page.reload();
            await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(
              2,
              { timeout: 30_000 },
            );
            await selectClip(page, instanceId, 0.2);
            await seek(page, pxPerSec, 2.3);
            const stageTime = Number(
              await page
                .getByTestId('edit-stage')
                .getByTestId('stage-text')
                .first()
                .getAttribute('data-playhead-sec'),
            );
            const expectedGeometry = (project: EditorProjectV2) => {
              const c = composition(project),
                local = stageTime - c.timelineStartSec;
              const own = samplePositionTrack(
                positionKeysForProperty(c.keyframes),
                local,
                c.transform.position,
                c.keyframeOffsetSec,
              );
              const parent = parentPositionDelta(project, c.id, stageTime);
              return {
                x: own.x + parent.x,
                y: own.y + parent.y,
                sx: sampleNumericTrack(
                  numericKeysForProperty(c.keyframes, 'transform.scaleX'),
                  local,
                  c.transform.scaleX,
                  c.keyframeOffsetSec,
                ),
                sy: sampleNumericTrack(
                  numericKeysForProperty(c.keyframes, 'transform.scaleY'),
                  local,
                  c.transform.scaleY,
                  c.keyframeOffsetSec,
                ),
                rotation: sampleNumericTrack(
                  numericKeysForProperty(c.keyframes, 'transform.rotationDeg'),
                  local,
                  c.transform.rotationDeg,
                  c.keyframeOffsetSec,
                ),
              };
            };
            const box = page.getByTestId('stage-transform-box');
            await expect(box).toBeVisible();
            const geometry = () =>
              box.evaluate((element) => ({
                x: parseFloat(element.style.left) / 100,
                y: parseFloat(element.style.top) / 100,
                width: parseFloat(element.style.width) / 100,
                height: parseFloat(element.style.height) / 100,
                rotation: Number(element.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]),
              }));
            const initial = await geometry(),
              expected = expectedGeometry(stageProject);
            assert(
              `${interpolation}: native handles sample parent, retained expressions and signed axes`,
              near(initial.x, expected.x, 0.001) &&
                near(initial.y, expected.y, 0.001) &&
                near(initial.width, Math.abs(expected.sx), 0.001) &&
                near(initial.height, Math.abs(expected.sy), 0.001) &&
                near(initial.rotation, expected.rotation, 0.001),
              JSON.stringify({ initial, expected, stageTime }),
            );
            const frameBox = await box.locator('..').boundingBox();
            if (!frameBox) throw new Error('Missing stage frame');
            const move = page.getByRole('button', { name: 'Move selected clip', exact: true });
            const moveBox = await move.boundingBox();
            if (!moveBox) throw new Error('Missing move handle');
            await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(
              moveBox.x + moveBox.width / 2 + frameBox.width * 0.06,
              moveBox.y + moveBox.height / 2 - frameBox.height * 0.04,
              { steps: 5 },
            );
            await page.mouse.up();
            const moved = await until(
              () => getProject(api, projectId),
              (p) => p.revision > stageProject.revision,
            );
            const movedGeometry = expectedGeometry(moved);
            assert(
              `${interpolation}: native move authors only wrapped position and retains expression phase`,
              near(movedGeometry.x, expected.x + 0.06, 0.003) &&
                near(movedGeometry.y, expected.y - 0.04, 0.003) &&
                JSON.stringify(composition(moved).transform) ===
                  JSON.stringify(composition(stageProject).transform) &&
                JSON.stringify(
                  composition(moved).keyframes.filter((k) => k.property !== 'transform.position'),
                ) ===
                  JSON.stringify(
                    composition(stageProject).keyframes.filter(
                      (k) => k.property !== 'transform.position',
                    ),
                  ),
              JSON.stringify({ movedGeometry, expected }),
            );
            stageProject = moved;
            const beforeScale = expectedGeometry(stageProject);
            const scaleHandle = page
              .getByRole('button', { name: 'Scale selected clip', exact: true })
              .first();
            const scaleBox = await scaleHandle.boundingBox();
            if (!scaleBox) throw new Error('Missing scale handle');
            const scaleStart = {
              x: scaleBox.x + scaleBox.width / 2,
              y: scaleBox.y + scaleBox.height / 2,
            };
            const centre = {
              x: frameBox.x + beforeScale.x * frameBox.width,
              y: frameBox.y + beforeScale.y * frameBox.height,
            };
            await page.mouse.move(scaleStart.x, scaleStart.y);
            await page.mouse.down();
            await page.mouse.move(
              centre.x + (scaleStart.x - centre.x) * 0.95,
              centre.y + (scaleStart.y - centre.y) * 0.95,
              { steps: 5 },
            );
            await page.mouse.up();
            const scaled = await until(
              () => getProject(api, projectId),
              (p) => p.revision > stageProject.revision,
            );
            const scaledGeometry = expectedGeometry(scaled);
            assert(
              `${interpolation}: native scale keeps negative/nonuniform axes and unrelated motion`,
              near(scaledGeometry.sx, beforeScale.sx * 0.95, 0.003) &&
                near(scaledGeometry.sy, beforeScale.sy * 0.95, 0.003) &&
                JSON.stringify(
                  composition(scaled).keyframes.filter(
                    (k) => !['transform.scaleX', 'transform.scaleY'].includes(k.property),
                  ),
                ) ===
                  JSON.stringify(
                    composition(stageProject).keyframes.filter(
                      (k) => !['transform.scaleX', 'transform.scaleY'].includes(k.property),
                    ),
                  ),
              JSON.stringify({ scaledGeometry, beforeScale }),
            );
            stageProject = scaled;
            const rotate = page.getByRole('button', { name: 'Rotate selected clip', exact: true });
            const rotateBox = await rotate.boundingBox();
            if (!rotateBox) throw new Error('Missing rotate handle');
            const from = {
              x: rotateBox.x + rotateBox.width / 2,
              y: rotateBox.y + rotateBox.height / 2,
            };
            const pointerTarget = await page.evaluate(({ x, y }) => {
              const element = document.elementFromPoint(x, y);
              return {
                tag: element?.tagName,
                label: element?.closest('button')?.getAttribute('aria-label'),
              };
            }, from);
            writeFileSync(
              join(folder, `${interpolation}-stage-pointer.json`),
              JSON.stringify(
                {
                  rotateBox,
                  from,
                  frameBox,
                  centre,
                  geometry: await geometry(),
                  pointerTarget,
                  scaled,
                },
                null,
                2,
              ),
            );
            assert(
              `${interpolation}: rotation grip is reachable inside the visible frame`,
              pointerTarget.label === 'Rotate selected clip',
              JSON.stringify({ pointerTarget, rotateBox, frameBox }),
            );

            const theta = (10 * Math.PI) / 180,
              dx = from.x - centre.x,
              dy = from.y - centre.y;
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            await page.mouse.move(
              centre.x + dx * Math.cos(theta) - dy * Math.sin(theta),
              centre.y + dx * Math.sin(theta) + dy * Math.cos(theta),
              { steps: 5 },
            );
            await page.mouse.up();
            const rotated = await until(
              () => getProject(api, projectId),
              (p) => p.revision > stageProject.revision,
            );
            const rotatedGeometry = expectedGeometry(rotated);
            writeFileSync(
              join(folder, `${interpolation}-stage-rotated-readback.json`),
              JSON.stringify(rotated, null, 2),
            );
            assert(
              `${interpolation}: native rotation edits displayed key and preserves other channels`,
              near(rotatedGeometry.rotation, scaledGeometry.rotation + 10, 0.1) &&
                JSON.stringify(
                  composition(rotated).keyframes.filter(
                    (k) => k.property !== 'transform.rotationDeg',
                  ),
                ) ===
                  JSON.stringify(
                    composition(stageProject).keyframes.filter(
                      (k) => k.property !== 'transform.rotationDeg',
                    ),
                  ),
              JSON.stringify({ rotatedGeometry, scaledGeometry }),
            );
            await page.reload();
            await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(
              2,
              { timeout: 30_000 },
            );
            await selectClip(page, instanceId, 0.2);
            await seek(page, pxPerSec, stageTime);
            const reloaded = await geometry();
            assert(
              `${interpolation}: native stage geometry survives reload`,
              near(reloaded.x, rotatedGeometry.x, 0.001) &&
                near(reloaded.width, Math.abs(rotatedGeometry.sx), 0.001) &&
                near(reloaded.rotation, rotatedGeometry.rotation, 0.001),
            );
            const stagePath = join(folder, `${interpolation}-stage-handles.mp4`);
            await render(rotated, stagePath);
            const stageParity = [];
            for (const [index, sec] of [0.8, 1.3, 2.3, 3.2].entries()) {
              const native = magentaCenter(await nativeNested(rotated, sec, `stage-${index}`));
              const encoded = magentaCenter(frame(stagePath, sec));
              stageParity.push({
                sec,
                native,
                encoded,
                distance: Math.hypot(native.x - encoded.x, native.y - encoded.y),
              });
            }
            assert(
              `${interpolation}: native stage drags match decoded export placement`,
              stageParity.every((p) => p.native.mass > 0 && p.encoded.mass > 0 && p.distance < 3),
              JSON.stringify(stageParity),
            );
            assert(
              `${interpolation}: stage drags preserve child sequence and other instance`,
              JSON.stringify(rotated.nestedSequences) ===
                JSON.stringify(stageOriginal.nestedSequences) &&
                JSON.stringify(clipById(rotated, repeatedInstanceId)) ===
                  JSON.stringify(clipById(stageOriginal, repeatedInstanceId)),
            );
            writeFileSync(
              join(folder, `${interpolation}-stage-handles.json`),
              JSON.stringify(
                { stageTime, initial, expected, moved, scaled, rotated, reloaded, stageParity },
                null,
                2,
              ),
            );
            await postOp(api, projectId, 'undo', { toRevision: stageOriginal.revision });
            await page.reload();
            await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(
              2,
              { timeout: 30_000 },
            );
          }
          await selectClip(page, instanceId, 0.2);
          await page
            .getByTestId('composition-inspector')
            .getByRole('button', { name: 'Composition audio', exact: true })
            .click();
          const muted = await until(
            () => getProject(api, projectId),
            (p) => {
              const c = clipById(p, instanceId);
              return c?.kind === 'nested_sequence' && !c.audioEnabled;
            },
          );
          const mutedNative = await previewAudio(muted);
          const mutedPath = join(folder, `${interpolation}-composition-muted.mp4`);
          await render(muted, mutedPath);
          const mutedBytes = execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              mutedPath,
              '-vn',
              '-af',
              'pan=mono|c0=c0',
              '-ar',
              '48000',
              '-f',
              'f32le',
              'pipe:1',
            ],
            { maxBuffer: 8_000_000 },
          );
          const mutedEncoded = new Float32Array(
            mutedBytes.buffer.slice(
              mutedBytes.byteOffset,
              mutedBytes.byteOffset + mutedBytes.byteLength,
            ),
          );
          const muteEnergy = [mutedNative, mutedEncoded].map((audio) => {
            let sum = 0;
            for (let i = 38400; i < 43200; i++) sum += (audio[i] ?? 0) ** 2;
            return sum / 4800;
          });
          if (!repeatReference) throw new Error('Independent repeated-child reference missing');
          const repeatErrors = [mutedNative, mutedEncoded].map((audio) => {
            let energy = 0,
              error = 0;
            for (const sec of [1.8, 2.3, 2.8])
              for (let sample = 0; sample < 1920; sample++) {
                const at = sec + sample / 48000;
                const expected = repeatReference!(at);
                energy += expected ** 2;
                error += ((audio[Math.round(at * 48000)] ?? 0) - expected) ** 2;
              }
            return { energy, relativeError: error / energy };
          });
          assert(
            `${interpolation}: native composition mute silences its window and retains repeated child sound`,
            muteEnergy.every((energy) => energy < 1e-8) &&
              repeatErrors.every((result) => result.energy > 1e-12 && result.relativeError < 0.05),
            JSON.stringify({ muteEnergy, repeatErrors }),
          );
          writeFileSync(
            join(folder, `${interpolation}-composition-muted-preview.f32`),
            Buffer.from(mutedNative.buffer),
          );
          const lockedResponse = await postOp(api, projectId, 'apply_commands', {
            expectedRevision: muted.revision,
            commands: [
              {
                commandType: 'upsert_clip',
                trackId: nestedTrackId,
                clip: { ...composition(muted), locked: true },
              },
            ],
          });
          const lockedProject = await getProject(api, projectId);
          assert(
            `${interpolation}: composition lock persists before inspecting it`,
            lockedResponse.status === 200 && composition(lockedProject).locked,
            lockedResponse.text.slice(0, 400),
          );
          await page.reload();
          await expect(page.locator('[data-clip-kind="nested_sequence"]:visible')).toHaveCount(2, {
            timeout: 30_000,
          });
          await selectClip(page, instanceId, 0.2);
          await expect(
            page.getByText('Unlock this clip to edit it.', { exact: true }),
          ).toBeVisible();
          assert(
            `${interpolation}: locked composition shows an unlock instruction and no editable inspector`,
            lockedResponse.status === 200 &&
              (await page.getByTestId('composition-inspector').count()) === 0 &&
              (!STAGE_JOURNEY || (await page.getByTestId('stage-transform-box').count()) === 0),
          );
          writeFileSync(
            join(folder, `${interpolation}-composition-controls.json`),
            JSON.stringify(
              {
                transformed,
                sped,
                trimmed,
                commandSped,
                muted,
                controlParity,
                muteEnergy,
                repeatErrors,
              },
              null,
              2,
            ),
          );
        }
        const nestedUndo = await postOp(api, projectId, 'undo', { toRevision: before.revision });
        const nestedRestored = await getProject(api, projectId);
        assert(
          `${interpolation}: undo restores the original project and removes the temporary nested sequence`,
          nestedUndo.status === 200 &&
            JSON.stringify(nestedRestored.tracks) === JSON.stringify(before.tracks) &&
            JSON.stringify(nestedRestored.nestedSequences) ===
              JSON.stringify(before.nestedSequences),
        );
        writeFileSync(
          join(folder, `${interpolation}-nested-readback.json`),
          JSON.stringify(
            {
              before: nestedBefore,
              after: nestedAfter,
              nestedParity,
              transparentErrors,
              retainedErrors,
              retainedNative,
              nestedAudioProof,
            },
            null,
            2,
          ),
        );
      }
      summary.push({
        interpolation,
        baseline: before,
        edited,
        frames: errors,
        pcmRelativeError: delta / energy,
        previewErrors,
      });
    }
    writeFileSync(join(folder, 'summary.json'), JSON.stringify(summary, null, 2));
    assert(
      'native page has no uncaught errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | '),
    );
    proof.record(
      'unexercised release and dialogue paths',
      'SKIP',
      COLLAGE_JOURNEY
        ? 'Real recorded videos/stills, native collage UI/store/browser export exercised. Physical device output, native Export dialog/hosted Render, effect/motion/parent combinations, agent/MCP model/live production are unexercised. All media and fixtures stayed local.'
        : KEYFRAME_JOURNEY
          ? 'Native keyframe UI/store→browser compositor and commit timings exercised. Export dialog, hosted Render, real spoken/caption protection, animated jump operation and agent unexercised. All media stayed local.'
          : ANIMATED_SPEECH_JOURNEY
            ? 'Native cached Auto-captions and animated Quick cuts/store/browser compositor exercised in four curve modes, with native stereo gain and source-clock samples. Transcript accuracy, fresh STT, varied dialogue/music, Export dialog, hosted Render, speed and agent model unexercised. Supplied beat markers do not certify beat detection. All media stayed local.'
            : SPEECH_JOURNEY
              ? 'Native cached Auto-captions/Quick cuts/store→browser compositor only. Transcript accuracy, fresh STT, Export dialog, hosted Render, animated jump operation, speed and agent unexercised. Supplied beat markers do not certify beat detection. All media stayed local.'
              : 'Native UI/store→browser compositor only. Export dialog, hosted Render, real spoken/caption protection, animated jump operation, speed and agent unexercised. All media stayed local.',
    );
  } catch (error) {
    proof.record(
      'journey completion',
      'FAIL',
      error instanceof Error ? error.message.slice(0, 500) : String(error),
    );
    throw error;
  } finally {
    await context?.close();
    try {
      await removeProjects(admin, BRAND, ids);
      if (ids.length > 0) {
        const { count, error } = await admin
          .schema('media')
          .from('editor_projects')
          .select('id', { count: 'exact', head: true })
          .in('id', ids);
        const { count: revisions, error: revisionError } = await admin
          .schema('media')
          .from('editor_project_revisions')
          .select('project_id', { count: 'exact', head: true })
          .in('project_id', ids);
        assert(
          'owned projects and revisions removed',
          !error && !revisionError && count === 0 && revisions === 0,
        );
      }
      if (session) {
        if (brandChanged) {
          const preferences = admin.schema('brand_profiles').from('user_brand_preferences');
          const { error: restoreError } =
            previousBrand === undefined
              ? await preferences.delete().eq('user_id', session.userId)
              : await preferences.upsert(
                  {
                    user_id: session.userId,
                    active_brand_id: previousBrand,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'user_id' },
                );
          assert('bench brand preference restored', !restoreError);
        }
        const { error } = await admin.auth.admin.signOut(session.accessToken, 'local');
        assert('own minted session revoked', !error);
      }
      for (const localSource of ownedSources) {
        if (transcriptPath) {
          const { error } = await admin.storage
            .from('brand-profile-assets')
            .remove([transcriptPath]);
          const { data, error: listError } = await admin.storage
            .from('brand-profile-assets')
            .list(transcriptPath.slice(0, transcriptPath.lastIndexOf('/')), {
              search: transcriptPath.slice(transcriptPath.lastIndexOf('/') + 1),
            });
          assert(
            'owned cached transcript removed from loopback storage',
            !error && !listError && data?.length === 0,
          );
        }
        const { error: storageError } = await admin.storage
          .from('media-library')
          .remove([localSource.path]);
        if (localSource.assetId) {
          const { error: assetError } = await admin
            .schema('media')
            .from('assets')
            .delete()
            .eq('id', localSource.assetId)
            .eq('brand_id', BRAND);
          assert('local recorded fixture asset delete succeeds', !assetError);
        }
        if (localSource.receiptKey) {
          assert(
            'local receipt cleanup identity valid',
            /^generated:[a-f0-9]{64}$/.test(localSource.receiptKey) &&
              /^[a-f0-9-]{36}$/.test(BRAND),
          );
          const receiptsLeft = execFileSync(
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
              `delete from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${localSource.receiptKey}'; select count(*) from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${localSource.receiptKey}';`,
            ],
            { stdio: 'pipe', encoding: 'utf8' },
          );
          assert(
            'local recorded fixture registration receipt removed',
            receiptsLeft.trim().split('\n').at(-1) === '0',
          );
        }
        const { data: objects, error: objectError } = await admin.storage
          .from('media-library')
          .list(localSource.path.slice(0, localSource.path.lastIndexOf('/')));
        const { count, error: assetReadError } = localSource.assetId
          ? await admin
              .schema('media')
              .from('assets')
              .select('id', { count: 'exact', head: true })
              .eq('id', localSource.assetId)
          : { count: 0, error: null };
        assert(
          'local recorded fixture asset and storage removed',
          !storageError && !objectError && !assetReadError && count === 0 && objects?.length === 0,
        );
      }
    } finally {
      for (const server of servers.reverse()) server.stop();
      proof.notes.push(`local media retained: ${folder}`);
      proof.print();
    }
  }
});
