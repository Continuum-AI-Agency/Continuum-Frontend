import type { Edge } from '@xyflow/react';
import { TIMELINE_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import type { StudioNode, ClipSlot, TimelineItem, TimelineInputSource, TimelineTrack } from '../../types';
import type { NodeOutput } from '../../types/execution';
import type { TimelineOverlayRenderItem, TimelineRenderItem } from './composeTimeline';
import { parseDataUrl } from '../dataUrl';
import { isVideoGeneratorNodeType } from '../videoModel';

export type ResolvedClip = {
  slotId: string;
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Clip data URL is malformed');
  }
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: parsed.mimeType || 'video/mp4' });
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch clip source (${response.status})`);
  }
  return response.blob();
}

function readVideoFromSourceNode(node: StudioNode | undefined): string | undefined {
  if (!node) return undefined;

  if (node.type === 'video') {
    const value = (node.data as { video?: unknown }).video;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  // Mirror the contracts' isVideoProducingSource (workflow-graph.ts): both editor
  // node types emit generatedVideo/generatedVideoUrl. Omitting timelineEditor here
  // let the canvas connect + place a Video Editor's output but then fail the render
  // with "upstream produced no media".
  if (
    isVideoGeneratorNodeType(node.type) ||
    node.type === 'extendVideo' ||
    node.type === 'videoEditor' ||
    node.type === 'timelineEditor'
  ) {
    const data = node.data as { generatedVideo?: unknown; generatedVideoUrl?: unknown };
    const generated = typeof data.generatedVideo === 'string' && data.generatedVideo.trim() ? data.generatedVideo.trim() : undefined;
    if (generated) return generated;
    const url = typeof data.generatedVideoUrl === 'string' && data.generatedVideoUrl.trim() ? data.generatedVideoUrl.trim() : undefined;
    return url;
  }

  return undefined;
}

async function resolveSource(source: string): Promise<Blob> {
  if (source.startsWith('data:')) {
    return dataUrlToBlob(source);
  }
  return uriToBlob(source);
}

export async function resolveClipSources(
  slots: ClipSlot[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<ResolvedClip[]> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ordered = [...slots].sort((a, b) => a.order - b.order);

  const resolved = await Promise.all(
    ordered.map(async (slot) => {
      const handleId = `clip-${slot.id}`;
      const edge = edges.find((e) => e.target === targetNodeId && e.targetHandle === handleId);
      if (!edge) {
        throw new Error(`Clip slot ${slot.order + 1}: no connected source`);
      }

      const upstream = resolvedOutputs.get(edge.source);
      let source: string | undefined;

      if (upstream?.type === 'video' && upstream.url) {
        source = upstream.url;
      } else {
        source = readVideoFromSourceNode(nodeById.get(edge.source));
      }

      if (!source) {
        throw new Error(`Clip slot ${slot.order + 1}: upstream did not produce a video`);
      }

      const blob = await resolveSource(source);
      return {
        slotId: slot.id,
        blob,
        trimStartSec: slot.trimStartSec,
        trimEndSec: slot.trimEndSec,
      } satisfies ResolvedClip;
    }),
  );

  return resolved;
}

const isUsableUrl = (value?: string | null): value is string =>
  typeof value === 'string' && (value.startsWith('data:') || /^(https?|blob):/i.test(value.trim()));

function readImageFromSourceNode(node: StudioNode | undefined): string | undefined {
  if (!node) return undefined;

  if (node.type === 'image') {
    const value = (node.data as { image?: unknown }).image;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  if (node.type === 'nanoGen') {
    const data = node.data as { generatedImage?: unknown; generatedImageUrl?: unknown };
    const generated =
      typeof data.generatedImage === 'string' && data.generatedImage.trim() ? data.generatedImage.trim() : undefined;
    if (generated) return generated;
    const url =
      typeof data.generatedImageUrl === 'string' && data.generatedImageUrl.trim() ? data.generatedImageUrl.trim() : undefined;
    return url;
  }

  return undefined;
}

function deriveSourceLabel(node: StudioNode): string {
  const data = node.data as { label?: unknown; fileName?: unknown };
  if (typeof data.label === 'string' && data.label.trim()) return data.label.trim();
  if (typeof data.fileName === 'string' && data.fileName.trim()) return data.fileName.trim();
  switch (node.type) {
    case 'image':
      return 'Image';
    case 'nanoGen':
      return 'Generated image';
    case 'video':
      return 'Video';
    case 'extendVideo':
      return 'Extended video';
    case 'videoEditor':
    case 'timelineEditor':
      return 'Edited video';
    default:
      return 'Clip';
  }
}

function readSourceKindAndUrl(node: StudioNode | undefined): { kind: 'video' | 'image'; url?: string } {
  if (node?.type === 'image' || node?.type === 'nanoGen') {
    return { kind: 'image', url: readImageFromSourceNode(node) };
  }
  return { kind: 'video', url: readVideoFromSourceNode(node) };
}

// Enumerate the Video Editor (timelineEditor) input pool: the image/video source
// nodes connected to the node's single `media-in` handle. Each becomes a
// placeable tile in the editor's media bin. De-duplicated by source node id.
export function resolveTimelineInputPool(
  targetNodeId: string,
  edges: Edge[],
  nodes: StudioNode[],
): TimelineInputSource[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const pool: TimelineInputSource[] = [];

  for (const edge of edges) {
    if (edge.target !== targetNodeId || (edge.targetHandle ?? '') !== TIMELINE_MEDIA_INPUT_HANDLE) continue;
    if (seen.has(edge.source)) continue;
    const node = nodeById.get(edge.source);
    if (!node) continue;
    seen.add(edge.source);
    const { kind, url } = readSourceKindAndUrl(node);
    pool.push({
      nodeId: edge.source,
      kind,
      label: deriveSourceLabel(node),
      previewUrl: isUsableUrl(url) ? url : undefined,
    });
  }

  return pool;
}

// A cached resolver from a source node id to its bytes + kind (a source placed
// more than once — via split, or across base + overlay tracks — is fetched
// once and shared). Shared by the base and overlay resolvers.
function createTimelineSourceResolver(
  nodeById: Map<string, StudioNode>,
  resolvedOutputs: Map<string, NodeOutput>,
): (sourceId: string) => Promise<{ kind: 'video' | 'image'; blob: Blob }> {
  const cache = new Map<string, Promise<{ kind: 'video' | 'image'; blob: Blob }>>();
  return (sourceId: string) => {
    const cached = cache.get(sourceId);
    if (cached) return cached;
    const promise = (async () => {
      const upstream = resolvedOutputs.get(sourceId);
      let kind: 'video' | 'image';
      let source: string | undefined;
      if (upstream?.type === 'video' && upstream.url) {
        kind = 'video';
        source = upstream.url;
      } else if (upstream?.type === 'image' && (isUsableUrl(upstream.url) || upstream.base64)) {
        kind = 'image';
        source = isUsableUrl(upstream.url)
          ? upstream.url
          : `data:${upstream.mimeType || 'image/png'};base64,${upstream.base64}`;
      } else {
        const resolved = readSourceKindAndUrl(nodeById.get(sourceId));
        kind = resolved.kind;
        source = resolved.url;
      }
      if (!source) {
        throw new Error(`Timeline source ${sourceId}: upstream produced no media`);
      }
      const blob = await resolveSource(source);
      return { kind, blob };
    })();
    cache.set(sourceId, promise);
    return promise;
  };
}

// Resolve each overlay-track placement to its source bytes. Overlays float on
// top of the base track at their absolute `startSec`.
export async function resolveTimelineOverlays(
  tracks: TimelineTrack[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<TimelineOverlayRenderItem[]> {
  const overlayItems = tracks.flatMap((track) => track.items);
  if (overlayItems.length === 0) return [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const poolSourceIds = new Set(
    edges
      .filter((e) => e.target === targetNodeId && (e.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE)
      .map((e) => e.source),
  );
  const resolveSourceNode = createTimelineSourceResolver(nodeById, resolvedOutputs);

  return Promise.all(
    overlayItems.map(async (item) => {
      if (!item.sourceNodeId || !poolSourceIds.has(item.sourceNodeId)) {
        throw new Error(`Overlay item ${item.id}: no connected source`);
      }
      const { kind, blob } = await resolveSourceNode(item.sourceNodeId);
      return {
        itemId: item.id,
        kind,
        blob,
        startSec: Math.max(0, item.startSec ?? 0),
        trimStartSec: item.trimStartSec,
        trimEndSec: item.trimEndSec,
        durationSec: item.durationSec,
        muteAudio: item.muteAudio,
        volume: item.volume,
        audioFadeInSec: item.audioFadeInSec,
        audioFadeOutSec: item.audioFadeOutSec,
        effects: item.effects,
      } satisfies TimelineOverlayRenderItem;
    }),
  );
}

// Resolve each Video Editor (timelineEditor) placement to its source bytes +
// kind. Placements reference a pool member by `sourceNodeId`; the kind is
// authoritative from the connected source node/output (an image node → still,
// any video producer → clip). A source placed more than once (e.g. via split)
// is fetched once and shared.
export async function resolveTimelineSources(
  items: TimelineItem[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<TimelineRenderItem[]> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const poolSourceIds = new Set(
    edges
      .filter((e) => e.target === targetNodeId && (e.targetHandle ?? '') === TIMELINE_MEDIA_INPUT_HANDLE)
      .map((e) => e.source),
  );
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const resolveSourceNode = createTimelineSourceResolver(nodeById, resolvedOutputs);

  return Promise.all(
    ordered.map(async (item) => {
      if (!item.sourceNodeId || !poolSourceIds.has(item.sourceNodeId)) {
        throw new Error(`Timeline item ${item.order + 1}: no connected source`);
      }
      const { kind, blob } = await resolveSourceNode(item.sourceNodeId);
      return {
        itemId: item.id,
        kind,
        blob,
        trimStartSec: item.trimStartSec,
        trimEndSec: item.trimEndSec,
        durationSec: item.durationSec,
        muteAudio: item.muteAudio,
        volume: item.volume,
        audioFadeInSec: item.audioFadeInSec,
        audioFadeOutSec: item.audioFadeOutSec,
        effects: item.effects,
        transition: item.transition,
      } satisfies TimelineRenderItem;
    }),
  );
}
