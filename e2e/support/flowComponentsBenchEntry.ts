import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { buildTimelineEditorRenderPlan } from '../../src/lib/client-render/executors/timelineEditor';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';

const WIDTH = 480;
const HEIGHT = 270;
const FPS = 30;
const SEGMENT_SEC = 2;

const examples = [
  { id: 'control', label: 'CONTROL / POP', animation: 'pop', effects: [] },
  {
    id: 'vignette',
    label: 'VIGNETTE / SCALE',
    animation: 'scaleIn',
    effects: [{ effectId: 'vignette', parameters: { amount: 0.85 } }],
  },
  {
    id: 'film-grain',
    label: 'FILM GRAIN / FLOAT',
    animation: 'floatIn',
    effects: [{ effectId: 'film_grain', parameters: { amount: 0.8 } }],
  },
  {
    id: 'pixelate',
    label: 'PIXELATE / POP',
    animation: 'pop',
    effects: [{ effectId: 'pixelate', parameters: { blockPx: 18 } }],
  },
  {
    id: 'rgb-shift',
    label: 'RGB SHIFT / SCALE',
    animation: 'scaleIn',
    effects: [{ effectId: 'chromatic_aberration', parameters: { amount: 1 } }],
  },
  {
    id: 'vhs',
    label: 'VHS / FLOAT',
    animation: 'floatIn',
    effects: [{ effectId: 'vhs', parameters: { amount: 0.9 } }],
  },
] as const;

export interface FlowComponentsBenchRun {
  bytes: number;
  durationSec: number;
  width: number;
  height: number;
  mp4Base64: string;
  frames: Array<{ id: string; pngBase64: string; lowerFrameDifference: number }>;
  animations: Array<{ id: string; earlyInk: number; midInk: number; exitInk: number }>;
  plan: Array<{ id: string; effects: Record<string, unknown> }>;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read benchmark blob'));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const marker = ';base64,';
      const markerIndex = dataUrl.indexOf(marker);
      if (markerIndex < 0) return reject(new Error('Benchmark blob did not produce a base64 URL'));
      resolve(dataUrl.slice(markerIndex + marker.length));
    };
    reader.readAsDataURL(blob);
  });

async function encodeSource(): Promise<Blob> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_MEDIUM } = await import(
    'mediabunny'
  );
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for Flow benchmark source');
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source);
  await output.start();
  for (let frame = 0; frame < SEGMENT_SEC * FPS; frame += 1) {
    const progress = frame / (SEGMENT_SEC * FPS - 1);
    context.fillStyle = '#101827';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const gradient = context.createLinearGradient(0, 70, WIDTH, HEIGHT);
    gradient.addColorStop(0, '#f97316');
    gradient.addColorStop(0.5, '#06b6d4');
    gradient.addColorStop(1, '#7c3aed');
    context.fillStyle = gradient;
    context.fillRect(0, 70, WIDTH, HEIGHT - 70);
    context.fillStyle = '#f8fafc';
    for (let x = -40; x < WIDTH + 40; x += 48) {
      context.fillRect(x + progress * 48, 115, 18, 105);
    }
    context.fillStyle = '#111827';
    context.beginPath();
    context.arc(80 + progress * 320, 180, 34, 0, Math.PI * 2);
    context.fill();
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Flow benchmark source encoder returned no bytes');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}

function inkInTop(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let y = 0; y < 70; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      if (
        (pixels[offset] ?? 0) > 205 &&
        (pixels[offset + 1] ?? 0) > 205 &&
        (pixels[offset + 2] ?? 0) > 205
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function lowerFrameDifference(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let difference = 0;
  let channels = 0;
  for (let y = 80; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      difference += Math.abs((left[offset] ?? 0) - (right[offset] ?? 0));
      difference += Math.abs((left[offset + 1] ?? 0) - (right[offset + 1] ?? 0));
      difference += Math.abs((left[offset + 2] ?? 0) - (right[offset + 2] ?? 0));
      channels += 3;
    }
  }
  return channels ? difference / channels : 0;
}

async function frameAt(
  input: InstanceType<typeof import('mediabunny')['Input']>,
  timestampSec: number,
): Promise<{ pixels: Uint8ClampedArray; pngBase64: string }> {
  const { CanvasSink } = await import('mediabunny');
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Flow benchmark output has no video track');
  const wrapped = await new CanvasSink(track).getCanvas(timestampSec);
  if (!wrapped) throw new Error(`No decoded frame at ${timestampSec}s`);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for Flow benchmark analysis');
  context.drawImage(wrapped.canvas, 0, 0, WIDTH, HEIGHT);
  return {
    pixels: context.getImageData(0, 0, WIDTH, HEIGHT).data,
    pngBase64: await blobToBase64(await canvas.convertToBlob({ type: 'image/png' })),
  };
}

export async function runFlowComponentsBench(): Promise<FlowComponentsBenchRun> {
  const sourceBlob = await encodeSource();
  const sourceUrl = URL.createObjectURL(sourceBlob);
  const created = createEditorProjectV2({
    projectId: '00000000-0000-4000-8000-000000000444',
    title: 'Flow components benchmark',
    width: WIDTH,
    height: HEIGHT,
    now: '2026-09-08T12:00:00.000Z',
  });
  const project = editorProjectV2Schema.parse({
    ...created,
    durationSec: examples.length * SEGMENT_SEC,
    exportSettings: {
      ...created.exportSettings,
      width: WIDTH,
      height: HEIGHT,
      frameRate: { numerator: FPS, denominator: 1 },
      videoBitrateKbps: 1_500,
      captionMode: 'burn_in',
    },
    tracks: [
      {
        id: 'masters',
        name: 'Effect examples',
        order: 0,
        kind: 'video',
        clips: examples.map((example, index) => ({
          id: example.id,
          timelineStartSec: index * SEGMENT_SEC,
          durationSec: SEGMENT_SEC,
          kind: 'video' as const,
          source: {
            sourceType: 'library_asset' as const,
            assetId: 'flow-source-asset',
            renditionId: 'flow-source-version',
          },
          sourceInSec: 0,
          audioEnabled: false,
          effects: example.effects.map((effect, effectIndex) => ({
            id: `${example.id}:effect:${effectIndex}`,
            effectType: 'custom' as const,
            effectId: effect.effectId,
            parameters: effect.parameters,
          })),
        })),
      },
      {
        id: 'animated-type',
        name: 'Animated type examples',
        order: 1,
        kind: 'text',
        clips: examples.map((example, index) => ({
          id: `title:${example.id}`,
          timelineStartSec: index * SEGMENT_SEC,
          durationSec: SEGMENT_SEC,
          kind: 'text' as const,
          text: example.label,
          animationIn: example.animation,
          animationOut: example.animation,
          style: {
            fontFamily: 'Arial',
            fontSizePx: 31,
            fontWeight: 900,
            color: '#ffffff',
            outlineColor: '#000000',
            outlineWidthPx: 3,
          },
          transform: { position: { x: 0.5, y: 0.13, unit: 'normalized' as const } },
        })),
      },
    ],
  });

  try {
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: examples.map((example) => ({
        sourceId: example.id,
        sourceAssetId: 'flow-source-asset',
        sourceRevision: 'flow-source-version',
        storage: { bucket: 'bench', path: 'flow-source' },
      })),
      signedUrls: new Map([['bench\nflow-source', sourceUrl]]),
      signal: new AbortController().signal,
    });
    const rendered = await composeTimeline({
      ...plan,
      videoBitrate: 1_500_000,
      audioBitrate: 128_000,
      targetWidth: WIDTH,
      targetHeight: HEIGHT,
      frameRate: FPS,
    });
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
    try {
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('Flow benchmark output has no video track');
      const [durationSec, width, height] = await Promise.all([
        input.computeDuration(),
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
      ]);
      const middleFrames = await Promise.all(
        examples.map((_, index) => frameAt(input, index * SEGMENT_SEC + 1)),
      );
      const control = middleFrames[0]?.pixels;
      if (!control) throw new Error('Flow benchmark control frame is missing');
      const animations = await Promise.all(
        examples.map(async (example, index) => {
          const start = index * SEGMENT_SEC;
          const [early, middle, exit] = await Promise.all([
            frameAt(input, start + 0.02),
            frameAt(input, start + 1),
            frameAt(input, start + 1.98),
          ]);
          return {
            id: example.id,
            earlyInk: inkInTop(early.pixels),
            midInk: inkInTop(middle.pixels),
            exitInk: inkInTop(exit.pixels),
          };
        }),
      );
      return {
        bytes: rendered.blob.size,
        durationSec,
        width,
        height,
        mp4Base64: await blobToBase64(rendered.blob),
        frames: examples.map((example, index) => ({
          id: example.id,
          pngBase64: middleFrames[index]?.pngBase64 ?? '',
          lowerFrameDifference:
            index === 0 || !middleFrames[index]
              ? 0
              : lowerFrameDifference(control, middleFrames[index].pixels),
        })),
        animations,
        plan: plan.items.map((item) => ({ id: item.itemId, effects: item.effects ?? {} })),
      };
    } finally {
      input.dispose();
      URL.revokeObjectURL(rendered.objectUrl);
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

declare global {
  interface Window {
    __flowComponentsBench: { run: typeof runFlowComponentsBench };
  }
}

window.__flowComponentsBench = { run: runFlowComponentsBench };
