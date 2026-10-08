import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { editorProjectResponseSchema, videoStudioEditorPath } from '@continuum/contracts';
import { type Browser, type BrowserContext, chromium, expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';
import { mintSessionBundleForEmail } from './support/auth';
import { loadLocalSupabaseEnv } from './support/prodEnv';
import { bootBackend, bootFrontend, freePort, type Server } from './video-editor-workspace/harness';
import { removeProjects } from './video-editor-workspace/ledger';

// Real native capture, upload, Edge registration, editor save, reload and playback.
// Camera/mic use Chromium's file-backed devices; screen capture may only select our tab.
// No physical devices, desktop capture, paid provider, or hosted database is permitted.
const BENCH = 'videoeditor:record:e2e:bench';
const BRAND = '00000000-0000-4000-8000-0000000000b2';
const SOURCE_SHA = '157f82600e337c8efa0b1be466806854075f90acb05a8f33dbb2a90a9ee3d201';
const { url, serviceRoleKey } = loadLocalSupabaseEnv();
process.env.SUPABASE_URL = url;
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const media = admin.schema('media');
const rec = new Recorder(BENCH);
const results: { step: string; grade: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = [];
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function check(step: string, ok: boolean, detail?: string) {
  rec.check(step, ok, detail);
  results.push({ step, grade: ok ? 'PASS' : 'FAIL', detail });
}
function localSql(sql: string): string {
  return execFileSync(
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
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}
type Capture = {
  stopAt: number;
  visibleAt: number;
  durableAt: number;
  chunks: string;
  tracks: { kind: string; label: string; state: string; settings: MediaTrackSettings }[];
  requests: { path: string; start: number; end: number; status: number }[];
};

test.describe.configure({ timeout: 900_000 });
test(BENCH, async () => {
  const folder = process.env.VIDEO_EDITOR_RECORD_OUTPUT;
  const source = process.env.VIDEO_EDITOR_RECORDED_FIXTURE;
  const renderer = process.env.VIDEO_EDITOR_RENDER_URL;
  if (!folder || !source || !renderer)
    throw new Error(
      'Require recorded fixture, fresh output directory and explicit loopback Render URL.',
    );
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(renderer).hostname))
    throw new Error('Render must be loopback.');
  if (process.env.BENCH_SINK !== 'library') throw new Error('Require BENCH_SINK=library.');
  mkdirSync(folder, { recursive: true });
  expect(sha(readFileSync(source))).toBe(SOURCE_SHA);
  const cameraFile = join(folder, 'camera.y4m');
  const micFile = join(folder, 'mic.wav');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    source,
    '-an',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'yuv4mpegpipe',
    cameraFile,
  ]);
  execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-vn', '-ac', '1', '-ar', '48000', micFile]);
  writeFileSync(
    join(folder, 'device-fixtures.json'),
    JSON.stringify(
      {
        source: SOURCE_SHA,
        camera: sha(readFileSync(cameraFile)),
        microphone: sha(readFileSync(micFile)),
      },
      null,
      2,
    ),
  );
  const title = `Continuum owned capture ${randomUUID()}`;
  const fixturePort = await freePort();
  const fixtureBytes = readFileSync(source);
  const fixture = createServer((request, response) => {
    if (request.url === '/source.mp4') {
      response.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fixtureBytes.length,
      });
      response.end(fixtureBytes);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        `<title>${title}</title><style>body{margin:0;background:#222}video{width:800px;height:450px}</style><video src="/source.mp4" autoplay loop playsinline></video>`,
      );
    }
  });
  await new Promise<void>((done) => fixture.listen(fixturePort, '127.0.0.1', done));
  const projects: string[] = [];
  const tickets = new Map<string, { assetId: string; bucket: string; path: string }>();
  const tasks = new Set<Promise<void>>();
  const samples: { source: string; durationMs: number }[] = [];
  const servers: Server[] = [];
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let session: Awaited<ReturnType<typeof mintSessionBundleForEmail>> | undefined;
  let previousBrand: string | null | undefined;
  let preferenceChanged = false;
  const previewTasks = new Set<Promise<unknown>>();
  try {
    const port = await freePort();
    const backend = await bootBackend(`http://localhost:${port}`, {
      CONTINUUM_RENDER_SERVICE_URL: renderer,
    });
    servers.push(backend);
    const frontend = await bootFrontend(port, backend.url, '.next/video-record-e2e');
    servers.push(frontend);
    writeFileSync(
      join(folder, 'server-logs.json'),
      JSON.stringify(
        servers.map(({ url: address, log }) => ({ url: address, log })),
        null,
        2,
      ),
    );
    process.env.PLAYWRIGHT_BASE_URL = frontend.url;
    session = await mintSessionBundleForEmail('local@continuum.test');
    const preference = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (preference.error) throw preference.error;
    previousBrand = preference.data?.active_brand_id;
    const update = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: session.userId, active_brand_id: BRAND });
    if (update.error) throw update.error;
    preferenceChanged = true;
    writeFileSync(
      join(folder, 'cleanup-identity.json'),
      JSON.stringify({ userId: session.userId, previousBrand }, null, 2),
    );
    for (const mode of ['screen', 'camera', 'mic'] as const) {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        ignoreDefaultArgs: mode === 'screen' ? ['--mute-audio'] : [],
        args: [
          ...(mode === 'screen'
            ? []
            : [
                '--use-fake-device-for-media-stream',
                `--use-file-for-fake-video-capture=${cameraFile}`,
                `--use-file-for-fake-audio-capture=${micFile}`,
              ]),
          `--auto-select-tab-capture-source-by-title=${title}`,
          '--enable-usermedia-screen-capturing',
        ],
      });
      context = await browser.newContext({
        storageState: session.state,
        viewport: { width: 1440, height: 1000 },
      });
      await context.grantPermissions(['camera', 'microphone', 'local-network-access'], {
        origin: frontend.url,
      });
      await context.addInitScript((ownedTitle) => {
        const state: Capture = {
          stopAt: 0,
          visibleAt: 0,
          durableAt: 0,
          chunks: '',
          tracks: [],
          requests: [],
        };
        const target = window as Window & { captureProof: Capture };
        target.captureProof = state;
        const nativeDisplay = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getDisplayMedia = async (options) => {
          const stream = await nativeDisplay(options);
          const track = stream.getVideoTracks()[0];
          if (track?.getSettings().displaySurface !== 'browser') {
            for (const item of stream.getTracks()) item.stop();
            throw new Error(
              `Refusing capture outside owned fixture tab: ${JSON.stringify({ label: track?.label, settings: track?.getSettings(), ownedTitle })}`,
            );
          }
          return stream;
        };
        const nativeStart = MediaRecorder.prototype.start;
        const nativeStop = MediaRecorder.prototype.stop;
        MediaRecorder.prototype.start = function (timeslice) {
          const chunks: Blob[] = [];
          const tracks = this.stream.getTracks();
          const settings = tracks.map((track) => track.getSettings());
          this.addEventListener('dataavailable', (event) => {
            if (event.data.size) chunks.push(event.data);
          });
          this.addEventListener('stop', async () => {
            // Observe native bytes and cleanup; never replace the stream or recorder.
            const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            state.chunks = btoa(binary);
            state.tracks = tracks.map((track, index) => ({
              kind: track.kind,
              label: track.label,
              state: track.readyState,
              settings: settings[index]!,
            }));
          });
          return nativeStart.call(this, timeslice);
        };
        MediaRecorder.prototype.stop = function () {
          if (!state.stopAt) state.stopAt = performance.now();
          return nativeStop.call(this);
        };
        document.addEventListener(
          'click',
          (event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[aria-label="Stop recording"]')
            )
              state.stopAt = performance.now();
          },
          true,
        );
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const input = args[0];
          const path = new URL(input instanceof Request ? input.url : String(input), location.href)
            .pathname;
          const start = performance.now();
          const response = await nativeFetch(...args);
          const end = performance.now();
          state.requests.push({ path, start, end, status: response.status });
          if (state.stopAt && path.endsWith('/commands') && response.ok) state.durableAt = end;
          return response;
        };
        new MutationObserver(() => {
          if (state.stopAt && !state.visibleAt && document.querySelector('[data-clip-id]'))
            state.visibleAt = performance.now();
        }).observe(document, { subtree: true, childList: true });
      }, title);
      const fixturePage = await context.newPage();
      await fixturePage.goto(`http://127.0.0.1:${fixturePort}`);
      await fixturePage.locator('video').evaluate((video: HTMLVideoElement) => video.play());
      const page = await context.newPage();
      page.on('response', (response) => {
        if (!response.url().includes('/functions/v1/library-upload')) return;
        const task = response.json().then((body: unknown) => {
          const ticket = z
            .object({ assetId: z.string().uuid(), bucket: z.string(), path: z.string() })
            .safeParse(body);
          if (ticket.success) {
            tickets.set(ticket.data.assetId, ticket.data);
            writeFileSync(
              join(folder, 'owned-tickets.json'),
              JSON.stringify([...tickets.values()], null, 2),
            );
          }
        });
        tasks.add(task);
        task.finally(() => tasks.delete(task));
      });
      const pending = new Set<string>();
      page.on('request', (request) => {
        if (!request.url().endsWith('/api/media/library-preview-proxy')) return;
        pending.add(request.url());
        const task = request.response().then((response) => response?.finished());
        previewTasks.add(task);
        void task.finally(() => previewTasks.delete(task));
      });
      page.on('requestfinished', (request) => pending.delete(request.url()));
      page.on('requestfailed', (request) => pending.delete(request.url()));
      const created = await fetch(`${backend.url}/api/ai-studio/video-projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId: BRAND,
          title: `record-${mode}-${title}`,
          width: 800,
          height: 450,
        }),
      });
      if (!created.ok) throw new Error(`Create project ${created.status}: ${await created.text()}`);
      const projectId = editorProjectResponseSchema.parse(await created.json()).project.projectId;
      projects.push(projectId);
      writeFileSync(join(folder, 'owned-projects.json'), JSON.stringify(projects));
      await page.goto(`${frontend.url}${videoStudioEditorPath(projectId)}`);
      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await page
        .getByRole('menuitem', {
          name: mode === 'screen' ? 'Screen' : mode === 'camera' ? 'Camera' : 'Voice-over (mic)',
          exact: true,
        })
        .click();
      await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(2200);
      await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await expect(page.locator('[data-clip-id]:visible').first()).toBeVisible({ timeout: 90_000 });
      await page.waitForFunction(
        () => (window as Window & { captureProof: Capture }).captureProof.durableAt > 0,
        null,
        { timeout: 90_000 },
      );
      const capture = await page.evaluate(
        () => (window as Window & { captureProof: Capture }).captureProof,
      );
      const durationMs = Math.max(capture.visibleAt, capture.durableAt) - capture.stopAt;
      samples.push({ source: mode, durationMs });
      writeFileSync(
        join(folder, `${mode}-capture.json`),
        JSON.stringify({ ...capture, chunks: undefined, durationMs }, null, 2),
      );
      const native = Buffer.from(capture.chunks, 'base64');
      writeFileSync(join(folder, `${mode}-native.webm`), native);
      check(
        `${mode}: native capture releases every track`,
        capture.tracks.length > 0 && capture.tracks.every((track) => track.state === 'ended'),
        JSON.stringify(capture.tracks),
      );
      if (mode === 'camera')
        check(
          'camera: recorded fixture device selected',
          capture.tracks.some((track) => track.kind === 'video' && track.label === cameraFile),
        );
      if (mode === 'screen')
        check(
          'screen: only the owned browser tab captured',
          capture.tracks.some(
            (track) => track.kind === 'video' && track.settings.displaySurface === 'browser',
          ),
        );
      const read = await fetch(`${backend.url}/api/ai-studio/video-projects/${projectId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const project = editorProjectResponseSchema.parse(await read.json()).project;
      const clips = project.tracks.flatMap((track) => track.clips);
      const clip = clips[0];
      if (!clip || !('source' in clip) || clip.source.sourceType !== 'library_asset')
        throw new Error('Missing pinned recorded clip.');
      const version = await media
        .from('asset_versions')
        .select('*')
        .eq('id', clip.source.renditionId)
        .single();
      if (version.error) throw version.error;
      const stored = await admin.storage
        .from(version.data.bucket)
        .download(version.data.storage_path);
      if (stored.error) throw stored.error;
      const bytes = Buffer.from(await stored.data.arrayBuffer());
      const file = join(folder, `${mode}-stored.webm`);
      writeFileSync(file, bytes);
      check(
        `${mode}: exact native bytes persist at the pinned Library version`,
        sha(bytes) === sha(native) && version.data.asset_id === clip.source.assetId,
        JSON.stringify({ native: sha(native), stored: sha(bytes), version: version.data.id }),
      );
      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'error', '-show_streams', '-show_packets', '-of', 'json', file],
          { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        ),
      ) as {
        streams: { codec_type: string }[];
        packets: { pts_time?: string; duration_time?: string }[];
      };
      const duration = Math.max(
        ...probe.packets.map(
          (packet) => Number(packet.pts_time ?? 0) + Number(packet.duration_time ?? 0),
        ),
      );
      execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
      check(
        `${mode}: real native media decodes with expected tracks`,
        duration > 1.5 &&
          (mode === 'mic'
            ? probe.streams.every((stream) => stream.codec_type === 'audio')
            : probe.streams.some((stream) => stream.codec_type === 'video')) &&
          (mode === 'screen' || probe.streams.some((stream) => stream.codec_type === 'audio')),
        JSON.stringify({ duration, streams: probe.streams.map((stream) => stream.codec_type) }),
      );
      if (probe.streams.some((stream) => stream.codec_type === 'audio')) {
        const pcm = execFileSync(
          'ffmpeg',
          ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
          { maxBuffer: 8 * 1024 * 1024 },
        );
        let energy = 0;
        for (let offset = 0; offset < pcm.length; offset += 4)
          energy += pcm.readFloatLE(offset) ** 2;
        check(
          `${mode}: captured real audio contains audible samples`,
          pcm.length > 48000 && energy / (pcm.length / 4) > 1e-8,
          JSON.stringify({ samples: pcm.length / 4, energy }),
        );
      }
      if (mode !== 'mic') {
        const pixels = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-ss',
          '0.5',
          '-i',
          file,
          '-frames:v',
          '1',
          '-vf',
          'scale=80:45',
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          '-',
        ]);
        const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
        const variance =
          pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;
        check(
          `${mode}: captured video contains decoded picture detail`,
          pixels.length === 80 * 45 * 3 && variance > 20,
          JSON.stringify({ mean, variance }),
        );
      }
      const clipDuration = clip.durationSec;
      check(
        `${mode}: persisted timeline uses the capture's real duration`,
        Math.abs(clipDuration - duration) <= 0.2,
        JSON.stringify({ clipDuration, decodedDuration: duration }),
      );
      writeFileSync(
        join(folder, `${mode}-persisted.json`),
        JSON.stringify({ project, version: version.data, probe }, null, 2),
      );
      await expect.poll(() => pending.size, { timeout: 180_000 }).toBe(0);
      await Promise.all([...tasks]);
      await page.keyboard.press('Escape');
      await page.reload();
      await expect(page.locator(`[data-clip-id="${clip.id}"]:visible`)).toBeVisible();
      const signed = await admin.storage
        .from(version.data.bucket)
        .createSignedUrl(version.data.storage_path, 300);
      if (signed.error) throw signed.error;
      const playback = await page.evaluate(
        async ({ sourceUrl, audio }) => {
          const element = document.createElement(audio ? 'audio' : 'video');
          element.muted = true;
          element.src = sourceUrl;
          document.body.append(element);
          await element.play();
          const start = element.currentTime;
          await new Promise((resolve) => setTimeout(resolve, 350));
          const result = {
            start,
            end: element.currentTime,
            error: element.error?.message ?? null,
            width: element instanceof HTMLVideoElement ? element.videoWidth : null,
          };
          element.pause();
          element.removeAttribute('src');
          element.load();
          element.remove();
          return result;
        },
        { sourceUrl: signed.data.signedUrl, audio: mode === 'mic' },
      );
      check(
        `${mode}: reloaded persisted source plays in native browser media`,
        !playback.error &&
          playback.end > playback.start + 0.1 &&
          (mode === 'mic' || Number(playback.width) > 0),
        JSON.stringify(playback),
      );
      await page.screenshot({ path: join(folder, `${mode}-reloaded.png`) });
      await context.close();
      await browser.close();
      context = undefined;
      browser = undefined;
    }
  } catch (error) {
    check('native recording journey', false, error instanceof Error ? error.stack : String(error));
    for (const page of context?.pages() ?? []) {
      if (page.url().includes('/studio/video/')) {
        writeFileSync(join(folder, 'failed-page.txt'), await page.locator('body').innerText());
        await page.screenshot({ path: join(folder, 'failed-page.png') });
      }
    }
  } finally {
    check(
      'f04 every Stop → durable save and visible clip passes 1000ms',
      samples.length === 3 &&
        samples.every((sample) => sample.durationMs > 0 && sample.durationMs <= 1000),
      JSON.stringify(samples),
    );
    writeFileSync(join(folder, 'save-timings.json'), JSON.stringify(samples, null, 2));
    await Promise.allSettled([...tasks]);
    // Keep all writers alive until their real HTTP responses are complete.
    await Promise.all([...previewTasks]);
    await context?.close();
    await browser?.close();
    await (async () => {
      try {
        await removeProjects(admin, BRAND, projects);
        if (projects.length) {
          const quotedProjects = projects.map((id) => `'${z.string().uuid().parse(id)}'`).join(',');
          check(
            'owned projects and revisions removed',
            localSql(
              `select (select count(*) from media.editor_projects where id in (${quotedProjects})) + (select count(*) from media.editor_project_revisions where project_id in (${quotedProjects}));`,
            ) === '0',
          );
        }
        const ids = [...tickets.keys()].map((id) => z.string().uuid().parse(id));
        if (ids.length) {
          const quoted = ids.map((id) => `'${id}'`).join(',');
          const objects = JSON.parse(
            localSql(
              `select coalesce(json_agg(t),'[]') from (select bucket_id,name from storage.objects where name like '${BRAND}/%' and (${ids.map((id) => `name like '%${id}%'`).join(' or ')})) t;`,
            ),
          ) as { bucket_id: string; name: string }[];
          for (const bucket of new Set(objects.map((object) => object.bucket_id))) {
            const removed = await admin.storage
              .from(bucket)
              .remove(
                objects
                  .filter((object) => object.bucket_id === bucket)
                  .map((object) => object.name),
              );
            if (removed.error) throw removed.error;
          }
          const removed = await media.from('assets').delete().eq('brand_id', BRAND).in('id', ids);
          if (removed.error) throw removed.error;
          localSql(
            `delete from library_internal.operation_receipts where brand_id='${BRAND}' and (response->>'assetId' in (${quoted}) or idempotency_key in (${ids.map((id) => `'upload:${id}'`).join(',')})); delete from billing_private.storage_reservations where brand_id='${BRAND}' and id in (${quoted});`,
          );
          const left = localSql(
            `select (select count(*) from media.assets where id in (${quoted})) + (select count(*) from media.asset_versions where asset_id in (${quoted})) + (select count(*) from library_internal.operation_receipts where brand_id='${BRAND}' and response->>'assetId' in (${quoted})) + (select count(*) from billing_private.storage_reservations where id in (${quoted})) + (select count(*) from storage.objects where name like '${BRAND}/%' and (${ids.map((id) => `name like '%${id}%'`).join(' or ')}));`,
          );
          check(
            'owned captured assets, versions and Storage objects removed',
            left === '0',
            JSON.stringify({ ids, objects: objects.length, left }),
          );
        }
        if (session && preferenceChanged) {
          const prefs = admin.schema('brand_profiles').from('user_brand_preferences');
          const restored =
            previousBrand === undefined
              ? await prefs.delete().eq('user_id', session.userId)
              : await prefs.upsert({ user_id: session.userId, active_brand_id: previousBrand });
          if (restored.error) throw restored.error;
          check('prior active brand restored', true);
        }
        if (session) {
          const signedOut = await admin.auth.admin.signOut(session.accessToken, 'local');
          if (signedOut.error) throw signedOut.error;
          check('owned session revoked', true);
        }
      } catch (error) {
        check(
          'owned fixture cleanup',
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
    fixture.closeAllConnections();
    fixture.close();
    for (const server of servers.reverse()) server.stop();
  }
  const step =
    'Physical camera/mic, OS share picker and cancellation, other browsers, long recordings and current production';
  rec.record(
    step,
    'SKIP',
    'Only native Chromium capture from owned tab and file-backed recorded devices exercised.',
  );
  results.push({ step, grade: 'SKIP' });
  const summary = {
    bench: BENCH,
    startedAt,
    durationMs: Date.now() - startedMs,
    results,
    notes: [
      `speed samples: ${JSON.stringify({ record: samples.map((sample) => sample.durationMs) })}`,
    ],
    counts: rec.summary(),
    exitCode: rec.summary().fail ? 1 : 0,
  };
  writeFileSync(join(folder, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  expect(summary.exitCode).toBe(0);
});
