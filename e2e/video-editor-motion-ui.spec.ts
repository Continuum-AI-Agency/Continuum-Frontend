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
  registerGeneratedAssetResponseSchema,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import type { DurableTimelineRequest } from './support/editorV2DurableRenderBenchEntry';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
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
const LOCAL_CURVE_JOURNEY = process.env.VIDEO_EDITOR_CURVE_JOURNEY_LOCAL === '1';
const SPEECH_JOURNEY = process.env.VIDEO_EDITOR_SPEECH_JOURNEY === '1';
const TEXT_JOURNEY = process.env.VIDEO_EDITOR_TEXT_JOURNEY === '1';
const PARENT_JOURNEY = process.env.VIDEO_EDITOR_PARENT_JOURNEY === '1';
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
  ? (() => {
      const status = execFileSync('supabase', ['status', '-o', 'env'], {
        cwd: join(__dirname, '../..'),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const env = Object.fromEntries(
        status.split('\n').flatMap((line) => {
          const match = /^([A-Z_]+)="(.*)"$/.exec(line);
          return match ? [[match[1], match[2]]] : [];
        }),
      );
      const url = env.API_URL;
      if (
        !url ||
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) ||
        !env.SERVICE_ROLE_KEY ||
        !env.ANON_KEY
      )
        throw new Error(
          'Local curve journey requires the running loopback Supabase stack; no reset/hydration is performed.',
        );
      process.env.SUPABASE_ANON_KEY = env.ANON_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.ANON_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = env.ANON_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY = env.ANON_KEY;
      return { url, serviceRoleKey: env.SERVICE_ROLE_KEY };
    })()
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
async function selectClip(page: Page, clipId: string) {
  // The middle of the block: its edges are trim handles and transition seams.
  await page.locator(`[data-clip-id="${clipId}"]:visible`).click();
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
    SPEECH_JOURNEY
      ? 'videoeditor:motion:e2e:bench:speech-jumps'
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
    const render = async (project: EditorProjectV2, path: string) => {
      const request: DurableTimelineRequest = {
        project,
        inputs: mainClips(project).map((clip) => ({
          sourceId: clip.id,
          sourceAssetId: assetId,
          sourceRevision: versionId,
          storage: { bucket: version.bucket, path: version.storage_path },
          url: signed.signedUrl,
        })),
      };
      const result = await compositor.evaluate(
        (input) => window.__editorV2DurableRenderBench.renderTimeline(input),
        request,
      );
      writeFileSync(path, Buffer.from(result.base64, 'base64'));
      return result;
    };
    const previewAudio = async (project: EditorProjectV2, fromSec = 0) => {
      const request: DurableTimelineRequest = {
        project,
        inputs: mainClips(project).map((clip) => ({
          sourceId: clip.id,
          sourceAssetId: assetId,
          sourceRevision: versionId,
          storage: { bucket: version.bucket, path: version.storage_path },
          url: signed.signedUrl,
        })),
      };
      const result = await compositor.evaluate(
        ({ request, fromSec }) =>
          window.__editorV2DurableRenderBench.previewTimelineAudio(request, fromSec),
        { request, fromSec },
      );
      const bytes = Buffer.from(result.pcmBase64, 'base64');
      return new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
    };
    const summary = [];
    const commandResponses: Array<{ status: number; body: string }> = [];
    page.on('response', async (response) => {
      if (/\/video-projects\/[^/]+\/commands$/.test(response.url()))
        commandResponses.push({
          status: response.status(),
          body: (await response.text()).slice(0, 800),
        });
    });
    if (SPEECH_JOURNEY) {
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
        join(folder, 'caption-input-readback.json'),
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
      const baselinePath = join(folder, 'speech-baseline.mp4');
      await render(before, baselinePath);
      await page.reload();
      await expect(page.locator('[data-clip-id="speaker"]:visible')).toHaveCount(1, {
        timeout: 30_000,
      });
      await selectClip(page, 'speaker');
      const jumpStarted = performance.now();
      await visible(page.getByRole('button', { name: 'Quick cuts', exact: true })).click();
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
        join(folder, 'speech-jump-readback.json'),
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
      const editedPath = join(folder, 'speech-edited-bare.mp4');
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
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-ss',
          String(sec),
          '-i',
          file,
          '-frames:v',
          '1',
          '-vf',
          'scale=64:64,format=rgb24',
          '-f',
          'rawvideo',
          'pipe:1',
        ]);
      const frameErrors = clips.map((clip) => {
        const outputSec =
          Math.floor((clip.timelineStartSec + clip.durationSec / 2) * 30) / 30 + 1 / 60;
        const sourceSec = outputSec - clip.timelineStartSec + clip.sourceInSec - sourceInSec;
        const got = frame(editedPath, outputSec),
          expected = frame(baselinePath, sourceSec);
        return got.length && got.length === expected.length
          ? got.reduce((sum, value, i) => sum + Math.abs(value - expected[i]!), 0) / got.length
          : Infinity;
      });
      assert(
        'independent decoded picture follows each retained speech source span',
        frameErrors.every((error) => error < 4),
        JSON.stringify(frameErrors),
      );
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
      const burnedPath = join(folder, 'speech-edited-captions.mp4');
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
    for (const interpolation of SPEECH_JOURNEY
      ? []
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
            canvas: { ...initial.canvas, width: 360, height: 640 },
            durationSec: 4,
          },
          {
            commandType: 'set_export_settings',
            exportSettings: editorExportSettingsSchema.parse({
              ...initial.exportSettings,
              width: 360,
              height: 640,
              frameRate: { numerator: 30, denominator: 1 },
              videoBitrateKbps: 1500,
              audioBitrateKbps: 128,
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
        writeFileSync(join(folder, `${interpolation}-native-${label}.png`), png);
        return execFileSync(
          'ffmpeg',
          ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
          { input: png, maxBuffer: 4_000_000 },
        );
      };
      const baselineTitles: Buffer[] = [];
      if (TEXT_JOURNEY) {
        for (const [index, sec] of [0.2, 0.7, 2.2, 2.7].entries())
          baselineTitles.push(await titlePreview(sec, `baseline-${index}`));
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
      SPEECH_JOURNEY
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
      if (localSource) {
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
