import { randomUUID } from 'node:crypto';
import type { EditorClip, EditorProjectV2 } from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
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
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
/** "Solicita tu Day Pass en Vivo 4047" — a 6.6 s Vivo 47 clip on the bench brand. */
const SOURCE_ASSET_ID =
  process.env.VIDEO_MOTION_SOURCE_ASSET ?? 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const CUT_SEC = 3;
const LIVE_EDIT_BUDGET_MS = 3_000;
const STEP_MS = 20_000;
const RUN = randomUUID().slice(0, 8);
const HOOK_LINE = `Motion bench ${RUN}`;
const OUTSIDE_LINE = `Outside ${RUN}`;

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
  const ruler = await page.locator('[data-timeline-ruler]:visible').boundingBox();
  if (!ruler) throw new Error('ruler not visible');
  await page.mouse.click(ruler.x + pxPerSec * sec, ruler.y + ruler.height / 2);
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
  const servers: Server[] = [];
  const createdProjects: string[] = [];
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

    // ── a blank edit, then two cuts of a bench video from outside ─────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
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
