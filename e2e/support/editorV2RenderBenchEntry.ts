import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { buildTimelineEditorRenderPlan } from '../../src/lib/client-render/executors/timelineEditor';
import { composeTimeline } from '../../src/StudioCanvas/utils/splice/composeTimeline';

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 15;

export interface EditorV2RenderBenchRun {
  bytes: number;
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  averagePacketRate: number;
  colorSpace: { primaries?: string; transfer?: string; matrix?: string; fullRange?: boolean };
  plan: { items: number; overlays: number; audioTracks: number; captionCues: number };
  overlayPixel: [number, number, number];
  transitionPixel: [number, number, number];
  effectPixel: [number, number, number];
  keyframeEdgePixel: [number, number, number];
  captionWhitePixels: number;
  captionBackgroundPixels: number;
  textGreenPixels: number;
  audioRms: number;
  fadeInRms: number;
  audioFrequencyHz: number;
}

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
  const frameCount = Math.round(durationSec * FPS);
  for (let frame = 0; frame < frameCount; frame += 1) {
    context.fillStyle = color;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();
  if (!output.target.buffer) throw new Error('Source encoder returned no bytes');
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}

async function overlayPng(): Promise<Blob> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for overlay');
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#ffdd00';
  context.fillRect(WIDTH / 2 - 30, HEIGHT / 2 - 30, 60, 60);
  return canvas.convertToBlob({ type: 'image/png' });
}

function toneWav(durationSec: number): Blob {
  const sampleRate = 48_000;
  const frames = Math.round(durationSec * sampleRate);
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.sin((2 * Math.PI * 220 * frame) / sampleRate) * 0.15;
    view.setInt16(44 + frame * 2, Math.round(sample * 0x7fff), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

async function readFramePixels(
  input: InstanceType<typeof import('mediabunny')['Input']>,
  atSec: number,
): Promise<Uint8ClampedArray> {
  const { CanvasSink } = await import('mediabunny');
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Rendered master has no video track');
  const wrapped = await new CanvasSink(track).getCanvas(atSec);
  if (!wrapped) throw new Error('Rendered master has no decodable frame');
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for verification');
  context.drawImage(wrapped.canvas, 0, 0, WIDTH, HEIGHT);
  return context.getImageData(0, 0, WIDTH, HEIGHT).data;
}

const pixelAt = (pixels: Uint8ClampedArray, x: number, y: number): [number, number, number] => {
  const offset = (y * WIDTH + x) * 4;
  return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
};

const countPixels = (
  pixels: Uint8ClampedArray,
  matches: (red: number, green: number, blue: number) => boolean,
): number => {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (matches(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0)) {
      count += 1;
    }
  }
  return count;
};

async function readAudioMetrics(
  track: NonNullable<
    Awaited<ReturnType<InstanceType<typeof import('mediabunny')['Input']>['getPrimaryAudioTrack']>>
  >,
): Promise<{ audioRms: number; fadeInRms: number; audioFrequencyHz: number }> {
  const { AudioSampleSink } = await import('mediabunny');
  const measure = async (startSec: number, endSec: number) => {
    let frames = 0;
    let sumSquares = 0;
    let crossings = 0;
    let previous = 0;
    let sampleRate = 48_000;
    for await (const sample of new AudioSampleSink(track).samples(startSec, endSec)) {
      sampleRate = sample.sampleRate;
      const channel = new Float32Array(sample.numberOfFrames);
      sample.copyTo(channel, { planeIndex: 0, format: 'f32-planar' });
      for (const value of channel) {
        sumSquares += value * value;
        if ((previous < 0 && value >= 0) || (previous >= 0 && value < 0)) crossings += 1;
        previous = value;
      }
      frames += channel.length;
      sample.close();
    }
    return {
      rms: frames > 0 ? Math.sqrt(sumSquares / frames) : 0,
      frequencyHz: frames > 0 ? (crossings * sampleRate) / (2 * frames) : 0,
    };
  };
  const [fade, steady] = await Promise.all([measure(0, 0.05), measure(0.5, 1.5)]);
  return {
    audioRms: steady.rms,
    fadeInRms: fade.rms,
    audioFrequencyHz: steady.frequencyHz,
  };
}

export async function runEditorV2RenderBench(): Promise<EditorV2RenderBenchRun> {
  const [first, second, overlay, score] = await Promise.all([
    encodeSolidVideo('#12366b', 2),
    encodeSolidVideo('#7a1830', 2),
    overlayPng(),
    Promise.resolve(toneWav(4)),
  ]);
  const blobs = new Map([
    ['first', first],
    ['second', second],
    ['overlay', overlay],
    ['score', score],
  ]);
  const urls = new Map([...blobs].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
  const created = createEditorProjectV2({
    projectId: '00000000-0000-4000-8000-000000000333',
    title: 'Browser render proof',
    width: WIDTH,
    height: HEIGHT,
    now: '2026-08-02T12:00:00.000Z',
  });
  const source = (id: string) => ({
    sourceType: 'library_asset' as const,
    assetId: `asset-${id}`,
    renditionId: `version-${id}`,
  });
  const project = editorProjectV2Schema.parse({
    ...created,
    durationSec: 3.75,
    exportSettings: {
      ...created.exportSettings,
      width: WIDTH,
      height: HEIGHT,
      videoBitrateKbps: 1_000,
      captionMode: 'burn_in',
    },
    tracks: [
      {
        id: 'masters',
        name: 'Masters',
        order: 0,
        kind: 'video',
        clips: [
          {
            id: 'first',
            timelineStartSec: 0,
            durationSec: 2,
            kind: 'video',
            source: source('first'),
            sourceInSec: 0,
            audioEnabled: false,
            effects: [
              {
                id: 'vivid-look',
                effectType: 'color_adjustment',
                effectId: 'vivid',
                parameters: { filterPreset: 'vivid', saturation: 1.8 },
              },
            ],
            keyframes: [
              {
                id: 'position-start',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear',
              },
              {
                id: 'position-end',
                property: 'transform.position',
                timeSec: 2,
                value: { x: 0.8, y: 0.5 },
                interpolation: 'linear',
              },
            ],
          },
          {
            id: 'second',
            timelineStartSec: 1.75,
            durationSec: 2,
            kind: 'video',
            source: source('second'),
            sourceInSec: 0,
            audioEnabled: false,
          },
        ],
      },
      {
        id: 'graphics',
        name: 'Graphics',
        order: 1,
        kind: 'overlay',
        clips: [
          {
            id: 'overlay',
            timelineStartSec: 0.5,
            durationSec: 2.5,
            kind: 'overlay',
            source: source('overlay'),
            mediaKind: 'image',
          },
        ],
      },
      {
        id: 'score-track',
        name: 'Score',
        order: 2,
        kind: 'audio',
        clips: [
          {
            id: 'score',
            timelineStartSec: 0,
            durationSec: 3.75,
            kind: 'audio',
            source: source('score'),
            sourceInSec: 0,
            volume: 0.7,
            fadeInSec: 0.1,
            fadeOutSec: 0.2,
          },
        ],
      },
      {
        id: 'captions',
        name: 'Captions',
        order: 3,
        kind: 'caption',
        clips: [
          {
            id: 'caption-proof',
            timelineStartSec: 0.25,
            durationSec: 1.5,
            kind: 'caption',
            text: 'Durable proof',
            language: 'en',
            words: [],
            style: {
              fontFamily: 'Arial',
              fontSizePx: 18,
              fontWeight: 800,
              color: '#ffffff',
              outlineColor: '#000000',
              outlineWidthPx: 3,
              backgroundColor: '#5500aa',
            },
            transform: { position: { x: 0.5, y: 0.8, unit: 'normalized' } },
            highlightMode: 'none',
          },
        ],
      },
      {
        id: 'text-track',
        name: 'Text',
        order: 4,
        kind: 'text',
        clips: [
          {
            id: 'text-proof',
            timelineStartSec: 1,
            durationSec: 2,
            kind: 'text',
            text: 'V2 MASTER',
            style: {
              fontFamily: 'Arial',
              fontSizePx: 20,
              fontWeight: 900,
              color: '#20ff60',
              backgroundColor: '#000000',
              outlineWidthPx: 0,
            },
            transform: { position: { x: 0.5, y: 0.2, unit: 'normalized' } },
          },
        ],
      },
    ],
    transitions: [
      {
        id: 'crossfade',
        trackId: 'masters',
        fromClipId: 'first',
        toClipId: 'second',
        transitionType: 'crossfade',
        durationSec: 0.25,
      },
    ],
  });

  try {
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
      audioBitrate: 128_000,
      targetWidth: WIDTH,
      targetHeight: HEIGHT,
      frameRate: 30,
    });
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(rendered.blob), formats: ALL_FORMATS });
    try {
      const [videoTrack, audioTrack, durationSec] = await Promise.all([
        input.getPrimaryVideoTrack(),
        input.getPrimaryAudioTrack(),
        input.computeDuration(),
      ]);
      if (!videoTrack) throw new Error('Rendered master has no video track');
      const [
        width,
        height,
        packetStats,
        colorSpace,
        effectFrame,
        concurrentFrame,
        transitionFrame,
        audioMetrics,
      ] = await Promise.all([
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        videoTrack.computePacketStats(),
        videoTrack.getColorSpace(),
        readFramePixels(input, 0.1),
        readFramePixels(input, 1.25),
        readFramePixels(input, 1.87),
        audioTrack
          ? readAudioMetrics(audioTrack)
          : Promise.resolve({ audioRms: 0, fadeInRms: 0, audioFrequencyHz: 0 }),
      ]);
      return {
        bytes: rendered.blob.size,
        durationSec,
        width,
        height,
        hasAudio: Boolean(audioTrack),
        averagePacketRate: packetStats.averagePacketRate,
        colorSpace: {
          ...(colorSpace.primaries ? { primaries: colorSpace.primaries } : {}),
          ...(colorSpace.transfer ? { transfer: colorSpace.transfer } : {}),
          ...(colorSpace.matrix ? { matrix: colorSpace.matrix } : {}),
          ...(colorSpace.fullRange !== undefined ? { fullRange: colorSpace.fullRange } : {}),
        },
        plan: {
          items: plan.items.length,
          overlays: plan.overlays.length,
          audioTracks: plan.audioTracks.length,
          captionCues: plan.captionCues.length,
        },
        overlayPixel: pixelAt(concurrentFrame, WIDTH / 2, HEIGHT / 2),
        transitionPixel: pixelAt(transitionFrame, 100, 10),
        effectPixel: pixelAt(effectFrame, WIDTH / 2, HEIGHT / 2),
        keyframeEdgePixel: pixelAt(concurrentFrame, 10, HEIGHT / 2),
        captionWhitePixels: countPixels(
          concurrentFrame,
          (red, green, blue) => red > 200 && green > 200 && blue > 200,
        ),
        captionBackgroundPixels: countPixels(
          concurrentFrame,
          (red, green, blue) => red > 45 && blue > 80 && blue > green * 1.5,
        ),
        textGreenPixels: countPixels(
          concurrentFrame,
          (red, green, blue) => green > 180 && green > red * 1.5 && green > blue * 1.5,
        ),
        ...audioMetrics,
      };
    } finally {
      input.dispose();
      URL.revokeObjectURL(rendered.objectUrl);
    }
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

declare global {
  interface Window {
    __editorV2RenderBench: { run: typeof runEditorV2RenderBench };
  }
}

window.__editorV2RenderBench = { run: runEditorV2RenderBench };
