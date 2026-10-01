// Browser half of videoeditor:motion:render:bench. It builds a V2 project that uses the
// motion vocabulary (text entrances and exits, text keyframes, a crossfade, a VHS look, a
// boxed text with a drop shadow), renders it through the REAL executor plan and splice
// compositor, and measures decoded frames by pixels and bounding boxes (never OCR). The
// Playwright spec asserts on the numbers.

import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { buildTimelineEditorRenderPlan } from '../../src/lib/client-render/executors/timelineEditor';
import { registerCaptionFonts } from '../../src/lib/clips/captionFonts';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';

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
      return {
        variant,
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
const ENTRANCES = [
  'fade',
  'pop',
  'scale-in',
  'float-in',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'typewriter',
  'word-pop',
  'bounce',
  'blur-in',
  'zoom-out',
  'wipe',
] as const;
const ENTRANCE_SEC = 1.1;

export type EntranceSample = { id: string; early: TextBox; settled: TextBox };

/** Each entrance sampled 0.1 s in and once it has settled, on a plain blue ground. */
export async function runEntrances(): Promise<EntranceSample[]> {
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
            animationIn: id,
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
          early: textBox(await framePixels(input, at(0.1)), TOP_BAND, at(0.1)),
          settled: textBox(await framePixels(input, at(0.95)), TOP_BAND, at(0.95)),
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
    texts: Array<{ name: string; times: number[]; settledAt: number }>;
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
  clientMp4Base64: string;
};

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

declare global {
  interface Window {
    __motionRenderBench: {
      run: typeof runMotionRender;
      entrances: typeof runEntrances;
      compare: typeof runServerCompare;
    };
  }
}

window.__motionRenderBench = {
  run: runMotionRender,
  entrances: runEntrances,
  compare: runServerCompare,
};
