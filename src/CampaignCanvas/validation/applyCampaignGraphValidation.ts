import type { CampaignCanvasEdge, CampaignCanvasNode } from '../types';
import { applyAdCreativeRelationshipValidation } from './adCreativeRelationships';
import { applySingleParentRelationshipValidation } from './hierarchyRelationships';
import { applyOrphanValidation } from './orphanRelationships';

export function applyCampaignGraphValidation(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): CampaignCanvasNode[] {
  const nodesWithSingleParentValidation = applySingleParentRelationshipValidation(nodes, edges);
  const nodesWithCreativeValidation = applyAdCreativeRelationshipValidation(
    nodesWithSingleParentValidation,
    edges,
  );
  return applyOrphanValidation(nodesWithCreativeValidation, edges);
}
