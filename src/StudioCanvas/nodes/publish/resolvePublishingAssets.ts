import {
  type CanvasPublishingAsset,
  PUBLISH_IMAGE_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
  variationIndexFromHandle,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { GeneratedImageVariation, PlannerDraftNodeData, StudioNode } from '../../types';
import { readNodeAssetRef } from '../../utils/nodeAssetRef';

/**
 * The Library asset a wired source actually produced — the exact one, version pinned.
 *
 * `sourceHandle` is load-bearing: a 4-up generator publishes its variations on
 * `image-1..image-4`, and reading `renderOutputAssetId` regardless of handle attached
 * variation 1 to every wire no matter which one the user dragged. `versionId` is pinned
 * for the same reason the API-render node pins it — without it a publish sends whatever
 * the asset's head version happens to be at publish time, not the reviewed creative.
 */
const assetFromNode = (
  node: StudioNode | undefined,
  sourceHandle: string | null | undefined,
): { assetId: string; versionId?: string } | null => {
  if (!node) return null;
  const data = node.data as Record<string, unknown>;
  const variations = Array.isArray(data.generatedImages)
    ? (data.generatedImages as GeneratedImageVariation[])
    : [];
  const variation = variations[variationIndexFromHandle(sourceHandle)];
  if (variation?.assetId) {
    return {
      assetId: variation.assetId,
      ...(variation.assetVersionId ? { versionId: variation.assetVersionId } : {}),
    };
  }
  // Then whichever key this node's own Library pointer was written under —
  // `readNodeAssetRef` is the one place that list of keys lives.
  return readNodeAssetRef(data);
};

const IMAGE_SOURCE_TYPES = new Set(['image', 'nanoGen', 'frameExtract']);
const VIDEO_SOURCE_TYPES = new Set([
  'video',
  'videoGen',
  'veoDirector',
  'veoFast',
  'omniGen',
  'extendVideo',
  'timelineEditor',
]);

const kindFromNode = (node: StudioNode | undefined): 'image' | 'video' | null => {
  if (!node) return null;
  const type = node.type ?? '';
  if (IMAGE_SOURCE_TYPES.has(type)) return 'image';
  if (VIDEO_SOURCE_TYPES.has(type)) return 'video';
  return null;
};

export function resolvePublishingAssets(args: {
  nodeId: string;
  data: PlannerDraftNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}): CanvasPublishingAsset[] {
  const nodeById = new Map(args.nodes.map((node) => [node.id, node]));
  const handleOrder =
    args.data.format === 'carousel'
      ? [...(args.data.assetSlots ?? [])]
          .sort((left, right) => left.order - right.order)
          .map((slot) => `asset-${slot.id}`)
      : [args.data.format === 'image' ? PUBLISH_IMAGE_INPUT_HANDLE : PUBLISH_VIDEO_INPUT_HANDLE];

  return handleOrder.flatMap((handle, order) => {
    const edge = args.edges.find(
      (candidate) => candidate.target === args.nodeId && candidate.targetHandle === handle,
    );
    const source = edge ? nodeById.get(edge.source) : undefined;
    const asset = assetFromNode(source, edge?.sourceHandle);
    const kind = kindFromNode(source);
    return asset && kind ? [{ ...asset, kind, order }] : [];
  });
}
