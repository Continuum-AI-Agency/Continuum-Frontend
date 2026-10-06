// Browser half of videoeditor:motion:render:bench. It builds a V2 project that uses the
// motion vocabulary (text entrances and exits, text keyframes, a crossfade, a VHS look, a
// boxed text with a drop shadow), renders it through the REAL executor plan and splice
// compositor, and measures decoded frames by pixels and bounding boxes (never OCR). The
// Playwright spec asserts on the numbers.

import {
  createEditorProjectV2,
  editorProjectV2Schema,
  LOOK_EFFECTS,
  type LookEffectId,
  lookEffectInstance,
  TEXT_ANIMATION_IDS,
} from '@continuum/contracts';
import {
  buildTimelineEditorRenderPlan,
  textCueFor,
} from '../../src/lib/client-render/executors/timelineEditor';
import { registerCaptionFonts } from '../../src/lib/clips/captionFonts';
import { simulate } from '../../src/StudioCanvas/nodes/timeline/workspace/timelineEdits';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';
import { drawActiveCaption } from '../../src/StudioCanvas/utils/splice/drawCaptions';
import { runTimelineInWorker } from '../../src/StudioCanvas/workers/spliceWorkerClient';

const WIDTH = 360;
const HEIGHT = 640;
const SOURCE_FPS = 15;
const BLUE = '#12366b';
const RED = '#7a1830';
const TEXT_GREEN = '#20ff60';
const FONT_PX = 44;
const DURATION_SEC = 7;
/** Text layers T1–T4 sit in the top half; the boxed T5 in the bottom half. */
const TOP_BAND: Band = { top: 0, bottom: 360 };
const BOTTOM_BAND: Band = { top: 400, bottom: 560 };
const CLEAR_BAND: Band = { top: 580, bottom: 640 };

export type Band = { top: number; bottom: number };
export type TextBox = {
  timeSec: number;
  /** Pixels that read as the green text (green over red and blue by 30+). */
  count: number;
  /** Sum of that green excess: falls with alpha even before pixels drop out. */
  mass: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type MotionRenderRun = {
  variant: 'control' | 'styled';
  plan: { items: number; overlays: number; captionCues: number };
  durationSec: number;
  mp4Base64: string;
  snapshots: Array<{ timeSec: number; meanRgbError: number; durationMs: number }>;
  slideUp: TextBox[];
  slideUpHold: TextBox[];
  typewriter: TextBox[];
  exit: TextBox[];
  keyframed: TextBox[];
  crossfade: {
    blue: [number, number, number];
    mid: [number, number, number];
    red: [number, number, number];
  };
  /** Mean absolute RGB difference is taken spec-side between the two variants. */
  clearBand: number[];
  boxYellowPixels: number;
  boxBandLuma: number;
};

async function encodeSolidVideo(color: string, durationSec: number): Promise<Blob> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_MEDIUM } = await import(
    'mediabunny'
  );
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for source encoding');
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  await output.start();
  for (let frame = 0; frame < Math.round(durationSec * SOURCE_FPS); frame += 1) {
    context.fillStyle = color;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    await source.add(frame / SOURCE_FPS, 1 / SOURCE_FPS);
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Source encoder returned no bytes');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}

const source = (id: string) => ({
  sourceType: 'library_asset' as const,
  assetId: `asset-${id}`,
  renditionId: `version-${id}`,
});

const textClip = (
  id: string,
  text: string,
  timelineStartSec: number,
  durationSec: number,
  extra: Record<string, unknown> = {},
  style: Record<string, unknown> = {},
  y = 0.3,
) => ({
  id,
  kind: 'text',
  timelineStartSec,
  durationSec,
  text,
  style: {
    fontFamily: 'Arial',
    fontSizePx: FONT_PX,
    fontWeight: 900,
    color: TEXT_GREEN,
    outlineWidthPx: 0,
    ...style,
  },
  transform: { position: { x: 0.5, y, unit: 'normalized' } },
  ...extra,
});

/** The timeline both variants share; `styled` adds the VHS look and the drop shadow. */
function motionProject(styled: boolean) {
  const created = createEditorProjectV2({
    projectId: '00000000-0000-4000-8000-000000000777',
    title: 'Motion render proof',
    width: WIDTH,
    height: HEIGHT,
    now: '2026-09-30T12:00:00.000Z',
  });
  return editorProjectV2Schema.parse({
    ...created,
    durationSec: DURATION_SEC,
    exportSettings: {
      ...created.exportSettings,
      width: WIDTH,
      height: HEIGHT,
      videoBitrateKbps: 2_000,
      captionMode: 'burn_in',
    },
    tracks: [
      {
        id: 'main',
        name: 'Main',
        order: 0,
        kind: 'video',
        clips: [
          {
            id: 'first',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: 3.5,
            source: source('first'),
            audioEnabled: false,
          },
          {
            id: 'second',
            kind: 'video',
            timelineStartSec: 3,
            durationSec: 4,
            source: source('second'),
            audioEnabled: false,
            effects: styled
              ? [
                  {
                    id: 'look-vhs',
                    effectType: 'video_filter',
                    effectId: 'vhs',
                    parameters: { amount: 0.6 },
                  },
                ]
              : [],
          },
        ],
      },
      {
        id: 'titles',
        name: 'Titles',
        order: 1,
        kind: 'text',
        clips: [
          textClip('slide-up', 'SLIDE UP', 0.2, 1.4, { animationIn: 'slide-up' }),
          textClip('typewriter', 'TYPEWRITER GOES', 1.7, 1.5, { animationIn: 'typewriter' }),
          textClip('exit', 'EXIT', 3.3, 1.3, { animationOut: 'slide-down' }),
          textClip('keyframed', 'MOVE', 4.7, 1.5, {
            keyframes: [
              {
                id: 'from',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.25, y: 0.3 },
                interpolation: 'linear',
              },
              {
                id: 'to',
                property: 'transform.position',
                timeSec: 1.5,
                value: { x: 0.75, y: 0.3 },
                interpolation: 'linear',
              },
            ],
          }),
        ],
      },
      {
        id: 'cards',
        name: 'Cards',
        order: 2,
        kind: 'text',
        clips: [
          textClip(
            'boxed',
            'BOXED',
            0.2,
            6.7,
            {},
            {
              backgroundColor: '#ffd400',
              ...(styled ? { shadowColor: 'rgba(0,0,0,0.85)', shadowBlurPx: 10 } : {}),
            },
            0.75,
          ),
        ],
      },
    ],
    transitions: [
      {
        id: 'blend',
        trackId: 'main',
        fromClipId: 'first',
        toClipId: 'second',
        transitionType: 'crossfade',
        durationSec: 0.5,
      },
    ],
  });
}

async function framePixels(
  input: InstanceType<typeof import('mediabunny')['Input']>,
  atSec: number,
): Promise<Uint8ClampedArray> {
  const { CanvasSink } = await import('mediabunny');
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Rendered master has no video track');
  const wrapped = await new CanvasSink(track).getCanvas(atSec);
  if (!wrapped) throw new Error(`No decodable frame at ${atSec}s`);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for verification');
  context.drawImage(wrapped.canvas, 0, 0, WIDTH, HEIGHT);
  return context.getImageData(0, 0, WIDTH, HEIGHT).data;
}

function textBox(pixels: Uint8ClampedArray, band: Band, timeSec: number): TextBox {
  const box = { timeSec, count: 0, mass: 0, left: WIDTH, right: -1, top: HEIGHT, bottom: -1 };
  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const excess =
        (pixels[offset + 1] ?? 0) - Math.max(pixels[offset] ?? 0, pixels[offset + 2] ?? 0);
      if (excess <= 30) continue;
      box.count += 1;
      box.mass += excess;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }
  return box;
}

const pixelAt = (pixels: Uint8ClampedArray, x: number, y: number): [number, number, number] => {
  const offset = (y * WIDTH + x) * 4;
  return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
};

function bandRgb(pixels: Uint8ClampedArray, band: Band): number[] {
  const out: number[] = [];
  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      out.push(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
    }
  }
  return out;
}

function bandStats(pixels: Uint8ClampedArray, band: Band): { yellow: number; luma: number } {
  let yellow = 0;
  let luma = 0;
  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const [red, green, blue] = [
        pixels[offset] ?? 0,
        pixels[offset + 1] ?? 0,
        pixels[offset + 2] ?? 0,
      ];
      if (red > 200 && green > 160 && blue < 90) yellow += 1;
      luma += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }
  }
  return { yellow, luma: luma / ((band.bottom - band.top) * WIDTH) };
}

/** Mid-frame times: frame k of the 30 fps master covers [k/30, (k+1)/30). */
const frameTimes = (fromSec: number, toSec: number, stepSec: number): number[] => {
  const times: number[] = [];
  for (let t = fromSec; t <= toSec + 1e-9; t += stepSec) {
    times.push((Math.floor(t * 30 + 1e-6) + 0.5) / 30);
  }
  return times;
};

export async function runMotionRender(variant: 'control' | 'styled'): Promise<MotionRenderRun> {
  const blobs = new Map([
    ['first', await encodeSolidVideo(BLUE, 3.5)],
    ['second', await encodeSolidVideo(RED, 4)],
  ]);
  const urls = new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
  try {
    const ids = [...blobs.keys()];
    const plan = await buildTimelineEditorRenderPlan({
      project: motionProject(variant === 'styled'),
      jobInputs: ids.map((sourceId) => ({
        sourceId,
        sourceAssetId: `asset-${sourceId}`,
        sourceRevision: `version-${sourceId}`,
        storage: { bucket: 'bench', path: sourceId },
      })),
      signedUrls: new Map(ids.map((id) => [`bench\n${id}`, urls.get(id) ?? ''])),
      signal: new AbortController().signal,
    });
    // What the worker does before its first draw: the plan's faces, registered.
    await registerCaptionFonts(plan.captionFonts);
    const rendered = await composeTimeline({
      ...plan,
      videoBitrate: 2_000_000,
      audioBitrate: 128_000,
      targetWidth: WIDTH,
      targetHeight: HEIGHT,
      frameRate: 30,
    });
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
    try {
      const boxes = async (times: number[], band: Band) => {
        const out: TextBox[] = [];
        for (const t of times) out.push(textBox(await framePixels(input, t), band, t));
        return out;
      };
      const at = (t: number) => framePixels(input, (Math.floor(t * 30) + 0.5) / 30);
      const [blueFrame, midFrame, redFrame, clearFrame, boxFrame] = [
        await at(2.5),
        await at(3.25),
        await at(4.0),
        await at(5.0),
        await at(2.0),
      ];
      const box = bandStats(boxFrame, BOTTOM_BAND);
      const bytes = new Uint8Array(await rendered.blob.arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const snapshots = [];
      for (const timeSec of [0.8, 98 / 30, 5]) {
        const started = performance.now();
        const snapshot = await composeTimeline({
          ...plan,
          targetWidth: WIDTH,
          targetHeight: HEIGHT,
          frameTimeSec: timeSec,
        });
        try {
          const bitmap = await createImageBitmap(snapshot.blob);
          const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('No snapshot comparison canvas.');
          try {
            ctx.drawImage(bitmap, 0, 0);
          } finally {
            bitmap.close();
          }
          const actual = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
          const expected = await at(timeSec);
          let error = 0;
          for (let pixel = 0; pixel < actual.length; pixel += 4) {
            for (let channel = 0; channel < 3; channel += 1)
              error += Math.abs(actual[pixel + channel] - expected[pixel + channel]);
          }
          snapshots.push({
            timeSec,
            meanRgbError: error / (WIDTH * HEIGHT * 3),
            durationMs: performance.now() - started,
          });
        } finally {
          URL.revokeObjectURL(snapshot.objectUrl);
        }
      }
      return {
        variant,
        snapshots,
        plan: {
          items: plan.items.length,
          overlays: plan.overlays.length,
          captionCues: plan.captionCues.length,
        },
        durationSec: await input.computeDuration(),
        mp4Base64: btoa(binary),
        // slide-up enters over 0.2–0.6 s, then holds until 1.6 s.
        slideUp: await boxes(frameTimes(0.2, 0.6, 1 / 30), TOP_BAND),
        slideUpHold: await boxes([0.8, 1.1, 1.4], TOP_BAND),
        // typewriter types over 1.7–2.5 s.
        typewriter: await boxes(frameTimes(1.75, 2.6, 0.1), TOP_BAND),
        // exit slides down and fades over 4.2–4.6 s, before the clip ends at 4.6 s.
        exit: await boxes([4.0, ...frameTimes(4.4, 4.58, 1 / 30)], TOP_BAND),
        // keyframed moves x 0.25 → 0.75 over 4.7–6.2 s.
        keyframed: await boxes([4.8, 5.45, 6.1], TOP_BAND),
        crossfade: {
          blue: pixelAt(blueFrame, 20, 20),
          mid: pixelAt(midFrame, 20, 20),
          red: pixelAt(redFrame, 20, 20),
        },
        clearBand: bandRgb(clearFrame, CLEAR_BAND),
        boxYellowPixels: box.yellow,
        boxBandLuma: box.luma,
      };
    } finally {
      input.dispose();
      URL.revokeObjectURL(rendered.objectUrl);
    }
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

/** Every entrance the contract names, one after another, each on its own 1.1 s text clip. */
const ENTRANCES = TEXT_ANIMATION_IDS;
const ENTRANCE_SEC = 1.1;

export type EntranceSample = { id: string; early: TextBox; settled: TextBox };

/** Each entrance sampled 0.1 s in and once it has settled, on a plain blue ground. */
export async function runEntrances(direction: 'in' | 'out' = 'in'): Promise<EntranceSample[]> {
  const total = ENTRANCES.length * ENTRANCE_SEC;
  const ground = await encodeSolidVideo(BLUE, total);
  const url = URL.createObjectURL(ground);
  const created = createEditorProjectV2({
    projectId: '00000000-0000-4000-8000-000000000778',
    title: 'Entrance vocabulary proof',
    width: WIDTH,
    height: HEIGHT,
    now: '2026-09-30T12:00:00.000Z',
  });
  const project = editorProjectV2Schema.parse({
    ...created,
    durationSec: total,
    exportSettings: {
      ...created.exportSettings,
      width: WIDTH,
      height: HEIGHT,
      videoBitrateKbps: 2_000,
      captionMode: 'burn_in',
    },
    tracks: [
      {
        id: 'main',
        name: 'Main',
        order: 0,
        kind: 'video',
        clips: [
          {
            id: 'ground',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: total,
            source: source('ground'),
            audioEnabled: false,
          },
        ],
      },
      {
        id: 'titles',
        name: 'Titles',
        order: 1,
        kind: 'text',
        clips: ENTRANCES.map((id, index) =>
          textClip(`in-${id}`, 'WORD POP', index * ENTRANCE_SEC, ENTRANCE_SEC, {
            ...(direction === 'in' ? { animationIn: id } : { animationOut: id }),
          }),
        ),
      },
    ],
  });
  try {
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: [
        {
          sourceId: 'ground',
          sourceAssetId: 'asset-ground',
          sourceRevision: 'version-ground',
          storage: { bucket: 'bench', path: 'ground' },
        },
      ],
      signedUrls: new Map([['bench\nground', url]]),
      signal: new AbortController().signal,
    });
    // What the worker does before its first draw: the plan's faces, registered.
    await registerCaptionFonts(plan.captionFonts);
    const rendered = await composeTimeline({
      ...plan,
      videoBitrate: 2_000_000,
      audioBitrate: 128_000,
      targetWidth: WIDTH,
      targetHeight: HEIGHT,
      frameRate: 30,
    });
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
    try {
      const samples: EntranceSample[] = [];
      for (const [index, id] of ENTRANCES.entries()) {
        const start = index * ENTRANCE_SEC;
        const at = (sec: number) => (Math.floor((start + sec) * 30) + 0.5) / 30;
        samples.push({
          id,
          early: textBox(
            await framePixels(input, at(direction === 'in' ? 0.1 : 1.05)),
            TOP_BAND,
            at(direction === 'in' ? 0.1 : 1.05),
          ),
          settled: textBox(
            await framePixels(input, at(direction === 'in' ? 0.95 : 0.1)),
            TOP_BAND,
            at(direction === 'in' ? 0.95 : 0.1),
          ),
        });
      }
      return samples;
    } finally {
      input.dispose();
      URL.revokeObjectURL(rendered.objectUrl);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The server-export comparison: the Backend bench built a project with the real ops and had
 * Render export it. This renders the SAME project from the SAME source files in the browser
 * and measures both masters with the same judges, frame for frame.
 */
export type ServerCompareInput = {
  project: unknown;
  /** By clip id: where the page fetches the file, and the Library pin it plays. */
  sources: Record<string, { url: string; assetId: string; versionId: string }>;
  serverUrl: string;
  samples: {
    texts: Array<{ name: string; clipId?: string; times: number[]; settledAt: number }>;
    keyed: number[];
    crossfadeAt: number;
    lookAt: number;
  };
};

type Measured = { name: string; frames: TextBox[]; settled: TextBox };
type Master = {
  texts: Measured[];
  keyed: TextBox[];
  crossfade: number[];
  /** Clip 2's look in a clear band: its mean colour and its luma spread (VHS noise). */
  look: { mean: number[]; spread: number };
};

export type ServerCompareRun = {
  client: Master;
  server: Master;
  serverSize: { width: number; height: number; durationSec: number };
  /**
   * Each text's settled cue drawn by the real draw path twice — in the face the export
   * loaded, and in the fallback stack a missing face would leave — so a frame's line width
   * says which face drew it.
   */
  faces: Array<{ name: string; face: TextBox; fallback: TextBox }>;
  clientMp4Base64: string;
};

/** A cue's settled line, drawn in its own face or in the fallback stack, measured. */
function probeFace(
  project: { canvas: { width: number; height: number }; tracks: unknown[] },
  clipId: string,
  atSec: number,
  fallback: boolean,
): TextBox {
  const clip = (project.tracks as Array<{ clips: Array<{ id: string; kind: string }> }>)
    .flatMap((track) => track.clips)
    .find((entry) => entry.id === clipId);
  if (!clip || clip.kind !== 'text') throw new Error(`no text clip ${clipId}`);
  const cue = textCueFor(clip as Parameters<typeof textCueFor>[0], project.canvas.height);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for the face probe');
  context.fillStyle = '#1e1e1e';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawActiveCaption(
    context,
    fallback ? { ...cue, style: { ...cue.style, fontFamily: 'Continuum Missing Face' } } : cue,
    atSec,
    WIDTH,
    HEIGHT,
  );
  return textBox(context.getImageData(0, 0, WIDTH, HEIGHT).data, TOP_BAND, atSec);
}

/** A band's mean colour and luma spread — a solid picture spreads ~0, VHS noise does not. */
function bandLook(pixels: Uint8ClampedArray, band: Band): Master['look'] {
  const total = [0, 0, 0];
  let lumaSum = 0;
  let squares = 0;
  let count = 0;
  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      total[0] = (total[0] ?? 0) + red;
      total[1] = (total[1] ?? 0) + green;
      total[2] = (total[2] ?? 0) + blue;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      lumaSum += luma;
      squares += luma * luma;
      count += 1;
    }
  }
  const mean = lumaSum / count;
  return {
    mean: total.map((channel) => Math.round(channel / count)),
    spread: Math.sqrt(Math.max(0, squares / count - mean * mean)),
  };
}

async function measureMaster(
  input: InstanceType<typeof import('mediabunny')['Input']>,
  samples: ServerCompareInput['samples'],
): Promise<Master> {
  const at = async (t: number, band: Band) => textBox(await framePixels(input, t), band, t);
  const texts: Measured[] = [];
  for (const text of samples.texts) {
    const frames: TextBox[] = [];
    for (const t of text.times) frames.push(await at(t, TOP_BAND));
    texts.push({ name: text.name, frames, settled: await at(text.settledAt, TOP_BAND) });
  }
  const keyed: TextBox[] = [];
  for (const t of samples.keyed) keyed.push(await at(t, TOP_BAND));
  const blend = await framePixels(input, samples.crossfadeAt);
  const look = await framePixels(input, samples.lookAt);
  return {
    texts,
    keyed,
    crossfade: pixelAt(blend, 20, 20),
    look: bandLook(look, CLEAR_BAND),
  };
}

export async function runServerCompare(input: ServerCompareInput): Promise<ServerCompareRun> {
  const project = editorProjectV2Schema.parse(input.project);
  const ids = Object.keys(input.sources);
  const plan = await buildTimelineEditorRenderPlan({
    project,
    jobInputs: ids.map((sourceId) => ({
      sourceId,
      sourceAssetId: input.sources[sourceId]?.assetId,
      sourceRevision: input.sources[sourceId]?.versionId,
      storage: { bucket: 'bench', path: sourceId },
    })),
    signedUrls: new Map(ids.map((id) => [`bench\n${id}`, input.sources[id]?.url ?? ''])),
    signal: new AbortController().signal,
  });
  await registerCaptionFonts(plan.captionFonts);
  const rendered = await composeTimeline({
    ...plan,
    videoBitrate: project.exportSettings.videoBitrateKbps * 1_000,
    audioBitrate: project.exportSettings.audioBitrateKbps * 1_000,
    targetWidth: project.exportSettings.width,
    targetHeight: project.exportSettings.height,
    frameRate: 30,
  });
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
  const client = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
  const serverBlob = await (await fetch(input.serverUrl)).blob();
  const server = new Input({ source: new BlobSource(serverBlob), formats: ALL_FORMATS });
  try {
    const track = await server.getPrimaryVideoTrack();
    const bytes = new Uint8Array(await rendered.blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return {
      client: await measureMaster(client, input.samples),
      server: await measureMaster(server, input.samples),
      faces: input.samples.texts.flatMap((text) =>
        text.clipId
          ? [
              {
                name: text.name,
                face: probeFace(project, text.clipId, text.settledAt, false),
                fallback: probeFace(project, text.clipId, text.settledAt, true),
              },
            ]
          : [],
      ),
      serverSize: {
        width: (await track?.getDisplayWidth()) ?? 0,
        height: (await track?.getDisplayHeight()) ?? 0,
        durationSec: await server.computeDuration(),
      },
      clientMp4Base64: btoa(binary),
    };
  } finally {
    client.dispose();
    server.dispose();
    URL.revokeObjectURL(rendered.objectUrl);
  }
}

export const MOTION_RENDER = { WIDTH, HEIGHT, FONT_PX, DURATION_SEC };

/** Persisted caption colours must survive the real plan and composed-frame path. */
async function runCaptionHighlights() {
  const video = URL.createObjectURL(await encodeSolidVideo(BLUE, 1));
  try {
    const base = motionProject(false);
    const results = [];
    for (const highlightMode of ['word', 'karaoke', 'none'] as const) {
      const project = editorProjectV2Schema.parse({
        ...base,
        durationSec: 1,
        transitions: [],
        tracks: [
          { ...base.tracks[0], clips: [{ ...base.tracks[0]?.clips[0], durationSec: 1 }] },
          {
            id: 'captions',
            name: 'Captions',
            kind: 'caption',
            order: 1,
            clips: [
              {
                id: 'caption',
                kind: 'caption',
                timelineStartSec: 0,
                durationSec: 1,
                text: 'BRAND',
                language: 'en',
                words: [{ text: 'BRAND', startSec: 0, endSec: 1 }],
                highlightMode,
                highlightColor: '#ff3366',
                style: {
                  fontFamily: 'Inter',
                  fontSizePx: 52,
                  fontWeight: 800,
                  color: '#ffffff',
                  outlineColor: '#000000',
                  outlineWidthPx: 4,
                },
              },
            ],
          },
        ],
      });
      const plan = await buildTimelineEditorRenderPlan({
        project,
        jobInputs: [
          {
            sourceId: 'first',
            sourceAssetId: 'asset-first',
            sourceRevision: 'version-first',
            storage: { bucket: 'bench', path: 'first' },
          },
        ],
        signedUrls: new Map([['bench\nfirst', video]]),
        signal: new AbortController().signal,
      });
      await registerCaptionFonts(plan.captionFonts);
      const rendered = await composeTimeline({
        ...plan,
        targetWidth: WIDTH,
        targetHeight: HEIGHT,
        frameRate: 30,
        frameTimeSec: 0.5,
      });
      const bitmap = await createImageBitmap(rendered.blob);
      try {
        const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No highlight verification canvas.');
        ctx.drawImage(bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        let branded = 0;
        let yellow = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const [r, g, b] = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
          if (r > 220 && g < 100 && b > 70 && b < 150) branded++;
          if (r > 200 && g > 160 && b < 90) yellow++;
        }
        results.push({ highlightMode, branded, yellow });
      } finally {
        bitmap.close();
        URL.revokeObjectURL(rendered.objectUrl);
      }
    }
    return results;
  } finally {
    URL.revokeObjectURL(video);
  }
}

/**
 * One composed frame at 0.5 s: a solid ground video under an image overlay carrying at most
 * one look. `amount` overrides the look's amount parameter after it is built from `strength`.
 */
async function renderLookFrame(
  imageUrl: string,
  groundUrl: string,
  effect?: LookEffectId,
  strength = 1,
  amount?: number,
) {
  const started = performance.now();
  const instance = effect ? lookEffectInstance(effect, { id: 'look', strength }) : undefined;
  if (instance && amount !== undefined) instance.parameters.amount = amount;
  const project = editorProjectV2Schema.parse({
    ...createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000779',
      title: 'Look vocabulary proof',
      width: WIDTH,
      height: HEIGHT,
      now: '2026-10-01T12:00:00.000Z',
    }),
    durationSec: 1,
    tracks: [
      {
        id: 'ground',
        name: 'Ground',
        kind: 'video',
        order: 0,
        clips: [
          {
            id: 'ground',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: 1,
            source: source('ground'),
            audioEnabled: false,
          },
        ],
      },
      {
        id: 'image',
        name: 'Image',
        kind: 'overlay',
        order: 1,
        clips: [
          {
            id: 'image',
            kind: 'overlay',
            mediaKind: 'image',
            timelineStartSec: 0,
            durationSec: 1,
            source: source('image'),
            effects: instance ? [instance] : [],
          },
        ],
      },
    ],
  });
  const plan = await buildTimelineEditorRenderPlan({
    project,
    jobInputs: [
      {
        sourceId: 'ground',
        sourceAssetId: 'asset-ground',
        sourceRevision: 'version-ground',
        storage: { bucket: 'bench', path: 'ground' },
      },
      {
        sourceId: 'image',
        sourceAssetId: 'asset-image',
        sourceRevision: 'version-image',
        storage: { bucket: 'bench', path: 'image.png' },
      },
    ],
    signedUrls: new Map([
      ['bench\nimage.png', imageUrl],
      ['bench\nground', groundUrl],
    ]),
    signal: new AbortController().signal,
  });
  const rendered = await composeTimeline({
    ...plan,
    targetWidth: WIDTH,
    targetHeight: HEIGHT,
    frameTimeSec: 0.5,
  });
  const bitmap = await createImageBitmap(rendered.blob);
  try {
    const frame = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = frame.getContext('2d');
    if (!ctx) throw new Error('No looks readback canvas.');
    ctx.drawImage(bitmap, 0, 0);
    return {
      pixels: ctx.getImageData(0, 0, WIDTH, HEIGHT).data,
      durationMs: performance.now() - started,
    };
  } finally {
    bitmap.close();
    URL.revokeObjectURL(rendered.objectUrl);
  }
}

export async function runLooks() {
  const image = new OffscreenCanvas(WIDTH, HEIGHT);
  const brush = image.getContext('2d');
  if (!brush) throw new Error('No looks fixture canvas.');
  brush.fillStyle = '#00ff00';
  brush.fillRect(0, 0, WIDTH, HEIGHT);
  for (let y = 100; y < HEIGHT - 100; y += 3)
    for (let x = 80; x < WIDTH - 80; x += 3) {
      brush.fillStyle = (x + y) % 2 ? '#db253e' : '#8e1430';
      brush.fillRect(x, y, 3, 3);
    }
  const url = URL.createObjectURL(await image.convertToBlob({ type: 'image/png' }));
  const groundUrl = URL.createObjectURL(await encodeSolidVideo(BLUE, 1));
  const render = (effect?: LookEffectId, strength = 1) =>
    renderLookFrame(url, groundUrl, effect, strength);
  try {
    const control = await render();
    const difference = (pixels: Uint8ClampedArray) =>
      pixels.reduce((sum, value, index) => sum + Math.abs(value - control.pixels[index]), 0) /
      pixels.length;
    const results = [];
    for (const id of Object.keys(LOOK_EFFECTS) as LookEffectId[]) {
      const actual = await render(id, id === 'chroma_key' ? 0.6 : 1);
      const zero =
        LOOK_EFFECTS[id].parameter === null ? difference((await render(id, 0)).pixels) : null;
      const corner = 4 * (20 * WIDTH + 20);
      const centre = 4 * (Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2));
      results.push({
        id,
        difference: difference(actual.pixels),
        zeroDifference: zero,
        durationMs: actual.durationMs,
        corner: [...actual.pixels.slice(corner, corner + 4)],
        centre: [...actual.pixels.slice(centre, centre + 4)],
      });
    }
    return results;
  } finally {
    URL.revokeObjectURL(url);
    URL.revokeObjectURL(groundUrl);
  }
}

/**
 * Dust density on a real recorded frame. A pixel counts as changed when its RGB moves by more
 * than 3 in total against a control that runs the same pixel pass at amount 1e-10, which removes
 * bitmap-resize differences: the definition the vintage-looks proof used for its density bound.
 */
export async function runDustDensity(frameUrl: string) {
  const groundUrl = URL.createObjectURL(await encodeSolidVideo(BLUE, 1));
  try {
    const control = (await renderLookFrame(frameUrl, groundUrl, 'dust', 1, 1e-10)).pixels;
    const changedFraction = (pixels: Uint8ClampedArray) => {
      let changed = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const delta =
          Math.abs(pixels[i] - control[i]) +
          Math.abs(pixels[i + 1] - control[i + 1]) +
          Math.abs(pixels[i + 2] - control[i + 2]);
        if (delta > 3) changed++;
      }
      return changed / (pixels.length / 4);
    };
    const full = await renderLookFrame(frameUrl, groundUrl, 'dust', 1);
    return {
      full: changedFraction(full.pixels),
      zeroAmount: changedFraction(
        (await renderLookFrame(frameUrl, groundUrl, 'dust', 1, 0)).pixels,
      ),
      bare: changedFraction((await renderLookFrame(frameUrl, groundUrl)).pixels),
      durationMs: full.durationMs,
    };
  } finally {
    URL.revokeObjectURL(groundUrl);
  }
}

export async function runRetainedCurves(sourceUrl: string) {
  const results = [];
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
  for (const interpolation of ['hold', 'linear', 'bezier', 'spring'] as const) {
    const project = editorProjectV2Schema.parse({
      ...createEditorProjectV2({
        projectId: 'curve-proof',
        title: 'Recorded curve proof',
        width: WIDTH,
        height: HEIGHT,
      }),
      durationSec: 4,
      tracks: [
        {
          id: 'picture',
          kind: 'video',
          name: 'Recorded footage',
          order: 0,
          clips: [
            {
              id: 'source',
              kind: 'video',
              timelineStartSec: 0,
              durationSec: 4,
              source: { sourceType: 'external_url', url: sourceUrl },
              volume: 0.6,
              keyframes: ['transform.opacity', 'audio.volume'].flatMap((property) => [
                {
                  id: `${property}:a`,
                  property,
                  timeSec: 0.5,
                  value: 0.3,
                  interpolation,
                  ...(interpolation === 'bezier'
                    ? {
                        easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
                        expression: 'wiggle(0.7, 0.05)',
                      }
                    : {}),
                  ...(interpolation === 'spring'
                    ? { spring: { bounce: 0.7 }, expression: 'loop' }
                    : {}),
                },
                {
                  id: `${property}:b`,
                  property,
                  timeSec: 3.5,
                  value: 0.8,
                  interpolation: 'linear',
                },
              ]),
            },
          ],
        },
      ],
    });
    const sliced = simulate(project, [
      {
        commandType: 'split_clip',
        trackId: 'picture',
        clipId: 'source',
        splitAtSec: 1,
        rightClipId: 'middle',
      },
      {
        commandType: 'split_clip',
        trackId: 'picture',
        clipId: 'middle',
        splitAtSec: 1,
        rightClipId: 'end',
      },
      { commandType: 'trim_clip', trackId: 'picture', clipId: 'end', durationSec: 1 },
      { commandType: 'remove_clip', trackId: 'picture', clipId: 'middle' },
      {
        commandType: 'move_clip',
        fromTrackId: 'picture',
        toTrackId: 'picture',
        clipId: 'end',
        timelineStartSec: 1,
      },
    ]);
    const render = async (value: typeof project) => {
      const plan = await buildTimelineEditorRenderPlan({
        project: value,
        jobInputs: value.tracks.flatMap((track) =>
          track.clips.map((clip) => ({
            sourceId: clip.id,
            storage: { bucket: 'bench', path: clip.id },
          })),
        ),
        signedUrls: new Map(
          value.tracks.flatMap((track) =>
            track.clips.map((clip) => [`bench\n${clip.id}`, sourceUrl] as const),
          ),
        ),
        signal: new AbortController().signal,
      });
      return composeTimeline({
        ...plan,
        videoBitrate: 1_500_000,
        audioBitrate: 128_000,
        targetWidth: WIDTH,
        targetHeight: HEIGHT,
        frameRate: 30,
      });
    };
    const baseline = await render(project);
    const actual = await render(sliced);
    const a = new Input({ source: new BlobSource(baseline.blob), formats: ALL_FORMATS });
    const b = new Input({ source: new BlobSource(actual.blob), formats: ALL_FORMATS });
    try {
      const frames = [];
      for (const time of [0.25, 0.75, 1.25, 1.75]) {
        const expected = await framePixels(a, time < 1 ? time : time + 1);
        const got = await framePixels(b, time);
        frames.push(
          got.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) /
            got.length,
        );
      }
      const encode = async (blob: Blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      results.push({
        interpolation,
        frames,
        project: sliced,
        baseline: await encode(baseline.blob),
        actual: await encode(actual.blob),
      });
    } finally {
      a.dispose();
      b.dispose();
      URL.revokeObjectURL(baseline.objectUrl);
      URL.revokeObjectURL(actual.objectUrl);
    }
  }
  return results;
}

/** Replays retained project/media through the same worker used by browser export. */
export async function runRecordedExport(
  input: Pick<ServerCompareInput, 'project' | 'sources'> & {
    workerUrl: string;
    frameTimeSec?: number;
  },
) {
  const project = editorProjectV2Schema.parse(input.project);
  const ids = Object.keys(input.sources);
  const plan = await buildTimelineEditorRenderPlan({
    project,
    jobInputs: ids.map((sourceId) => ({
      sourceId,
      sourceAssetId: input.sources[sourceId]?.assetId,
      sourceRevision: input.sources[sourceId]?.versionId,
      storage: { bucket: 'bench', path: sourceId },
    })),
    signedUrls: new Map(ids.map((id) => [`bench\n${id}`, input.sources[id]?.url ?? ''])),
    signal: new AbortController().signal,
  });
  const settings = {
    ...plan,
    targetWidth: project.exportSettings.width,
    targetHeight: project.exportSettings.height,
    frameRate:
      project.exportSettings.frameRate.numerator / project.exportSettings.frameRate.denominator,
    videoBitrate: project.exportSettings.videoBitrateKbps * 1_000,
    audioBitrate: project.exportSettings.audioBitrateKbps * 1_000,
  };
  if (input.frameTimeSec !== undefined) await registerCaptionFonts(plan.captionFonts);
  const result =
    input.frameTimeSec === undefined
      ? await runTimelineInWorker({
          ...settings,
          workerFactory: () => new Worker(input.workerUrl, { type: 'module' }),
        })
      : await composeTimeline({ ...settings, frameTimeSec: input.frameTimeSec });
  try {
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return {
      base64: btoa(binary),
      durationSec: result.durationSec,
      width: result.width,
      height: result.height,
    };
  } finally {
    URL.revokeObjectURL(result.objectUrl);
  }
}

declare global {
  interface Window {
    __motionRenderBench: {
      run: typeof runMotionRender;
      entrances: typeof runEntrances;
      compare: typeof runServerCompare;
      highlights: typeof runCaptionHighlights;
      looks: typeof runLooks;
      dust: typeof runDustDensity;
      curves: typeof runRetainedCurves;
      recordedExport: typeof runRecordedExport;
    };
  }
}

window.__motionRenderBench = {
  run: runMotionRender,
  entrances: runEntrances,
  compare: runServerCompare,
  highlights: runCaptionHighlights,
  looks: runLooks,
  dust: runDustDensity,
  curves: runRetainedCurves,
  recordedExport: runRecordedExport,
};
