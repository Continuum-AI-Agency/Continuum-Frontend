// Browser-side half of the poster-SELECT bench. Bundled with `bun build
// --target=browser` and injected into a real Chrome page by
// e2e/library-poster-select.spec.ts, so the code under test runs through REAL
// WebCodecs and the REAL rendition persist path (Supabase browser client →
// library-creative-operations edge fn), not a mock.
//
// It reuses the color-per-second MP4 encoder from posterBenchEntry (second 0
// red, 1 green, 2 blue, 3 yellow) so the bench can prove a picked frame is the
// RIGHT second's color, and that a REPLACE swaps the bytes in place.

import { persistAssetRendition } from '../../src/lib/library/assetPreview';
import { generateVideoPoster } from '../../src/lib/library/videoPoster';
import { createSupabaseBrowserClient } from '../../src/lib/supabase/client';
import { makeSampleMp4 } from './posterBenchEntry';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Reads the center patch so the bench can assert the still is a genuine frame
// from the picked second, not an empty canvas or frame 0.
async function centerRgb(blob: Blob): Promise<[number, number, number]> {
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

export type CaptureProbe = {
  base64: string;
  byteLength: number;
  width: number;
  height: number;
  timestampSec: number;
  mimeType: string;
  centerRgb: [number, number, number];
};

// The frame picker's decode step: grab a SPECIFIC second, not the auto offset.
async function capturePoster(
  mp4Base64: string,
  timestampSec: number,
): Promise<CaptureProbe | null> {
  const poster = await generateVideoPoster(
    new Blob([base64ToBytes(mp4Base64)], { type: 'video/mp4' }),
    { timestampSec },
  );
  if (!poster) return null;
  const posterBytes = new Uint8Array(await poster.blob.arrayBuffer());
  return {
    base64: bytesToBase64(posterBytes),
    byteLength: posterBytes.byteLength,
    width: poster.width,
    height: poster.height,
    timestampSec: poster.timestampSec,
    mimeType: poster.blob.type,
    centerRgb: await centerRgb(poster.blob),
  };
}

// Decodes stored/replaced poster bytes (handed back as base64 from Node, to
// dodge cross-origin fetches) so the bench can assert the round-tripped image is
// the picked second's color.
async function probeImageColor(base64: string): Promise<[number, number, number]> {
  return centerRgb(new Blob([base64ToBytes(base64)], { type: 'image/webp' }));
}

export type PersistResult = { renditionId: string; signedUrl: string | null };

// The frame picker's confirm step: sign → upload → complete, all through the
// real edge function with the page's own session.
async function persistUserPoster(input: {
  brandId: string;
  assetId: string;
  assetVersionId: string;
  base64: string;
  mimeType: string;
  sourceTimestampMs: number;
}): Promise<PersistResult> {
  const client = createSupabaseBrowserClient();
  const mimeType = input.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const result = await persistAssetRendition({
    client,
    brandId: input.brandId,
    assetId: input.assetId,
    assetVersionId: input.assetVersionId,
    role: 'poster',
    blob: new Blob([base64ToBytes(input.base64)], { type: mimeType }),
    mimeType,
    renderer: 'mediabunny-frame-picker',
    posterSource: 'user',
    sourceTimestampMs: input.sourceTimestampMs,
  });
  return { renditionId: result.renditionId, signedUrl: result.signedUrl };
}

// The opportunistic backfill hop: auto timestamp, 'auto' provenance — the same
// call useOpportunisticPoster makes when a posterless video is opened.
async function backfillAutoPoster(input: {
  brandId: string;
  assetId: string;
  assetVersionId: string;
  mp4Base64: string;
}): Promise<(PersistResult & { timestampSec: number }) | null> {
  const poster = await generateVideoPoster(
    new Blob([base64ToBytes(input.mp4Base64)], { type: 'video/mp4' }),
  );
  if (!poster) return null;
  const client = createSupabaseBrowserClient();
  const mimeType = poster.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const posterBytes = new Uint8Array(await poster.blob.arrayBuffer());
  const result = await persistAssetRendition({
    client,
    brandId: input.brandId,
    assetId: input.assetId,
    assetVersionId: input.assetVersionId,
    role: 'poster',
    blob: new Blob([posterBytes], { type: mimeType }),
    mimeType,
    width: poster.width,
    height: poster.height,
    renderer: 'mediabunny-backfill-poster',
    posterSource: 'auto',
    sourceTimestampMs: Math.round(poster.timestampSec * 1000),
  });
  return {
    renditionId: result.renditionId,
    signedUrl: result.signedUrl,
    timestampSec: poster.timestampSec,
  };
}

declare global {
  interface Window {
    __posterSelectBench: {
      makeSampleMp4: typeof makeSampleMp4;
      capturePoster: typeof capturePoster;
      persistUserPoster: typeof persistUserPoster;
      backfillAutoPoster: typeof backfillAutoPoster;
      probeImageColor: typeof probeImageColor;
    };
  }
}

window.__posterSelectBench = {
  makeSampleMp4,
  capturePoster,
  persistUserPoster,
  backfillAutoPoster,
  probeImageColor,
};
