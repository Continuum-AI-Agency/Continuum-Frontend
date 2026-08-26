/**
 * Local file export — the byte-level half of the Canvas V3 Export node.
 *
 * Everything here is browser-only and side-effect free apart from the file it hands
 * back: give it bytes and a format, get bytes in that format. No canvas store, no
 * React, no network — so the canvas glue (`StudioCanvas/utils/export/`) and any future
 * caller (a library "download as…" menu) share one implementation of "make me a WEBP".
 *
 * Local formats only. Google Drive and every other remote destination are deliberately
 * out of scope: a terminal node that writes a file the user downloads has no business
 * holding an OAuth token.
 *
 * Why three different engines rather than one:
 *   • stills  → `OffscreenCanvas.convertToBlob`. The platform already encodes PNG/JPEG/
 *     WEBP; importing an encoder for that would be pure weight.
 *   • clips   → Mediabunny `Conversion`. It owns the demux → decode → encode → mux
 *     pipeline the splice engine already runs on, so an MP4 written here is written the
 *     same way as one written by the timeline.
 *   • GIF     → gifenc, fed from a Mediabunny `CanvasSink`. Mediabunny has NO GIF output
 *     format (it is a WebCodecs wrapper and WebCodecs has no GIF encoder), which is the
 *     entire reason this program carries one new dependency.
 */

import {
  type ExportFormatId,
  type ExportKind,
  exportFormatsForKind,
  IMAGE_EXPORT_FORMATS,
  VIDEO_EXPORT_FORMATS,
} from '@continuum/contracts';
import { unzipSync, zipSync } from 'fflate';

// The ids and their modality come from contracts: the Studio agent's node vocabulary
// renders them as the legal values of `export.format`, and a second copy here is how a
// prompt starts advertising a format this file cannot write. The engines, MIME types,
// extensions and picker copy stay local — they are browser concerns. Re-exported so every
// existing caller keeps importing them from `@/lib/export/transcode`.
export { type ExportFormatId, type ExportKind, IMAGE_EXPORT_FORMATS, VIDEO_EXPORT_FORMATS };

export interface ExportFormatDef {
  label: string;
  /** Which upstream modality this format can be applied to. */
  kind: ExportKind;
  /** MIME of the file that lands on disk. */
  mimeType: string;
  extension: string;
  /** Shown under the picker when the format needs a caveat. */
  hint?: string;
}

export const EXPORT_FORMATS: Readonly<Record<ExportFormatId, ExportFormatDef>> = {
  png: { label: 'PNG', kind: 'image', mimeType: 'image/png', extension: 'png' },
  jpg: { label: 'JPG', kind: 'image', mimeType: 'image/jpeg', extension: 'jpg' },
  webp: { label: 'WEBP', kind: 'image', mimeType: 'image/webp', extension: 'webp' },
  'video-original': {
    label: 'Original',
    kind: 'video',
    mimeType: 'video/mp4',
    extension: 'mp4',
    hint: 'Saves the file exactly as generated — no re-encode.',
  },
  'mp4-h264': { label: 'MP4 (H.264)', kind: 'video', mimeType: 'video/mp4', extension: 'mp4' },
  'mp4-h265': {
    label: 'MP4 (H.265)',
    kind: 'video',
    mimeType: 'video/mp4',
    extension: 'mp4',
    hint: 'Falls back to H.264 where this browser cannot encode HEVC.',
  },
  'mov-h264': {
    label: 'MOV (H.264)',
    kind: 'video',
    mimeType: 'video/quicktime',
    extension: 'mov',
  },
  gif: {
    label: 'GIF',
    kind: 'video',
    mimeType: 'image/gif',
    extension: 'gif',
    hint: 'Capped at 15fps and 480px — GIF is a poor container for long clips.',
  },
} as const;

export const DEFAULT_EXPORT_FORMAT: Readonly<Record<ExportKind, ExportFormatId>> = {
  image: 'png',
  video: 'mp4-h264',
};

export const isExportFormatId = (value: unknown): value is ExportFormatId =>
  typeof value === 'string' && value in EXPORT_FORMATS;

export const formatsForKind = exportFormatsForKind;

/** JPEG/WEBP are lossy; PNG ignores the argument. High enough that a re-export is not a downgrade. */
const STILL_QUALITY = 0.92;

/** Task-level caps. A GIF is a flipbook of full frames — the caps are what keep it openable. */
export const GIF_MAX_FPS = 15;
export const GIF_MAX_EDGE = 480;
// ponytail: hard frame ceiling so a 10-minute clip cannot exhaust the tab; raise it if
// someone actually needs a longer GIF than 40s.
export const GIF_MAX_FRAMES = 600;

const loadMediabunny = () => import('mediabunny');

// ── Stills ───────────────────────────────────────────────────────────────────

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Re-encode a still into `format`.
 *
 * The bitmap is drawn onto an OffscreenCanvas rather than passed through, because
 * "export as JPG" on a PNG with alpha has to composite onto something — left alone,
 * Chromium fills transparent pixels with black, which reads as a corrupted export.
 * White is the sane paper colour for a flattening format.
 */
export async function transcodeImage(source: Blob, format: ExportFormatId): Promise<EncodedImage> {
  const def = EXPORT_FORMATS[format];
  if (def.kind !== 'image') throw new Error(`${def.label} is not a still format`);

  const bitmap = await createImageBitmap(source);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not open a 2D context to export this image');
    if (def.mimeType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: def.mimeType, quality: STILL_QUALITY });
    return { blob, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

// ── Clips ────────────────────────────────────────────────────────────────────

export type ExportVideoCodec = 'avc' | 'hevc';

let hevcProbe: Promise<boolean> | null = null;

/**
 * Can this browser ENCODE HEVC?
 *
 * Probed, never assumed: hardware HEVC encode exists on Safari and on some Chromium/
 * Windows builds and is absent everywhere else. Committing to it unprobed produces a
 * `Conversion` that reports `isValid: false` at execute time, i.e. a download button
 * that throws. Memoised — the answer cannot change within a page.
 */
export async function canEncodeHevc(): Promise<boolean> {
  if (!hevcProbe) {
    hevcProbe = loadMediabunny()
      .then(({ canEncodeVideo }) => canEncodeVideo('hevc'))
      .catch(() => false);
  }
  return hevcProbe;
}

/** Test seam: forget the memoised probe. */
export const resetHevcProbe = (): void => {
  hevcProbe = null;
};

/**
 * Which codec a clip format actually gets, given what the browser can encode.
 *
 * Split out from `transcodeVideo` because it is the whole of the H.265 fallback rule and
 * the only part of it that can be tested without a WebCodecs encoder.
 */
export function codecForFormat(
  format: ExportFormatId,
  hevcAvailable: boolean,
): { codec: ExportVideoCodec; fellBackToH264: boolean } {
  if (format !== 'mp4-h265') return { codec: 'avc', fellBackToH264: false };
  return hevcAvailable
    ? { codec: 'hevc', fellBackToH264: false }
    : { codec: 'avc', fellBackToH264: true };
}

export interface EncodedVideo {
  blob: Blob;
  /** What actually got encoded — not what was asked for. */
  codec: ExportVideoCodec;
  /** True when H.265 was requested and this browser could not encode it. */
  fellBackToH264: boolean;
}

/**
 * Re-encode a clip into `format` with Mediabunny's Conversion driver.
 *
 * `video-original` short-circuits: passthrough is a real choice, and re-muxing a file
 * the generator already wrote can only lose information.
 */
export async function transcodeVideo(source: Blob, format: ExportFormatId): Promise<EncodedVideo> {
  const def = EXPORT_FORMATS[format];
  if (def.kind !== 'video') throw new Error(`${def.label} is not a clip format`);
  if (format === 'gif') throw new Error('Use encodeGif for GIF export');

  if (format === 'video-original') {
    return {
      blob: source.type ? source : new Blob([source], { type: def.mimeType }),
      codec: 'avc',
      fellBackToH264: false,
    };
  }

  const { codec, fellBackToH264 } = codecForFormat(format, await canEncodeHevc());

  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    MovOutputFormat,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH,
  } = await loadMediabunny();

  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  try {
    const output = new Output({
      format: format === 'mov-h264' ? new MovOutputFormat() : new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec, bitrate: QUALITY_HIGH },
    });
    if (!conversion.isValid) {
      const why = conversion.discardedTracks.map((track) => track.reason).join(', ');
      throw new Error(`Cannot export as ${def.label}${why ? ` — ${why}` : ''}`);
    }
    await conversion.execute();
    const bytes = output.target.buffer;
    if (!bytes) throw new Error(`${def.label} export produced no bytes`);
    return { blob: new Blob([bytes], { type: def.mimeType }), codec, fellBackToH264 };
  } finally {
    input.dispose();
  }
}

// ── GIF ──────────────────────────────────────────────────────────────────────

export interface EncodedGif {
  blob: Blob;
  frameCount: number;
  width: number;
  height: number;
  fps: number;
}

/**
 * Sample a clip down to a GIF.
 *
 * The sampling timestamps are computed up front and handed to `canvasesAtTimestamps`,
 * which decodes each packet at most once for a monotonic list. Iterating every decoded
 * frame and throwing most away would decode the whole clip to produce a fifth of it.
 */
export async function encodeGif(
  source: Blob,
  options: { maxFps?: number; maxEdge?: number; maxFrames?: number } = {},
): Promise<EncodedGif> {
  const fps = Math.max(1, Math.min(options.maxFps ?? GIF_MAX_FPS, GIF_MAX_FPS));
  const maxEdge = Math.max(16, Math.min(options.maxEdge ?? GIF_MAX_EDGE, GIF_MAX_EDGE));
  const maxFrames = Math.max(1, options.maxFrames ?? GIF_MAX_FRAMES);

  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await loadMediabunny();
  const { applyPalette, GIFEncoder, quantize } = await import('gifenc');

  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This clip has no video track to turn into a GIF');

    const duration = await track.computeDuration();
    const displayWidth = await track.getDisplayWidth();
    const displayHeight = await track.getDisplayHeight();
    const scale = Math.min(1, maxEdge / Math.max(displayWidth, displayHeight));
    // GIF frames are indexed bitmaps; odd widths survive fine, but keeping the box even
    // avoids half-pixel resampling seams on the very small sizes the cap produces.
    const width = Math.max(2, Math.round((displayWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((displayHeight * scale) / 2) * 2);

    const step = 1 / fps;
    const timestamps: number[] = [];
    for (let t = 0; t < duration && timestamps.length < maxFrames; t += step) timestamps.push(t);
    if (timestamps.length === 0) timestamps.push(0);

    const sink = new CanvasSink(track, { width, height, fit: 'contain', poolSize: 2 });
    const gif = GIFEncoder();
    const delay = Math.round(1000 / fps);
    let frameCount = 0;

    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (!wrapped) continue;
      // CanvasSink hands back an OffscreenCanvas or an HTMLCanvasElement depending on
      // the environment; both expose the same 2D context, so narrow rather than cast.
      const ctx =
        wrapped.canvas instanceof OffscreenCanvas
          ? wrapped.canvas.getContext('2d')
          : wrapped.canvas.getContext('2d');
      if (!ctx) throw new Error('Could not read frames for the GIF');
      const { data } = ctx.getImageData(0, 0, width, height);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
      frameCount += 1;
    }

    gif.finish();
    if (frameCount === 0) throw new Error('No frames could be decoded for the GIF');
    // Copy out of gifenc's growable buffer: `bytes()` already returns a fresh
    // Uint8Array, but slicing pins the exact ArrayBuffer the Blob wraps.
    const bytes = gif.bytes();
    return {
      blob: new Blob([bytes.slice()], { type: 'image/gif' }),
      frameCount,
      width,
      height,
      fps,
    };
  } finally {
    input.dispose();
  }
}

// ── Bulk ─────────────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/**
 * De-duplicate ZIP entry names.
 *
 * Two exports of the same node (or two variations of one generation) arrive with the
 * same basename, and a ZIP with two identical entries silently loses one on extraction
 * in most tools. Suffix before the extension, the way a browser's download folder does.
 */
export function uniqueEntryNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const taken = seen.get(name);
    if (taken === undefined) {
      seen.set(name, 1);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let next = taken + 1;
    let candidate = `${stem} (${next})${ext}`;
    while (seen.has(candidate)) {
      next += 1;
      candidate = `${stem} (${next})${ext}`;
    }
    seen.set(name, next);
    seen.set(candidate, 1);
    return candidate;
  });
}

/**
 * Pack entries into a ZIP.
 *
 * `level: 0` (store) on purpose: every payload here is already-compressed PNG/JPEG/
 * WEBP/MP4/GIF, so DEFLATE spends real CPU on the main thread to save ~0%.
 */
export async function zipBlobs(entries: readonly ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) throw new Error('Nothing to zip');
  const names = uniqueEntryNames(entries.map((entry) => entry.name));
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  await Promise.all(
    entries.map(async (entry, index) => {
      files[names[index]] = [new Uint8Array(await entry.blob.arrayBuffer()), { level: 0 }];
    }),
  );
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

/** Read a ZIP back to `{ name → bytes }`. Exists so a caller can verify what it wrote. */
export function unzipToEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}
