// videoeditor:audio:render:bench — a music bed ducked under speech through the REAL browser
// compositor (buildTimelineEditorRenderPlan → composeTimeline → the PCM mixdown, the code
// Render bundles as timeline-editor.js), judged on the decoded export:
//
//   ducking     the bed's level inside each speech range drops to the contract's duckTo
//               (0.25 ≈ −12 dB, ± 2 dB) and comes back outside it
//   speech      the voice track is untouched by the bed's keys
//   unchanged   a bed with NO keyframes mixes sample for sample as the pre-ducking mixer did
//               (the same entry bundled with audioMix.ts from BASELINE_REV)
//   control     the pre-ducking mixer given the SAME keys does not duck (the measurement
//               can tell the two apart)
//   pixels      the picture is identical with and without the keys
//
// Levels are the RMS of each tone in 100 ms windows (a Hann-windowed single-bin DFT at the
// tone's frequency), so the 220 Hz "speech" never counts as music and vice versa.
// The masters go to GCS (never the Library): gs://…/video-editor-audio/render-<run>/.
//
// Server-export mode — the same judgement on a DEPLOYED Render revision:
//   AUDIO_RENDER_SERVER_EXPORT=<Render URL> bun run videoeditor:audio:render:bench
// (an environment variable, because Playwright refuses flags it does not know). A local
// Backend from this tree (workers off) calls that Render with the .env service account's
// Cloud Run identity, as production does. The two tones are staged as Library audio assets
// of the bench brand over an existing bench video (picture only), and the timeline is
// exported twice through the real `export` op: bed keyed, then bed unkeyed. Writes (the
// two staged tones, the project, both exports, their render jobs, storage and receipts) are
// deleted at exit and asserted gone by id. Hold the shared bench lock for this mode.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DUCKING, duckingKeyframes, type EditorProjectV2 } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { loadProdSupabaseEnv, readBackendEnv } from './support/prodEnv';
import type { AudioRenderRun } from './support/videoEditorAudioRenderEntry';
import { bootBackend, type Server } from './video-editor-workspace/harness';
import { objectsFor, removeAssets } from './video-editor-workspace/ledger';

test.use({ channel: 'chrome' });
test.describe.configure({ timeout: 300_000 });

const GCS_PREFIX = 'gs://continuum-production-477821-creative-benchmarks/video-editor-audio';
const ENTRY = 'e2e/support/videoEditorAudioRenderEntry.ts';
/** The Frontend commit before ducking: its audioMix.ts is the mixer an unkeyed clip must match. */
const BASELINE_REV = 'ac323de4';
const MIXER = 'src/StudioCanvas/utils/splice/audioMix.ts';
const MUSIC_HZ = 1_000;
const SPEECH_HZ = 220;
const SPEECH = [
  { startSec: 2, endSec: 3.5 },
  { startSec: 5, endSec: 6 },
];
const WINDOW_SEC = 0.1;
const DUCK_DB = 20 * Math.log10(DUCKING.duckTo);
const PICTURE: [number, number, number] = [0x1f, 0x6f, 0xeb];

// Builds the entry with the mixer swapped for the baseline revision's, through Bun.build's
// onLoad hook; everything else is this tree.
const BASELINE_BUILD = `
const [entry, outfile, rev, mixer] = process.argv.slice(2);
const baseline = Bun.spawnSync(['git', 'show', rev + ':' + mixer]);
if (baseline.exitCode !== 0) throw new Error(baseline.stderr.toString());
const built = await Bun.build({
  entrypoints: [entry],
  target: 'browser',
  plugins: [{
    name: 'baseline-mixer',
    setup(build) {
      build.onLoad({ filter: /utils[\\\\/]splice[\\\\/]audioMix\\.ts$/ }, () => ({
        contents: baseline.stdout.toString(),
        loader: 'ts',
      }));
    },
  }],
});
if (!built.success) throw new AggregateError(built.logs, 'baseline build failed');
await Bun.write(outfile, await built.outputs[0].text());
`;

function bundle(baseline: boolean): string {
  const scratch = mkdtempSync(join(tmpdir(), 'video-editor-audio-render-'));
  const outfile = join(scratch, 'entry.js');
  try {
    if (baseline) {
      const script = join(scratch, 'build.ts');
      writeFileSync(script, BASELINE_BUILD);
      execFileSync('bun', [script, ENTRY, outfile, BASELINE_REV, MIXER], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    } else {
      execFileSync('bun', ['build', ENTRY, '--target=browser', '--outfile', outfile], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }
    return readFileSync(outfile, 'utf8');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const pcmOf = (run: AudioRenderRun): Float32Array => {
  const bytes = Buffer.from(run.pcmBase64, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

/** RMS of one tone over [fromSec, toSec): a Hann-windowed DFT at that single frequency. */
function toneRms(pcm: Float32Array, rate: number, hz: number, fromSec: number, toSec: number) {
  const start = Math.round(fromSec * rate);
  const count = Math.min(pcm.length, Math.round(toSec * rate)) - start;
  const step = (2 * Math.PI * hz) / rate;
  let real = 0;
  let imaginary = 0;
  let weight = 0;
  for (let index = 0; index < count; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
    const value = (pcm[start + index] ?? 0) * hann;
    real += value * Math.cos(step * (start + index));
    imaginary -= value * Math.sin(step * (start + index));
    weight += hann;
  }
  return (2 * Math.hypot(real, imaginary)) / weight / Math.SQRT2;
}

const db = (ratio: number) => 20 * Math.log10(Math.max(ratio, 1e-9));
const median = (values: readonly number[]) => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

/** 100 ms windows, split by where each sits against the speech and its duck ramps. */
function windows(durationSec: number) {
  const ducked: number[] = [];
  const clear: number[] = [];
  for (let at = 0.1; at + WINDOW_SEC <= durationSec - 0.1; at += WINDOW_SEC) {
    const end = at + WINDOW_SEC;
    if (SPEECH.some((range) => at >= range.startSec + 0.05 && end <= range.endSec - 0.05)) {
      ducked.push(at);
    } else if (
      SPEECH.every(
        (range) =>
          end <= range.startSec - DUCKING.attackSec - 0.05 ||
          at >= range.endSec + DUCKING.releaseSec + 0.05,
      )
    ) {
      clear.push(at);
    }
  }
  return { ducked, clear };
}

test('a music bed ducks under speech in the real compositor, judged on the decoded mix', async ({
  browser,
}) => {
  const rec = createBenchRecorder('videoeditor:audio:render:bench', []);
  const current = bundle(false);
  const baseline = bundle(true);
  const render = async (code: string, variant: AudioRenderRun['variant']) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/video-editor-audio-render-bench', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await page.goto('http://127.0.0.1:4173/video-editor-audio-render-bench', {
      waitUntil: 'domcontentloaded',
    });
    await page.addScriptTag({ content: code, type: 'module' });
    await page.waitForFunction(() => Boolean(window.__audioRenderBench));
    const run = (await page.evaluate(
      (name) => window.__audioRenderBench.run(name),
      variant,
    )) as AudioRenderRun;
    await context.close();
    return run;
  };
  const ducked = await render(current, 'ducked');
  const plain = await render(current, 'plain');
  const oldPlain = await render(baseline, 'plain');
  const oldDucked = await render(baseline, 'ducked');
  const automated = await render(current, 'automated');

  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    rec.record(name, ok ? 'PASS' : 'FAIL', detail);
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
    expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };

  check(
    'plan: two audio clips mixed; the bed carries the contract’s ducking keys; an 8 s master',
    ducked.audioTracks === 2 &&
      plain.audioTracks === 2 &&
      ducked.keyframes.length === SPEECH.length * 4 &&
      plain.keyframes.length === 0 &&
      Math.abs(ducked.durationSec - 8) <= 0.1,
    `audio ${ducked.audioTracks}/${plain.audioTracks} · ${ducked.keyframes.length} keys (${ducked.keyframes
      .map((key) => `${key.timeSec}s=${key.value}`)
      .join(' ')}) · ${ducked.durationSec.toFixed(3)} s`,
  );

  const rate = ducked.sampleRate;
  const [duckedPcm, plainPcm, oldPlainPcm, oldDuckedPcm] = [ducked, plain, oldPlain, oldDucked].map(
    pcmOf,
  ) as [Float32Array, Float32Array, Float32Array, Float32Array];
  const { ducked: underSpeech, clear } = windows(ducked.durationSec);
  const levelDb = (pcm: Float32Array, reference: Float32Array, hz: number, at: number) =>
    db(
      toneRms(pcm, rate, hz, at, at + WINDOW_SEC) /
        toneRms(reference, rate, hz, at, at + WINDOW_SEC),
    );
  const under = underSpeech.map((at) => levelDb(duckedPcm, plainPcm, MUSIC_HZ, at));
  const outside = clear.map((at) => levelDb(duckedPcm, plainPcm, MUSIC_HZ, at));
  const summary = (values: number[]) =>
    `median ${median(values).toFixed(2)} dB, ${Math.min(...values).toFixed(2)}…${Math.max(...values).toFixed(2)} dB over ${values.length} windows`;

  check(
    `ducking: under speech the bed sits at duckTo (${DUCK_DB.toFixed(2)} dB ± 2 dB) against the unducked mix`,
    under.length >= 20 && under.every((value) => Math.abs(value - DUCK_DB) <= 2),
    summary(under),
  );
  check(
    'ducking: away from speech and its ramps the bed is back at full level (± 0.5 dB)',
    outside.length >= 20 && outside.every((value) => Math.abs(value) <= 0.5),
    summary(outside),
  );

  const bedRms = 0.4 / Math.SQRT2;
  const plainLevels = [...underSpeech, ...clear].map((at) =>
    db(toneRms(plainPcm, rate, MUSIC_HZ, at, at + WINDOW_SEC) / bedRms),
  );
  check(
    'unkeyed bed: steady at the source level (0 dB ± 0.5) through speech and silence',
    plainLevels.every((value) => Math.abs(value) <= 0.5),
    summary(plainLevels),
  );

  let residual = 0;
  let energy = 0;
  const frames = Math.min(plainPcm.length, oldPlainPcm.length);
  for (let index = 0; index < frames; index += 1) {
    residual += ((plainPcm[index] ?? 0) - (oldPlainPcm[index] ?? 0)) ** 2;
    energy += (oldPlainPcm[index] ?? 0) ** 2;
  }
  const residualDb = residual === 0 ? Number.NEGATIVE_INFINITY : db(Math.sqrt(residual / energy));
  check(
    `unchanged: an unkeyed mix matches the pre-ducking mixer (${BASELINE_REV}) sample for sample`,
    plainPcm.length === oldPlainPcm.length && residualDb <= -60,
    `${plainPcm.length} vs ${oldPlainPcm.length} samples · residual ${Number.isFinite(residualDb) ? `${residualDb.toFixed(1)} dB` : '−∞ dB (bit-identical)'}`,
  );

  const control = underSpeech.map((at) => levelDb(oldDuckedPcm, plainPcm, MUSIC_HZ, at));
  check(
    `control: the pre-ducking mixer (${BASELINE_REV}) given the same keys does not duck`,
    control.every((value) => Math.abs(value) <= 0.5),
    summary(control),
  );

  const speechWindows = underSpeech.map((at) => levelDb(duckedPcm, plainPcm, SPEECH_HZ, at));
  const speechLevel = underSpeech.map((at) =>
    toneRms(duckedPcm, rate, SPEECH_HZ, at, at + WINDOW_SEC),
  );
  const silentVoice = clear.map((at) => toneRms(duckedPcm, rate, SPEECH_HZ, at, at + WINDOW_SEC));
  check(
    'speech: the voice plays in its ranges at the same level with or without the bed’s keys',
    speechWindows.every((value) => Math.abs(value) <= 0.5) &&
      Math.min(...speechLevel) > 0.15 &&
      Math.max(...silentVoice) < 0.01,
    `voice Δ ${summary(speechWindows)} · voice RMS ≥ ${Math.min(...speechLevel).toFixed(3)} in speech, ≤ ${Math.max(...silentVoice).toFixed(4)} outside`,
  );

  const pixelDelta = Math.max(
    ...ducked.frames.flatMap((rgb, index) =>
      rgb.map((value, channel) => Math.abs(value - (plain.frames[index]?.[channel] ?? -999))),
    ),
  );
  const pictureOff = Math.max(
    ...ducked.frames.flatMap((rgb) =>
      rgb.map((value, channel) => Math.abs(value - PICTURE[channel]!)),
    ),
  );
  check(
    'pixels: the picture is the same with and without the keys, and is the source colour',
    pixelDelta <= 1 && pictureOff <= 15,
    `max mean-RGB Δ ${pixelDelta.toFixed(2)} between renders · ${pictureOff.toFixed(1)} off ${PICTURE.join(',')} (${ducked.frames
      .map((rgb) => rgb.map((value) => value.toFixed(0)).join(','))
      .join(' | ')})`,
  );

  console.log(
    'decoded audio origins:',
    JSON.stringify(
      [ducked, plain, automated].map(({ variant, decodedStartSec }) => ({
        variant,
        decodedStartSec,
      })),
    ),
  );
  const automatedPcm = pcmOf(automated);
  const envelope = [
    [1.5, 0.8],
    [2.5, 0.5],
    [3.5, 0.2],
    [4.25, 0.251665],
    [4.5, 0.4],
    [4.75, 0.548335],
    [5.5, 0.6],
    [6.5, 0.8],
  ];
  const levels = envelope.map(([at, expected]) => ({
    at,
    expected,
    actual:
      toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, at - 0.05, at + 0.05) / bedRms,
  }));
  check(
    'volume automation: holds, linear ramps and bezier easing match decoded gain after trim and speed',
    automated.keyframes.length === 7 &&
      levels.every((level) => Math.abs(level.actual - level.expected) <= 0.03),
    JSON.stringify(levels),
  );
  check(
    'AAC presentation: music starts on the timeline without encoder priming delay',
    toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, 0.975, 0.985) < 0.005 &&
      Math.abs(
        toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, 1.005, 1.015) / bedRms - 0.8,
      ) <= 0.04,
    `first audible window gain ${toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, 1.005, 1.015) / bedRms}`,
  );
  check(
    'volume automation: clip-local gain begins at the offset and ends with the clip',
    toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, 0.4, 0.6) < 0.001 &&
      toneRms(automatedPcm, automated.sampleRate, MUSIC_HZ * 1.25, 7.4, 7.6) < 0.001 &&
      Math.abs(automated.durationSec - 8) <= 1 / 30,
    `duration ${automated.durationSec}s`,
  );
  check(
    'volume automation: speech and picture remain unchanged',
    underSpeech.every((at) => Math.abs(levelDb(automatedPcm, plainPcm, SPEECH_HZ, at)) <= 0.5) &&
      automated.frames.every((rgb, index) =>
        rgb.every((channel, c) => Math.abs(channel - plain.frames[index][c]) <= 1),
      ),
    'Measured separate speech frequency and decoded picture',
  );

  const run = `render-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const scratch = mkdtempSync(join(tmpdir(), 'video-editor-audio-render-'));
  try {
    for (const rendered of [ducked, plain, automated]) {
      writeFileSync(
        join(scratch, `${rendered.variant}.mp4`),
        Buffer.from(rendered.mp4Base64, 'base64'),
      );
    }
    writeFileSync(
      join(scratch, 'summary.json'),
      JSON.stringify(
        {
          lines,
          duckedDb: { median: median(under), min: Math.min(...under), max: Math.max(...under) },
          clearDb: {
            median: median(outside),
            min: Math.min(...outside),
            max: Math.max(...outside),
          },
          residualDb,
          automation: levels,
          notExercised: ['server export via Render /v1/timeline — needs an owner Render rebuild'],
        },
        null,
        2,
      ),
    );
    let stored = true;
    try {
      execFileSync(
        'gcloud',
        ['storage', 'cp', '--quiet', join(scratch, '*'), `${GCS_PREFIX}/${run}/`],
        { stdio: 'pipe' },
      );
    } catch (error) {
      stored = false;
      lines.push(`FAIL  outputs stored in GCS — ${String(error).slice(0, 300)}`);
    }
    check('outputs: masters and summary stored in GCS', stored, `${GCS_PREFIX}/${run}/`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  lines.push(
    'NOT EXERCISED  server export of ducking — Render /v1/timeline serves the compositor bundled into the Render image, which the owner must rebuild',
  );
  rec.notes.push(
    'NOT EXERCISED: automatic speech detection, audio preview, editor control/store latency, or production Backend/Frontend. Tone fixtures isolate gain accuracy; they are not speech-detection accuracy evidence. Server export requires its separate mode.',
  );
  rec.print();
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  const failed = lines.filter((line) => line.startsWith('FAIL')).length;
  console.log(
    [
      ...lines,
      `videoeditor:audio:render:bench — ${passed} passed, ${failed} failed, 1 not exercised`,
    ].join('\n'),
  );
});

// ── Server-export mode ──────────────────────────────────────────────────────────────────

const SERVER_EXPORT = process.env.AUDIO_RENDER_SERVER_EXPORT?.replace(/\/+$/, '');
const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const BUCKET = process.env.AI_STUDIO_BUCKET ?? 'brand-profile-assets';
const BACKEND_DIR = resolve(process.cwd(), '../Continuum-Backend');
/** "Solicita tu Day Pass en Vivo 4047" (6.6 s) — the picture only; its own audio is off. */
const PICTURE_ASSET_ID = 'd0cae5f0-d938-4825-952b-f1d24cef0069';
const TONE_SEC = 8;
const TONE_RATE = 48_000;

/** A mono 16-bit PCM WAV of `sampleAt(timeSec)`. */
function wav(sampleAt: (timeSec: number) => number): Buffer {
  const frames = TONE_SEC * TONE_RATE;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + frames * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(TONE_RATE, 24);
  bytes.writeUInt32LE(TONE_RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index += 1) {
    const value = Math.max(-1, Math.min(1, sampleAt(index / TONE_RATE)));
    bytes.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  return bytes;
}

// Stages files the way the Backend stages generated media: storage upload, then the Library's
// register RPC (kind audio, so no analysis). Run by Bun with the Backend's .env.
const STAGE = `
import { basename } from 'node:path';
const [backend, brand, bucket, run, ...files] = process.argv.slice(2);
const { registerGeneratedMediaAssetReceipt } = await import(backend + '/App/media/registerGeneratedAsset.ts');
const { getMediaServiceClient } = await import(backend + '/App/media/supabase.ts');
const staged = [];
for (const file of files) {
  const name = basename(file);
  const storagePath = brand + '/video-editor-bench/' + run + '/' + name;
  const bytes = await Bun.file(file).arrayBuffer();
  const { error } = await getMediaServiceClient().storage.from(bucket).upload(storagePath, bytes, { contentType: 'audio/wav' });
  if (error) throw new Error('upload failed: ' + error.message);
  const receipt = await registerGeneratedMediaAssetReceipt({
    brandId: brand, kind: 'audio', bucket, storagePath, fileName: name, mimeType: 'audio/wav',
    durationMs: ${TONE_SEC * 1000}, sizeBytes: bytes.byteLength, source: 'canvas',
    operation: 'bench_fixture', title: 'bench: ' + name, tags: ['bench:videoeditor-audio-render'],
  });
  if (!receipt) throw new Error('registration failed for ' + name);
  staged.push({ id: receipt.assetId, versionId: receipt.versionId, storagePath });
}
console.log('STAGED ' + JSON.stringify(staged));
`;

/** The export's left channel at 48 kHz, decoded by ffmpeg. */
function decodeLeft(mp4: string): Float32Array {
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      mp4,
      '-map',
      '0:a:0',
      '-af',
      'pan=mono|c0=c0',
      '-ar',
      '48000',
      '-f',
      'f32le',
      '-',
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

test('server export: a ducked bed on a deployed Render revision, judged on the decoded MP4', async () => {
  test.skip(
    !SERVER_EXPORT,
    'set AUDIO_RENDER_SERVER_EXPORT=<Render URL> for the server-export mode',
  );
  test.setTimeout(1_200_000);
  const renderUrl = SERVER_EXPORT ?? '';
  const { url: supabaseUrl, serviceRoleKey } = loadProdSupabaseEnv();
  process.env.SUPABASE_URL = supabaseUrl;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const media = admin.schema('media');
  const run = `server-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const scratch = mkdtempSync(join(tmpdir(), 'video-editor-audio-server-'));
  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
    expect.soft(ok, `${name}: ${detail}`).toBe(true);
  };
  const staged: { id: string; versionId: string; storagePath: string }[] = [];
  let projectId: string | null = null;
  let backend: Server | null = null;
  const summary: Record<string, unknown> = { renderUrl, run };
  try {
    let revision = 'unknown';
    try {
      const token = execFileSync('gcloud', ['auth', 'print-identity-token'], {
        encoding: 'utf8',
      }).trim();
      const health = await fetch(`${renderUrl}/health`, {
        headers: { authorization: `Bearer ${token}` },
      });
      revision = JSON.stringify(await health.json()).slice(0, 200);
    } catch (error) {
      revision = `health unreadable: ${String(error).slice(0, 120)}`;
    }
    lines.push(`NOTE  render ${renderUrl} — ${revision}`);
    summary.revision = revision;

    // ── the two tones, staged as Library audio of the bench brand ────────────────────
    const talking = (t: number) => SPEECH.some((range) => t >= range.startSec && t < range.endSec);
    writeFileSync(
      join(scratch, 'speech-220hz.wav'),
      wav((t) => (talking(t) ? 0.3 * Math.sin(2 * Math.PI * SPEECH_HZ * t) : 0)),
    );
    writeFileSync(
      join(scratch, 'bed-1khz.wav'),
      wav((t) => 0.4 * Math.sin(2 * Math.PI * MUSIC_HZ * t)),
    );
    writeFileSync(join(scratch, 'stage.ts'), STAGE);
    const out = execFileSync(
      'bun',
      [
        '--no-env-file',
        `--env-file=${BACKEND_DIR}/.env`,
        join(scratch, 'stage.ts'),
        BACKEND_DIR,
        BRAND,
        BUCKET,
        run,
        join(scratch, 'speech-220hz.wav'),
        join(scratch, 'bed-1khz.wav'),
      ],
      { cwd: BACKEND_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    const stagedLine = out.split('\n').find((line) => line.startsWith('STAGED '));
    staged.push(...(JSON.parse(stagedLine?.slice(7) ?? '[]') as typeof staged));
    const [speechAsset, bedAsset] = staged;
    if (!speechAsset || !bedAsset)
      throw new Error(`staging returned ${stagedLine ?? out.slice(-300)}`);

    const { data: picture } = await media
      .from('assets')
      .select('head_version_id,duration_ms')
      .eq('id', PICTURE_ASSET_ID)
      .maybeSingle();
    const pictureRow = picture as { head_version_id: string; duration_ms: number } | null;
    if (!pictureRow) throw new Error('the bench picture asset is missing');
    const durationSec = pictureRow.duration_ms / 1_000;

    // ── a local Backend on the given Render, a project, the timeline ──────────────────
    backend = await bootBackend('http://localhost:1', { CONTINUUM_RENDER_SERVICE_URL: renderUrl });
    lines.push(`NOTE  local Backend ${backend.url} (workers off, log ${backend.log})`);
    const session = await mintSessionBundleForEmail(
      readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai',
    );
    const call = async <T>(path: string, body?: unknown): Promise<T> => {
      const response = await fetch(`${backend?.url}/api/ai-studio/video-projects${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${session.accessToken}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text) as T;
    };
    const created = await call<{ project: EditorProjectV2 }>('', {
      brandId: BRAND,
      title: `bench:videoeditor-audio-render ${run}`,
      width: 360,
      height: 640,
    });
    projectId = created.project.projectId;
    const op = <T>(name: string, body: Record<string, unknown>) =>
      call<T>(`/${projectId}/ops/${name}`, body);
    const keys = duckingKeyframes({
      clipStartSec: 0,
      clipDurationSec: durationSec,
      volume: 1,
      speech: SPEECH,
      idPrefix: 'duck',
    });
    const library = (asset: { id: string; versionId: string }) => ({
      sourceType: 'library_asset',
      assetId: asset.id,
      renditionId: asset.versionId,
    });
    await op('apply_commands', {
      expectedRevision: created.project.revision,
      commands: [
        { commandType: 'set_project_metadata', durationSec },
        {
          commandType: 'add_track',
          track: {
            id: 'video-main',
            name: 'Main video',
            kind: 'video',
            order: 0,
            clips: [
              {
                id: 'picture',
                kind: 'video',
                timelineStartSec: 0,
                durationSec,
                audioEnabled: false,
                source: {
                  sourceType: 'library_asset',
                  assetId: PICTURE_ASSET_ID,
                  renditionId: pictureRow.head_version_id,
                },
              },
            ],
          },
        },
        {
          commandType: 'add_track',
          track: {
            id: 'voice',
            name: 'Voice',
            kind: 'audio',
            order: 1,
            clips: [
              {
                id: 'speech',
                kind: 'audio',
                timelineStartSec: 0,
                durationSec,
                source: library(speechAsset),
              },
            ],
          },
        },
        {
          commandType: 'add_track',
          track: {
            id: 'bed',
            name: 'Music',
            kind: 'audio',
            order: 2,
            clips: [
              {
                id: 'music',
                kind: 'audio',
                timelineStartSec: 0,
                durationSec,
                volume: 1,
                keyframes: keys,
                source: library(bedAsset),
              },
            ],
          },
        },
      ],
    });

    const exportOnce = async (label: 'keyed' | 'unkeyed') => {
      const started = await op<{ jobId: string }>('export', { captionMode: 'none' });
      const startedMs = Date.now();
      let status = await op<{
        state: string;
        assetId?: string;
        downloadUrl?: string;
        error?: string;
      }>('export_status', { jobId: started.jobId });
      while (
        (status.state === 'queued' || status.state === 'running') &&
        Date.now() - startedMs < 600_000
      ) {
        await new Promise((done) => setTimeout(done, 3_000));
        status = await op('export_status', { jobId: started.jobId });
      }
      const wallSec = (Date.now() - startedMs) / 1_000;
      check(
        `server export (${label}) completes into a Library asset`,
        status.state === 'completed' && Boolean(status.downloadUrl),
        `job ${started.jobId} ${status.state} after ${wallSec.toFixed(1)} s${status.error ? ` — ${status.error}` : ''}`,
      );
      if (!status.downloadUrl) throw new Error(`no ${label} export to decode`);
      const file = join(scratch, `${label}.mp4`);
      writeFileSync(file, Buffer.from(await (await fetch(status.downloadUrl)).arrayBuffer()));
      return { file, pcm: decodeLeft(file), wallSec };
    };
    const keyed = await exportOnce('keyed');
    const project = await call<{ project: EditorProjectV2 }>(`/${projectId}`);
    await op('apply_commands', {
      expectedRevision: project.project.revision,
      commands: [{ commandType: 'set_keyframes', trackId: 'bed', clipId: 'music', keyframes: [] }],
    });
    const unkeyed = await exportOnce('unkeyed');

    // ── the same judgement as the browser run ─────────────────────────────────────────
    const rate = 48_000;
    const { ducked: underSpeech, clear } = windows(
      Math.min(keyed.pcm.length, unkeyed.pcm.length) / rate,
    );
    const ratio = (pcm: Float32Array, reference: Float32Array, hz: number, at: number) =>
      db(
        toneRms(pcm, rate, hz, at, at + WINDOW_SEC) /
          toneRms(reference, rate, hz, at, at + WINDOW_SEC),
      );
    const describe = (values: number[]) =>
      `median ${median(values).toFixed(2)} dB, ${Math.min(...values).toFixed(2)}…${Math.max(...values).toFixed(2)} dB over ${values.length} windows`;
    const under = underSpeech.map((at) => ratio(keyed.pcm, unkeyed.pcm, MUSIC_HZ, at));
    const outside = clear.map((at) => ratio(keyed.pcm, unkeyed.pcm, MUSIC_HZ, at));
    check(
      `server ducking: under speech the bed sits at duckTo (${DUCK_DB.toFixed(2)} dB ± 2 dB) against the unkeyed export`,
      under.length >= 15 && under.every((value) => Math.abs(value - DUCK_DB) <= 2),
      describe(under),
    );
    check(
      'server ducking: away from speech and its ramps the bed is back at full level (± 0.5 dB)',
      outside.length >= 15 && outside.every((value) => Math.abs(value) <= 0.5),
      describe(outside),
    );
    const bedRms = 0.4 / Math.SQRT2;
    const flat = [...underSpeech, ...clear].map((at) =>
      db(toneRms(unkeyed.pcm, rate, MUSIC_HZ, at, at + WINDOW_SEC) / bedRms),
    );
    check(
      'server unkeyed bed: does not duck — steady at the source level (0 dB ± 0.5) through speech and silence',
      flat.every((value) => Math.abs(value) <= 0.5),
      describe(flat),
    );
    const voice = underSpeech.map((at) => ratio(keyed.pcm, unkeyed.pcm, SPEECH_HZ, at));
    const voiceRms = underSpeech.map((at) =>
      toneRms(keyed.pcm, rate, SPEECH_HZ, at, at + WINDOW_SEC),
    );
    const quiet = clear.map((at) => toneRms(keyed.pcm, rate, SPEECH_HZ, at, at + WINDOW_SEC));
    check(
      'server speech: the voice plays in its ranges at the same level with or without the bed’s keys',
      voice.every((value) => Math.abs(value) <= 0.5) &&
        Math.min(...voiceRms) > 0.15 &&
        Math.max(...quiet) < 0.01,
      `voice Δ ${describe(voice)} · voice RMS ≥ ${Math.min(...voiceRms).toFixed(3)} in speech, ≤ ${Math.max(...quiet).toFixed(4)} outside`,
    );
    summary.duckedDb = { median: median(under), min: Math.min(...under), max: Math.max(...under) };
    summary.clearDb = {
      median: median(outside),
      min: Math.min(...outside),
      max: Math.max(...outside),
    };
    summary.unkeyedDb = { min: Math.min(...flat), max: Math.max(...flat) };
    summary.wallSec = { keyed: keyed.wallSec, unkeyed: unkeyed.wallSec };
    try {
      writeFileSync(join(scratch, 'summary.json'), JSON.stringify({ ...summary, lines }, null, 2));
      execFileSync(
        'gcloud',
        [
          'storage',
          'cp',
          '--quiet',
          keyed.file,
          unkeyed.file,
          join(scratch, 'summary.json'),
          `${GCS_PREFIX}/${run}/`,
        ],
        { stdio: 'pipe' },
      );
      lines.push(`NOTE  exports and summary in ${GCS_PREFIX}/${run}/`);
    } catch (error) {
      lines.push(`NOTE  GCS copy failed — ${String(error).slice(0, 200)}`);
    }
  } catch (error) {
    check(
      'server export ran to completion',
      false,
      error instanceof Error ? error.message.slice(0, 500) : String(error),
    );
  } finally {
    // ── cleanup + net zero, by id ──────────────────────────────────────────────────────
    try {
      backend?.stop();
      const exported: { id: string; storagePath: string }[] = [];
      if (projectId) {
        const { data: jobs } = await media
          .from('client_render_jobs')
          .select('result_asset_ids')
          .eq('source_id', projectId);
        const ids = ((jobs ?? []) as Array<{ result_asset_ids: string[] | null }>).flatMap(
          (job) => job.result_asset_ids ?? [],
        );
        if (ids.length > 0) {
          const { data: rows } = await media.from('assets').select('id,storage_path').in('id', ids);
          for (const row of (rows ?? []) as Array<{ id: string; storage_path: string }>)
            exported.push({ id: row.id, storagePath: row.storage_path });
        }
      }
      // Anything staged under this run's folder, even when staging stopped half way.
      const stagedPrefix = `${BRAND}/video-editor-bench/${run}`;
      const { data: stagedRows } = await media
        .from('assets')
        .select('id,storage_path')
        .eq('brand_id', BRAND)
        .like('storage_path', `${stagedPrefix}/%`);
      for (const row of (stagedRows ?? []) as Array<{ id: string; storage_path: string }>) {
        if (!staged.some((asset) => asset.id === row.id))
          staged.push({ id: row.id, versionId: '', storagePath: row.storage_path });
      }
      const { data: stagedObjects } = await admin.storage.from(BUCKET).list(stagedPrefix);
      if (stagedObjects?.length)
        await admin.storage
          .from(BUCKET)
          .remove(stagedObjects.map((entry) => `${stagedPrefix}/${entry.name}`));
      const ours = [...staged.map(({ id, storagePath }) => ({ id, storagePath })), ...exported];
      for (const table of ['preview_jobs', 'media_probe_jobs', 'asset_renditions']) {
        if (ours.length > 0)
          await media
            .from(table)
            .delete()
            .in(
              'asset_id',
              ours.map((asset) => asset.id),
            );
      }
      await removeAssets(admin, BRAND, ours);
      if (projectId) {
        await media.from('client_render_jobs').delete().eq('source_id', projectId);
        await media.from('editor_projects').delete().eq('id', projectId);
        const prefix = `${BRAND}/video-exports/${projectId}`;
        const { data: left } = await admin.storage.from(BUCKET).list(prefix);
        if (left?.length)
          await admin.storage.from(BUCKET).remove(left.map((entry) => `${prefix}/${entry.name}`));
      }
      const ids =
        ours.length > 0 ? ours.map((asset) => asset.id) : ['00000000-0000-0000-0000-000000000000'];
      const { count: leftAssets } = await media
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .in('id', ids);
      const leftObjects = (await objectsFor(BRAND, ours)).length;
      const { count: leftProjects } = await media
        .from('editor_projects')
        .select('id', { count: 'exact', head: true })
        .eq('id', projectId ?? '00000000-0000-0000-0000-000000000000');
      const { count: leftJobs } = await media
        .from('client_render_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('source_id', projectId ?? '00000000-0000-0000-0000-000000000000');
      check(
        'server net zero: no staged tone, export, storage object, render job or project left (by id)',
        (leftAssets ?? 0) === 0 &&
          leftObjects === 0 &&
          (leftProjects ?? 0) === 0 &&
          (leftJobs ?? 0) === 0,
        `assets ${leftAssets ?? 0}/${ours.length} (${staged.length} staged, ${exported.length} exported), objects ${leftObjects}, project ${leftProjects ?? 0}, render jobs ${leftJobs ?? 0}`,
      );
    } catch (error) {
      check('server cleanup', false, error instanceof Error ? error.message : String(error));
    }
    rmSync(scratch, { recursive: true, force: true });
  }
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  const failed = lines.filter((line) => line.startsWith('FAIL')).length;
  console.log(
    [
      ...lines,
      `videoeditor:audio:render:bench (server export) — ${passed} passed, ${failed} failed`,
    ].join('\n'),
  );
});
