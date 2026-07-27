'use client';

import {
  generateVideoPoster,
  type VideoFrameSelector,
  type VideoPoster,
} from '@/lib/library/videoPoster';

async function sourceToBlob(source: string | Blob): Promise<Blob> {
  if (source instanceof Blob) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Video download failed (${response.status})`);
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || 'image/webp'};base64,${btoa(binary)}`;
}

export async function extractVideoFrame(params: {
  source: string | Blob;
  selector: VideoFrameSelector;
  timestampSec?: number | null;
  outputWidth?: number;
  quality?: number;
}): Promise<(VideoPoster & { dataUrl: string }) | null> {
  const source = await sourceToBlob(params.source);
  const poster = await generateVideoPoster(source, {
    selector: params.selector,
    ...(params.timestampSec !== null && params.timestampSec !== undefined
      ? { timestampSec: params.timestampSec }
      : {}),
    ...(params.outputWidth ? { maxWidth: params.outputWidth } : {}),
    ...(params.quality ? { quality: params.quality } : {}),
  });
  if (!poster) return null;
  return { ...poster, dataUrl: await blobToDataUrl(poster.blob) };
}
