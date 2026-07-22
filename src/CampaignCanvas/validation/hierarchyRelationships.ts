import type { Connection } from '@xyflow/react';
import type { CampaignCanvasEdge, CampaignCanvasNode, CampaignNodeType } from '../types';

type ChildNodeTypeWithSingleParent = 'ad-set' | 'ad' | 'creative';

interface SingleParentIssue {
  childId: string;
  childType: ChildNodeTypeWithSingleParent;
  parentType: CampaignNodeType;
}

const hierarchyErrorPrefix = 'Hierarchy constraint';

const SINGLE_PARENT_RULES: Record<ChildNodeTypeWithSingleParent, CampaignNodeType> = {
  'ad-set': 'campaign',
  ad: 'ad-set',
  creative: 'ad',
};

const NODE_DISPLAY_NAMES: Record<CampaignNodeType, string> = {
  campaign: 'campaign',
  'ad-set': 'ad set',
  ad: 'ad',
  audience: 'audience',
  creative: 'creative',
};

function isSingleParentChildNodeType(
  nodeType: CampaignNodeType,
): nodeType is ChildNodeTypeWithSingleParent {
  return nodeType === 'ad-set' || nodeType === 'ad' || nodeType === 'creative';
}

export function getExpectedSingleParentTypeForChild(
  childType: CampaignNodeType,
): CampaignNodeType | null {
  return isSingleParentChildNodeType(childType) ? SINGLE_PARENT_RULES[childType] : null;
}

export function getSingleParentConstraintMessage(
  childType: CampaignNodeType,
  parentType: CampaignNodeType,
): string {
  return `${hierarchyErrorPrefix}: ${NODE_DISPLAY_NAMES[childType]} can only be attached to one ${NODE_DISPLAY_NAMES[parentType]} at a time.`;
}

export function hasExistingSingleParentAttachment(
  childNodeId: string,
  parentType: CampaignNodeType,
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): boolean {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return edges.some((edge) => {
    if (edge.target !== childNodeId) {
      return false;
    }

    const sourceNode = nodeById.get(edge.source);
    return sourceNode?.type === parentType;
  });
}

function getHierarchyErrorMessage(issue: SingleParentIssue): string {
  return getSingleParentConstraintMessage(issue.childType, issue.parentType);
}

function getHierarchyErrorsForNode(
  existingErrors: string[] | undefined,
  issues: SingleParentIssue[],
): string[] {
  const retainedErrors = (existingErrors ?? []).filter(
    (error) => !error.startsWith(hierarchyErrorPrefix),
  );
  const hierarchyErrors = issues.map(getHierarchyErrorMessage);
  return [...retainedErrors, ...hierarchyErrors];
}

export function getSingleParentConnectionViolationMessage(
  connection: Connection,
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): string | null {
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (!sourceNode || !targetNode || !isSingleParentChildNodeType(targetNode.type)) {
    return null;
  }

  const expectedParentType = getExpectedSingleParentTypeForChild(targetNode.type);
  if (!expectedParentType) {
    return null;
  }

  if (sourceNode.type !== expectedParentType) {
    return null;
  }

  const hasExistingAttachment = hasExistingSingleParentAttachment(
    targetNode.id,
    expectedParentType,
    nodes,
    edges.filter((edge) => edge.source !== sourceNode.id),
  );

  if (!hasExistingAttachment) {
    return null;
  }

  return getHierarchyErrorMessage({
    childId: targetNode.id,
    childType: targetNode.type,
    parentType: expectedParentType,
  });
}

export function collectSingleParentRelationshipIssues(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): SingleParentIssue[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const issues: SingleParentIssue[] = [];

  for (const childNode of nodes) {
    if (!isSingleParentChildNodeType(childNode.type)) {
      continue;
    }

    const expectedParentType = getExpectedSingleParentTypeForChild(childNode.type);
    if (!expectedParentType) {
      continue;
    }

    const incomingParentEdges = edges.filter((edge) => {
      if (edge.target !== childNode.id) {
        return false;
      }

      const sourceNode = nodeById.get(edge.source);
      return sourceNode?.type === expectedParentType;
    });

    if (incomingParentEdges.length > 1) {
      issues.push({
        childId: childNode.id,
        childType: childNode.type,
        parentType: expectedParentType,
      });
    }
  }

  return issues;
}

export function applySingleParentRelationshipValidation(
  nodes: CampaignCanvasNode[],
  edges: CampaignCanvasEdge[],
): CampaignCanvasNode[] {
  const issues = collectSingleParentRelationshipIssues(nodes, edges);
  const nodeIssues = new Map<string, SingleParentIssue[]>();

  for (const issue of issues) {
    const childIssues = nodeIssues.get(issue.childId) ?? [];
    childIssues.push(issue);
    nodeIssues.set(issue.childId, childIssues);
  }

  return nodes.map((node) => {
    const issuesForNode = nodeIssues.get(node.id) ?? [];
    const validationErrors = getHierarchyErrorsForNode(node.data.validationErrors, issuesForNode);

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
