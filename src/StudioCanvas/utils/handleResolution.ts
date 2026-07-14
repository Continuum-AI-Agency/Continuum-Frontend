import type { StudioNodeType } from '@continuum/contracts';
import { getAllowedSourceHandles, getAllowedTargetHandles } from './isValidConnection';

// The node types the edge-drop-to-create flow (useEdgeDropNode) and the sidebar
// drag-drop flow (resolveSidebarDropTarget) know how to instantiate.
export type NodeType =
  | 'nanoGen'
  | 'videoGen'
  | 'veoDirector'
  | 'extendVideo'
  | 'string'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'videoDecode';

export type EdgeDataType = 'text' | 'image' | 'video' | 'audio' | 'document';

// Derives the best target handle for a newly-created (or existing) node by
// delegating to the canonical handle vocabulary from @continuum/contracts
// instead of maintaining a parallel mapping table. Picks the first allowed
// handle that is compatible with the given source handle's data type. Takes
// the full StudioNodeType (not just NodeType) so it can also resolve handles
// for nodes the auto-create flows never instantiate themselves (e.g. an
// existing videoEditor/omniGen node a sidebar drop lands on).
export function getTargetHandleForNodeType(
  nodeType: StudioNodeType,
  sourceHandle: string | null,
  nodeData: Record<string, unknown> = {},
): string | undefined {
  const syntheticNode = { id: '__new__', type: nodeType, data: nodeData };
  const allowed = getAllowedTargetHandles(syntheticNode);

  if (allowed.length === 0) return undefined;

  if (sourceHandle === 'text') {
    for (const h of ['prompt-in', 'prompt', 'negative']) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'image') {
    // nanoGen renders only a singular `ref-image` handle; every other
    // image-accepting node (video generators, omniGen) renders the plural
    // `ref-images`. The priority order must match the node's actual handle or
    // the resolved id won't exist and the edge silently fails to render.
    const imagePriority =
      nodeType === 'nanoGen'
        ? ['ref-image', 'ref-images', 'first-frame', 'image']
        : ['ref-images', 'ref-image', 'first-frame', 'image'];
    for (const h of imagePriority) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'video') {
    for (const h of ['video', 'ref-video']) {
      if (allowed.includes(h)) return h;
    }
  }

  if (sourceHandle === 'audio' && allowed.includes('audio')) return 'audio';
  if (sourceHandle === 'document' && allowed.includes('document')) return 'document';

  // Fall back to the first handle in the allowed set (deterministic, contract-driven).
  return allowed[0];
}

// The single output/source handle id a newly-created node of this type
// exposes. Every producer/leaf type in NodeType has exactly one source
// handle, so this is total (no fallback branch needed) — verified against
// getAllowedSourceHandles for every NodeType member.
export function getSourceHandleForNodeType(nodeType: NodeType): string | undefined {
  return getAllowedSourceHandles({ id: '__new__', type: nodeType })[0];
}

// Resolves an edge's dataType (drives edge color) from its source handle id.
// Consolidates two previously-divergent copies (useStudioStore's
// getDataTypeFromHandle, useEdgeDropNode's resolveDataType) that disagreed on
// fallback behavior, mis-coloring audio/document edges created via one path
// but not the other. 'text' is the universal fallback, matching
// StudioCanvas's styledEdges resolver.
export function resolveEdgeDataType(handleId?: string | null): EdgeDataType {
  if (!handleId) return 'text';
  if (handleId === 'video' || handleId === 'ref-video') return 'video';
  if (handleId === 'audio') return 'audio';
  if (handleId === 'document') return 'document';
  if (handleId.includes('image') || handleId.includes('frame')) return 'image';
  return 'text';
}
