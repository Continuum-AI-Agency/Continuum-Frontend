// Browser half of videoeditor:audio:render:bench. It builds a V2 project with a picture, a
// "speech" audio clip (a 220 Hz tone only while someone talks) and a steady 1 kHz music bed,
// ducks the bed with the contract's `duckingKeyframes`, and exports it through the REAL
// executor plan and splice compositor. It hands back the decoded mix (mono PCM) and a few
// frame colours; the Playwright spec does every measurement.
//
// The same bundle is built twice: once from this tree, once with the mixer as it was before
// ducking (the spec swaps `audioMix.ts` for the baseline revision), so an unkeyed clip can be
// compared sample for sample against the old code.

import {
  createEditorProjectV2,
  duckingKeyframes,
  editorProjectV2Schema,
  type SpeechRange,
} from '@continuum/contracts';
import {
  addKeyEdit,
  easeKeyEdit,
  valueKeyEdit,
} from '../../src/components/video-studio/motion/keyframeEdits';
import { buildTimelineEditorRenderPlan } from '../../src/lib/client-render/executors/timelineEditor';
import { videoTimelineItems } from '../../src/StudioCanvas/nodes/timeline/editorProjectV2AssemblyModel';
import { buildEditorProjectV2AudioPreviewPlan } from '../../src/StudioCanvas/nodes/timeline/useEditorProjectV2AudioPreview';
import { computeLayout } from '../../src/StudioCanvas/nodes/timeline/useTimelineEditorModel';
import { TimelineWebAudioPreviewEngine } from '../../src/StudioCanvas/nodes/timeline/webAudioPreviewEngine';
import { simulate } from '../../src/StudioCanvas/nodes/timeline/workspace/timelineEdits';
import { calibratedAacConfig } from '../../src/StudioCanvas/utils/splice/aacTiming';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 15;
const RATE = 48_000;
const DURATION_SEC = 8;
const PICTURE = '#1f6feb';
const MUSIC_HZ = 1_000;
const MUSIC_AMPLITUDE = 0.4;
const SPEECH_HZ = 220;
const SPEECH_AMPLITUDE = 0.3;
/** Timeline seconds someone is talking. */
const SPEECH: SpeechRange[] = [
  { startSec: 2, endSec: 3.5 },
  { startSec: 5, endSec: 6 },
];

export type AudioRenderRun = {
  variant: 'ducked' | 'plain' | 'automated' | 'video-automated' | 'video-plain' | 'video-solo';
  keyframes: { timeSec: number; value: number }[];
  audioTracks: number;
  durationSec: number;
  sampleRate: number;
  decodedStartSec: number;
  /** The mix's left channel as little-endian Float32. */
  pcmBase64: string;
  mp4Base64: string;
  previewPcmBase64?: string;
  previewSeekPcmBase64?: string;
  /** Mean RGB of the whole frame at 1, 2.5, 4 and 5.5 s. */
  frames: [number, number, number][];
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

async function encodeSolidVideo(embeddedAudio = false): Promise<Blob> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_MEDIUM } = await import(
    'mediabunny'
  );
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for source encoding');
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  const mb = await import('mediabunny');
  const audio = embeddedAudio
    ? new mb.AudioSampleSource(await calibratedAacConfig(mb, 192_000))
    : undefined;
  if (audio) output.addAudioTrack(audio);
  await output.start();
  for (let frame = 0; frame < DURATION_SEC * FPS; frame += 1) {
    context.fillStyle = PICTURE;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    await source.add(frame / FPS, 1 / FPS);
  }
  if (audio) {
    const data = new Float32Array(DURATION_SEC * RATE);
    for (let index = 0; index < data.length; index += 1)
      data[index] = 0.35 * Math.sin((2 * Math.PI * 1500 * index) / RATE);
    const sample = new mb.AudioSample({
      data,
      format: 'f32-planar',
      numberOfChannels: 1,
      sampleRate: RATE,
      timestamp: 0,
    });
    try {
      await audio.add(sample);
    } finally {
      sample.close();
    }
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Source encoder returned no bytes');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}

/** Encoded fixture audio; automation uses AAC so source seeks exercise decoder pre-roll. */
async function encodeAudio(sampleAt: (timeSec: number) => number, aac = false): Promise<Blob> {
  const mb = await import('mediabunny');
  const { Output, BufferTarget, WavOutputFormat, Mp4OutputFormat, AudioSampleSource, AudioSample } =
    mb;
  const output = new Output({
    format: aac ? new Mp4OutputFormat() : new WavOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new AudioSampleSource(
    aac ? await calibratedAacConfig(mb, 192_000) : { codec: 'pcm-s16' },
  );
  output.addAudioTrack(source);
  await output.start();
  const frames = DURATION_SEC * RATE;
  const data = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) data[index] = sampleAt(index / RATE);
  const sample = new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: 1,
    sampleRate: RATE,
    timestamp: 0,
  });
  await source.add(sample);
  sample.close();
  await output.finalize();
  if (!output.target.buffer) throw new Error('Fixture audio encoder returned no bytes');
  return new Blob([output.target.buffer], { type: aac ? 'audio/mp4' : 'audio/wav' });
}

const talking = (timeSec: number) =>
  SPEECH.some((range) => timeSec >= range.startSec && timeSec < range.endSec);

const source = (id: string) => ({
  sourceType: 'library_asset' as const,
  assetId: `asset-${id}`,
  renditionId: `version-${id}`,
});

function audioProject(variant: AudioRenderRun['variant']) {
  const created = createEditorProjectV2({
    projectId: '00000000-0000-4000-8000-000000000779',
    title: 'Ducking proof',
    width: WIDTH,
    height: HEIGHT,
    now: '2026-09-30T12:00:00.000Z',
  });
  const keyframes =
    variant === 'ducked'
      ? duckingKeyframes({
          clipStartSec: 0,
          clipDurationSec: DURATION_SEC,
          volume: 1,
          speech: SPEECH,
          idPrefix: 'duck',
        })
      : [];
  let project = editorProjectV2Schema.parse({
    ...created,
    durationSec: DURATION_SEC,
    exportSettings: {
      ...created.exportSettings,
      width: WIDTH,
      height: HEIGHT,
      videoBitrateKbps: 1_000,
    },
    tracks: [
      {
        id: 'main',
        name: 'Main',
        order: 0,
        kind: 'video',
        clips: [
          {
            id: 'picture',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: DURATION_SEC,
            source: source('picture'),
            audioEnabled: variant.startsWith('video-'),
            ...(variant.startsWith('video-')
              ? { sourceInSec: 1, playbackRate: 0.75, volume: 0.65, fadeInSec: 1, fadeOutSec: 0.5 }
              : {}),
          },
        ],
      },
      {
        id: 'voice',
        name: 'Voice',
        order: 1,
        kind: 'audio',
        clips: [
          {
            id: 'speech',
            kind: 'audio',
            timelineStartSec: 0,
            durationSec: DURATION_SEC,
            source: source('speech'),
          },
        ],
      },
      {
        id: 'bed',
        name: 'Music',
        solo: variant === 'video-solo',
        order: 2,
        kind: 'audio',
        clips: [
          {
            id: 'music',
            kind: 'audio',
            timelineStartSec: variant === 'automated' ? 1 : 0,
            durationSec: variant === 'automated' ? 6 : DURATION_SEC,
            sourceInSec: variant === 'automated' ? 0.5 : 0,
            playbackRate: variant === 'automated' ? 1.25 : 1,
            source: source('music'),
            volume: 1,
            keyframes,
          },
        ],
      },
    ],
  });
  if (variant === 'automated' || variant === 'video-automated') {
    const target = variant === 'video-automated' ? 'picture' : 'music';
    for (const [timeSec, value] of [
      [0, 0.8],
      [1, 0.8],
      [2, 0.2],
      [3, 0.2],
      [4, 0.6],
      [5, 0.6],
      [6, 1],
      ...(variant === 'video-automated' ? [[8, 0.4]] : []),
    ]) {
      const added = addKeyEdit(project, target, 'volume', timeSec);
      if (!added) throw new Error('Audio volume key was not editable.');
      project = simulate(project, added.forward);
      const changed = valueKeyEdit(project, target, 'volume', timeSec, value);
      if (!changed) throw new Error('Audio volume value was not editable.');
      project = simulate(project, changed.forward);
    }
    const eased = easeKeyEdit(project, target, 'volume', 3, {
      interpolation: 'bezier',
      easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
    });
    if (!eased) throw new Error('Audio volume easing was not editable.');
    project = simulate(project, eased.forward);
  }
  return project;
}

async function meanRgb(
  input: InstanceType<typeof import('mediabunny')['Input']>,
  atSec: number,
): Promise<[number, number, number]> {
  const { CanvasSink } = await import('mediabunny');
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Rendered master has no video track');
  const wrapped = await new CanvasSink(track).getCanvas(atSec);
  if (!wrapped) throw new Error(`No decodable frame at ${atSec}s`);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for verification');
  context.drawImage(wrapped.canvas, 0, 0, WIDTH, HEIGHT);
  const data = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const sum: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) {
    sum[0] += data[index] ?? 0;
    sum[1] += data[index + 1] ?? 0;
    sum[2] += data[index + 2] ?? 0;
  }
  const pixels = data.length / 4;
  return [sum[0] / pixels, sum[1] / pixels, sum[2] / pixels];
}

/** The mix's left channel, decoded from the exported master. */
async function decodedLeft(
  input: InstanceType<typeof import('mediabunny')['Input']>,
): Promise<{ pcm: Float32Array; sampleRate: number; decodedStartSec: number }> {
  const { AudioSampleSink } = await import('mediabunny');
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('Rendered master has no audio track');
  const chunks: { at: number; pcm: Float32Array }[] = [];
  let sampleRate = RATE;
  let decodedStartSec = Number.NaN;
  for await (const sample of new AudioSampleSink(track).samples()) {
    sampleRate = sample.sampleRate;
    if (!Number.isFinite(decodedStartSec)) decodedStartSec = sample.timestamp;
    const plane = new Float32Array(sample.numberOfFrames);
    sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
    chunks.push({ at: Math.round(sample.timestamp * sampleRate), pcm: plane });
    sample.close();
  }
  const pcm = new Float32Array(Math.max(0, ...chunks.map((chunk) => chunk.at + chunk.pcm.length)));
  for (const chunk of chunks) {
    // Respect presentation timestamps: discard negative priming and retain any timeline gaps.
    pcm.set(chunk.pcm.subarray(Math.max(0, -chunk.at)), Math.max(0, chunk.at));
  }
  return { pcm, sampleRate, decodedStartSec };
}

export async function runAudioRender(variant: AudioRenderRun['variant']): Promise<AudioRenderRun> {
  const blobs = new Map([
    ['picture', await encodeSolidVideo(variant.startsWith('video-'))],
    [
      'speech',
      await encodeAudio((t) =>
        talking(t) ? SPEECH_AMPLITUDE * Math.sin(2 * Math.PI * SPEECH_HZ * t) : 0,
      ),
    ],
    [
      'music',
      await encodeAudio(
        (t) => MUSIC_AMPLITUDE * Math.sin(2 * Math.PI * MUSIC_HZ * t),
        variant === 'automated',
      ),
    ],
  ]);
  const urls = new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
  try {
    const project = audioProject(variant);
    const ids = [...blobs.keys()];
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: ids.map((sourceId) => ({
        sourceId,
        sourceAssetId: `asset-${sourceId}`,
        sourceRevision: `version-${sourceId}`,
        storage: { bucket: 'bench', path: sourceId },
      })),
      signedUrls: new Map(ids.map((id) => [`bench\n${id}`, urls.get(id) ?? ''])),
      signal: new AbortController().signal,
    });
    const rendered = await composeTimeline({
      ...plan,
      videoBitrate: 1_000_000,
      audioBitrate: 192_000,
      targetWidth: WIDTH,
      targetHeight: HEIGHT,
      frameRate: 30,
    });
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
    try {
      const { pcm, sampleRate, decodedStartSec } = await decodedLeft(input);
      let previewPcmBase64: string | undefined;
      let previewSeekPcmBase64: string | undefined;
      if (variant.startsWith('video-') || variant === 'automated') {
        const previewPlan = buildEditorProjectV2AudioPreviewPlan({
          project,
          layout: computeLayout(videoTimelineItems(project), () => DURATION_SEC, 80),
          blobsByClipId: blobs,
        });
        const renderPreview = async (from: number) => {
          const context = new OfflineAudioContext(2, (DURATION_SEC - from) * RATE, RATE);
          const engine = new TimelineWebAudioPreviewEngine(context);
          try {
            if (!(await engine.play(previewPlan, from)))
              throw new Error('Preview did not schedule audio.');
            const buffer = await context.startRendering();
            return toBase64(new Uint8Array(buffer.getChannelData(0).buffer));
          } finally {
            await engine.dispose();
          }
        };
        previewPcmBase64 = await renderPreview(0);
        previewSeekPcmBase64 = await renderPreview(3.5);
      }
      const music = project.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === (variant.startsWith('video-') ? 'picture' : 'music'));
      return {
        variant,
        ...(previewPcmBase64 ? { previewPcmBase64, previewSeekPcmBase64 } : {}),
        keyframes:
          music && 'keyframes' in music
            ? music.keyframes.map((key) => ({ timeSec: key.timeSec, value: Number(key.value) }))
            : [],
        audioTracks: plan.audioTracks.length,
        durationSec: await input.computeDuration(),
        sampleRate,
        decodedStartSec,
        pcmBase64: toBase64(new Uint8Array(pcm.buffer)),
        mp4Base64: toBase64(new Uint8Array(await rendered.blob.arrayBuffer())),
        frames: [
          await meanRgb(input, 1),
          await meanRgb(input, 2.5),
          await meanRgb(input, 4),
          await meanRgb(input, 5.5),
        ],
      };
    } finally {
      input.dispose();
      URL.revokeObjectURL(rendered.objectUrl);
    }
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

export const AUDIO_RENDER = {
  DURATION_SEC,
  PICTURE,
  MUSIC_HZ,
  MUSIC_AMPLITUDE,
  SPEECH_HZ,
  SPEECH,
};

declare global {
  interface Window {
    __audioRenderBench: { run: typeof runAudioRender };
  }
}

window.__audioRenderBench = { run: runAudioRender };
