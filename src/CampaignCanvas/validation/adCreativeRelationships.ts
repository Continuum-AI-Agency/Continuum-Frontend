import type { AdData, CampaignCanvasEdge, CampaignCanvasNode, CreativeData } from '../types';
import { isAdFormatCompatibleWithCreativeType } from '../types/adCreativeCompatibility';

interface RelationshipIssue {
  adId: string;
  creativeId: string;
  adFormat: AdData['adFormat'] | undefined;
  assetType: CreativeData['assetType'] | undefined;
}

const relationshipErrorPrefix = 'Ad/Creative compatibility';

function isAdNode(node: CampaignCanvasNode): node is CampaignCanvasNode & { data: AdData } {
  return node.type === 'ad';
}

function isCreativeNode(
  node: CampaignCanvasNode,
): node is CampaignCanvasNode & { data: CreativeData } {
  return node.type === 'creative';
}

function getErrorMessage(issue: RelationshipIssue): string {
  const adFormat = issue.adFormat ?? 'IMAGE';
  const assetType = (issue.assetType ?? 'image').toUpperCase();
  return `${relationshipErrorPrefix}: ${assetType} creative is not supported by ${adFormat} ad format.`;
}

function getRelationshipErrorsForNode(
  existingErrors: string[] | undefined,
  issues: RelationshipIssue[],
): string[] {
  const retainedErrors = (existingErrors ?? []).filter(
    (error) => !error.startsWith(relationshipErrorPrefix),
  );
  const relationshipErrors = issues.map(getErrorMessage);
  return [...retainedErrors, ...relationshipErrors];
}

export function collectAdCreativeRelationshipIssues(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): RelationshipIssue[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const issues: RelationshipIssue[] = [];

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    if (!source || !target || !isAdNode(source) || !isCreativeNode(target)) {
      continue;
    }

    const isCompatible = isAdFormatCompatibleWithCreativeType(
      source.data.adFormat,
      target.data.assetType,
    );

    if (!isCompatible) {
      issues.push({
        adId: source.id,
        creativeId: target.id,
        adFormat: source.data.adFormat,
        assetType: target.data.assetType,
      });
    }
  }

  return issues;
}

export function applyAdCreativeRelationshipValidation(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): CampaignCanvasNode[] {
  const issues = collectAdCreativeRelationshipIssues(nodes, edges);
  const nodeIssues = new Map<string, RelationshipIssue[]>();

  for (const issue of issues) {
    const adIssues = nodeIssues.get(issue.adId) ?? [];
    adIssues.push(issue);
    nodeIssues.set(issue.adId, adIssues);

    const creativeIssues = nodeIssues.get(issue.creativeId) ?? [];
    creativeIssues.push(issue);
    nodeIssues.set(issue.creativeId, creativeIssues);
  }

  return nodes.map((node) => {
    const issuesForNode = nodeIssues.get(node.id) ?? [];
    const validationErrors = getRelationshipErrorsForNode(
      node.data.validationErrors,
      issuesForNode,
    );

    return {
      ...node,
      data: {
        ...node.data,
        validationErrors,
        validationStatus:
          validationErrors.length > 0
            ? 'error'
            : node.data.validationStatus === 'warning'
              ? 'warning'
              : 'valid',
      },
    };
  });
}
