import type { CampaignCanvasEdge, CampaignCanvasNode } from '../types';
import { applyAdCreativeRelationshipValidation } from './adCreativeRelationships';
import { applySingleParentRelationshipValidation } from './hierarchyRelationships';

export function applyCampaignGraphValidation(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[]
): CampaignCanvasNode[] {
  const nodesWithSingleParentValidation = applySingleParentRelationshipValidation(nodes, edges);
  return applyAdCreativeRelationshipValidation(nodesWithSingleParentValidation, edges);
}
