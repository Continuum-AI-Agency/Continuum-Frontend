// Creative combinations end to end, on the loopback stack only ($0).
//
// One ordered stack per platform format — looks, beat-synced shot switching on a real drum
// performance, a four-panel collage with dust and light leaks, a hook title, word-highlight
// captions and a label parented to a moving panel — goes through the real editor ops door,
// the native editor (reload, Undo/Redo, preview), the actual browser-export worker and the
// native Export dialog (Backend job → local Continuum Render → Library → download). Every
// picture and sound is graded against independent FFmpeg decodes, ablated composed frames
// and the independent MIDI onset labels; native and encoded evidence are recorded apart, and a
// stationary codec control separates encoder colour from composition defects.
//
// Run through scripts/video-studio/fe-creative/bench.sh (it starts the local Render).

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type EditorClip,
  type EditorProjectV2,
  editorProjectV2Schema,
  PLATFORM_EXPORT_PRESETS,
  type PlatformExportPresetId,
  parentPositionDelta,
  registerGeneratedAssetResponseSchema,
  videoStudioEditorPath,
} from '@continuum/contracts';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadLocalSupabaseEnv } from './support/prodEnv';
import {
  audioError,
  type Box,
  boxDistance,
  boxesDisjoint,
  boxNear,
  changedFraction,
  changeMask,
  decodeCover,
  decodeRgb,
  decodeSmall,
  energyIn,
  gridCell,
  mae,
  maeIn,
  onsetAlignment,
  pcm,
  pngSize,
  type Rect,
  readability,
} from './video-editor-combos/oracle';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { removeProjects } from './video-editor-workspace/ledger';

test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 3_600_000 });

const BENCH = 'videoeditor:combos:e2e:bench';
const BRAND = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const RUN = randomUUID().slice(0, 8);
const ENABLED = process.env.VIDEO_EDITOR_COMBOS === '1';
const RENDER_URL = process.env.VIDEO_EDITOR_RENDER_URL ?? '';
const FIXTURE = process.env.VIDEO_EDITOR_RECORDED_FIXTURE ?? '';
const TRANSCRIPT = process.env.VIDEO_EDITOR_SPEECH_TRANSCRIPT ?? '';
const MUSIC = process.env.VIDEO_EDITOR_MUSIC_FIXTURE ?? '';
const MUSIC_LABELS = process.env.VIDEO_EDITOR_MUSIC_LABELS ?? '';
const FORMATS = (process.env.VIDEO_EDITOR_COMBOS_FORMATS ?? 'tiktok,youtube,square')
  .split(',')
  .filter(Boolean) as PlatformExportPresetId[];
// The shape and family blocks a run takes. The anchor runs all of them; a focused run names one
// (with VIDEO_EDITOR_COMBOS_FORMATS empty), so a short run can prove a single path end to end.
const PARTS = new Set(
  (process.env.VIDEO_EDITOR_COMBOS_PARTS ?? 'lanes,nested,text-only,dark,family')
    .split(',')
    .filter(Boolean),
);
const OUT = resolve(
  process.env.VIDEO_EDITOR_COMBOS_OUTPUT ?? join(tmpdir(), `video-combos-${RUN}`),
);
const RECORDING_SHA = '59c4807dc9c32bfbd2d97e7bfd400373ccc4eaa14ee14f3ba7f5aa88914cdc51';
const MUSIC_SHA = '760a90ac7ea8888ee7e2d31c2b517f79a7003430b0da3ca4cda36316b0521634';
const FPS = 30;
const DURATION = 6;
const COLLAGE_AT = 1.5;
const SLIDE_SEC = 0.8;
/** The hook holds the top third until the panel's label takes it over. */
const HOOK_SEC = 1.5;
const MAIN_IN = 64.7;
const OCEAN_IN = 138;
const POOL_IN = 248;
const NO_PROVIDER = {
  AI_STUDIO_BUCKET: 'brand-profile-assets',
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  GOOGLE_GENAI_API_KEY: '',
  OPENAI_API_KEY: '',
  VERTEX_API_KEY: '',
  VERTEX_PROJECT_ID: '',
  GOOGLE_CLOUD_PROJECT: '',
  GCLOUD_PROJECT: '',
  GOOGLE_VERTEX_PROJECT: '',
  GOOGLE_PROJECT_ID: '',
  GOOGLE_CLIENT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  GOOGLE_APPLICATION_CREDENTIALS: '/tmp/continuum-combos-no-provider-credentials',
};
/** A frame's centre, so a seek a few milliseconds off still shows the same frame. */
const frameAt = (sec: number) => (Math.round(sec * FPS) + 0.5) / FPS;
/** The start of the frame on screen at `sec`: the time an export renders that frame at. */
const frameStart = (sec: number) => Math.floor(sec * FPS + 1e-6) / FPS;

type Api = { base: string; token: string };
type Recorded = {
  assetId: string;
  versionId: string;
  path: string;
  receiptKey: string;
  url: string;
};

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function getProject(api: Api, projectId: string): Promise<EditorProjectV2> {
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}`, {
    headers: { Authorization: `Bearer ${api.token}` },
  });
  if (!response.ok) throw new Error(`get project ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { project: EditorProjectV2 }).project;
}

async function postOp(api: Api, projectId: string, op: string, body: unknown) {
  const started = performance.now();
  const response = await fetch(`${api.base}/api/ai-studio/video-projects/${projectId}/ops/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, ms: performance.now() - started };
}

async function until<T>(read: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    value = await read();
  }
  return value;
}

const allClips = (project: EditorProjectV2): EditorClip[] => [
  ...project.tracks.flatMap((track) => track.clips),
  ...project.nestedSequences.flatMap((sequence) => sequence.tracks.flatMap((t) => t.clips)),
];
const mainTrack = (project: EditorProjectV2) =>
  project.tracks.filter((t) => t.kind === 'video').toSorted((a, b) => a.order - b.order)[0];
const sameTracks = (a: EditorProjectV2, b: EditorProjectV2) =>
  JSON.stringify(a.tracks) === JSON.stringify(b.tracks);
/** Ids of tracks whose content differs between two documents (added or removed included). */
const changedTracks = (before: EditorProjectV2, after: EditorProjectV2): string[] => {
  const ids = new Set([...before.tracks, ...after.tracks].map((t) => t.id));
  return [...ids].filter(
    (id) =>
      JSON.stringify(before.tracks.find((t) => t.id === id)) !==
      JSON.stringify(after.tracks.find((t) => t.id === id)),
  );
};
/** The document with some clips taken out — an ablation for one layer's contribution. */
const without = (
  project: EditorProjectV2,
  drop: (clip: EditorClip) => boolean,
): EditorProjectV2 => ({
  ...project,
  tracks: project.tracks.map((track) => ({
    ...track,
    clips: (track.clips as EditorClip[]).filter((clip) => !drop(clip)),
  })) as EditorProjectV2['tracks'],
});
/** The document with chosen effects taken off (all when `which` is omitted). */
const withoutEffects = (
  project: EditorProjectV2,
  which?: (clipId: string, effectId: string) => boolean,
): EditorProjectV2 => ({
  ...project,
  tracks: project.tracks.map((track) => ({
    ...track,
    clips: (track.clips as EditorClip[]).map((clip) =>
      'effects' in clip
        ? {
            ...clip,
            effects: clip.effects.filter(
              (effect) => which !== undefined && !which(clip.id, String(effect.effectId ?? '')),
            ),
          }
        : clip,
    ),
  })) as EditorProjectV2['tracks'],
});
const magentaCount = (rgb: Buffer) => {
  let count = 0;
  for (let i = 0; i < rgb.length; i += 3)
    if (rgb[i]! > 150 && rgb[i + 2]! > 150 && rgb[i + 1]! < 100) count += 1;
  return count;
};
const describeError = (error: unknown) =>
  error instanceof Error ? error.message : JSON.stringify(error);
const center = (box: Box | null) => (box ? (box.left + box.right) / 2 : Number.NaN);

test(BENCH, async ({ browser }) => {
  test.skip(!ENABLED, 'Explicit loopback combination mode only (VIDEO_EDITOR_COMBOS=1).');
  mkdirSync(OUT, { recursive: true });
  const notes: string[] = [];
  const rec = createBenchRecorder(BENCH, notes);
  const save = (name: string, value: unknown) =>
    writeFileSync(join(OUT, name), JSON.stringify(value, null, 2));
  let fails = 0;
  const check = (step: string, ok: boolean, detail?: unknown) => {
    if (!ok) fails += 1;
    rec.record(
      step,
      ok ? 'PASS' : 'FAIL',
      detail === undefined ? undefined : JSON.stringify(detail).slice(0, 900),
    );
    return ok;
  };
  const must = (step: string, ok: boolean, detail?: unknown) => {
    if (!check(step, ok, detail))
      throw new Error(`${step}: ${JSON.stringify(detail).slice(0, 400)}`);
  };
  const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
  /**
   * A speed sample against its frozen ceiling. A sample taken at a 1-minute load above 18 (this
   * machine's 18 cores) is contended: kept and reported, never certifying, and over its ceiling
   * it is WARN rather than FAIL. At or under 18 the ceiling is binding.
   */
  const speedCheck = (step: string, ms: number, ceilingMs: number) => {
    const now = uptime();
    const load = Number(/load averages?: ([\d.]+)/.exec(now)?.[1] ?? Number.NaN);
    const contended = !(load <= 18);
    const detail = JSON.stringify({ ms, ceilingMs, load, contended, uptime: now });
    if (ms <= ceilingMs) rec.record(step, 'PASS', detail);
    else if (contended) {
      rec.record(step, 'WARN', detail);
      notes.push(
        `contended speed sample over its ceiling (kept, not certifying): ${step} ${Math.round(ms)} ms at load ${load}`,
      );
    } else check(step, false, { ms, ceilingMs, load, uptime: now });
  };
  notes.push(`uptime at start: ${uptime()}`);

  const local = loadLocalSupabaseEnv();
  // The booted Backend inherits this, so it verifies sessions against the loopback stack too.
  process.env.SUPABASE_URL = local.url;
  const admin = createClient(local.url, local.serviceRoleKey, { auth: { persistSession: false } });
  const media = admin.schema('media');
  const servers: Server[] = [];
  const projectIds: string[] = [];
  const outputAssetIds: string[] = [];
  const owned: Array<Partial<Recorded> & { path: string }> = [];
  let transcriptPath: string | null = null;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | null = null;
  let previousPreference: {
    user_id: string;
    active_brand_id: string | null;
    updated_at: string;
  } | null = null;
  let changedPreference = false;
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  const speed: Record<string, number[]> = { editor_op: [], browser_export: [], native_export: [] };
  const pageErrors: string[] = [];
  /** What this run owns right now, so an interrupted run is recoverable by exact id (recover.ts). */
  const persistOwned = () =>
    save('owned-live.json', {
      brandId: BRAND,
      projectIds,
      assetIds: [...outputAssetIds, ...owned.flatMap((o) => (o.assetId ? [o.assetId] : []))],
      objects: [
        ...owned.map((o) => ({ bucket: 'media-library', path: o.path })),
        ...(transcriptPath ? [{ bucket: 'brand-profile-assets', path: transcriptPath }] : []),
      ],
      receiptKeys: owned.flatMap((o) => (o.receiptKey ? [o.receiptKey] : [])),
      sessionIds: session
        ? [
            JSON.parse(Buffer.from(session.accessToken.split('.')[1]!, 'base64url').toString())
              .session_id,
          ]
        : [],
    });

  const cleanupOwned = async () => {
    const { data: jobs, error: jobsError } = projectIds.length
      ? await media
          .from('client_render_jobs')
          .select('id,state,result_asset_ids')
          .eq('brand_id', BRAND)
          .in('source_id', projectIds)
      : { data: [], error: null };
    if (jobsError) throw jobsError;
    if ((jobs ?? []).some((j) => !['completed', 'failed', 'superseded'].includes(j.state)))
      throw new Error('An owned export is still live; exact fixtures retained for recovery.');
    const assetIds = new Set([
      ...outputAssetIds,
      ...(jobs ?? []).flatMap((j) => j.result_asset_ids as string[]),
      ...owned.flatMap((o) => (o.assetId ? [o.assetId] : [])),
    ]);
    for (const assetId of assetIds) {
      const { data: versionRows, error } = await media
        .from('asset_versions')
        .select('bucket,storage_path')
        .eq('brand_id', BRAND)
        .eq('asset_id', assetId);
      if (error) throw error;
      for (const row of versionRows ?? [])
        await admin.storage.from(row.bucket).remove([row.storage_path]);
      const removed = await media.from('assets').delete().eq('brand_id', BRAND).eq('id', assetId);
      if (removed.error) throw removed.error;
      execFileSync('docker', [
        'exec',
        '-i',
        'supabase_db_continuum',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
        '-c',
        `delete from library_internal.operation_receipts where brand_id='${BRAND}' and response->>'assetId'='${assetId}';`,
      ]);
    }
    for (const entry of owned) {
      await admin.storage.from('media-library').remove([entry.path]);
      if (entry.receiptKey && /^generated:[a-f0-9]{64}$/.test(entry.receiptKey))
        execFileSync('docker', [
          'exec',
          '-i',
          'supabase_db_continuum',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-At',
          '-c',
          `delete from library_internal.operation_receipts where brand_id='${BRAND}' and idempotency_key='${entry.receiptKey}';`,
        ]);
    }
    if (transcriptPath) await admin.storage.from('brand-profile-assets').remove([transcriptPath]);
    if (projectIds.length) {
      const removedJobs = await media
        .from('client_render_jobs')
        .delete()
        .eq('brand_id', BRAND)
        .in('source_id', projectIds);
      if (removedJobs.error) throw removedJobs.error;
    }
    await removeProjects(admin, BRAND, projectIds);
    const { count: projectsLeft } = projectIds.length
      ? await media
          .from('editor_projects')
          .select('id', { count: 'exact', head: true })
          .in('id', projectIds)
      : { count: 0 };
    const { count: assetsLeft } = assetIds.size
      ? await media
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .in('id', [...assetIds])
      : { count: 0 };
    save('owned-ids.json', {
      brandId: BRAND,
      projectIds,
      assetIds: [...assetIds],
      paths: owned.map((o) => o.path),
      transcriptPath,
      jobs,
    });
    check(
      'every owned project, job, asset, object, receipt and transcript is removed',
      projectsLeft === 0 && assetsLeft === 0,
      { projectsLeft, assetsLeft },
    );
  };
  const restoreIdentity = async () => {
    if (session && changedPreference) {
      const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
      const { error } = previousPreference
        ? await prefs.upsert(previousPreference, { onConflict: 'user_id' })
        : await prefs.delete().eq('user_id', session.userId);
      if (error) throw error;
      check('prior active brand preference restored', true);
    }
    if (session) {
      const { error } = await admin.auth.admin.signOut(session.accessToken, 'local');
      check('own minted session revoked', !error, error?.message);
    }
  };
  try {
    must(
      'render loopback',
      ['127.0.0.1', 'localhost'].includes(new URL(RENDER_URL || 'http://x').hostname),
      RENDER_URL,
    );
    must(
      'recorded NASA fixture matches its frozen checksum',
      FIXTURE !== '' && sha256(FIXTURE) === RECORDING_SHA,
    );
    must(
      'Groove MIDI rock performance matches its frozen checksum',
      MUSIC !== '' && sha256(MUSIC) === MUSIC_SHA,
    );
    const labels = JSON.parse(readFileSync(MUSIC_LABELS, 'utf8')) as {
      cases: Array<{
        audioSha256: string;
        notes: Array<{ timeSec: number; velocity: number }>;
      }>;
    };
    const rock = labels.cases.find((c) => c.audioSha256 === MUSIC_SHA);
    must('independent MIDI onset labels for the exact performance', rock !== undefined);
    const onsets = rock!.notes.filter((n) => n.velocity > 0).map((n) => n.timeSec);
    const transcript = JSON.parse(readFileSync(TRANSCRIPT, 'utf8')) as {
      setId: string;
      sources: Array<{
        versionId: string;
        durationSec: number;
        language: string;
        words: Array<{ text: string; startSec: number; endSec: number }>;
      }>;
    };
    must(
      'kept real transcript covers the exact recording (no STT call)',
      transcript.setId === 'nasa-melvin' &&
        transcript.sources[0]?.versionId === 'fixture:nasa-ksc-122210-itow-melvin@59c4807dc9c3',
    );

    const fePort = await freePort();
    const backend = await bootBackend(`http://localhost:${fePort}`, {
      ...NO_PROVIDER,
      CONTINUUM_RENDER_SERVICE_URL: RENDER_URL,
    });
    servers.push(backend);
    const frontend = await bootFrontend(fePort, backend.url, '.next/video-combos-e2e');
    servers.push(frontend);
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    save('servers.json', {
      render: RENDER_URL,
      servers: servers.map(({ url, log }) => ({ url, log })),
    });
    session = await mintSessionBundleForEmail(OWNER_EMAIL);
    const api: Api = { base: backend.url, token: session.accessToken };
    const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
    const { data: preference, error: prefError } = await prefs
      .select('user_id,active_brand_id,updated_at')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (prefError) throw prefError;
    previousPreference = preference;
    const { error: setPrefError } = await prefs.upsert(
      { user_id: session.userId, active_brand_id: BRAND, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (setPrefError) throw setPrefError;
    changedPreference = true;
    persistOwned();
    save('cleanup-identity.json', {
      userId: session.userId,
      previousPreference,
      sessionId: JSON.parse(Buffer.from(session.accessToken.split('.')[1]!, 'base64url').toString())
        .session_id,
    });

    // ── Real media into the real local Library, exact versions ─────────────────────────
    const { buildRegisterGeneratedAssetOperation } = await import(
      '../../Continuum-Backend/App/media/registerGeneratedAsset'
    );
    const register = async (
      file: string,
      kind: 'video' | 'image' | 'audio',
      mimeType: string,
      name: string,
      extra: { width?: number; height?: number; durationMs?: number },
    ): Promise<Recorded> => {
      const bytes = readFileSync(file);
      const path = `${BRAND}/video-editor-combos/${randomUUID()}/${name}`;
      const entry: Partial<Recorded> & { path: string } = { path };
      owned.push(entry);
      const operation = buildRegisterGeneratedAssetOperation({
        brandId: BRAND,
        kind,
        bucket: 'media-library',
        storagePath: path,
        fileName: `combos-${RUN}-${name}`,
        mimeType,
        createdBy: session!.userId,
        ...extra,
        sizeBytes: bytes.length,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        source: 'canvas',
        operation: 'video_editor_local_fixture',
        originRef: { bench: BENCH, actualRecordedMedia: true },
      });
      const uploaded = await admin.storage
        .from('media-library')
        .upload(path, bytes, { contentType: mimeType });
      if (uploaded.error) throw uploaded.error;
      entry.receiptKey = operation.idempotencyKey;
      persistOwned();
      const registered = await media.rpc('library_execute_operation', {
        p_action: operation.action,
        p_payload: { ...operation, actor: session!.userId },
      });
      if (registered.error) throw registered.error;
      const receipt = registerGeneratedAssetResponseSchema.parse(registered.data);
      entry.assetId = receipt.assetId;
      entry.versionId = receipt.versionId;
      persistOwned();
      const signed = await admin.storage.from('media-library').createSignedUrl(path, 7200);
      if (signed.error || !signed.data) throw signed.error ?? new Error('sign failed');
      entry.url = signed.data.signedUrl;
      return entry as Recorded;
    };
    const recording = await register(FIXTURE, 'video', 'video/mp4', 'recording.mp4', {
      width: 800,
      height: 450,
      durationMs: 431_932,
    });
    const photos: Array<Recorded & { file: string; srgb: string }> = [];
    for (const [index, image] of [
      { sec: 248, crop: '600:338:100:56' },
      { sec: 138, crop: '338:338:231:56' },
    ].entries()) {
      const file = join(OUT, `photo-${index}.png`);
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        String(image.sec),
        '-i',
        FIXTURE,
        '-vf',
        `crop=${image.crop}`,
        '-frames:v',
        '1',
        '-y',
        file,
      ]);
      const [w, h] = image.crop.split(':').map(Number) as [number, number];
      photos.push({
        ...(await register(file, 'image', 'image/png', `photo-${index}.png`, {
          width: w,
          height: h,
        })),
        file,
        srgb: '',
      });
    }
    const music = await register(MUSIC, 'audio', 'audio/wav', 'rock-120.wav', {
      durationMs: 24_000,
    });
    transcriptPath = `${BRAND}/video-editor/transcripts/${recording.versionId}.json`;
    persistOwned();
    const source = transcript.sources[0]!;
    const kept = await admin.storage.from('brand-profile-assets').upload(
      transcriptPath,
      JSON.stringify({
        ranges: [
          {
            startSec: 0,
            endSec: source.durationSec,
            words: source.words,
            language: source.language,
          },
        ],
      }),
      { contentType: 'application/json', upsert: true },
    );
    if (kept.error) throw kept.error;
    check(
      'real recording, two photos and the drum performance register exact Library versions',
      true,
      {
        recording: recording.versionId,
        photos: photos.map((p) => p.versionId),
        music: music.versionId,
      },
    );
    const versions = new Map<string, Recorded>(
      [recording, music, ...photos].map((item) => [item.versionId, item]),
    );

    // ── Browser: the native editor and a compositor page on the same origin ────────────
    context = await browser.newContext({
      storageState: session.state,
      viewport: { width: 1600, height: 1000 },
    });
    await context.grantPermissions(['local-network-access'], { origin: frontend.url });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const bundle = (entry: string, define?: Record<string, string | undefined>) => {
      const outfile = join(tmpdir(), `video-combos-${RUN}-${entry.replace(/\W+/g, '-')}.js`);
      execFileSync(
        'bun',
        [
          'build',
          entry,
          '--target=browser',
          '--outfile',
          outfile,
          ...(define ? ['--define', `process.env=${JSON.stringify(define)}`] : []),
        ],
        { stdio: 'pipe' },
      );
      return readFileSync(outfile, 'utf8');
    };
    const combosBundle = bundle('e2e/video-editor-combos/entry.ts');
    const durableBundle = bundle('e2e/support/editorV2DurableRenderBenchEntry.ts', {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: local.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_API_URL: backend.url,
    });
    const workerBundle = bundle('src/StudioCanvas/workers/splicer.worker.ts');
    writeFileSync(join(OUT, 'actual-splicer-worker.js'), workerBundle);
    const compositor = await context.newPage();
    compositor.on('pageerror', (error) => pageErrors.push(`compositor: ${error.message}`));
    await compositor.route('**/combos-compositor', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await compositor.route('**/combos-splicer-worker.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: workerBundle }),
    );
    await compositor.goto(`${frontend.url}/combos-compositor`);
    // Each composed frame builds a fresh render plan that downloads every source again (the
    // recording is 59.5 MB). The first read of each signed URL still goes to real storage; later
    // reads of that same URL reuse its bytes in this bench page only.
    await compositor.evaluate(() => {
      const original = window.fetch.bind(window);
      const cache = new Map<string, Promise<{ blob: Blob; type: string }>>();
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if ((init?.method ?? 'GET') !== 'GET' || !url.includes('/storage/v1/object/sign/'))
          return original(input, init);
        let hit = cache.get(url);
        if (!hit) {
          hit = original(input, init).then(async (response) => {
            if (!response.ok) throw new Error(`storage HTTP ${response.status}`);
            return {
              blob: await response.blob(),
              type: response.headers.get('content-type') ?? '',
            };
          });
          cache.set(url, hit);
          hit.catch(() => cache.delete(url));
        }
        return hit.then(
          ({ blob, type }) =>
            new Response(blob, { status: 200, headers: { 'content-type': type } }),
        );
      };
    });
    await compositor.addScriptTag({ content: combosBundle, type: 'module' });
    await compositor.addScriptTag({ content: durableBundle, type: 'module' });
    await compositor.waitForFunction(() =>
      Boolean(window.__combos && window.__editorV2DurableRenderBench),
    );
    const workerUrl = `${frontend.url}/combos-splicer-worker.js`;

    // Photos as the browser displays them (their PNGs carry a non-sRGB transfer profile).
    for (const [index, photo] of photos.entries()) {
      const png = await compositor.evaluate(async (url) => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        const bytes = new Uint8Array(
          await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
        );
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768)
          binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return btoa(binary);
      }, photo.url);
      photo.srgb = join(OUT, `photo-${index}-srgb.png`);
      writeFileSync(photo.srgb, Buffer.from(png, 'base64'));
    }

    const sourcesOf = (project: EditorProjectV2) =>
      Object.fromEntries(
        allClips(project).flatMap((clip) => {
          if (!('source' in clip) || clip.source.sourceType !== 'library_asset') return [];
          const version = versions.get(clip.source.renditionId ?? '');
          if (!version) throw new Error(`Unregistered source on ${clip.id}`);
          return [
            [clip.id, { assetId: version.assetId, versionId: version.versionId, url: version.url }],
          ];
        }),
      );
    const frame = async (
      project: EditorProjectV2,
      file: string,
      sec: number,
      sources: ReturnType<typeof sourcesOf> = sourcesOf(project),
    ) => {
      const out = await compositor.evaluate((input) => window.__combos.recordedExport(input), {
        project,
        sources,
        workerUrl,
        frameTimeSec: frameStart(sec),
      });
      writeFileSync(file, Buffer.from(out.base64, 'base64'));
      return file;
    };
    const workerExport = async (project: EditorProjectV2, file: string) => {
      const started = performance.now();
      const out = await compositor.evaluate((input) => window.__combos.recordedExport(input), {
        project,
        sources: sourcesOf(project),
        workerUrl,
      });
      writeFileSync(file, Buffer.from(out.base64, 'base64'));
      return performance.now() - started;
    };
    const previewPcm = async (project: EditorProjectV2) => {
      const inputs = allClips(project).flatMap((clip) => {
        if (!('source' in clip) || clip.source.sourceType !== 'library_asset') return [];
        const version = versions.get(clip.source.renditionId ?? '')!;
        return [
          {
            sourceId: clip.id,
            sourceAssetId: version.assetId,
            sourceRevision: version.versionId,
            storage: { bucket: 'media-library', path: version.path },
            url: version.url,
          },
        ];
      });
      const result = await compositor.evaluate(
        (request) => window.__editorV2DurableRenderBench.previewTimelineAudio(request, 0),
        { project, inputs },
      );
      return result.channelsBase64.map((b64) => {
        const bytes = Buffer.from(b64, 'base64');
        return new Float32Array(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        );
      });
    };
    const stationary = async (png: string, project: EditorProjectV2, file: string) => {
      const out = await compositor.evaluate((input) => window.__combos.stationaryControl(input), {
        pngBase64: readFileSync(png).toString('base64'),
        frameRate:
          project.exportSettings.frameRate.numerator / project.exportSettings.frameRate.denominator,
        videoBitrate: project.exportSettings.videoBitrateKbps * 1000,
        seconds: 1,
      });
      writeFileSync(file, Buffer.from(out.base64, 'base64'));
      return file;
    };
    const probe = (file: string) =>
      JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
          { encoding: 'utf8' },
        ),
      ) as {
        streams: Array<{
          codec_type: string;
          codec_name: string;
          width?: number;
          height?: number;
          r_frame_rate?: string;
          channels?: number;
        }>;
        format: { duration: string };
      };

    type Frames = Map<number, Record<string, string>>;
    /** A new project at a platform size, seeded by one apply_commands (its starter tracks removed). */
    const createSeeded = async (
      preset: PlatformExportPresetId,
      title: string,
      commands: unknown[],
      durationSec: number,
    ): Promise<string> => {
      const { width, height } = PLATFORM_EXPORT_PRESETS[preset];
      const created = await fetch(`${api.base}/api/ai-studio/video-projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: BRAND, title: `${title} ${RUN}`, width, height }),
      });
      if (!created.ok)
        throw new Error(`create ${title}: ${created.status} ${await created.text()}`);
      const initial = ((await created.json()) as { project: EditorProjectV2 }).project;
      projectIds.push(initial.projectId);
      persistOwned();
      const seeded = await postOp(api, initial.projectId, 'apply_commands', {
        expectedRevision: initial.revision,
        commands: [
          ...commands,
          ...initial.tracks.map((track) => ({ commandType: 'remove_track', trackId: track.id })),
          {
            commandType: 'set_project_metadata',
            durationSec,
            frameRate: { numerator: FPS, denominator: 1 },
          },
        ],
      });
      must(`${title}: seed persists`, seeded.status === 200, seeded.text.slice(0, 300));
      return initial.projectId;
    };
    /** One real editor op that must commit once; its round trip is an editor-op speed sample. */
    const op = async (id: string, label: string, name: string, body: Record<string, unknown>) => {
      const before = await getProject(api, id);
      const result = await postOp(api, id, name, body);
      speed.editor_op!.push(result.ms);
      must(`${label}: ${name} commits`, result.status === 200, result.text.slice(0, 300));
      const after = await getProject(api, id);
      check(
        `${label}: ${name} commits exactly one revision`,
        after.revision === before.revision + 1,
        {
          before: before.revision,
          after: after.revision,
        },
      );
      speedCheck(
        `${label}: ${name} saved within the 1000 ms editor-operation ceiling`,
        result.ms,
        1000,
      );
      return JSON.parse(result.text) as Record<string, unknown>;
    };
    /** One encoded film against its composed frames, type boxes and a stationary codec control. */
    const encodedAgainst = async (o: {
      label: string;
      file: string;
      project: EditorProjectV2;
      W: number;
      H: number;
      dir: string;
      times: number[];
      frames: Frames;
      typeBoxes?: Map<number, Record<string, Box | null>>;
      extra?: (t: number, decoded: Buffer) => void;
      audio: (file: string) => void;
    }) => {
      const meta = probe(o.file);
      const video = meta.streams.find((s) => s.codec_type === 'video');
      const audio = meta.streams.find((s) => s.codec_type === 'audio');
      check(
        `${o.label}: H.264 ${o.W}×${o.H} at 30 fps, stereo, exact duration`,
        video?.codec_name === 'h264' &&
          video.width === o.W &&
          video.height === o.H &&
          video.r_frame_rate === '30/1' &&
          audio?.channels === 2 &&
          Math.abs(Number(meta.format.duration) - o.project.durationSec) <= 1 / FPS,
        meta,
      );
      const errors: Array<{ t: number; error: number; control: number }> = [];
      for (const t of o.times) {
        const png = o.frames.get(t)!.full!;
        const composed = decodeRgb(png, o.W, o.H);
        const decoded = decodeRgb(o.file, o.W, o.H, t);
        const error = mae(decoded, composed);
        const controlFile = await stationary(
          png,
          o.project,
          join(o.dir, `${o.label.replace(/\W+/g, '-')}-control-${t.toFixed(3)}.mp4`),
        );
        const control = mae(decodeRgb(controlFile, o.W, o.H, 0.5), composed);
        rmSync(controlFile, { force: true });
        errors.push({ t, error, control });
        check(`${o.label} ${t.toFixed(2)}s matches the composed frame (≤6 mean RGB)`, error <= 6, {
          error,
          stationaryCodecControl: control,
        });
        for (const [key, box] of Object.entries(o.typeBoxes?.get(t) ?? {})) {
          if (!box) continue;
          // Searched near the composed glyphs: chroma subsampling makes saturated edges elsewhere
          // (captions, panels) differ by more than the glyph threshold.
          const encodedBox = boxNear(
            decoded,
            decodeRgb(o.frames.get(t)![key]!, o.W, o.H),
            composed,
            o.W,
            o.H,
            box,
          );
          check(
            `${o.label} ${t.toFixed(2)}s ${key.slice(2)} glyphs land within 3 px of the composed type`,
            boxDistance(encodedBox, box) <= 3,
            { encodedBox, box },
          );
        }
        o.extra?.(t, decoded);
      }
      o.audio(o.file);
      save(`${o.label.replace(/\W+/g, '-')}-encoded-errors.json`, errors);
      return errors;
    };
    /** Native Export dialog → Backend job → local Render → Library → download, for `id`. */
    const nativeExport = async (
      label: string,
      id: string,
      preset: PlatformExportPresetId,
      dir: string,
      expected: EditorProjectV2,
    ) => {
      if (!page.url().includes(id)) {
        await page.goto(`${frontend.url}${videoStudioEditorPath(id)}`, { timeout: 300_000 });
        await page.getByTestId('video-studio-edit').waitFor({ timeout: 300_000 });
        if (await page.locator('[data-testid="brief-dialog"]:visible').count())
          await page.keyboard.press('Escape');
      }
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const dialog = page.locator('[data-testid="video-studio-export-dialog"]');
      await dialog.locator(`[data-testid="export-preset-${preset}"]`).click();
      await dialog.getByRole('button', { name: 'Fill (crop)', exact: true }).click();
      const exported = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/video-projects/${id}/ops/export`) && r.request().method() === 'POST',
      );
      const began = performance.now();
      await dialog.locator('[data-testid="export-start"]').click();
      const exportResponse = await exported;
      const exportOut = (await exportResponse.json()) as { jobId: string };
      must(`${label}: native export operation starts`, exportResponse.ok(), exportOut);
      const terminal = await until(
        async () =>
          JSON.parse((await postOp(api, id, 'export_status', { jobId: exportOut.jobId })).text) as {
            state: string;
            error?: string;
            assetId?: string;
          },
        (s) => ['completed', 'failed'].includes(s.state),
        180_000,
      );
      if (terminal.assetId) outputAssetIds.push(terminal.assetId);
      persistOwned();
      must(
        `${label}: native export job completes on the local Render`,
        terminal.state === 'completed',
        terminal,
      );
      await dialog.locator('[data-testid="export-complete"]').waitFor();
      // Awaited together, so a failed click never leaves a wait to reject past cleanup.
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        dialog.getByRole('link', { name: 'Download MP4', exact: true }).click(),
      ]);
      const file = join(dir, 'native-export.mp4');
      await download.saveAs(file);
      const ms = performance.now() - began;
      speed.native_export!.push(ms);
      await page.screenshot({ path: join(dir, 'native-export-dialog.png') });
      await page.keyboard.press('Escape');
      const doc = await getProject(api, id);
      check(
        `${label}: the export dialog leaves the composition unchanged`,
        sameTracks(doc, expected),
        changedTracks(expected, doc),
      );
      const { data: asset } = await media
        .from('assets')
        .select('id,kind')
        .eq('brand_id', BRAND)
        .eq('id', terminal.assetId ?? '')
        .maybeSingle();
      const { data: version } = await media
        .from('asset_versions')
        .select('id,bucket,storage_path')
        .eq('asset_id', terminal.assetId ?? '')
        .maybeSingle();
      check(
        `${label}: the native export is registered Library media`,
        asset?.kind === 'video' && version !== null,
        { asset },
      );
      if (version?.bucket) {
        const stored = await admin.storage.from(version.bucket).download(version.storage_path);
        const bytes = stored.data ? Buffer.from(await stored.data.arrayBuffer()) : Buffer.alloc(0);
        check(
          `${label}: the downloaded file is the registered object byte for byte`,
          createHash('sha256').update(bytes).digest('hex') === sha256(file),
        );
      }
      speedCheck(
        `${label}: native export, job and download complete within 120000 ms`,
        ms,
        120_000,
      );
      return { file, ms, doc };
    };
    /** Browser export (actual worker) then native Export of one project; their sound must agree. */
    const exportBoth = async (o: {
      label: string;
      id: string;
      preset: PlatformExportPresetId;
      doc: EditorProjectV2;
      dir: string;
      times: number[];
      frames: Frames;
      typeBoxes?: Map<number, Record<string, Box | null>>;
      extra?: (t: number, decoded: Buffer) => void;
      audio: (kind: string) => (file: string) => void;
    }) => {
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS[o.preset];
      const browserFile = join(o.dir, 'browser-export.mp4');
      const ms = await workerExport(o.doc, browserFile);
      speed.browser_export!.push(ms);
      speedCheck(`${o.label}: browser export completes within 120000 ms`, ms, 120_000);
      const common = {
        project: o.doc,
        W,
        H,
        dir: o.dir,
        times: o.times,
        frames: o.frames,
        typeBoxes: o.typeBoxes,
        extra: o.extra,
      };
      const browserErrors = await encodedAgainst({
        ...common,
        label: `${o.label} browser export`,
        file: browserFile,
        audio: o.audio('browser export'),
      });
      const native = await nativeExport(o.label, o.id, o.preset, o.dir, o.doc);
      const nativeErrors = await encodedAgainst({
        ...common,
        project: native.doc,
        label: `${o.label} native export`,
        file: native.file,
        audio: o.audio('native export'),
      });
      for (const ch of [0, 1]) {
        const result = audioError(pcm(native.file, ch), pcm(browserFile, ch));
        check(
          `${o.label} channel ${ch}: native Export sounds like the browser export (≤0.01)`,
          result.lengthMatches && result.relativeError <= 0.01,
          result,
        );
      }
      return { browserFile, nativeFile: native.file, browserErrors, nativeErrors };
    };

    // ── The ordered combination, once per platform format ───────────────────────────────
    for (const preset of FORMATS) {
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS[preset];
      const dir = join(OUT, preset);
      mkdirSync(dir, { recursive: true });
      const tag = (s: string) => `${preset}: ${s}`;
      const created = await fetch(`${api.base}/api/ai-studio/video-projects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: BRAND,
          title: `Combination ${preset} ${RUN}`,
          width: W,
          height: H,
        }),
      });
      if (!created.ok)
        throw new Error(`create ${preset}: ${created.status} ${await created.text()}`);
      const initial = ((await created.json()) as { project: EditorProjectV2 }).project;
      projectIds.push(initial.projectId);
      persistOwned();
      const id = initial.projectId;
      const lib = (version: Recorded) => ({
        sourceType: 'library_asset',
        assetId: version.assetId,
        renditionId: version.versionId,
      });
      const seed = await postOp(api, id, 'apply_commands', {
        expectedRevision: initial.revision,
        commands: [
          {
            commandType: 'add_track',
            track: {
              id: 'main',
              name: 'Interview',
              kind: 'video',
              order: 0,
              clips: [
                {
                  id: 'interview',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: MAIN_IN,
                  durationSec: DURATION,
                  audioEnabled: true,
                  source: lib(recording),
                },
              ],
            },
          },
          {
            commandType: 'add_track',
            track: {
              id: 'shot-pool',
              name: 'Ocean',
              kind: 'video',
              order: 1,
              enabled: false,
              clips: [
                {
                  id: 'ocean',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: OCEAN_IN,
                  durationSec: DURATION,
                  audioEnabled: false,
                  source: lib(recording),
                },
              ],
            },
          },
          {
            commandType: 'add_track',
            track: {
              id: 'panel-pool',
              name: 'Panel',
              kind: 'video',
              order: 2,
              enabled: false,
              clips: [
                {
                  id: 'panel',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: POOL_IN,
                  durationSec: DURATION,
                  audioEnabled: false,
                  source: lib(recording),
                },
              ],
            },
          },
          ...photos.map((photo, index) => ({
            commandType: 'add_track',
            track: {
              id: `photo-pool-${index}`,
              name: `Photo ${index + 1}`,
              kind: 'overlay',
              order: 3 + index,
              enabled: false,
              clips: [
                {
                  id: `photo-${index}`,
                  kind: 'overlay',
                  mediaKind: 'image',
                  timelineStartSec: 0,
                  durationSec: DURATION,
                  source: lib(photo),
                },
              ],
            },
          })),
          {
            commandType: 'add_track',
            track: {
              id: 'music',
              name: 'Rock 120',
              kind: 'audio',
              order: 5,
              clips: [
                {
                  id: 'drums',
                  // Declared music: an untagged audio clip is sent to speech recognition first.
                  tags: ['music-bed'],

                  kind: 'audio',
                  timelineStartSec: 0,
                  sourceInSec: 0,
                  durationSec: DURATION,
                  volume: 0.6,
                  source: lib(music),
                },
              ],
            },
          },
          ...initial.tracks.map((track) => ({ commandType: 'remove_track', trackId: track.id })),
          {
            commandType: 'set_project_metadata',
            durationSec: DURATION,
            frameRate: { numerator: FPS, denominator: 1 },
          },
        ],
      });
      must(
        tag('seed persists real video, photos and the drum bed'),
        seed.status === 200,
        seed.text.slice(0, 300),
      );
      const seeded = await getProject(api, id);
      save(`${preset}/0-seed.json`, seeded);

      // Seed evidence: composed frames and a worker export, for undo and continuous sound.
      const samples = [0.35, 1.05, 1.75, 2.55, 3.55, 4.25, 5.25].map(frameAt);
      const inCollage = (t: number) => t >= COLLAGE_AT && t < COLLAGE_AT + 3;
      // Seed frames are what a full undo must reproduce byte for byte.
      const undoSamples = samples.filter((_, index) => index % 2 === 0);
      const seedFrames = new Map<number, string>();
      for (const t of undoSamples)
        seedFrames.set(t, await frame(seeded, join(dir, `seed-${t.toFixed(3)}.png`), t));
      const seedFilm = join(dir, 'seed-worker.mp4');
      await workerExport(seeded, seedFilm);
      const seedPcm = [pcm(seedFilm, 0), pcm(seedFilm, 1)];
      const seedPreview = await previewPcm(seeded);

      // Each layer: one real op, one revision, only its own tracks touched.
      type Layer = {
        name: string;
        op: string;
        body: () => Record<string, unknown>;
        tracks: (b: EditorProjectV2, a: EditorProjectV2) => boolean;
        verify?: (b: EditorProjectV2, a: EditorProjectV2, out: Record<string, unknown>) => void;
      };
      const docs: EditorProjectV2[] = [];
      const collageIds: string[] = [];
      let hookIds: string[] = [];
      let labelId = '';
      let cuts: number[] = [];
      const effectsOf = (project: EditorProjectV2, clipId: string) => {
        const clip = allClips(project).find((c) => c.id === clipId);
        return clip && 'effects' in clip ? clip.effects.map((e) => String(e.effectId)) : [];
      };
      const onlyChanged =
        (allowed: (id: string, a: EditorProjectV2) => boolean) =>
        (b: EditorProjectV2, a: EditorProjectV2) =>
          changedTracks(b, a).every((trackId) => allowed(trackId, a));
      const layers: Layer[] = [
        {
          name: 'format to the platform (cover)',
          op: 'set_format',
          body: () => ({ preset, fit: 'cover' }),
          tracks: () => true,
          verify: (_b, a) =>
            check(
              tag('format sets the canvas and export size'),
              a.canvas.width === W &&
                a.canvas.height === H &&
                a.exportSettings.width === W &&
                a.exportSettings.height === H,
              a.canvas,
            ),
        },
        {
          name: 'vintage on the interview',
          op: 'apply_effect',
          body: () => ({ clipId: 'interview', effect: 'vintage', strength: 0.6 }),
          tracks: onlyChanged((t) => t === 'main'),
        },
        {
          name: 'vintage on the ocean shot',
          op: 'apply_effect',
          body: () => ({ clipId: 'ocean', effect: 'vintage', strength: 0.6 }),
          tracks: onlyChanged((t) => t === 'shot-pool'),
        },
        {
          name: 'switch shots on the drum beat',
          op: 'beat_cut',
          body: () => ({
            mode: 'switch_shots',
            everyNBeats: 1,
            clipIds: ['interview', 'ocean'],
            audioClipId: 'drums',
          }),
          tracks: onlyChanged(
            (t, a) => t === 'main' || a.tracks.find((x) => x.id === t)?.name === 'Original audio',
          ),
          verify: (_b, a, out) => {
            cuts = (out.cuts as number[]) ?? [];
            const shots = mainTrack(a)?.clips ?? [];
            const aligned = onsetAlignment(cuts, onsets, 1 / FPS);
            save(`${preset}/beat-alignment.json`, {
              cuts,
              aligned,
              onsetsInWindow: onsets.filter((o) => o < DURATION),
            });
            check(
              tag('rapid cuts land on real drum attacks (≥95% within one frame of a MIDI onset)'),
              cuts.length >= 6 && aligned.fraction >= 0.95,
              { cuts: cuts.length, ...aligned },
            );
            check(
              tag('every shot keeps the look it was cut from and alternates sources'),
              shots.length >= 6 &&
                shots.every((s) => effectsOf(a, s.id).includes('vintage')) &&
                new Set(
                  shots.map((s) =>
                    (s.kind === 'video' ? Math.floor(s.sourceInSec) : -1) < 100
                      ? 'interview'
                      : 'ocean',
                  ),
                ).size === 2,
              shots.map((s) => [s.timelineStartSec, s.kind === 'video' ? s.sourceInSec : null]),
            );
            const original = a.tracks.find((t) => t.name === 'Original audio');
            check(
              tag('the interview sound moves whole to its own track (continuous)'),
              original?.clips.length === 1 &&
                original.clips[0]?.kind === 'audio' &&
                original.clips[0].timelineStartSec === 0 &&
                Math.abs(original.clips[0].durationSec - DURATION) < 1e-6 &&
                original.clips[0].sourceInSec === MAIN_IN,
              original?.clips,
            );
          },
        },
        {
          name: 'four-panel collage',
          op: 'collage',
          body: () => ({
            clipIds: ['panel', 'ocean', 'photo-0', 'photo-1'],
            layout: 'grid',
            atSec: COLLAGE_AT,
          }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.name === 'Collage'),
          verify: (_b, a, out) => {
            collageIds.push(...((out.clipIds as string[]) ?? []));
            const panels = collageIds.map((cid) => allClips(a).find((c) => c.id === cid));
            check(
              tag('collage places four panels for three seconds, ocean keeps its look'),
              panels.length === 4 &&
                panels.every(
                  (p) =>
                    p && p.timelineStartSec === COLLAGE_AT && Math.abs(p.durationSec - 3) < 1e-6,
                ) &&
                effectsOf(a, collageIds[1]!).includes('vintage'),
              panels.map((p) => p && [p.id, p.timelineStartSec, p.durationSec]),
            );
          },
        },
        {
          name: 'dust on the first photo panel',
          op: 'apply_effect',
          body: () => ({ clipId: collageIds[2], effect: 'dust', strength: 1 }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.name === 'Collage'),
        },
        {
          name: 'hook title',
          op: 'add_text',
          body: () => ({
            template: 'hook_title',
            text: 'Rock the launch',
            startSec: 0,
            durationSec: HOOK_SEC,
          }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.kind === 'text'),
          verify: (_b, _a, out) => {
            hookIds = (out.clipIds as string[]) ?? [String(out.clipId)];
          },
        },
        {
          name: 'word-highlight captions (pop)',
          op: 'set_captions',
          body: () => ({ style: 'pop', highlight: 'word', highlightColor: '#ff00ff' }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.kind === 'caption'),
          verify: (_b, a) => {
            const heard = source.words
              .filter((w) => w.startSec >= MAIN_IN && w.endSec <= MAIN_IN + DURATION)
              .map((w) => w.text);
            const written = a.tracks
              .filter((t) => t.kind === 'caption')
              .flatMap((t) => t.clips)
              .flatMap((c) => (c.kind === 'caption' ? c.words.map((w) => w.text) : []));
            check(
              tag('captions write exactly the heard words of the kept transcript'),
              written.length > 0 && JSON.stringify(written) === JSON.stringify(heard),
              { written, heard },
            );
          },
        },
        {
          name: 'slide the ocean panel in',
          op: 'animate_clip',
          body: () => ({ clipId: collageIds[1], preset: 'slide_in_right', durationSec: SLIDE_SEC }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.name === 'Collage'),
        },
        {
          name: 'panel label (top-third title)',
          op: 'add_text',
          body: () => ({ kind: 'title', text: 'OCEAN', startSec: COLLAGE_AT, durationSec: 3 }),
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.kind === 'text'),
          verify: (_b, _a, out) => {
            labelId = String(out.clipId);
          },
        },
        {
          name: 'parent the label to the moving panel',
          op: 'apply_commands',
          body: () => {
            const project = docs.at(-1)!;
            const track = project.tracks.find((t) => t.clips.some((c) => c.id === labelId))!;
            return {
              expectedRevision: project.revision,
              commands: [
                {
                  commandType: 'set_clip_parent',
                  trackId: track.id,
                  clipId: labelId,
                  parentClipId: collageIds[1],
                },
              ],
            };
          },
          tracks: onlyChanged((t, a) => a.tracks.find((x) => x.id === t)?.kind === 'text'),
          verify: (_b, a) =>
            check(
              tag('label is parented to the ocean panel'),
              allClips(a).find((c) => c.id === labelId)?.parentClipId === collageIds[1],
            ),
        },
      ];
      docs.push(seeded);
      for (const [index, layer] of layers.entries()) {
        const before = docs.at(-1)!;
        const result = await postOp(api, id, layer.op, layer.body());
        speed.editor_op!.push(result.ms);
        const after = await getProject(api, id);
        save(`${preset}/${index + 1}-${layer.op}.json`, {
          request: layer.body(),
          response: result.text.slice(0, 4000),
          ms: result.ms,
          before: before.revision,
          after,
        });
        must(
          tag(`${layer.name}: commits once`),
          result.status === 200 && after.revision === before.revision + 1,
          {
            status: result.status,
            text: result.text.slice(0, 300),
            before: before.revision,
            after: after.revision,
          },
        );
        check(
          tag(`${layer.name}: touches only its own tracks`),
          layer.tracks(before, after),
          changedTracks(before, after),
        );
        speedCheck(
          tag(`${layer.name}: saved within the 1000 ms editor-operation ceiling`),
          result.ms,
          1000,
        );
        layer.verify?.(before, after, JSON.parse(result.text) as Record<string, unknown>);
        docs.push(after);
      }

      // ── Native editor: the last layer through native controls, reload, Undo/Redo ────────
      await page.goto(`${frontend.url}${videoStudioEditorPath(id)}`, { timeout: 300_000 });
      await page.getByTestId('video-studio-edit').waitFor({ timeout: 300_000 });
      if (await page.locator('[data-testid="brief-dialog"]:visible').count())
        await page.keyboard.press('Escape');
      const leakPanel = collageIds[3]!;
      const leakAmount = (project: EditorProjectV2) => {
        const clip = allClips(project).find((c) => c.id === leakPanel);
        const effect =
          clip && 'effects' in clip
            ? clip.effects.find((e) => e.effectId === 'light_leaks')
            : undefined;
        return effect ? Number(effect.parameters.amount) : undefined;
      };
      const nativeLook = async (name: string, act: () => Promise<void>, strength: number) => {
        const before = docs.at(-1)!;
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${id}/ops/apply_effect`) &&
            r.request().method() === 'POST' &&
            (r.request().postDataJSON() as { strength?: number }).strength === strength,
        );
        const started = performance.now();
        await act();
        const answered = await response;
        const ms = performance.now() - started;
        speed.editor_op!.push(ms);
        const after = await until(
          () => getProject(api, id),
          (p) => p.revision > before.revision,
          20_000,
        );
        save(`${preset}/${docs.length}-native-${strength}.json`, {
          ms,
          before: before.revision,
          after,
        });
        must(
          tag(`${name}: commits once`),
          answered.ok() && after.revision === before.revision + 1,
          {
            status: answered.status(),
            revision: after.revision,
          },
        );
        check(
          tag(`${name}: touches only the collage panel`),
          changedTracks(before, after).every(
            (t) => after.tracks.find((x) => x.id === t)?.name === 'Collage',
          ),
          changedTracks(before, after),
        );
        speedCheck(tag(`${name}: native control to persisted response within 1000 ms`), ms, 1000);
        docs.push(after);
        layers.push({
          name,
          op: 'native apply_effect',
          body: () => ({ strength }),
          tracks: () => true,
        });
        return after;
      };
      await page.keyboard.press('Escape');
      await page.locator(`[data-clip-id="${leakPanel}"]:visible`).click();
      const chipped = await nativeLook(
        'light leaks on the second photo panel (native Look chip)',
        () => page.locator('[data-look="light_leaks"]').filter({ visible: true }).click(),
        0.6,
      );
      const slider = page
        .getByRole('group', { name: 'Light leaks strength' })
        .getByRole('slider')
        .filter({ visible: true });
      const full = await nativeLook(
        'light leaks to full strength (native slider)',
        async () => {
          await slider.focus();
          await page.keyboard.press('End');
        },
        1,
      );
      check(
        tag('the native slider sets light leaks to full strength'),
        leakAmount(chipped) !== undefined &&
          Math.abs((leakAmount(full) ?? 0) / leakAmount(chipped)! - 1 / 0.6) < 1e-6,
        { chip: leakAmount(chipped), slider: leakAmount(full) },
      );
      const final = docs.at(-1)!;
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      const undone = await until(
        () => getProject(api, id),
        (p) => sameTracks(p, chipped),
        20_000,
      );
      check(
        tag('native Undo steps the leak back to the chip strength only'),
        sameTracks(undone, chipped),
      );
      await page.getByRole('button', { name: 'Redo', exact: true }).click();
      const redone = await until(
        () => getProject(api, id),
        (p) => sameTracks(p, final),
        20_000,
      );
      check(tag('native Redo restores full strength'), sameTracks(redone, final));
      // In-page history is per session; after a reload the server revisions carry undo.
      await page.reload();
      await page.getByTestId('video-studio-edit').waitFor({ timeout: 300_000 });
      const reloaded = await getProject(api, id);
      check(
        tag('reload keeps the complete stacked document'),
        reloaded.revision === redone.revision && sameTracks(reloaded, final),
      );
      await page.screenshot({ path: join(dir, 'native-workspace.png') });

      // ── Composed frames and ablations (the oracle for preview and both exports) ────────
      const finalDoc = editorProjectV2Schema.parse(redone);
      const text = new Set(
        finalDoc.tracks.filter((t) => t.kind === 'text').flatMap((t) => t.clips.map((c) => c.id)),
      );
      const caption = new Set(
        finalDoc.tracks
          .filter((t) => t.kind === 'caption')
          .flatMap((t) => t.clips.map((c) => c.id)),
      );
      const ablations: Record<string, EditorProjectV2> = {
        noHook: without(finalDoc, (c) => hookIds.includes(c.id)),
        noCaptions: without(finalDoc, (c) => caption.has(c.id)),
        noLabel: without(finalDoc, (c) => c.id === labelId),
        noLeak: withoutEffects(
          finalDoc,
          (cid, effect) => cid === collageIds[3] && effect === 'light_leaks',
        ),
        noDust: withoutEffects(
          finalDoc,
          (cid, effect) => cid === collageIds[2] && effect === 'dust',
        ),
        bare: withoutEffects(without(finalDoc, (c) => text.has(c.id) || caption.has(c.id))),
        mainLook: without(
          finalDoc,
          (c) => text.has(c.id) || caption.has(c.id) || collageIds.includes(c.id),
        ),
        mainOnly: withoutEffects(
          without(
            finalDoc,
            (c) => text.has(c.id) || caption.has(c.id) || collageIds.includes(c.id),
          ),
        ),
      };
      const wordsAt = (t: number) =>
        finalDoc.tracks
          .filter((tr) => tr.kind === 'caption')
          .flatMap((tr) => tr.clips)
          .some(
            (c) =>
              c.kind === 'caption' &&
              c.words.some(
                (w) => t >= c.timelineStartSec + w.startSec && t < c.timelineStartSec + w.endSec,
              ),
          );
      // Only the ablations a sample's checks read are composed (each 1080p frame costs seconds).
      const needs = (t: number): string[] => [
        ...(t < HOOK_SEC ? ['noHook'] : []),
        ...(wordsAt(t) ? ['noCaptions'] : []),
        ...(inCollage(t) ? ['noLabel'] : []),
        ...(inCollage(t) && t >= COLLAGE_AT + SLIDE_SEC ? ['noLeak', 'noDust', 'bare'] : []),
        ...(inCollage(t) ? [] : ['mainLook', 'mainOnly']),
      ];
      const frames: Frames = new Map();
      for (const t of samples) {
        const set: Record<string, string> = {
          full: await frame(finalDoc, join(dir, `full-${t.toFixed(3)}.png`), t),
        };
        for (const key of needs(t))
          set[key] = await frame(ablations[key]!, join(dir, `${key}-${t.toFixed(3)}.png`), t);
        frames.set(t, set);
      }
      const rgb = (file: string) => decodeRgb(file, W, H);
      const typeBoxes = new Map<number, Record<string, Box | null>>();
      for (const t of samples) {
        const f = frames.get(t)!;
        const full = rgb(f.full!);
        const boxes: Record<string, Box | null> = {};
        // Readable type: what each text layer changed, against what it covers.
        const hookShown = t < HOOK_SEC;
        const settledLabel = inCollage(t) && t >= COLLAGE_AT + SLIDE_SEC + 0.5;
        for (const [key, shown] of [
          ['noHook', hookShown],
          ['noCaptions', caption.size > 0 && wordsAt(t)],
          ['noLabel', settledLabel],
        ] as const) {
          if (!shown) continue;
          const result = readability(full, rgb(f[key]!), W, H);
          boxes[key] = result.box;
          check(
            tag(
              `${t.toFixed(2)}s ${key.slice(2)} type is present, inside the safe area and contrasted ≥3:1`,
            ),
            result.areaFrac >= 0.001 && result.inside && result.contrast >= 3,
            result,
          );
        }
        const keys = Object.keys(boxes);
        for (let i = 0; i < keys.length; i += 1)
          for (let j = i + 1; j < keys.length; j += 1)
            check(
              tag(`${t.toFixed(2)}s ${keys[i]!.slice(2)} and ${keys[j]!.slice(2)} do not overlap`),
              boxesDisjoint(boxes[keys[i]!]!, boxes[keys[j]!]!),
              [boxes[keys[i]!], boxes[keys[j]!]],
            );
        typeBoxes.set(t, boxes);
        if (wordsAt(t))
          check(
            tag(`${t.toFixed(2)}s the spoken word is highlighted`),
            magentaCount(full) > 60,
            magentaCount(full),
          );
        if (inCollage(t) && t >= COLLAGE_AT + SLIDE_SEC) {
          // Panels after the stack: independent centre-fill references at their source clocks.
          const bare = rgb(f.bare!);
          const local = t - COLLAGE_AT;
          const refs = [
            decodeCover(FIXTURE, Math.floor(W / 2), Math.floor(H / 2), POOL_IN + local),
            decodeCover(FIXTURE, Math.floor(W / 2), Math.floor(H / 2), OCEAN_IN + local),
            decodeCover(photos[0]!.srgb, Math.floor(W / 2), Math.floor(H / 2), 0),
            decodeCover(photos[1]!.srgb, Math.floor(W / 2), Math.floor(H / 2), 0),
          ];
          for (const [index, ref] of refs.entries()) {
            const cell = gridCell(index, W, H);
            const crop = Buffer.alloc(cell.w * cell.h * 3);
            for (let y = 0; y < cell.h; y += 1)
              bare.copy(
                crop,
                y * cell.w * 3,
                ((cell.y + y) * W + cell.x) * 3,
                ((cell.y + y) * W + cell.x + cell.w) * 3,
              );
            const error = mae(crop, ref);
            check(
              tag(`${t.toFixed(2)}s panel ${index} matches its independent source reference`),
              error < 8 && energyIn(crop, cell.w, { x: 0, y: 0, w: cell.w, h: cell.h }) > 10,
              { error },
            );
          }
          // Light leaks visible in this orientation and confined to their panel.
          const leakCell = gridCell(3, W, H);
          const noLeak = rgb(f.noLeak!);
          const leakDelta = maeIn(full, noLeak, W, leakCell);
          const leakMask = changeMask(full, noLeak, W, H, 0);
          check(
            tag(`${t.toFixed(2)}s light leaks change the panel by ≥5 mean RGB`),
            leakDelta >= 5,
            { leakDelta },
          );
          check(
            tag(`${t.toFixed(2)}s light leaks stay inside their panel`),
            leakMask.box !== null &&
              leakMask.box.left >= leakCell.x &&
              leakMask.box.top >= leakCell.y,
            leakMask.box,
          );
          const dustCell = gridCell(2, W, H);
          const dust = changedFraction(full, rgb(f.noDust!), W, dustCell);
          check(
            tag(`${t.toFixed(2)}s dust marks its panel sparsely`),
            dust > 0.0001 && dust < 0.08,
            { dust },
          );
          notes.push(
            `${preset} ${t.toFixed(3)}s leak ${leakDelta.toFixed(3)} dust ${dust.toFixed(5)}`,
          );
        }
        if (!inCollage(t)) {
          // Source clock after the beat cut: the shot on screen is the source frame it claims.
          const at0 = frameStart(t);
          const shot = mainTrack(finalDoc)!.clips.find(
            (c) => at0 >= c.timelineStartSec && at0 < c.timelineStartSec + c.durationSec,
          );
          if (shot?.kind === 'video') {
            const at = shot.sourceInSec + (at0 - shot.timelineStartSec) * shot.playbackRate;
            const error = mae(rgb(f.mainOnly!), decodeCover(FIXTURE, W, H, at));
            const wrong = mae(
              rgb(f.mainOnly!),
              decodeCover(FIXTURE, W, H, at < 100 ? OCEAN_IN + 1 : MAIN_IN + 1),
            );
            check(
              tag(
                `${t.toFixed(2)}s main shot shows source ${at.toFixed(3)}s (independent FFmpeg frame)`,
              ),
              error < 8 && wrong > error + 4,
              { error, wrong },
            );
          }
          const look = mae(rgb(f.mainLook!), rgb(f.mainOnly!));
          check(tag(`${t.toFixed(2)}s vintage visibly changes the shot`), look > 1, { look });
        }
      }
      // Parent motion: the label travels with its panel's slide.
      {
        const mid = frameAt(1.75);
        const settled = frameAt(3.55);
        const midBox = readability(
          rgb(frames.get(mid)!.full!),
          rgb(frames.get(mid)!.noLabel!),
          W,
          H,
        ).box;
        const settledBox = readability(
          rgb(frames.get(settled)!.full!),
          rgb(frames.get(settled)!.noLabel!),
          W,
          H,
        ).box;
        const expected =
          (parentPositionDelta(finalDoc, labelId, frameStart(mid)).x -
            parentPositionDelta(finalDoc, labelId, frameStart(settled)).x) *
          W;
        const measured = center(midBox) - center(settledBox);
        check(
          tag('the parented label moves with its sliding panel (within 3 px)'),
          Math.abs(expected) > 20 && Math.abs(measured - expected) <= 3,
          { expected, measured, midBox, settledBox },
        );
      }

      // ── Native preview against the composed frames ───────────────────────────────────
      const clip0 = page.locator(`[data-clip-id="${mainTrack(finalDoc)!.clips[0]!.id}"]:visible`);
      const clipBox = await clip0.boundingBox();
      const pxPerSec = (clipBox?.width ?? 0) / mainTrack(finalDoc)!.clips[0]!.durationSec;
      // Snapping would pull the playhead onto the nearest beat or clip edge.
      const snap = page.getByRole('button', { name: 'Toggle snapping', exact: true });
      if ((await snap.getAttribute('aria-pressed')) === 'true') await snap.click();
      for (const t of samples) {
        await page.keyboard.press('Escape');
        await seek(page, pxPerSec, t);
        // Every stage video decoded and settled, then two paints, before the capture.
        await expect
          .poll(
            () =>
              page
                .getByTestId('edit-stage')
                .locator('video')
                .evaluateAll((videos) =>
                  videos.every(
                    (v) =>
                      (v as HTMLVideoElement).readyState >= 2 && !(v as HTMLVideoElement).seeking,
                  ),
                ),
            // A wait, not a gate: a contended machine decodes slowly; the comparison below grades.
            { timeout: 180_000 },
          )
          .toBe(true);
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        );
        const native = join(dir, `native-${t.toFixed(3)}.png`);
        const shot = await page
          .getByTestId('edit-stage')
          .locator('video')
          .first()
          .locator('..')
          .screenshot();
        writeFileSync(native, shot);
        // The preview is a scaled view: compare at its own size, not upscaled to the canvas.
        const { width: nw, height: nh } = pngSize(shot);
        const error = mae(decodeRgb(native, nw, nh), decodeRgb(frames.get(t)!.full!, nw, nh));
        check(tag(`${t.toFixed(2)}s native preview matches the composed frame (<12)`), error < 12, {
          error,
          previewSize: [nw, nh],
        });
      }

      // ── Browser export (actual worker) and native Export, both against the composed frames ─
      const leakSurvives = (label: string) => (t: number, decoded: Buffer) => {
        if (inCollage(t) && t >= COLLAGE_AT + SLIDE_SEC)
          check(
            tag(`${label} ${t.toFixed(2)}s light leaks survive encoding (≥5)`),
            maeIn(decoded, rgb(frames.get(t)!.noLeak!), W, gridCell(3, W, H)) >= 5,
          );
      };
      const continuous = (kind: string) => (file: string) => {
        for (const ch of [0, 1]) {
          const result = audioError(pcm(file, ch), seedPcm[ch]!);
          check(
            tag(`${kind} channel ${ch}: speech and drums continuous through every layer (≤0.01)`),
            result.lengthMatches && result.energy > 1e-6 && result.relativeError <= 0.01,
            result,
          );
        }
      };
      const exported = await exportBoth({
        label: preset,
        id,
        preset,
        doc: finalDoc,
        dir,
        times: samples,
        frames,
        typeBoxes,
        extra: leakSurvives('export'),
        audio: continuous,
      });
      const finalPreview = await previewPcm(finalDoc);
      for (const ch of [0, 1]) {
        const result = audioError(finalPreview[ch]!, seedPreview[ch]!);
        check(
          tag(`native Web Audio preview channel ${ch} unchanged by the stack (≤0.02)`),
          result.lengthMatches && result.relativeError <= 0.02,
          result,
        );
      }

      // ── Undo the whole stack, layer by layer, back to the seed ───────────────────────
      for (let k = docs.length - 2; k >= 0; k -= 1) {
        const target = docs[k]!;
        const undo = await postOp(api, id, 'undo', { toRevision: target.revision });
        const back = await getProject(api, id);
        check(
          tag(`undo to before "${layers[k]!.name}" restores that document exactly`),
          undo.status === 200 &&
            sameTracks(back, target) &&
            back.canvas.width === target.canvas.width &&
            JSON.stringify(back.markers) === JSON.stringify(target.markers),
          { status: undo.status, changed: changedTracks(target, back) },
        );
      }
      const restored = await getProject(api, id);
      for (const t of undoSamples) {
        const again = await frame(restored, join(dir, `undone-${t.toFixed(3)}.png`), t);
        check(
          tag(`${t.toFixed(2)}s full undo renders the seed frame byte for byte`),
          readFileSync(again).equals(readFileSync(seedFrames.get(t)!)),
        );
      }
      save(`${preset}/encoded-errors.json`, {
        browser: exported.browserErrors,
        native: exported.nativeErrors,
      });
    }

    // ── Export shapes beside the stack ──────────────────────────────────────────────────
    const lib = (version: Recorded) => ({
      sourceType: 'library_asset',
      assetId: version.assetId,
      renditionId: version.versionId,
    });
    const framesFor = async (
      doc: EditorProjectV2,
      dir: string,
      times: number[],
      ablations: Record<string, EditorProjectV2> = {},
    ): Promise<Frames> => {
      mkdirSync(dir, { recursive: true });
      const out: Frames = new Map();
      for (const t of times) {
        const set: Record<string, string> = {
          full: await frame(doc, join(dir, `full-${t.toFixed(3)}.png`), t),
        };
        for (const [key, ablated] of Object.entries(ablations))
          set[key] = await frame(ablated, join(dir, `${key}-${t.toFixed(3)}.png`), t);
        out.set(t, set);
      }
      return out;
    };
    const silent = (label: string) => (file: string) => {
      for (const ch of [0, 1]) {
        const samples = pcm(file, ch);
        const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        check(`${label} channel ${ch}: silent as authored`, samples.length > 0 && peak <= 1e-4, {
          peak,
        });
      }
    };
    const sameSound = (label: string, reference: Float32Array[]) => (file: string) => {
      for (const ch of [0, 1]) {
        const result = audioError(pcm(file, ch), reference[ch]!);
        check(
          `${label} channel ${ch}: sound matches its reference (≤0.01)`,
          result.lengthMatches && result.energy > 1e-6 && result.relativeError <= 0.01,
          result,
        );
      }
    };

    // Shape 1 — a primary video that ends before longer secondary lanes (picture-in-picture
    // still and the drum bed run two seconds past it).
    if (PARTS.has('lanes')) {
      const label = 'shape lanes';
      const dir = join(OUT, 'shape-lanes');
      mkdirSync(dir, { recursive: true });
      const id = await createSeeded(
        'square',
        'Shape lanes',
        [
          {
            commandType: 'add_track',
            track: {
              id: 'main',
              name: 'Interview',
              kind: 'video',
              order: 0,
              clips: [
                {
                  id: 'interview',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: MAIN_IN,
                  durationSec: 4,
                  audioEnabled: true,
                  source: lib(recording),
                },
              ],
            },
          },
          {
            commandType: 'add_track',
            track: {
              id: 'pip',
              name: 'Picture in picture',
              kind: 'overlay',
              order: 1,
              clips: [
                {
                  id: 'pip-photo',
                  kind: 'overlay',
                  mediaKind: 'image',
                  timelineStartSec: 0,
                  durationSec: 6,
                  source: lib(photos[1]!),
                  transform: {
                    position: { x: 0.75, y: 0.25, unit: 'normalized' },
                    scaleX: 0.35,
                    scaleY: 0.35,
                  },
                },
              ],
            },
          },
          {
            commandType: 'add_track',
            track: {
              id: 'music',
              name: 'Rock 120',
              kind: 'audio',
              order: 2,
              clips: [
                {
                  id: 'drums',
                  kind: 'audio',
                  tags: ['music-bed'],
                  timelineStartSec: 0,
                  sourceInSec: 0,
                  durationSec: 6,
                  volume: 0.6,
                  source: lib(music),
                },
              ],
            },
          },
        ],
        6,
      );
      await op(id, label, 'set_format', { preset: 'square', fit: 'cover' });
      const doc = await getProject(api, id);
      const times = [1.0, 3.5, 4.5, 5.5].map(frameAt);
      const frames = await framesFor(doc, dir, times, {
        noPip: without(doc, (c) => c.id === 'pip-photo'),
      });
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS.square;
      const tail = (rgbFrame: Buffer, pip: ReturnType<typeof changeMask>) => {
        let sum = 0;
        let n = 0;
        for (let p = 0; p < W * H; p += 1)
          if (!pip.mask[p]) {
            sum += rgbFrame[p * 3]! + rgbFrame[p * 3 + 1]! + rgbFrame[p * 3 + 2]!;
            n += 3;
          }
        return sum / Math.max(1, n);
      };
      const pipAt = new Map<number, ReturnType<typeof changeMask>>();
      for (const t of times.filter((x) => x > 4)) {
        const pip = changeMask(
          decodeRgb(frames.get(t)!.full!, W, H),
          decodeRgb(frames.get(t)!.noPip!, W, H),
          W,
          H,
          0,
        );
        pipAt.set(t, pip);
        check(
          `${label} ${t.toFixed(2)}s after the primary ends only the longer lane shows, on the background`,
          pip.count / (W * H) >= 0.01 && tail(decodeRgb(frames.get(t)!.full!, W, H), pip) <= 2,
          {
            pipFrac: pip.count / (W * H),
            outside: tail(decodeRgb(frames.get(t)!.full!, W, H), pip),
          },
        );
      }
      const musicRef = pcm(MUSIC, 0).map((v) => v * 0.6);
      const lanesSound = (kind: string) => (file: string) => {
        const from = Math.round(4.1 * 48_000);
        const to = Math.round(5.9 * 48_000);
        for (const ch of [0, 1]) {
          const exported = pcm(file, ch);
          const result = audioError(exported.subarray(from, to), musicRef.subarray(from, to));
          check(
            `${label} ${kind} channel ${ch}: the bed plays on alone after the primary ends (≤0.01 vs the WAV at 0.6)`,
            result.energy > 1e-6 && result.relativeError <= 0.01,
            result,
          );
          const speechFrom = Math.round(0.5 * 48_000);
          const speechTo = Math.round(3.5 * 48_000);
          const residual = audioError(
            exported.subarray(speechFrom, speechTo),
            musicRef.subarray(speechFrom, speechTo),
          );
          check(
            `${label} ${kind} channel ${ch}: the interview is heard over the bed while the primary plays`,
            residual.relativeError > 0.05,
            residual,
          );
        }
        for (const t of times.filter((x) => x > 4)) {
          const decoded = decodeRgb(file, W, H, t);
          check(
            `${label} ${kind} ${t.toFixed(2)}s encoded background stays black outside the inset`,
            tail(decoded, pipAt.get(t)!) <= 3,
            { outside: tail(decoded, pipAt.get(t)!) },
          );
        }
      };
      await exportBoth({ label, id, preset: 'square', doc, dir, times, frames, audio: lanesSound });
    }

    // Shape 2 — a nested (precomposed) inset with its title, then transformed as one piece.
    if (PARTS.has('nested')) {
      const label = 'shape nested';
      const dir = join(OUT, 'shape-nested');
      mkdirSync(dir, { recursive: true });
      const id = await createSeeded(
        'youtube',
        'Shape nested',
        [
          {
            commandType: 'add_track',
            track: {
              id: 'main',
              name: 'Ocean',
              kind: 'video',
              order: 0,
              clips: [
                {
                  id: 'ocean',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: OCEAN_IN,
                  durationSec: 4,
                  audioEnabled: true,
                  source: lib(recording),
                },
              ],
            },
          },
          {
            commandType: 'add_track',
            track: {
              id: 'inset-track',
              name: 'Inset',
              kind: 'overlay',
              order: 1,
              clips: [
                {
                  id: 'inset',
                  kind: 'overlay',
                  mediaKind: 'video',
                  sourceInSec: MAIN_IN,
                  timelineStartSec: 0,
                  durationSec: 4,
                  source: lib(recording),
                  transform: {
                    position: { x: 0.5, y: 0.5, unit: 'normalized' },
                    scaleX: 0.5,
                    scaleY: 0.5,
                  },
                },
              ],
            },
          },
        ],
        4,
      );
      await op(id, label, 'set_format', { preset: 'youtube', fit: 'cover' });
      const titled = await op(id, label, 'add_text', {
        kind: 'title',
        text: 'Nested cut',
        startSec: 0,
        durationSec: 4,
      });
      const flat = await getProject(api, id);
      const times = [1.0, 3.0].map(frameAt);
      const flatFrames = await framesFor(flat, join(dir, 'flat'), times);
      const flatFilm = join(dir, 'flat-browser-export.mp4');
      mkdirSync(join(dir, 'flat'), { recursive: true });
      await workerExport(flat, flatFilm);
      const flatPcm = [pcm(flatFilm, 0), pcm(flatFilm, 1)];
      const nested = await postOp(api, id, 'apply_commands', {
        expectedRevision: flat.revision,
        commands: [
          {
            commandType: 'precompose_clips',
            clipIds: ['inset', String(titled.clipId)],
            nestedSequenceId: 'nest',
            instanceClipId: 'nest-1',
            instanceTrackId: 'nests',
            name: 'Inset comp',
          },
        ],
      });
      speed.editor_op!.push(nested.ms);
      must(
        `${label}: precompose the inset and its title`,
        nested.status === 200,
        nested.text.slice(0, 300),
      );
      const precomposed = await getProject(api, id);
      check(
        `${label}: one nested sequence holds the inset and the title`,
        precomposed.nestedSequences.length === 1 &&
          allClips(precomposed).some((c) => c.id === 'nest-1') &&
          !precomposed.tracks.some((t) => t.clips.some((c) => c.id === 'inset')),
      );
      const nestedFrames = await framesFor(precomposed, join(dir, 'precomposed'), times);
      for (const t of times)
        check(
          `${label} ${t.toFixed(2)}s precomposing changes nothing on screen (≤1 mean RGB)`,
          mae(
            decodeRgb(nestedFrames.get(t)!.full!, 1920, 1080),
            decodeRgb(flatFrames.get(t)!.full!, 1920, 1080),
          ) <= 1,
          mae(
            decodeRgb(nestedFrames.get(t)!.full!, 1920, 1080),
            decodeRgb(flatFrames.get(t)!.full!, 1920, 1080),
          ),
        );
      const instance = allClips(precomposed).find((c) => c.id === 'nest-1')!;
      const moved = await postOp(api, id, 'apply_commands', {
        expectedRevision: precomposed.revision,
        commands: [
          {
            commandType: 'upsert_clip',
            trackId: 'nests',
            clip: {
              ...instance,
              transform: {
                ...('transform' in instance ? instance.transform : {}),
                scaleX: 0.7,
                scaleY: 0.7,
                rotationDeg: 6,
              },
            },
          },
        ],
      });
      speed.editor_op!.push(moved.ms);
      must(
        `${label}: scale and rotate the nested piece`,
        moved.status === 200,
        moved.text.slice(0, 300),
      );
      const doc = await getProject(api, id);
      const frames = await framesFor(doc, dir, times, {
        noNest: without(doc, (c) => c.id === 'nest-1'),
      });
      for (const t of times)
        check(
          `${label} ${t.toFixed(2)}s the transformed nest is visible and moved`,
          mae(
            decodeRgb(frames.get(t)!.full!, 1920, 1080),
            decodeRgb(flatFrames.get(t)!.full!, 1920, 1080),
          ) > 3,
        );
      await exportBoth({
        label,
        id,
        preset: 'youtube',
        doc,
        dir,
        times,
        frames,
        audio: (kind) => sameSound(`${label} ${kind}`, flatPcm),
      });
    }

    // Shape 3 — text only: no media at all, two text templates on the background.
    if (PARTS.has('text-only')) {
      const label = 'shape text-only';
      const dir = join(OUT, 'shape-text');
      mkdirSync(dir, { recursive: true });
      const id = await createSeeded('square', 'Shape text only', [], 4);
      const cta = await op(id, label, 'add_text', {
        template: 'cta_end_card',
        text: 'Book a demo',
        secondaryText: 'trycontinuum.ai',
        startSec: 0,
        durationSec: 4,
      });
      const kinetic = await op(id, label, 'add_text', {
        template: 'kinetic_words',
        text: 'Fast cuts win',
        startSec: 0.2,
        durationSec: 2.5,
      });
      const doc = await getProject(api, id);
      const ctaIds = (cta.clipIds as string[]) ?? [String(cta.clipId)];
      const times = [1.5, 3.2].map(frameAt);
      const frames = await framesFor(doc, dir, times, {
        noCta: without(doc, (c) => ctaIds.includes(c.id)),
        noKinetic: without(doc, (c) => c.id === String(kinetic.clipId)),
      });
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS.square;
      const typeBoxes = new Map<number, Record<string, Box | null>>();
      for (const t of times) {
        const full = decodeRgb(frames.get(t)!.full!, W, H);
        const boxes: Record<string, Box | null> = {};
        for (const key of ['noCta', ...(t < 2.7 ? ['noKinetic'] : [])]) {
          const result = readability(full, decodeRgb(frames.get(t)![key]!, W, H), W, H);
          boxes[key] = result.box;
          check(
            `${label} ${t.toFixed(2)}s ${key.slice(2)} type is present, inside the safe area and contrasted ≥3:1`,
            result.areaFrac >= 0.001 && result.inside && result.contrast >= 3,
            result,
          );
        }
        if (boxes.noKinetic !== undefined)
          check(
            `${label} ${t.toFixed(2)}s the two text layers do not overlap`,
            boxesDisjoint(boxes.noCta!, boxes.noKinetic),
            boxes,
          );
        typeBoxes.set(t, boxes);
      }
      const browserFile = join(dir, 'browser-export.mp4');
      const ms = await workerExport(doc, browserFile);
      speed.browser_export!.push(ms);
      await encodedAgainst({
        label: `${label} browser export`,
        file: browserFile,
        project: doc,
        W,
        H,
        dir,
        times,
        frames,
        typeBoxes,
        audio: silent(`${label} browser export`),
      });
      // Native Export: text is picture to the shared render gate, so the edit renders on its
      // background. Silent, so it is graded on picture and silence, not against the browser's sound.
      await page.goto(`${frontend.url}${videoStudioEditorPath(id)}`, { timeout: 300_000 });
      await page.getByTestId('video-studio-edit').waitFor({ timeout: 300_000 });
      if (await page.locator('[data-testid="brief-dialog"]:visible').count())
        await page.keyboard.press('Escape');
      const available = await page.getByRole('button', { name: 'Export', exact: true }).isEnabled();
      check(`${label}: native Export of a text-only edit is available`, available, {
        gate: 'editorRenderBlockers, packages/contracts/src/ai-studio/video-editor.ts',
      });
      if (available) {
        // Graded where it fails; a refusal here must not cost the family and retained parts.
        try {
          const native = await nativeExport(label, id, 'square', dir, doc);
          await encodedAgainst({
            label: `${label} native export`,
            file: native.file,
            project: native.doc,
            W,
            H,
            dir,
            times,
            frames,
            typeBoxes,
            audio: silent(`${label} native export`),
          });
        } catch (error) {
          notes.push(`${label}: native export stopped: ${describeError(error)}`);
          await page.keyboard.press('Escape');
        }
      }
    }

    // Shape 4 — near-black (dip to black between two shots) and off-screen motion (a title
    // sliding out past the left edge).
    if (PARTS.has('dark')) {
      const label = 'shape dark+offscreen';
      const dir = join(OUT, 'shape-dark');
      mkdirSync(dir, { recursive: true });
      const id = await createSeeded(
        'youtube',
        'Shape dark',
        [
          {
            commandType: 'add_track',
            track: {
              id: 'main',
              name: 'Two shots',
              kind: 'video',
              order: 0,
              clips: [
                {
                  id: 'first',
                  kind: 'video',
                  timelineStartSec: 0,
                  sourceInSec: MAIN_IN,
                  durationSec: 2,
                  audioEnabled: true,
                  source: lib(recording),
                },
                {
                  id: 'second',
                  kind: 'video',
                  timelineStartSec: 2,
                  sourceInSec: OCEAN_IN,
                  durationSec: 2,
                  audioEnabled: true,
                  source: lib(recording),
                },
              ],
            },
          },
        ],
        4,
      );
      await op(id, label, 'set_format', { preset: 'youtube', fit: 'cover' });
      await op(id, label, 'add_transition', {
        fromClipId: 'first',
        toClipId: 'second',
        type: 'dip_to_black',
        durationSec: 1,
      });
      const title = await op(id, label, 'add_text', {
        kind: 'title',
        text: 'Slide away',
        startSec: 0,
        durationSec: 3,
      });
      await op(id, label, 'animate_clip', {
        clipId: String(title.clipId),
        preset: 'slide_out_left',
        durationSec: 0.6,
      });
      const doc = await getProject(api, id);
      const darkest = frameAt(2);
      const times = [frameAt(1.0), darkest, frameAt(2.75), frameAt(2.95), frameAt(3.25)];
      const frames = await framesFor(doc, dir, times, {
        noTitle: without(doc, (c) => c.id === String(title.clipId)),
      });
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS.youtube;
      const full = (t: number) => decodeRgb(frames.get(t)!.full!, W, H);
      const meanOf = (b: Buffer) => b.reduce((s, v) => s + v, 0) / b.length;
      check(
        `${label} the dip reaches near-black (composed mean < 10)`,
        meanOf(full(darkest)) < 10,
        meanOf(full(darkest)),
      );
      const typeBoxes = new Map<number, Record<string, Box | null>>();
      for (const t of [2.75, 2.95].map(frameAt)) {
        const box = changeMask(full(t), decodeRgb(frames.get(t)!.noTitle!, W, H), W, H).box;
        typeBoxes.set(t, { noTitle: box });
      }
      check(
        `${label} the sliding title reaches the left edge (within 2 px)`,
        (typeBoxes.get(frameAt(2.95))!.noTitle?.left ?? 99) <= 2,
        typeBoxes.get(frameAt(2.95)),
      );
      const darkAndGone = (kind: string) => (file: string) => {
        const decoded = decodeRgb(file, W, H, darkest);
        check(
          `${label} ${kind} near-black frame stays within 2 mean RGB of the composed one`,
          Math.abs(meanOf(decoded) - meanOf(full(darkest))) <= 2,
          { encoded: meanOf(decoded), composed: meanOf(full(darkest)) },
        );
        const after = frameAt(3.25);
        const ghost = changeMask(
          decodeRgb(file, W, H, after),
          decodeRgb(frames.get(after)!.noTitle!, W, H),
          W,
          H,
        ).count;
        check(
          `${label} ${kind} nothing of the title remains once it has left`,
          ghost <= W * H * 0.0001,
          { ghost },
        );
      };
      await exportBoth({
        label,
        id,
        preset: 'youtube',
        doc,
        dir,
        times,
        frames,
        typeBoxes,
        audio: darkAndGone,
      });
    }

    // ── f37 with combinations: an A/B/C family, one look each, through Export all ───────
    if (PARTS.has('family')) {
      const label = 'family';
      const dir = join(OUT, 'family');
      mkdirSync(dir, { recursive: true });
      const briefId = randomUUID();
      const family: Array<{ label: string; id: string; doc: EditorProjectV2; title: string }> = [];
      for (const [index, [variant, look, strength]] of (
        [
          ['A', 'vintage', 0.6],
          ['B', 'dust', 1],
          ['C', 'light_leaks', 1],
        ] as const
      ).entries()) {
        const id = await createSeeded(
          'tiktok',
          `Family ${variant}`,
          [
            {
              commandType: 'add_track',
              track: {
                id: 'main',
                name: 'Interview',
                kind: 'video',
                order: 0,
                clips: [
                  {
                    id: 'interview',
                    kind: 'video',
                    timelineStartSec: 0,
                    sourceInSec: MAIN_IN,
                    durationSec: DURATION,
                    audioEnabled: true,
                    source: lib(recording),
                  },
                ],
              },
            },
            {
              commandType: 'add_track',
              track: {
                id: 'music',
                name: 'Rock 120',
                kind: 'audio',
                order: 1,
                clips: [
                  {
                    id: 'drums',
                    kind: 'audio',
                    tags: ['music-bed'],
                    timelineStartSec: 0,
                    sourceInSec: 0,
                    durationSec: DURATION,
                    volume: 0.6,
                    source: lib(music),
                  },
                ],
              },
            },
            {
              commandType: 'set_brief',
              brief: {
                briefId,
                text: 'One rock cut in three looks',
                kind: 'highlight',
                targetDurationSec: DURATION,
                variantLabel: variant,
                variantIndex: index,
              },
            },
          ],
          DURATION,
        );
        await op(id, `${label} ${variant}`, 'set_format', { preset: 'tiktok', fit: 'cover' });
        await op(id, `${label} ${variant}`, 'apply_effect', {
          clipId: 'interview',
          effect: look,
          strength,
        });
        const title = await op(id, `${label} ${variant}`, 'add_text', {
          template: 'hook_title',
          text: `Variant ${variant}`,
          startSec: 0,
          durationSec: DURATION,
        });
        family.push({
          label: variant,
          id,
          doc: await getProject(api, id),
          title: String(title.clipId),
        });
      }
      const { width: W, height: H } = PLATFORM_EXPORT_PRESETS.tiktok;
      const times = [0.5, 3.0, 5.5].map(frameAt);
      const refFilm = join(dir, 'A-browser-export.mp4');
      await workerExport(family[0]!.doc, refFilm);
      const familyPcm = [pcm(refFilm, 0), pcm(refFilm, 1)];
      await page.goto(`${frontend.url}${videoStudioEditorPath(family[1]!.id)}`, {
        timeout: 300_000,
      });
      await page.getByTestId('video-studio-edit').waitFor({ timeout: 300_000 });
      if (await page.locator('[data-testid="brief-dialog"]:visible').count())
        await page.keyboard.press('Escape');
      const exportAll = page
        .getByRole('button', { name: 'Export all variants', exact: true })
        .filter({ visible: true });
      await expect(exportAll).toBeEnabled({ timeout: 30_000 });
      await exportAll.click();
      const dialog = page.locator('[data-testid="video-studio-export-dialog"]:visible');
      await dialog.getByTestId('export-preset-tiktok').click();
      await dialog.getByRole('button', { name: 'Fill (crop)', exact: true }).click();
      await expect(dialog.getByTestId('export-all-start')).toContainText('Export 3 variants');
      const requests = family.map((v) =>
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/video-projects/${v.id}/ops/export`) &&
            r.request().method() === 'POST',
          { timeout: 120_000 },
        ),
      );
      const began = performance.now();
      await dialog.getByTestId('export-all-start').click();
      const outputs = await Promise.all(
        requests.map(async (r) => (await (await r).json()) as { jobId: string }),
      );
      let rows: Array<{ label: string; state: string; text: string }> = [];
      for (const deadline = Date.now() + 300_000; Date.now() < deadline; ) {
        rows = await dialog
          .locator('[data-testid="export-variants"] li[data-variant]')
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              label: node.getAttribute('data-variant') ?? '',
              state: node.getAttribute('data-state') ?? '',
              text: (node.textContent ?? '').trim(),
            })),
          );
        if (rows.length === 3 && rows.every((r) => r.state === 'completed' || r.state === 'failed'))
          break;
        await page.waitForTimeout(2_000);
      }
      must(
        `${label}: Export all variants completes A, B and C`,
        rows.length === 3 && rows.every((r) => r.state === 'completed'),
        rows,
      );
      const downloads: Record<string, string> = {};
      for (const v of family) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60_000 }),
          dialog.getByRole('link', { name: `Download ${v.label}`, exact: true }).click(),
        ]);
        const file = join(dir, `${v.label}-native-export.mp4`);
        await download.saveAs(file);
        downloads[v.label] = file;
      }
      const batchMs = performance.now() - began;
      speed.export_all_variants = [...(speed.export_all_variants ?? []), batchMs];
      speedCheck(
        `${label}: whole batch and all three downloads within 120000 ms`,
        batchMs,
        120_000,
      );
      await page.keyboard.press('Escape');
      const ownFrames = new Map<string, Frames>();
      for (const v of family) {
        const exported = await getProject(api, v.id);
        check(
          `${label} ${v.label}: Export all leaves the composition unchanged`,
          sameTracks(exported, v.doc),
          changedTracks(v.doc, exported),
        );
        ownFrames.set(v.label, await framesFor(exported, join(dir, v.label), times));
      }
      const hashes = new Set(Object.values(downloads).map(sha256));
      check(`${label}: three distinct files`, hashes.size === 3);
      for (const [index, v] of family.entries()) {
        const status = JSON.parse(
          (await postOp(api, v.id, 'export_status', { jobId: outputs[index]!.jobId })).text,
        ) as { state: string; assetId?: string };
        if (status.assetId) outputAssetIds.push(status.assetId);
        persistOwned();
        const { data: job } = await media
          .from('client_render_jobs')
          .select('source_id,state')
          .eq('id', outputs[index]!.jobId)
          .eq('brand_id', BRAND)
          .maybeSingle();
        check(
          `${label} ${v.label}: its job renders its own project and registers Library media`,
          job?.source_id === v.id && status.state === 'completed' && Boolean(status.assetId),
          { job, status: { ...status } },
        );
        const meta = probe(downloads[v.label]!);
        check(
          `${label} ${v.label}: H.264 1080×1920, stereo, exact duration`,
          meta.streams.some((s) => s.codec_type === 'video' && s.width === W && s.height === H) &&
            meta.streams.some((s) => s.codec_type === 'audio' && s.channels === 2) &&
            Math.abs(Number(meta.format.duration) - DURATION) <= 1 / FPS,
          meta,
        );
        for (const t of times) {
          const decoded = decodeRgb(downloads[v.label]!, W, H, t);
          const own = mae(decoded, decodeRgb(ownFrames.get(v.label)!.get(t)!.full!, W, H));
          const others = family
            .filter((o) => o.label !== v.label)
            .map((o) => mae(decoded, decodeRgb(ownFrames.get(o.label)!.get(t)!.full!, W, H)));
          check(
            `${label} ${v.label} ${t.toFixed(2)}s matches its own preview (≤6) and not a sibling's`,
            own <= 6 && others.every((e) => e > own),
            { own, others },
          );
        }
        sameSound(`${label} ${v.label}`, familyPcm)(downloads[v.label]!);
      }
    }

    // ── Retained native-export red (5.793/5.569/4.399 at a 5-unit diagnostic ceiling),
    // decomposed: composition vs colour interpretation vs encoder, with a stationary control.
    const RETAINED = process.env.VIDEO_EDITOR_RETAINED_NATIVE_EXPORT;
    if (RETAINED) {
      const retainedRed = [5.793, 5.569, 4.399];
      const rows = JSON.parse(readFileSync(join(RETAINED, 'sources.json'), 'utf8')) as Array<{
        assetId: string;
        versionId: string;
        file: string;
        sha256: string;
      }>;
      await compositor.route('**/retained-export/*', (route) => {
        const name = decodeURIComponent(
          new URL(route.request().url()).pathname.split('/').pop() ?? '',
        );
        return route.fulfill({ body: readFileSync(join(RETAINED, name)) });
      });
      const metric = (a: Buffer, b: Buffer) => mae(a, b);
      const decomposition = [];
      for (const index of [0, 1, 2]) {
        const read = JSON.parse(
          readFileSync(join(RETAINED, `${index}-export-readback.json`), 'utf8'),
        ) as {
          project: EditorProjectV2;
          sha256: string;
        };
        const film = join(RETAINED, `${index}-native-export.mp4`);
        const image = rows[index * 2]!;
        const raw = join(RETAINED, image.file.split('/').pop()!);
        must(
          `retained case ${index}: native download and source PNG match their recorded hashes`,
          sha256(film) === read.sha256 && sha256(raw) === image.sha256,
        );
        const sources = Object.fromEntries(
          allClips(read.project).flatMap((clip) => {
            if (!('source' in clip) || clip.source.sourceType !== 'library_asset') return [];
            const row = rows.find((r) => r.assetId === clip.source.assetId)!;
            return [
              [
                clip.id,
                {
                  assetId: row.assetId,
                  versionId: row.versionId,
                  url: `${frontend.url}/retained-export/${encodeURIComponent(row.file.split('/').pop()!)}`,
                },
              ],
            ];
          }),
        );
        const composed = await frame(
          read.project,
          join(OUT, `retained-${index}-composed.png`),
          1,
          sources,
        );
        const control = await stationary(
          composed,
          read.project,
          join(OUT, `retained-${index}-stationary.mp4`),
        );
        const rawSmall = decodeSmall(raw);
        const nativeSmall = decodeSmall(film, 1);
        const composedSmall = decodeSmall(composed);
        const controlSmall = decodeSmall(control, 0.5);
        const row = {
          case: index,
          nativeVsRawPng: metric(nativeSmall, rawSmall),
          composedVsRawPng: metric(composedSmall, rawSmall),
          stationaryControlVsRawPng: metric(controlSmall, rawSmall),
          nativeVsComposed: metric(nativeSmall, composedSmall),
          stationaryControlVsComposed: metric(controlSmall, composedSmall),
        };
        decomposition.push(row);
        check(
          `retained case ${index}: the independent replay reproduces the retained red`,
          Math.abs(row.nativeVsRawPng - retainedRed[index]!) <= 0.001,
          row,
        );
        check(
          `retained case ${index}: residual beyond the stationary codec control ≤1 (encoded output matches what was composed)`,
          row.nativeVsComposed - row.stationaryControlVsComposed <= 1 && row.nativeVsComposed <= 6,
          row,
        );
      }
      save('retained-native-export-decomposition.json', {
        scope:
          'Retained r3 native downloads, their exact source PNGs, the current compositor and a stationary WebCodecs control. Native (composed) and encoded evidence are reported separately; the retained 5-unit raw-PNG ceiling is unchanged.',
        decomposition,
      });
    }
    check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  } catch (error) {
    check('combination journey completes', false, describeError(error));
  } finally {
    notes.push(`speed samples: ${JSON.stringify(speed)}`);
    notes.push(`uptime at end: ${uptime()}`);
    save('speed-samples.json', speed);
    await context?.close().catch(() => undefined);
    try {
      await cleanupOwned();
    } catch (error) {
      check('exact owned fixture cleanup', false, describeError(error));
    }
    try {
      await restoreIdentity();
    } catch (error) {
      check('preference and session cleanup', false, describeError(error));
    }
    for (const server of servers.reverse()) server.stop();
    rec.record(
      'unexercised hops',
      'SKIP',
      'Hosted Render/Backend/Frontend (needs a release), paid generation, physical device output, held-out agent/MCP model tasks and adoption are not exercised; all media stayed on the loopback stack.',
    );
    save('summary.json', { notes });
    rec.print();
  }
  expect(fails, 'graded FAIL steps').toBe(0);
});

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

declare global {
  interface Window {
    __editorV2DurableRenderBench: {
      previewTimelineAudio: (
        request: { project: EditorProjectV2; inputs: unknown[] },
        fromSec: number,
      ) => Promise<{ channelsBase64: string[] }>;
    };
  }
}

// Rect is re-exported for callers that build their own panel windows.
export type { Rect };
