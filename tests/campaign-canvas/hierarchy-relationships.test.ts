import { describe, expect, test } from 'bun:test';
import type { Connection, Position } from '@xyflow/react';

import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import {
  applySingleParentRelationshipValidation,
  collectSingleParentRelationshipIssues,
  getSingleParentConnectionViolationMessage,
} from '@/CampaignCanvas/validation/hierarchyRelationships';

const basePosition: Position = { x: 0, y: 0 };

function createCampaignNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'campaign',
    position: basePosition,
    data: {
      label: `Campaign ${id}`,
      objective: 'OUTCOME_SALES',
      buyingType: 'AUCTION',
      specialAdCategories: [],
      validationStatus: 'valid',
    },
  };
}

function createAdSetNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'ad-set',
    position: basePosition,
    data: {
      label: `Ad Set ${id}`,
      optimizationGoal: 'CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      validationStatus: 'valid',
    },
  };
}

function createAdNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'ad',
    position: basePosition,
    data: {
      label: `Ad ${id}`,
      adFormat: 'IMAGE',
      primaryText: '',
      headline: '',
      callToAction: 'LEARN_MORE',
      validationStatus: 'valid',
    },
  };
}

function createCreativeNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'creative',
    position: basePosition,
    data: {
      label: `Creative ${id}`,
      assetType: 'image',
      validationStatus: 'valid',
    },
  };
}

function createEdge(id: string, source: string, target: string): CampaignCanvasEdge {
  return {
    id,
    source,
    target,
  };
}

describe('single-parent hierarchy issues', () => {
  test('flags a creative attached to two ads', () => {
    const nodes = [createAdNode('ad-1'), createAdNode('ad-2'), createCreativeNode('creative-1')];
    const edges = [
      createEdge('edge-1', 'ad-1', 'creative-1'),
      createEdge('edge-2', 'ad-2', 'creative-1'),
    ];

    const issues = collectSingleParentRelationshipIssues(nodes, edges);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.childId).toBe('creative-1');
    expect(issues[0]?.childType).toBe('creative');
    expect(issues[0]?.parentType).toBe('ad');
  });

  test('marks only the child node invalid for multi-parent hierarchy violations', () => {
    const nodes = [createAdSetNode('ad-set-1'), createAdSetNode('ad-set-2'), createAdNode('ad-1')];
    const edges = [
      createEdge('edge-1', 'ad-set-1', 'ad-1'),
      createEdge('edge-2', 'ad-set-2', 'ad-1'),
    ];

    const validatedNodes = applySingleParentRelationshipValidation(nodes, edges);
    const adNode = validatedNodes.find((node) => node.id === 'ad-1');
    const firstAdSet = validatedNodes.find((node) => node.id === 'ad-set-1');
    const secondAdSet = validatedNodes.find((node) => node.id === 'ad-set-2');

    expect(adNode?.data.validationStatus).toBe('error');
    expect(adNode?.data.validationErrors?.[0]).toContain(
      'ad can only be attached to one ad set at a time',
    );
    expect(firstAdSet?.data.validationStatus).toBe('valid');
    expect(secondAdSet?.data.validationStatus).toBe('valid');
  });

  test('clears only hierarchy errors and preserves unrelated validation errors', () => {
    const nodes: CampaignCanvasNode[] = [
      {
        ...createCreativeNode('creative-1'),
        data: {
          ...createCreativeNode('creative-1').data,
          validationStatus: 'error',
          validationErrors: [
            'Hierarchy constraint: creative can only be attached to one ad at a time.',
            'Missing media asset URL.',
          ],
        },
      },
      createAdNode('ad-1'),
    ];
    const edges = [createEdge('edge-1', 'ad-1', 'creative-1')];

    const validatedNodes = applySingleParentRelationshipValidation(nodes, edges);
    const creativeNode = validatedNodes.find((node) => node.id === 'creative-1');

    expect(creativeNode?.data.validationErrors).toEqual(['Missing media asset URL.']);
  });
});

describe('single-parent connection guard', () => {
  test('returns violation when connecting an ad set to a second campaign', () => {
    const nodes = [
      createCampaignNode('campaign-1'),
      createCampaignNode('campaign-2'),
      createAdSetNode('ad-set-1'),
    ];
    const edges = [createEdge('edge-1', 'campaign-1', 'ad-set-1')];
    const connection = {
      source: 'campaign-2',
      target: 'ad-set-1',
      sourceHandle: null,
      targetHandle: null,
    } as Connection;

    const violation = getSingleParentConnectionViolationMessage(connection, nodes, edges);

    expect(violation).toContain('ad set can only be attached to one campaign at a time');
  });

  test('returns null when connecting a child with no existing parent', () => {
    const nodes = [createCampaignNode('campaign-1'), createAdSetNode('ad-set-1')];
    const edges: CampaignCanvasEdge[] = [];
    const connection = {
      source: 'campaign-1',
      target: 'ad-set-1',
      sourceHandle: null,
      targetHandle: null,
    } as Connection;

    const violation = getSingleParentConnectionViolationMessage(connection, nodes, edges);
    expect(violation).toBeNull();
  });
});
