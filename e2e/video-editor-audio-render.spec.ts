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
// NOT EXERCISED: server export. Render's /v1/timeline serves the compositor bundled into
// the Render image (timeline-editor.js), which the owner rebuilds.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DUCKING } from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import type { AudioRenderRun } from './support/videoEditorAudioRenderEntry';

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
  const current = bundle(false);
  const baseline = bundle(true);
  const render = async (code: string, variant: 'ducked' | 'plain') => {
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

  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
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

  const run = `render-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const scratch = mkdtempSync(join(tmpdir(), 'video-editor-audio-render-'));
  try {
    for (const rendered of [ducked, plain]) {
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
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  const failed = lines.filter((line) => line.startsWith('FAIL')).length;
  console.log(
    [
      ...lines,
      `videoeditor:audio:render:bench — ${passed} passed, ${failed} failed, 1 not exercised`,
    ].join('\n'),
  );
});
