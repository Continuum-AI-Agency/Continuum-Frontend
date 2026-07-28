import {
  getVideoGeneratorImageReferenceHandle,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  type StudioNodeType,
} from '@continuum/contracts';
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
  | 'videoDecode'
  | 'frameExtract';

export type EdgeDataType = 'text' | 'image' | 'video' | 'audio' | 'document';

// Derives the best target handle for a newly-created (or existing) node by
// delegating to the canonical handle vocabulary from @continuum/contracts
// instead of maintaining a parallel mapping table. Picks the first allowed
// handle that is compatible with the given source handle's data type. Takes
// the full StudioNodeType (not just NodeType) so it can also resolve handles
// for nodes the auto-create flows never instantiate themselves (e.g. an
// existing timelineEditor/omniGen node a sidebar drop lands on).
export function getTargetHandleForNodeType(
  nodeType: StudioNodeType,
  sourceHandle: string | null,
  nodeData: Record<string, unknown> = {},
): string | undefined {
  return getTargetHandleCandidatesForNodeType(nodeType, sourceHandle, nodeData)[0];
}

// Every compatible handle, best first. A caller that can retry (a Library drop
// landing on a node whose first-choice handle is already full) walks the list;
// getTargetHandleForNodeType is just its head.
export function getTargetHandleCandidatesForNodeType(
  nodeType: StudioNodeType,
  sourceHandle: string | null,
  nodeData: Record<string, unknown> = {},
): string[] {
  const syntheticNode = { id: '__new__', type: nodeType, data: nodeData };
  const allowed = getAllowedTargetHandles(syntheticNode);

  if (allowed.length === 0) return [];

  const ranked = (priority: string[]): string[] => priority.filter((h) => allowed.includes(h));

  if (sourceHandle === 'text') {
    const matches = ranked(['prompt-in', 'prompt', 'negative']);
    if (matches.length > 0) return matches;
  }

  if (sourceHandle === 'image') {
    // `ref-image` and `ref-images` are aliases and BOTH sit in a video generator's
    // allowed set, but the node draws exactly one of them. Ask the contract which id
    // it renders instead of ranking the pair — a resolved id that isn't in the DOM
    // produces an edge that silently fails to render. nanoGen is not a video
    // generator and renders the singular. `last-frame` trails `first-frame` so a
    // SECOND image dropped on a frames-mode video node has somewhere to land.
    const imageReferenceHandle = isVideoGeneratorNodeType(nodeType)
      ? getVideoGeneratorImageReferenceHandle(
          resolveVideoGeneratorModel(syntheticNode),
          resolveVideoGeneratorReferenceMode(syntheticNode),
        )
      : nodeType === 'nanoGen'
        ? 'ref-image'
        : 'ref-images';
    const matches = ranked([
      ...(imageReferenceHandle ? [imageReferenceHandle] : []),
      'first-frame',
      'last-frame',
      'image',
    ]);
    if (matches.length > 0) return matches;
  }

  if (sourceHandle === 'video') {
    const matches = ranked(['video', 'ref-video']);
    if (matches.length > 0) return matches;
  }

  if (sourceHandle === 'audio' && allowed.includes('audio')) return ['audio'];
  if (sourceHandle === 'document' && allowed.includes('document')) return ['document'];

  // Fall back to the first handle in the allowed set (deterministic, contract-driven).
  return [allowed[0] as string];
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
