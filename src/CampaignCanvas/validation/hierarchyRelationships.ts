import type { Connection } from '@xyflow/react';
import type { CampaignCanvasEdge, CampaignCanvasNode, CampaignNodeType } from '../types';

type ChildNodeTypeWithSingleParent = 'ad-set' | 'ad' | 'creative' | 'openai-ad-group' | 'openai-ad';

interface SingleParentIssue {
  childId: string;
  childType: ChildNodeTypeWithSingleParent;
  parentType: CampaignNodeType;
}

const hierarchyErrorPrefix = 'Hierarchy constraint';

/**
 * Each child takes at most ONE parent of each listed type. An ad set has two: its
 * campaign (from above) and its audience (from the side) — Meta has one targeting per ad
 * set. The reverse is free: one audience may feed many ad sets.
 */
const SINGLE_PARENT_RULES: Record<ChildNodeTypeWithSingleParent, readonly CampaignNodeType[]> = {
  'ad-set': ['campaign', 'audience'],
  ad: ['ad-set'],
  creative: ['ad'],
  // The OpenAI hierarchy is campaign > ad group > ad, with no audience or creative node:
  // targeting lives on the campaign and the creative is fields on the ad itself.
  'openai-ad-group': ['openai-campaign'],
  'openai-ad': ['openai-ad-group'],
};

const NODE_DISPLAY_NAMES: Record<CampaignNodeType, string> = {
  campaign: 'campaign',
  'ad-set': 'ad set',
  ad: 'ad',
  audience: 'audience',
  creative: 'creative',
  'openai-campaign': 'campaign',
  'openai-ad-group': 'ad group',
  'openai-ad': 'ad',
};

const SINGLE_PARENT_CHILD_TYPES: readonly ChildNodeTypeWithSingleParent[] = [
  'ad-set',
  'ad',
  'creative',
  'openai-ad-group',
  'openai-ad',
];

function isSingleParentChildNodeType(
  nodeType: CampaignNodeType,
): nodeType is ChildNodeTypeWithSingleParent {
  return SINGLE_PARENT_CHILD_TYPES.includes(nodeType as ChildNodeTypeWithSingleParent);
}

/** Whether `childType` may take only one parent of `parentType`. */
export function isSingleParentRelationship(
  childType: CampaignNodeType,
  parentType: CampaignNodeType,
): boolean {
  return isSingleParentChildNodeType(childType)
    ? SINGLE_PARENT_RULES[childType].includes(parentType)
    : false;
}

export function getSingleParentConstraintMessage(
  childType: CampaignNodeType,
  parentType: CampaignNodeType,
): string {
  if (childType === 'ad-set' && parentType === 'audience') {
    return `${hierarchyErrorPrefix}: an ad set takes one audience. Meta has one targeting per ad set, so disconnect the current audience first.`;
  }
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

  if (!isSingleParentRelationship(targetNode.type, sourceNode.type)) {
    return null;
  }

  const hasExistingAttachment = hasExistingSingleParentAttachment(
    targetNode.id,
    sourceNode.type,
    nodes,
    edges.filter((edge) => edge.source !== sourceNode.id),
  );

  if (!hasExistingAttachment) {
    return null;
  }

  return getHierarchyErrorMessage({
    childId: targetNode.id,
    childType: targetNode.type,
    parentType: sourceNode.type,
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

    for (const parentType of SINGLE_PARENT_RULES[childNode.type]) {
      const incomingParentEdges = edges.filter(
        (edge) => edge.target === childNode.id && nodeById.get(edge.source)?.type === parentType,
      );

      if (incomingParentEdges.length > 1) {
        issues.push({ childId: childNode.id, childType: childNode.type, parentType });
      }
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
