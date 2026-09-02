import {
  actionDef,
  type GraphNodeLike,
  STUDIO_NODE_REGISTRY,
  TIMELINE_MEDIA_INPUT_HANDLE,
  type TimelineMediaKind,
  timelineMediaKind,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode, TimelineInputSource, TimelineItem, TimelineTrack } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { parseDataUrl } from '../dataUrl';
import type {
  TimelineAudioRenderItem,
  TimelineOverlayRenderItem,
  TimelineRenderItem,
} from './composeTimeline';

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

async function resolveSource(source: string): Promise<Blob> {
  if (source.startsWith('data:')) {
    return dataUrlToBlob(source);
  }
  return uriToBlob(source);
}

const isUsableUrl = (value?: string | null): value is string =>
  typeof value === 'string' && (value.startsWith('data:') || /^(https?|blob):/i.test(value.trim()));

// Every canvas node stamps whatever came out of it under the same few keys — the
// generators, the Canvas V3 `action`/`router`, the editors and the reference nodes
// (see ModalityPreview and the node data types). So the media is read by KIND, and
// the kind comes from contracts. A per-node-type list here is precisely what drifted
// away from the connection validator when the action catalog landed.
const MEDIA_KEYS: Readonly<Record<TimelineMediaKind, readonly string[]>> = {
  video: ['generatedVideo', 'generatedVideoUrl', 'video', 'sourceUrl'],
  image: [
    'generatedImage',
    'generatedImageUrl',
    'image',
    // `element` previews under previewUrl, `designRef` under specimenUrl.
    'previewUrl',
    'specimenUrl',
    'sourceUrl',
  ],
  audio: ['audio', 'sourceUrl'],
};

function readMediaUrl(node: StudioNode, kind: TimelineMediaKind): string | undefined {
  const data = node.data as Record<string, unknown>;
  for (const key of MEDIA_KEYS[kind]) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // A collection output (batch, or a fan-out op) previews and places its first item;
  // one pool tile is one clip.
  const items = data.collectionItems;
  if (Array.isArray(items)) {
    const first = items.find((item) => typeof item === 'string' && item.trim());
    if (typeof first === 'string') return first.trim();
  }
  return undefined;
}

const asGraphNode = (node: StudioNode): GraphNodeLike => ({
  id: node.id,
  type: node.type,
  data: node.data as Record<string, unknown>,
});

// The bin tile's name. An `action` is named by its OP — "Colour Grade", not "Action" —
// and every other type takes the one menu label contracts already carries, so a node
// type added later is named here for free instead of falling through to "Clip".
function deriveSourceLabel(node: StudioNode): string {
  const data = node.data as { label?: unknown; fileName?: unknown; actionId?: unknown };
  if (typeof data.label === 'string' && data.label.trim()) return data.label.trim();
  if (typeof data.fileName === 'string' && data.fileName.trim()) return data.fileName.trim();
  const action = actionDef(data.actionId);
  if (action) return action.label;
  const type = node.type as keyof typeof STUDIO_NODE_REGISTRY | undefined;
  return (type && STUDIO_NODE_REGISTRY[type]?.label) || 'Clip';
}

function sourceAssetId(node: StudioNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  const candidate = data.assetId ?? data.renderOutputAssetId ?? data.sourceAssetId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function sourceVersionId(node: StudioNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  const candidate = data.assetVersionId ?? data.renderOutputAssetVersionId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

type ResolvedMedia = { kind: TimelineMediaKind; url?: string };

// What a node handed downstream while the run is still in memory. Preferred over the
// node's stamped data: it is the fresher of the two.
function readMediaFromOutput(output: NodeOutput | undefined): ResolvedMedia | undefined {
  if (output?.type === 'video' && output.url) return { kind: 'video', url: output.url };
  if (output?.type === 'image' && (isUsableUrl(output.url) || output.base64)) {
    return {
      kind: 'image',
      url: isUsableUrl(output.url)
        ? output.url
        : `data:${output.mimeType || 'image/png'};base64,${output.base64}`,
    };
  }
  return undefined;
}

// The kind is contracts' `timelineMediaKind` — THE predicate `isConnectionCompatible`
// admits a source onto `media-in` with — so every node the canvas lets you connect
// resolves here instead of falling through to a blank `video` tile.
function readSourceKindAndUrl(
  node: StudioNode | undefined,
  sourceHandle?: string | null,
  resolvedOutputs?: Map<string, NodeOutput>,
): ResolvedMedia {
  if (!node) return { kind: 'video' };
  const fromOutput = readMediaFromOutput(resolvedOutputs?.get(node.id));
  if (fromOutput) return fromOutput;
  const kind = timelineMediaKind(asGraphNode(node), sourceHandle) ?? 'video';
  return { kind, url: readMediaUrl(node, kind) };
}

// The `media-in` pool as source node id → the handle it left its source on. The
// handle disambiguates the multi-output types (a `designRef` emits a specimen on
// `image` and a token summary on `text`).
function mediaInSourceHandles(edges: Edge[], targetNodeId: string): Map<string, string | null> {
  const handleBySource = new Map<string, string | null>();
  for (const edge of edges) {
    if (edge.target !== targetNodeId || (edge.targetHandle ?? '') !== TIMELINE_MEDIA_INPUT_HANDLE)
      continue;
    if (handleBySource.has(edge.source)) continue;
    handleBySource.set(edge.source, edge.sourceHandle ?? null);
  }
  return handleBySource;
}

// Enumerate the Video Editor (timelineEditor) input pool: the source nodes connected
// to the node's single `media-in` handle. Each becomes a placeable tile in the
// editor's media bin. De-duplicated by source node id.
//
// `resolvedOutputs` is the same in-memory run map the placement resolvers read, so a
// node that has just executed shows its REAL preview and its real kind in the bin
// rather than a blank tile that only comes right after the graph is reloaded.
export function resolveTimelineInputPool(
  targetNodeId: string,
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs?: Map<string, NodeOutput>,
): TimelineInputSource[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const pool: TimelineInputSource[] = [];

  for (const [sourceId, sourceHandle] of mediaInSourceHandles(edges, targetNodeId)) {
    const node = nodeById.get(sourceId);
    if (!node) continue;
    const { kind, url } = readSourceKindAndUrl(node, sourceHandle, resolvedOutputs);
    pool.push({
      nodeId: sourceId,
      kind,
      label: deriveSourceLabel(node),
      ...(sourceAssetId(node) ? { sourceAssetId: sourceAssetId(node) } : {}),
      ...(sourceVersionId(node) ? { sourceVersionId: sourceVersionId(node) } : {}),
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
  handleBySource: Map<string, string | null>,
): (sourceId: string) => Promise<{ kind: TimelineMediaKind; blob: Blob }> {
  const cache = new Map<string, Promise<{ kind: TimelineMediaKind; blob: Blob }>>();
  return (sourceId: string) => {
    const cached = cache.get(sourceId);
    if (cached) return cached;
    const promise = (async () => {
      const { kind, url } = readSourceKindAndUrl(
        nodeById.get(sourceId),
        handleBySource.get(sourceId),
        resolvedOutputs,
      );
      if (!url) {
        throw new Error(`Timeline source ${sourceId}: upstream produced no media`);
      }
      const blob = await resolveSource(url);
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
  const handleBySource = mediaInSourceHandles(edges, targetNodeId);
  const resolveSourceNode = createTimelineSourceResolver(nodeById, resolvedOutputs, handleBySource);

  return Promise.all(
    overlayItems.map(async (item) => {
      if (!item.sourceNodeId || !handleBySource.has(item.sourceNodeId)) {
        throw new Error(`Overlay item ${item.id}: no connected source`);
      }
      const { kind, blob } = await resolveSourceNode(item.sourceNodeId);
      if (kind === 'audio') {
        throw new Error(`Overlay item ${item.id}: audio belongs on an audio track`);
      }
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
  const handleBySource = mediaInSourceHandles(edges, targetNodeId);
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const resolveSourceNode = createTimelineSourceResolver(nodeById, resolvedOutputs, handleBySource);

  return Promise.all(
    ordered.map(async (item) => {
      if (!item.sourceNodeId || !handleBySource.has(item.sourceNodeId)) {
        throw new Error(`Timeline item ${item.order + 1}: no connected source`);
      }
      const { kind, blob } = await resolveSourceNode(item.sourceNodeId);
      if (kind === 'audio') {
        throw new Error(`Timeline item ${item.order + 1}: audio belongs on an audio track`);
      }
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

export async function resolveTimelineAudioTracks(
  tracks: TimelineTrack[],
  edges: Edge[],
  nodes: StudioNode[],
  resolvedOutputs: Map<string, NodeOutput>,
  targetNodeId: string,
): Promise<TimelineAudioRenderItem[]> {
  const audioItems = tracks
    .filter((track) => track.kind === 'audio')
    .flatMap((track) => track.items);
  if (audioItems.length === 0) return [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const handleBySource = mediaInSourceHandles(edges, targetNodeId);
  const resolveSourceNode = createTimelineSourceResolver(nodeById, resolvedOutputs, handleBySource);

  return Promise.all(
    audioItems.map(async (item) => {
      if (!item.sourceNodeId || !handleBySource.has(item.sourceNodeId)) {
        throw new Error(`Audio item ${item.id}: no connected source`);
      }
      const { kind, blob } = await resolveSourceNode(item.sourceNodeId);
      if (kind !== 'audio') {
        throw new Error(`Audio item ${item.id}: source is not audio`);
      }
      return {
        itemId: item.id,
        blob,
        startSec: Math.max(0, item.startSec ?? 0),
        trimStartSec: item.trimStartSec,
        trimEndSec: item.trimEndSec,
        volume: item.volume,
        fadeInSec: item.audioFadeInSec,
        fadeOutSec: item.audioFadeOutSec,
      } satisfies TimelineAudioRenderItem;
    }),
  );
}
