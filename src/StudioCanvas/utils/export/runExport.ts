/**
 * Canvas glue for the Export node: graph in, files out.
 *
 * `lib/export/transcode.ts` knows formats and bytes and nothing about the canvas. This
 * knows the canvas and nothing about encoders. The seam matters because there are TWO
 * callers with two different ideas of where the media is:
 *
 *   • a RUN — `executeWorkflow` holds live `NodeOutput`s in `resolvedOutputs`, including
 *     collections whose items are never persisted anywhere else;
 *   • the node's own Download button — no run in flight, so the only truth available is
 *     what the upstream nodes have MIRRORED into their node data (`generatedImage`,
 *     `generatedVideoUrl`, an `image` node's `image`, …).
 *
 * Both funnel into `runExport`, so a file downloaded from the button and a file written
 * by a run are produced by the same code.
 */

import { EXPORT_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  type ExportFormatId,
  type ExportKind,
  encodeGif,
  isExportFormatId,
  transcodeImage,
  transcodeVideo,
  type ZipEntry,
  zipBlobs,
} from '@/lib/export/transcode';
import type { NodeOutput } from '../../types/execution';
import { downloadAsset } from '../downloadAsset';

/** One thing to write out. `ref` is a data URL, an http(s) URL, or bytes already in hand. */
export interface ExportSource {
  kind: ExportKind;
  ref: string | Blob;
}

export interface ExportedFile {
  name: string;
  blob: Blob;
}

export interface ExportRunResult {
  files: ExportedFile[];
  /** True when more than one source was bundled into a single ZIP. */
  zipped: boolean;
  /** True when H.265 was asked for and this browser could only encode H.264. */
  fellBackToH264: boolean;
  format: ExportFormatId;
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

// ── Reading the graph ────────────────────────────────────────────────────────

/**
 * Flatten live run outputs into export sources.
 *
 * A collection contributes one source per item — that is what makes "Download All"
 * land a ZIP rather than a single file. Text is dropped: contracts already refuses a
 * text edge into `media-in`, and there is no file to hand a user for a string.
 */
export function exportSourcesFromOutputs(outputs: readonly NodeOutput[]): ExportSource[] {
  const sources: ExportSource[] = [];
  for (const output of outputs) {
    if (!output) continue;
    if (output.type === 'collection') {
      sources.push(...exportSourcesFromOutputs(output.items));
    } else if (output.type === 'images') {
      for (const item of output.items) {
        const ref = item.url ?? item.base64;
        if (nonEmpty(ref)) sources.push({ kind: 'image', ref });
      }
    } else if (output.type === 'image') {
      const ref = output.url ?? output.base64;
      if (nonEmpty(ref)) sources.push({ kind: 'image', ref });
    } else if (output.type === 'video') {
      if (nonEmpty(output.url)) sources.push({ kind: 'video', ref: output.url });
    }
  }
  return sources;
}

/**
 * What ONE upstream node currently holds, read from its node data.
 *
 * Video is checked first. Video generators keep a poster still alongside the clip, so a
 * node with both would export as a PNG of frame one if images won — the single most
 * confusing possible outcome of pressing Download on a video.
 */
export function exportSourceFromNodeData(node: {
  type?: string;
  data?: unknown;
}): ExportSource | null {
  const data = asRecord(node.data);

  const video = [data.generatedVideoUrl, data.generatedVideo, data.video].find(nonEmpty);
  if (nonEmpty(video)) return { kind: 'video', ref: video };
  if (node.type === 'video' && nonEmpty(data.sourceUrl)) {
    return { kind: 'video', ref: data.sourceUrl };
  }

  const image = [data.generatedImageUrl, data.generatedImage, data.image].find(nonEmpty);
  if (nonEmpty(image)) return { kind: 'image', ref: image };
  if (node.type === 'image' && nonEmpty(data.sourceUrl)) {
    return { kind: 'image', ref: data.sourceUrl };
  }
  return null;
}

/**
 * Every source feeding an export node, in edge order.
 *
 * `media-in` is a POOL (contracts caps it at `EXPORT_MEDIA_POOL_LIMIT`), so N edges into
 * one handle is the ordinary way to ask for a ZIP of N things.
 */
export function exportSourcesFromGraph(
  exportNodeId: string,
  edges: readonly Edge[],
  nodes: readonly { id: string; type?: string; data?: unknown }[],
): ExportSource[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter(
      (edge) =>
        edge.target === exportNodeId &&
        (edge.targetHandle ?? EXPORT_MEDIA_INPUT_HANDLE) === EXPORT_MEDIA_INPUT_HANDLE,
    )
    .map((edge) => byId.get(edge.source))
    .filter((node): node is { id: string; type?: string; data?: unknown } => Boolean(node))
    .map(exportSourceFromNodeData)
    .filter((source): source is ExportSource => source !== null);
}

/** The kind the picker should offer, given what is wired in. Null when nothing is. */
export function exportKindForSources(sources: readonly ExportSource[]): ExportKind | null {
  if (sources.length === 0) return null;
  // Mixed pools are legal (contracts only demands "media"). One video makes the whole
  // pool video for the PICKER, but encoding stays per-source: a still in a video pool
  // is written with its own kind's default format, never pushed through a clip encoder
  // (see `exportFormatForSource`).
  return sources.some((source) => source.kind === 'video') ? 'video' : 'image';
}

/**
 * The format to actually use.
 *
 * A stored format that does not match what is wired in is IGNORED rather than honoured:
 * rewiring a still into an export node that was set to MOV must not produce a `.mov`
 * holding a PNG.
 */
export function resolveExportFormat(
  stored: unknown,
  kind: ExportKind | null,
): ExportFormatId | null {
  if (!kind) return null;
  if (isExportFormatId(stored) && EXPORT_FORMATS[stored].kind === kind) return stored;
  return DEFAULT_EXPORT_FORMAT[kind];
}

/**
 * The format ONE source of a multi-source pool is actually encoded with.
 *
 * The node's single picker can only name formats of the POOL kind (video as soon as one
 * clip is wired), yet a mixed pool is legal. So the picked format applies to sources of
 * its own kind, and every other source takes its kind's default — image bytes through a
 * video encoder is not a conversion, it is "unsupported or unrecognizable format".
 */
export function exportFormatForSource(
  source: ExportSource,
  pooled: ExportFormatId,
): ExportFormatId {
  return EXPORT_FORMATS[pooled].kind === source.kind ? pooled : DEFAULT_EXPORT_FORMAT[source.kind];
}

// ── Writing the files ────────────────────────────────────────────────────────

const toBlob = async (ref: string | Blob): Promise<Blob> => {
  if (ref instanceof Blob) return ref;
  // `fetch` handles data:, blob: and http(s): alike — a hand-rolled base64 decoder here
  // would be a third copy of something the platform already does.
  const response = await fetch(ref);
  if (!response.ok) throw new Error(`Could not read the media to export (${response.status})`);
  return response.blob();
};

const encodeOne = async (
  source: ExportSource,
  format: ExportFormatId,
): Promise<{ blob: Blob; fellBackToH264: boolean }> => {
  const bytes = await toBlob(source.ref);
  if (EXPORT_FORMATS[format].kind === 'image') {
    const { blob } = await transcodeImage(bytes, format);
    return { blob, fellBackToH264: false };
  }
  if (format === 'gif') {
    const { blob } = await encodeGif(bytes);
    return { blob, fellBackToH264: false };
  }
  const encoded = await transcodeVideo(bytes, format);
  return { blob: encoded.blob, fellBackToH264: encoded.fellBackToH264 };
};

export interface RunExportOptions {
  sources: readonly ExportSource[];
  format: ExportFormatId;
  /** Basename without extension. Numbered when there is more than one file. */
  baseName?: string;
  /** Set false to get the bytes back without touching the DOM (a run, or a test). */
  download?: boolean;
}

/**
 * Encode every source and hand back the files — one per source, or a single ZIP when
 * there is more than one.
 *
 * Sources are encoded SEQUENTIALLY. Each video export holds a WebCodecs encoder and a
 * decode pipeline; running twenty of those at once on the main thread is how a tab dies.
 */
export async function runExport(options: RunExportOptions): Promise<ExportRunResult> {
  const { sources, format } = options;
  if (sources.length === 0) throw new Error('Nothing is connected to export');

  const baseName = options.baseName?.trim() || 'canvas-export';
  const single = sources.length === 1;

  const encoded: ExportedFile[] = [];
  let fellBackToH264 = false;
  for (const [index, source] of sources.entries()) {
    // A single source uses the picked format as-is; a pool encodes each source by its
    // own kind so a mixed image+video ZIP can exist at all (see exportFormatForSource).
    const sourceFormat = single ? format : exportFormatForSource(source, format);
    const result = await encodeOne(source, sourceFormat);
    fellBackToH264 = fellBackToH264 || result.fellBackToH264;
    encoded.push({
      name: `${baseName}${single ? '' : `-${index + 1}`}.${EXPORT_FORMATS[sourceFormat].extension}`,
      blob: result.blob,
    });
  }

  const files: ExportedFile[] = single
    ? encoded
    : [
        {
          name: `${baseName}.zip`,
          blob: await zipBlobs(encoded satisfies ZipEntry[]),
        },
      ];

  if (options.download !== false) {
    for (const file of files) downloadAsset({ data: file.blob, baseName: file.name });
  }

  return { files, zipped: !single, fellBackToH264, format };
}
