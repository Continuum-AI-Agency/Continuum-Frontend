// Browser-side half of the library poster bench. Bundled with `bun build
// --target=browser` and injected into a real Chrome page by
// e2e/library-poster-transcript.spec.ts, so the code under test
// (src/lib/library/videoPoster.ts) runs through REAL WebCodecs — the same path a
// user's upload takes — rather than a mock.
//
// It also mints the source video: a real H.264/MP4 encoded by Mediabunny, with a
// different base color every second. That makes the poster assertion strong —
// the frame we get back must be GREEN (the color painted at t=1s), which no
// stub, black frame, or first-frame fallback could produce.

import { generateVideoPoster } from '../../src/lib/library/videoPoster';

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 15;
const SECONDS = 4;
// second 0 red, second 1 green (the poster's second), second 2 blue, second 3 yellow
const SECOND_COLORS = ['#e53935', '#00c853', '#2962ff', '#ffd600'];

export type SampleVideo = { base64: string; byteLength: number; mimeType: string };
export type PosterProbe = {
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  timestampSec: number;
  base64: string;
  centerRgb: [number, number, number];
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Rich (compressible-but-not-trivial) frames: a solid base color plus decorative
// rings around a clean center patch. The center stays pure so a pixel probe reads
// the second's color; the rings keep the encoded still from being a few bytes.
function drawFrame(ctx: OffscreenCanvasRenderingContext2D, frameIndex: number): void {
  const second = Math.min(Math.floor(frameIndex / FPS), SECOND_COLORS.length - 1);
  ctx.fillStyle = SECOND_COLORS[second] ?? '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 60; i += 1) {
    const angle = (i / 60) * Math.PI * 2 + frameIndex * 0.05;
    const radius = 140 + (i % 7) * 8;
    const x = WIDTH / 2 + Math.cos(angle) * radius;
    const y = HEIGHT / 2 + Math.sin(angle) * (radius * 0.5);
    ctx.fillStyle = `hsl(${(i * 13 + frameIndex * 3) % 360} 80% 55%)`;
    ctx.beginPath();
    ctx.arc(x, y, 10 + (i % 5) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function makeSampleMp4(): Promise<SampleVideo> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } = await import(
    'mediabunny'
  );

  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH });
  output.addVideoTrack(source);
  await output.start();

  for (let frame = 0; frame < FPS * SECONDS; frame += 1) {
    drawFrame(ctx, frame);
    await source.add(frame / FPS, 1 / FPS);
  }
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('encoder produced no bytes');
  const bytes = new Uint8Array(buffer);
  return { base64: bytesToBase64(bytes), byteLength: bytes.byteLength, mimeType: 'video/mp4' };
}

// Decodes the produced poster back into pixels so the bench can assert it is a
// real frame from the real second — not an empty canvas and not frame 0.
async function probeCenterColor(blob: Blob): Promise<[number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0);

  const size = 20;
  const data = ctx.getImageData(
    Math.floor(bitmap.width / 2 - size / 2),
    Math.floor(bitmap.height / 2 - size / 2),
    size,
    size,
  ).data;

  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  return [Math.round(r / pixels), Math.round(g / pixels), Math.round(b / pixels)];
}

export async function runPoster(mp4Base64: string): Promise<PosterProbe | null> {
  const binary = atob(mp4Base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const poster = await generateVideoPoster(new Blob([bytes], { type: 'video/mp4' }));
  if (!poster) return null;

  const posterBytes = new Uint8Array(await poster.blob.arrayBuffer());
  return {
    mimeType: poster.blob.type,
    byteLength: posterBytes.byteLength,
    width: poster.width,
    height: poster.height,
    timestampSec: poster.timestampSec,
    base64: bytesToBase64(posterBytes),
    centerRgb: await probeCenterColor(poster.blob),
  };
}

declare global {
  interface Window {
    __posterBench: { makeSampleMp4: typeof makeSampleMp4; runPoster: typeof runPoster };
  }
}

window.__posterBench = { makeSampleMp4, runPoster };
