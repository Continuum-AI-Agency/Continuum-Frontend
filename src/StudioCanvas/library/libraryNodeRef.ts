// Which Library asset + version a canvas node holds, and which pinned Library versions fed
// an output node. Pure: the sync hook, the node status strip and the tests share it.

import {
  type CanvasLibraryAssetContext,
  type CanvasLibraryVersionContext,
  canvasLibrarySource,
  type PinnedLibraryAssetRef,
} from '@continuum/contracts';
import { readNodeAssetRef } from '../utils/nodeAssetRef';

export type LibraryNodeRef = {
  assetId: string;
  versionId: string | null;
  /** The node's own render output (registered by the canvas), not a reference it holds. */
  isOutput: boolean;
  /** Index into data.documents when the pointer lives on a document entry. */
  documentIndex: number | null;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

export function libraryNodeRef(data: unknown): LibraryNodeRef | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const ref = readNodeAssetRef(record);
  if (ref) {
    return {
      assetId: ref.assetId,
      versionId: ref.versionId ?? null,
      isOutput: Boolean(text(record.renderOutputAssetId) ?? text(record.generatedVideoAssetId)),
      documentIndex: null,
    };
  }
  const documents = Array.isArray(record.documents) ? record.documents : [];
  for (const [index, entry] of documents.entries()) {
    const doc = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
    const assetId = text(doc?.assetId);
    if (assetId) {
      return {
        assetId,
        versionId: text(doc?.assetVersionId),
        isOutput: false,
        documentIndex: index,
      };
    }
  }
  return null;
}

type GraphNode = { id: string; data?: unknown };
type GraphEdge = { source: string; target: string };

/**
 * The Library versions a node's inputs PINNED, however many hops upstream — what an
 * output actually derived from. Only reference nodes count (an upstream output is itself a
 * derived asset, credited through its own lineage), and only when they carry a version:
 * a legacy `libraryAssetId`-only seed pins nothing and is left to the register path's head.
 */
export function pinnedUpstreamSources(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  outputNodeId: string,
): PinnedLibraryAssetRef[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const upstream = new Map<string, string[]>();
  for (const edge of edges) {
    upstream.set(edge.target, [...(upstream.get(edge.target) ?? []), edge.source]);
  }
  const pinned = new Map<string, PinnedLibraryAssetRef>();
  const visited = new Set([outputNodeId]);
  const queue = [...(upstream.get(outputNodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    const ref = libraryNodeRef(byId.get(id)?.data);
    if (ref && !ref.isOutput && ref.versionId) {
      pinned.set(ref.versionId, { asset_id: ref.assetId, version_id: ref.versionId });
    }
    queue.push(...(upstream.get(id) ?? []));
  }
  return [...pinned.values()];
}

// ─── What the node strip says ────────────────────────────────────────────────────

type TechnicalAsset = Pick<
  CanvasLibraryAssetContext,
  | 'width'
  | 'height'
  | 'durationMs'
  | 'videoCodec'
  | 'frameRate'
  | 'colorSpace'
  | 'dynamicRange'
  | 'bitDepth'
  | 'hasAlpha'
  | 'audioCodec'
  | 'audioChannels'
  | 'audioSampleRate'
  | 'pageCount'
>;

/** The technical facts the Library knows, in reading order. Unknown ones are left out. */
export function libraryTechnicalFacts(asset: TechnicalAsset): string[] {
  const facts: string[] = [];
  if (asset.width && asset.height) facts.push(`${asset.width}×${asset.height}`);
  if (asset.durationMs) facts.push(`${(asset.durationMs / 1000).toFixed(1)} s`);
  if (asset.videoCodec) facts.push(asset.videoCodec);
  if (asset.frameRate) facts.push(`${Number(asset.frameRate.toFixed(3))} fps`);
  if (asset.dynamicRange && asset.dynamicRange !== 'sdr' && asset.dynamicRange !== 'unknown') {
    facts.push(asset.dynamicRange.toUpperCase());
  }
  if (asset.colorSpace) facts.push(asset.colorSpace);
  if (asset.bitDepth) facts.push(`${asset.bitDepth}-bit`);
  if (asset.hasAlpha) facts.push('alpha');
  if (asset.audioCodec) {
    const layout = asset.audioChannels === 1 ? 'mono' : asset.audioChannels === 2 ? 'stereo' : null;
    const rate = asset.audioSampleRate ? `${asset.audioSampleRate / 1000} kHz` : null;
    facts.push([asset.audioCodec, layout, rate].filter(Boolean).join(' '));
  }
  if (asset.pageCount) facts.push(`${asset.pageCount} page${asset.pageCount === 1 ? '' : 's'}`);
  return facts;
}

/**
 * The node data that moves a reference node onto the Library head: the pointer, the file
 * the node draws for it (original or rendition), and the decision it now shows. Null when
 * the head has nothing the canvas can draw yet. The drawable URL is re-signed afterwards.
 */
export function latestVersionPatch(input: {
  data: Record<string, unknown>;
  ref: LibraryNodeRef;
  asset: Pick<CanvasLibraryAssetContext, 'kind' | 'reviewStatus'>;
  head: CanvasLibraryVersionContext;
}): Record<string, unknown> | null {
  const source = canvasLibrarySource({
    kind: input.asset.kind,
    fileName: input.head.fileName,
    mimeType: input.head.mimeType,
    bucket: input.head.bucket,
    storagePath: input.head.storagePath,
    renditions: input.head.renditions,
  });
  if (!source) return null;
  const common = { libraryAckReviewStatus: input.asset.reviewStatus };
  if (input.ref.documentIndex !== null) {
    const documents = Array.isArray(input.data.documents) ? [...input.data.documents] : [];
    const current = documents[input.ref.documentIndex];
    documents[input.ref.documentIndex] = {
      ...(current && typeof current === 'object' ? current : {}),
      assetVersionId: input.head.id,
      bucket: source.bucket,
      storagePath: source.storagePath,
      name: input.head.fileName,
      sourceUrl: undefined,
    };
    return { ...common, documents };
  }
  return {
    ...common,
    assetVersionId: input.head.id,
    bucket: source.bucket,
    sourcePath: source.storagePath,
    fileName: input.head.fileName,
    renditionRole: source.renditionRole,
    sourceUrl: undefined,
  };
}
