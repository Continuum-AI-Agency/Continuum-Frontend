'use client';

import {
  canvasVisualEvidenceSchema,
  planFrameTimestamps,
  VISUAL_EVIDENCE_MAX_BASE64_BYTES,
  VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES,
  VISUAL_EVIDENCE_MAX_FRAMES,
  type VisualEvidenceFrame,
} from '@continuum/contracts';
import type { StudioNode } from '@/StudioCanvas/types';

// Sampling canvas media so the composer can actually SEE it.
//
// This runs in the browser because it is the only place it can: Bun has no WebCodecs,
// and backend mediabunny reads containers without decoding them, so a server-side
// sampler would need a codec package this repo has deliberately not adopted. The canvas
// already decodes video here for filmstrip thumbnails, so the frames are cheap exactly
// where the user is.
//
// Frames are sampled BEFORE the turn is sent and ride along with the request. A compose
// run is durable and detachable — the tab may be gone by the time the agent decides to
// look — so asking the browser for frames mid-turn would make the agent's reach depend
// on whether someone kept a tab open. They cost nothing until `look_at` pulls one in.

// Big enough for a model to read a product, a face, or a headline; small enough that a
// dozen of them fit the request budget. Vision models downsample hard anyway — the
// filmstrip's 64px is right for a UI strip and useless for reading type.
const FRAME_MAX_EDGE_PX = 512;
const FRAME_QUALITY = 0.7;
const FRAME_MEDIA_TYPE = 'image/jpeg' as const;

/** Node types whose media is worth reading. */
const MEDIA_NODE_TYPES = new Set(['image', 'video', 'element', 'designRef']);
const OUTPUT_NODE_TYPES = new Set([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'omniGen',
  'extendVideo',
  'hyperframesAgent',
  'timelineEditor',
]);

type NodeData = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

/**
 * Where this node's viewable media actually lives.
 *
 * Reference nodes carry `sourceUrl`; a generator carries whatever it last produced. The
 * generated keys are checked FIRST so that "look at the second one" after a run reads
 * the render rather than the reference that fed it.
 */
export function resolveMediaUrl(node: { type?: string; data?: NodeData }): string | undefined {
  const data = node.data ?? {};
  return (
    str(data.generatedVideoUrl) ??
    str(data.generatedImageUrl) ??
    (typeof data.generatedImage === 'string' ? str(data.generatedImage) : undefined) ??
    str(data.sourceUrl) ??
    str(data.previewUrl) ??
    str(data.url)
  );
}

export function isVideoNode(node: { type?: string; data?: NodeData }): boolean {
  const data = node.data ?? {};
  if (node.type === 'video' || node.type === 'timelineEditor') return true;
  if (str(data.generatedVideoUrl)) return true;
  return (
    node.type === 'videoGen' ||
    node.type === 'veoDirector' ||
    node.type === 'veoFast' ||
    node.type === 'omniGen' ||
    node.type === 'extendVideo' ||
    node.type === 'hyperframesAgent'
  );
}

/**
 * Which nodes are worth sampling, best first.
 *
 * The user's selection leads because it is the only reliable statement of what this
 * turn is about. Everything else follows in canvas order and is cut off by the budget,
 * so a canvas with forty images spends its frames on the ones being pointed at.
 */
export function rankEvidenceCandidates(
  nodes: readonly StudioNode[],
  selectedNodeIds: readonly string[] = [],
): StudioNode[] {
  const selected = new Set(selectedNodeIds);
  const eligible = nodes.filter((node) => {
    const type = node.type ?? '';
    if (!MEDIA_NODE_TYPES.has(type) && !OUTPUT_NODE_TYPES.has(type)) return false;
    return resolveMediaUrl(node) !== undefined;
  });
  return [
    ...eligible.filter((node) => selected.has(node.id)),
    ...eligible.filter((node) => !selected.has(node.id)),
  ];
}

function toJpegDataParts(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, FRAME_MAX_EDGE_PX / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  // Strip the `data:image/jpeg;base64,` prefix — the wire carries raw base64.
  return canvas.toDataURL(FRAME_MEDIA_TYPE, FRAME_QUALITY).split(',')[1] ?? '';
}

async function sampleImage(url: string): Promise<{ base64: string } | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = url;
  if (!(await loaded)) return null;
  const base64 = toJpegDataParts(image, image.naturalWidth, image.naturalHeight);
  return base64 ? { base64 } : null;
}

async function sampleVideo(url: string): Promise<{
  frames: Array<{ base64: string; timestampSec: number }>;
  durationSec: number;
} | null> {
  const mb = await import('mediabunny');
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const durationSec = await input.computeDuration();
    const timestamps = planFrameTimestamps(durationSec);
    const sink = new mb.CanvasSink(track);
    const frames: Array<{ base64: string; timestampSec: number }> = [];
    let index = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      const timestampSec = timestamps[index] ?? 0;
      index += 1;
      if (!wrapped) continue;
      const base64 = toJpegDataParts(wrapped.canvas, wrapped.canvas.width, wrapped.canvas.height);
      if (base64) frames.push({ base64, timestampSec });
    }
    return { frames, durationSec };
  } finally {
    (input as unknown as { dispose?: () => void }).dispose?.();
  }
}

/**
 * Sample the canvas for this turn, stopping at the request budget.
 *
 * Fails soft on every axis: a node with no URL, a fetch that 403s on an expired signed
 * URL, a codec the browser will not decode — each drops that node and keeps the rest.
 * Nothing here is worth failing a compose over; the agent simply has less to look at,
 * and `look_at` already reports which nodes it had no frames for.
 */
export async function collectVisualEvidence(params: {
  nodes: readonly StudioNode[];
  selectedNodeIds?: readonly string[];
}): Promise<VisualEvidenceFrame[]> {
  const candidates = rankEvidenceCandidates(params.nodes, params.selectedNodeIds);
  const collected: VisualEvidenceFrame[] = [];
  let bytes = 0;

  // Per frame as well as in total. The per-frame cap is the tighter of the two now that
  // both are sized from what this encoder actually emits, and the final safeParse below
  // is all-or-nothing — so one unusually dense frame slipping through here would cost
  // the turn every other frame it had already collected.
  const fits = (frame: VisualEvidenceFrame): boolean =>
    collected.length < VISUAL_EVIDENCE_MAX_FRAMES &&
    frame.base64.length <= VISUAL_EVIDENCE_MAX_FRAME_BASE64_BYTES &&
    bytes + frame.base64.length <= VISUAL_EVIDENCE_MAX_BASE64_BYTES;

  for (const node of candidates) {
    if (collected.length >= VISUAL_EVIDENCE_MAX_FRAMES) break;
    const url = resolveMediaUrl(node);
    if (!url) continue;
    const label = str((node.data as NodeData | undefined)?.label);

    try {
      if (isVideoNode(node)) {
        const sampled = await sampleVideo(url);
        if (!sampled) continue;
        for (const frame of sampled.frames) {
          const candidate: VisualEvidenceFrame = {
            nodeId: node.id,
            kind: 'video',
            timestampSec: frame.timestampSec,
            durationSec: sampled.durationSec,
            ...(label ? { label } : {}),
            mediaType: FRAME_MEDIA_TYPE,
            base64: frame.base64,
          };
          if (!fits(candidate)) break;
          collected.push(candidate);
          bytes += candidate.base64.length;
        }
        continue;
      }

      const still = await sampleImage(url);
      if (!still) continue;
      const candidate: VisualEvidenceFrame = {
        nodeId: node.id,
        kind: 'image',
        timestampSec: 0,
        ...(label ? { label } : {}),
        mediaType: FRAME_MEDIA_TYPE,
        base64: still.base64,
      };
      if (!fits(candidate)) continue;
      collected.push(candidate);
      bytes += candidate.base64.length;
    } catch {
      // One undecodable source must not cost the turn its other frames.
    }
  }

  // The schema is the budget's last word: anything that slipped past the running
  // tally is dropped here rather than 400ing the compose request.
  return canvasVisualEvidenceSchema.safeParse(collected).success ? collected : [];
}
