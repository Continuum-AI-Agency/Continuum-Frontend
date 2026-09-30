import { randomUUID } from 'node:crypto';
import {
  type EditorClip,
  type EditorProjectV2,
  HEADLESS_CONCEPTS,
  type VideoEditorOpInput,
} from '@continuum/contracts';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { prodSql } from '../../Continuum-Backend/scripts/_bench/managementSql';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { objectsFor, removeAssets, removeProjects } from './video-editor-workspace/ledger';

// ---------------------------------------------------------------------------
// videoeditor:generate:e2e:bench — generating inside the Video Studio, end to end, as the
// bench login on the bench brand against PRODUCTION Supabase and providers, a local Backend
// from this tree (every worker off) and a Next dev server.
//
//   /studio/video/new → an existing bench video with speech lands on V1 through
//   /ops/add_clip (never a dropped file: that opens the First-cut Brief) → Generate ▸ Music
//   Bed with the "Calm lo-fi" chip → the job completes → the bed is on an audio lane with a
//   visible ducking line, and the project holds its audio.volume keys → Generate ▸ Voiceover
//   with a short script lands at the playhead → the Concept Reel card shows the headless
//   catalog and its cost and is cancelled (never generated: it is paid) → a Library image
//   shows "Edit in timeline" and opens a timeline with the image on it.
//
// Every step is asserted on the persisted project, read back through the Backend. Paid: one
// Lyria bed and one TTS line (cents), plus STT of the 6.6 s source. Writes, all deleted at
// exit and asserted gone by id: the editor projects, the two generated Library assets and
// their stored audio, the source version's kept transcript (when this run made it), and the
// generation job rows.
// ---------------------------------------------------------------------------

test.describe.configure({ timeout: 1_200_000 });

const BENCH = 'videoeditor:generate:e2e:bench';
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
/** Where the Backend keeps transcripts per version (its AI_STUDIO_BUCKET default). */
const KEPT_BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';
/** "Solicita tu Day Pass en Vivo 4047" — a 6.6 s Vivo 47 clip on the bench brand, spoken. */
const SOURCE_ASSET_ID =
  process.env.VIDEO_GENERATE_SOURCE_ASSET ?? 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const VOICE_AT_SEC = 3;
const SCRIPT = 'Tu primera clase es gratis.';
const JOB_MS = 360_000;
const STEP_MS = 20_000;
const RUN = randomUUID().slice(0, 8);

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
const resolveBound = async (api: Api, assetId: string): Promise<string | null> => {
  const query = new URLSearchParams({
    brandId: BRAND,
    bindingType: 'library_asset',
    externalId: assetId,
  });
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/resolve?${query}`, {
    headers: { Authorization: `Bearer ${api.token}` },
  });
  if (!response.ok) throw new Error(`resolve ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { projectId: string | null }).projectId;
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

const clips = (project: EditorProjectV2) => project.tracks.flatMap((track) => track.clips);
const audioClips = (project: EditorProjectV2) =>
  clips(project).filter(
    (clip): clip is Extract<EditorClip, { kind: 'audio' }> => clip.kind === 'audio',
  );
const tagged = (project: EditorProjectV2, tag: string) =>
  audioClips(project).filter((clip) => clip.tags.includes(tag));
const volumeKeys = (clip: EditorClip | undefined) =>
  clip && 'keyframes' in clip
    ? clip.keyframes.filter((key) => key.property === 'audio.volume')
    : [];
const near = (value: number | undefined, target: number, tolerance: number) =>
  value !== undefined && Math.abs(value - target) <= tolerance;
const visible = (locator: Locator) => locator.filter({ visible: true });
/** Whether a locator reaches `count` visible matches in time — never throws. */
const shows = (locator: Locator, count = 1, timeout = 10_000) =>
  expect(visible(locator))
    .toHaveCount(count, { timeout })
    .then(() => true)
    .catch(() => false);

/** Seek by clicking the ruler at `sec`; the default zoom is read off a clip's width. */
async function seek(page: Page, pxPerSec: number, sec: number) {
  const ruler = await page.locator('[data-timeline-ruler]:visible').boundingBox();
  if (!ruler) throw new Error('ruler not visible');
  await page.mouse.click(ruler.x + pxPerSec * sec, ruler.y + ruler.height / 2);
}

/** Opens a Generate card; the dialog it opens. */
async function openCard(page: Page, id: string): Promise<Locator> {
  await visible(page.getByRole('tab', { name: 'Generate', exact: true })).click();
  await visible(page.locator(`[data-quick-start="${id}"]`)).click();
  const dialog = visible(page.locator('[data-testid="quick-start-dialog"]'));
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

/** Waits for a generation row to settle; its state and text. */
async function settled(page: Page, jobId: string) {
  const row = page.locator(`[data-generation-job="${jobId}"]`).first();
  await expect(row)
    .toHaveAttribute('data-state', /completed|failed/, { timeout: JOB_MS })
    .catch(() => undefined);
  return {
    state: (await row.getAttribute('data-state').catch(() => null)) ?? 'missing',
    text: ((await row.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 300),
  };
}

test(BENCH, async ({ browser }) => {
  const servers: Server[] = [];
  const createdProjects: string[] = [];
  const jobIds: string[] = [];
  let previousActiveBrand: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let keptPath: string | null = null;
  let keptBefore = true;
  try {
    // ── servers + identity ────────────────────────────────────────────────────────────
    const fePort = await freePort();
    const backend = await bootBackend(`http://localhost:${fePort}`);
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url, '.next/video-generate-e2e');
    servers.push(frontend);
    note(`local Backend ${backend.url} (workers off, log ${backend.log}); Next ${frontend.url}`);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const api: Api = { base: backend.url, token: session.accessToken };

    // The bed hears the source to duck under it, and keeps that version's transcript.
    const { data: sourceRow } = await media
      .from('assets')
      .select('head_version_id')
      .eq('id', SOURCE_ASSET_ID)
      .maybeSingle();
    const sourceVersion = (sourceRow as { head_version_id?: string } | null)?.head_version_id;
    if (sourceVersion) {
      keptPath = `${BRAND}/video-editor/transcripts/${sourceVersion}.json`;
      const { data } = await admin.storage
        .from(KEPT_BUCKET)
        .list(`${BRAND}/video-editor/transcripts`, { search: `${sourceVersion}.json` });
      keptBefore = (data ?? []).some((object) => object.name === `${sourceVersion}.json`);
    }

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

    // ── a blank edit, then the spoken source on V1 from outside ───────────────────────
    const context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const generateInputs: Array<VideoEditorOpInput<'generate'>> = [];
    page.on('request', (request) => {
      if (!request.url().includes('/ops/generate') || request.url().includes('generate_status'))
        return;
      try {
        generateInputs.push(request.postDataJSON() as VideoEditorOpInput<'generate'>);
      } catch {
        // not JSON: nothing to record
      }
    });
    page.on('response', (response) => {
      if (!response.url().endsWith('/ops/generate') || !response.ok()) return;
      void response
        .json()
        .then((body: { jobId?: string }) => {
          if (body.jobId && !jobIds.includes(body.jobId)) jobIds.push(body.jobId);
        })
        .catch(() => undefined);
    });
    await page.goto(`${frontend.url}/studio/video/new`, { timeout: 300_000 });
    await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 180_000 });
    const projectId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
    createdProjects.push(projectId);
    await expect(page.locator('[data-testid="video-studio-edit"]:visible')).toHaveCount(1, {
      timeout: 180_000,
    });

    const placed = await postOp(api, projectId, 'add_clip', { assetId: SOURCE_ASSET_ID, atSec: 0 });
    let project = await until(
      () => getProject(api, projectId),
      (value) => clips(value).some((clip) => clip.kind === 'video'),
    );
    const source = clips(project).find((clip) => clip.kind === 'video');
    if (
      !check(
        '/ops/add_clip places the spoken bench video on V1',
        placed.status === 200 && Boolean(source),
        `${placed.status} ${placed.status === 200 ? '' : placed.text.slice(0, 200)} · ${project.durationSec.toFixed(2)} s`,
      ) ||
      !source
    ) {
      await context.close();
      return;
    }
    await expect(page.locator('[data-clip-kind="video"]:visible')).toHaveCount(1, {
      timeout: 15_000,
    });
    const clipBox = await page.locator(`[data-clip-id="${source.id}"]:visible`).boundingBox();
    const pxPerSec = clipBox ? clipBox.width / source.durationSec : 60;

    // ── Generate ▸ Music Bed, a mood chip, ducked by default ──────────────────────────
    let dialog = await openCard(page, 'music_bed');
    await dialog.locator('[data-music-mood="lofi"]').click();
    const length = await dialog.getByLabel('Length (s)').inputValue();
    const duckOn = await dialog.getByRole('switch', { name: 'Duck under speech' }).isChecked();
    check(
      'Music Bed: the chip fills the mood, the length shows the timeline, ducking is on',
      (await dialog.locator('#quick-start-prompt').inputValue()).startsWith('Calm instrumental') &&
        near(Number(length), project.durationSec, 0.051) &&
        duckOn,
      `length "${length}" vs ${project.durationSec.toFixed(3)} s · duck ${duckOn}`,
    );
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
    const bedRequest = generateInputs.find((input) => input.quickStart === 'music_bed');
    const bedJob = await until(
      async () => jobIds[0],
      (value) => Boolean(value),
      10_000,
    );
    check(
      'the card starts generate with the chip’s mood, duck on, from 0:00 and no length of its own',
      Boolean(bedJob) &&
        bedRequest?.duck === true &&
        bedRequest.place?.atSec === 0 &&
        bedRequest.durationSec === undefined &&
        (bedRequest.prompt ?? '').startsWith('Calm instrumental'),
      `${bedJob ?? 'no job'} · ${JSON.stringify(bedRequest)}`,
    );
    const bedStartedMs = Date.now();
    const bedDone = bedJob ? await settled(page, bedJob) : { state: 'missing', text: '' };
    check(
      'the music bed job completes in the Results list',
      bedDone.state === 'completed',
      `${bedDone.state} after ${((Date.now() - bedStartedMs) / 1000).toFixed(1)} s · ${bedDone.text}`,
    );
    project = await until(
      () => getProject(api, projectId),
      (value) => tagged(value, 'music-bed').length > 0,
    );
    const bed = tagged(project, 'music-bed')[0];
    const bedKeys = volumeKeys(bed);
    const dips = bedKeys.filter((key) => Number(key.value) < (bed?.volume ?? 1) * 0.5);
    check(
      'the bed is on an audio lane from 0:00, as long as the edit, with audio.volume ducking keys',
      Boolean(bed) &&
        near(bed?.timelineStartSec, 0, 0.01) &&
        near(bed?.durationSec, project.durationSec, 0.05) &&
        bedKeys.length >= 4 &&
        dips.length >= 2,
      bed
        ? `${bed.durationSec.toFixed(2)} s @${bed.timelineStartSec} · ${bedKeys.length} keys (${bedKeys
            .map((key) => `${key.timeSec.toFixed(2)}=${Number(key.value).toFixed(2)}`)
            .join(' ')})`
        : 'no music-bed clip',
    );
    const line = page.locator(`[data-clip-id="${bed?.id}"]:visible [data-volume-line]`);
    const lineShown = await shows(line, 1, 15_000);
    check(
      'the audio lane draws the bed’s ducking as a volume line over its waveform',
      lineShown && (await line.getAttribute('data-volume-line')) === String(bedKeys.length),
      `line ${lineShown ? `with ${await line.getAttribute('data-volume-line')} keys` : 'not visible'}`,
    );

    // ── Generate ▸ Voiceover at the playhead ──────────────────────────────────────────
    await seek(page, pxPerSec, VOICE_AT_SEC);
    dialog = await openCard(page, 'voiceover');
    await dialog.getByRole('textbox', { name: 'Script' }).fill(SCRIPT);
    await dialog.locator('[data-voice-preset="Warm, confident, Mexican Spanish"]').click();
    const placeLabel = await dialog.locator('label[for="quick-start-place"]').innerText();
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
    const voiceRequest = generateInputs.find((input) => input.quickStart === 'voiceover');
    const voiceJob = await until(
      async () => jobIds[1],
      (value) => Boolean(value),
      10_000,
    );
    const playheadAt = voiceRequest?.place?.atSec;
    check(
      'Voiceover: the script and a voice preset go to generate, placed at the playhead',
      Boolean(voiceJob) &&
        voiceRequest?.prompt === SCRIPT &&
        voiceRequest.voice === 'Warm, confident, Mexican Spanish' &&
        near(playheadAt, VOICE_AT_SEC, 0.15),
      `${voiceJob ?? 'no job'} · "${placeLabel}" · ${JSON.stringify(voiceRequest)}`,
    );
    const voiceDone = voiceJob ? await settled(page, voiceJob) : { state: 'missing', text: '' };
    check(
      'the voiceover job completes in the Results list',
      voiceDone.state === 'completed',
      `${voiceDone.state} · ${voiceDone.text}`,
    );
    project = await until(
      () => getProject(api, projectId),
      (value) => tagged(value, 'voiceover').length > 0,
    );
    const voice = tagged(project, 'voiceover')[0];
    check(
      'the voiceover sits on an audio lane at the playhead',
      Boolean(voice) && near(voice?.timelineStartSec, playheadAt ?? VOICE_AT_SEC, 0.01),
      voice
        ? `@${voice.timelineStartSec.toFixed(3)} s for ${voice.durationSec.toFixed(2)} s (playhead ${playheadAt})`
        : 'no voiceover clip',
    );
    await expect(visible(page.locator(`[data-clip-id="${voice?.id}"]`)))
      .toHaveCount(1, { timeout: 15_000 })
      .catch(() => undefined);
    const reducked = volumeKeys(tagged(project, 'music-bed')[0]);
    note(
      `after the voiceover the bed has ${reducked.length} audio.volume keys (was ${bedKeys.length}): ${reducked
        .map((key) => `${key.timeSec.toFixed(2)}=${Number(key.value).toFixed(2)}`)
        .join(' ')}`,
    );

    // ── Concept Reel: the catalog, its cost, cancelled ───────────────────────────────
    const requestsBefore = generateInputs.length;
    dialog = await openCard(page, 'headless_concept');
    const concepts = dialog.locator('[data-concept]');
    await expect(concepts).toHaveCount(HEADLESS_CONCEPTS.length, { timeout: 10_000 });
    const firstConcept = HEADLESS_CONCEPTS[0];
    const firstText = firstConcept
      ? await dialog.locator(`[data-concept="${firstConcept.id}"]`).innerText()
      : '';
    await dialog.locator(`[data-concept="${firstConcept?.id}"] [role="radio"]`).click();
    const cost = await dialog.locator('[data-testid="concept-cost"]').innerText();
    const guarded = await visible(dialog.getByRole('button', { name: 'Generate reel' })).count();
    const listed = await concepts.count();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    check(
      'Concept Reel: the whole headless catalog with label, summary and when-to-use, and its dollar cost',
      Boolean(firstConcept) &&
        firstText.includes(firstConcept?.label ?? '?') &&
        firstText.includes(firstConcept?.summary.slice(0, 40) ?? '?') &&
        firstText.includes(firstConcept?.whenToUse.slice(0, 40) ?? '?') &&
        /Up to \$\d+/.test(cost) &&
        guarded === 1,
      `${listed} concepts · "${cost}"`,
    );
    check(
      'Concept Reel: cancelled — no reel was generated',
      generateInputs.length === requestsBefore &&
        !generateInputs.some((input) => input.quickStart === 'headless_concept'),
      `${generateInputs.length - requestsBefore} generate request(s) after opening it`,
    );

    // ── the Library: an image starts a timeline ───────────────────────────────────────
    const { data: images } = await media
      .from('assets')
      .select('id')
      .eq('brand_id', BRAND)
      .eq('kind', 'image')
      .not('head_version_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1);
    const imageId = (images as Array<{ id: string }> | null)?.[0]?.id;
    if (imageId) {
      const boundBefore = await resolveBound(api, imageId);
      await page.goto(`${frontend.url}/library?assetId=${imageId}`, { timeout: 300_000 });
      const edit = visible(page.getByRole('button', { name: 'Edit in timeline' }));
      const offered = await shows(edit, 1, 60_000);
      let opened: EditorProjectV2 | null = null;
      if (offered) {
        await edit.click();
        await page.waitForURL(/\/studio\/video\/[0-9a-f-]{36}/, { timeout: 120_000 });
        const openedId = /\/studio\/video\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
        if (openedId && openedId !== boundBefore) createdProjects.push(openedId);
        opened = openedId ? await getProject(api, openedId) : null;
      }
      const overlay = opened
        ? clips(opened).find(
            (clip) =>
              clip.kind === 'overlay' &&
              clip.source.sourceType === 'library_asset' &&
              clip.source.assetId === imageId,
          )
        : undefined;
      check(
        'a Library image offers "Edit in timeline" and opens an edit with the image on it',
        offered && Boolean(opened) && (boundBefore !== null || Boolean(overlay)),
        `${imageId} · offered ${offered} · ${opened ? `project ${opened.projectId} (${boundBefore ? 'already bound' : 'new'}), ${clips(opened).length} clip(s), overlay ${Boolean(overlay)}` : 'not opened'}`,
      );
    } else {
      check('a Library image offers "Edit in timeline"', false, 'the bench brand has no image');
    }

    check(
      'no uncaught page errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3).join(' | ') || 'none',
    );
    note(
      'NOT EXERCISED here: generating a concept reel (paid, owner-gated), the workspace preview hearing the ducked bed (unit-tested: webAudioPreviewEngine volumeAutomation), export of the ducked mix (videoeditor:audio:render:bench), audio and image "Edit in timeline" beyond this one image.',
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
      // Generated sound is filed under the project that asked for it.
      const generated: { id: string; storagePath: string }[] = [];
      for (const projectId of createdProjects) {
        const { data } = await media
          .from('assets')
          .select('id,storage_path')
          .eq('brand_id', BRAND)
          .contains('origin_ref', { nodeId: `video-project:${projectId}` });
        for (const row of (data ?? []) as Array<{ id: string; storage_path: string }>) {
          generated.push({ id: row.id, storagePath: row.storage_path });
        }
      }
      const ids = generated.map((asset) => asset.id);
      if (ids.length > 0) {
        // A probe a deployed worker is mid-way through would write after the delete.
        await until(
          async () =>
            (
              await media
                .from('media_probe_jobs')
                .select('state')
                .in('asset_id', ids)
                .in('state', ['queued', 'leased'])
            ).data ?? [],
          (rows) => rows.length === 0,
          120_000,
        );
        for (const table of ['preview_jobs', 'media_probe_jobs', 'asset_renditions']) {
          await media.from(table).delete().in('asset_id', ids);
        }
      }
      const removedAssets = await removeAssets(admin, BRAND, generated);
      const removedProjects = await removeProjects(admin, BRAND, createdProjects);
      if (keptPath && !keptBefore) await admin.storage.from(KEPT_BUCKET).remove([keptPath]);
      const removedJobs =
        jobIds.length === 0
          ? []
          : await prodSql(
              `delete from plugin_mcp.jobs where brand_id = '${BRAND}' and job_id in (${jobIds.map((id) => `'${id.replaceAll("'", '')}'`).join(',')}) returning 1`,
            );
      note(
        `cleanup: ${removedProjects} project(s), ${removedAssets.rows} generated asset(s), ${removedAssets.objects} object(s), ${removedJobs?.length ?? 0} job row(s)${keptPath && !keptBefore ? ', the kept source transcript' : ''}`,
      );

      const projectIds = createdProjects.length > 0 ? createdProjects : [randomUUID()];
      const { count: leftProjects } = await media
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .in('id', projectIds);
      const { count: leftAssets } = await media
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .in('id', ids.length > 0 ? ids : [randomUUID()]);
      const leftObjects = (await objectsFor(BRAND, generated)).length;
      let leftKept = 0;
      if (keptPath && !keptBefore) {
        const name = keptPath.split('/').pop() ?? '';
        const { data } = await admin.storage
          .from(KEPT_BUCKET)
          .list(`${BRAND}/video-editor/transcripts`, { search: name });
        leftKept = (data ?? []).filter((object) => object.name === name).length;
      }
      const leftJobs =
        jobIds.length === 0
          ? 0
          : ((
              await prodSql<{ count: number }>(
                `select count(*)::int as count from plugin_mcp.jobs where job_id in (${jobIds.map((id) => `'${id.replaceAll("'", '')}'`).join(',')})`,
              )
            )?.[0]?.count ?? -1);
      check(
        'net zero: no project, generated asset, stored audio, kept transcript or job row left from this run',
        (leftProjects ?? 0) === 0 &&
          (leftAssets ?? 0) === 0 &&
          leftObjects === 0 &&
          leftKept === 0 &&
          leftJobs === 0,
        `projects ${leftProjects ?? 0}/${createdProjects.length}, assets ${leftAssets ?? 0}/${ids.length}, objects ${leftObjects}, kept transcript ${leftKept}${keptBefore ? ' (existed before, kept)' : ''}, jobs ${leftJobs}/${jobIds.length}`,
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
  note(`run ${RUN}`);
  const failures = printEnvelope();
  expect(failures, 'graded FAIL steps').toBe(0);
});
