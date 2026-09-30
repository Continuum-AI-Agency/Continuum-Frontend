import { canvasPublishingAssets } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { PlannerDraftNodeData, StudioNode } from '../../types';

export function resolvePublishingAssets(args: {
  nodeId: string;
  data: PlannerDraftNodeData;
  nodes: StudioNode[];
  edges: Edge[];
}) {
  return canvasPublishingAssets({ ...args, data: args.data as unknown as Record<string, unknown> });
}
