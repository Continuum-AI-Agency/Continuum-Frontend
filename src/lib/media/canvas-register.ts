// Pure mapping from a register-canvas request to a media.assets insert row, plus
// the graph reader that resolves which Library assets fed the generation. Kept
// dependency-free (type-only contract import) so it is unit-testable without a
// Supabase client. Mirrors the backend buildGeneratedMediaAssetRow.

import type { RegisterCanvasAssetRequest, RegisteredAssetOriginRef } from '@continuum/contracts';

export type CanvasAssetRow = {
  brand_id: string;
  created_by: string | null;
  kind: 'image' | 'video';
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source: 'canvas' | 'ai_generated';
  origin_ref: Record<string, unknown>;
  status: 'stored';
};

// Which delineated library folder each producer composites under. Smart resize is
// an AI Studio generation that never touched a canvas, so calling it 'canvas'
// would misfile it.
const SOURCE_BY_ORIGIN_KIND: Record<RegisteredAssetOriginRef['kind'], CanvasAssetRow['source']> = {
  canvas: 'canvas',
  resize: 'ai_generated',
};

// Every Library asset that fed a generated output. Resolved server-side (off the
// persisted graph, or from an origin ref the route re-checks) rather than sent by
// the client: the origin-ref request schema is .strict(), but origin_ref on
// media.assets is free-form jsonb, so the row can carry more than the wire does.
export type AssetProvenance = {
  // Legacy scalar — the seed asset the room was opened from. Still written because
  // media_get_asset_usage honours it, and rows registered before sourceAssetIds
  // existed carry nothing else.
  sourceAssetId?: string;
  // Every contributor, seed included. This is the array media_get_asset_usage reads.
  sourceAssetIds: string[];
};

export function buildCanvasAssetRow(
  input: RegisterCanvasAssetRequest,
  userId: string | null,
  provenance?: AssetProvenance | null,
): CanvasAssetRow {
  return {
    brand_id: input.brandProfileId,
    created_by: userId,
    kind: input.kind,
    bucket: input.bucket,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_ms: input.durationMs ?? null,
    source: SOURCE_BY_ORIGIN_KIND[input.originRef.kind],
    origin_ref: {
      ...input.originRef,
      ...(provenance?.sourceAssetId ? { sourceAssetId: provenance.sourceAssetId } : {}),
      ...(provenance && provenance.sourceAssetIds.length > 0
        ? { sourceAssetIds: provenance.sourceAssetIds }
        : {}),
    },
    status: 'stored',
  };
}

// Three writers stamp a Library asset id onto a node, so three keys have to be
// read: `assetId` (attach_media, plus a dropped or uploaded reference),
// `libraryAssetId` (the reference node buildLibraryCanvasTemplate seeds), and
// `sourceAssetId` (the generation node that same template seeds). Reading all
// three is what keeps graphs written before `assetId` existed resolvable.
const ASSET_ID_KEYS = ['assetId', 'libraryAssetId', 'sourceAssetId'] as const;

type GraphNode = { id?: unknown; data?: unknown };
type GraphEdge = { source?: unknown; target?: unknown };

function readAssetIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  return ASSET_ID_KEYS.map((key) => record[key]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

function graphNodes(nodes: unknown): GraphNode[] {
  return Array.isArray(nodes)
    ? nodes.filter((n): n is GraphNode => !!n && typeof n === 'object')
    : [];
}

// source -> targets, keyed the way we walk it: from an output node back to
// everything upstream of it.
function sourcesByTarget(edges: unknown): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!Array.isArray(edges)) return map;
  for (const raw of edges) {
    const edge = raw as GraphEdge | null;
    if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string') continue;
    const existing = map.get(edge.target) ?? [];
    existing.push(edge.source);
    map.set(edge.target, existing);
  }
  return map;
}

// The generating node keeps the id of the Library asset the room was seeded from
// (buildLibraryCanvasTemplate stamps `sourceAssetId` on it). Reading it back off the
// persisted graph at registration time is what closes the Library → Canvas → Library
// round trip, and it survives the node being deleted afterwards because the id is
// copied onto the new asset's origin_ref.
export function readSeedSourceAssetId(nodes: unknown, nodeId: string): string | null {
  for (const node of graphNodes(nodes)) {
    if (node.id !== nodeId) continue;
    const sourceAssetId = (node.data as { sourceAssetId?: unknown } | null)?.sourceAssetId;
    return typeof sourceAssetId === 'string' && sourceAssetId.length > 0 ? sourceAssetId : null;
  }
  return null;
}

// Every Library asset that reached the output node — the seed AND each reference
// image/video wired into the generation, however many hops upstream. A generation
// is credited to all of its inputs, not just the one the room was opened from,
// otherwise "where has this creative been used" misses every asset a user dragged
// in by hand. Cycles are impossible on a valid canvas but the visited set makes
// them harmless anyway.
export function collectContributingAssetIds(
  nodes: unknown,
  edges: unknown,
  outputNodeId: string,
): string[] {
  const dataById = new Map(
    graphNodes(nodes)
      .filter((node): node is GraphNode & { id: string } => typeof node.id === 'string')
      .map((node) => [node.id, node.data]),
  );
  if (!dataById.has(outputNodeId)) return [];

  const upstream = sourcesByTarget(edges);
  const assetIds = new Set<string>();
  const visited = new Set<string>([outputNodeId]);
  const queue: string[] = [outputNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift() as string;
    for (const assetId of readAssetIds(dataById.get(nodeId))) assetIds.add(assetId);
    for (const source of upstream.get(nodeId) ?? []) {
      if (visited.has(source) || !dataById.has(source)) continue;
      visited.add(source);
      queue.push(source);
    }
  }

  return [...assetIds];
}

// A canvas re-run reuses its storage path, and the AI Studio backend registers its
// own outputs the moment they are stored — so the row we are registering may already
// exist. Fold the lineage into whatever origin_ref that row carries instead of
// overwriting it, and return null when there is nothing new to write so the caller
// can skip the round trip.
export function mergeOriginRefLineage(
  existing: unknown,
  provenance: AssetProvenance,
): Record<string, unknown> | null {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const current = Array.isArray(base.sourceAssetIds)
    ? base.sourceAssetIds.filter((id): id is string => typeof id === 'string')
    : [];
  const merged = [...new Set([...current, ...provenance.sourceAssetIds])];

  const addsSeed =
    provenance.sourceAssetId && typeof base.sourceAssetId !== 'string'
      ? provenance.sourceAssetId
      : null;
  if (merged.length === current.length && !addsSeed) return null;

  if (merged.length > 0) base.sourceAssetIds = merged;
  if (addsSeed) base.sourceAssetId = addsSeed;
  return base;
}

// Images and videos both go through analyze_media (mirrors the backend
// shouldAutoAnalyze); a video also comes back with a transcript, so it becomes
// searchable by what is said in it. Canvas never produces 'file' assets, so
// there is no third case to exclude here.
export function shouldAnalyzeCanvasAsset(kind: 'image' | 'video'): boolean {
  return kind === 'image' || kind === 'video';
}
