import {
  type CanvasPublishingAsset,
  type CanvasPublishingFormat,
  PUBLISH_IMAGE_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { PublisherNodeData, StudioNode } from '../../types';

const assetIdFromNode = (node: StudioNode | undefined): string | null => {
  if (!node) return null;
  const data = node.data as Record<string, unknown>;
  for (const candidate of [data.assetId, data.renderOutputAssetId, data.generatedAssetId]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
};

const kindFromNode = (node: StudioNode | undefined): 'image' | 'video' | null => {
  if (!node) return null;
  if (node.type === 'image' || node.type === 'nanoGen') return 'image';
  if (
    [
      'video',
      'videoGen',
      'veoDirector',
      'veoFast',
      'omniGen',
      'extendVideo',
      'timelineEditor',
    ].includes(node.type ?? '')
  ) {
    return 'video';
  }
  return null;
};

export function resolvePublishingAssets(args: {
  nodeId: string;
  data: PublisherNodeData;
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
    const assetId = assetIdFromNode(source);
    const kind = kindFromNode(source);
    return assetId && kind ? [{ assetId, kind, order }] : [];
  });
}
