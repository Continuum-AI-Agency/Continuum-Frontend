import { describe, expect, test } from 'bun:test';
import type { Position } from '@xyflow/react';

import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import {
  getAllowedAdFormatsForCreativeType,
  getAllowedCreativeTypesForAdFormat,
  isAdFormatCompatibleWithCreativeType,
} from '@/CampaignCanvas/types/adCreativeCompatibility';
import {
  applyAdCreativeRelationshipValidation,
  collectAdCreativeRelationshipIssues,
} from '@/CampaignCanvas/validation/adCreativeRelationships';

const basePosition: Position = { x: 0, y: 0 };

function createAdNode(
  id: string,
  adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION',
): CampaignCanvasNode {
  return {
    id,
    type: 'ad',
    position: basePosition,
    data: {
      label: `Ad ${id}`,
      adFormat,
      primaryText: '',
      headline: '',
      callToAction: 'LEARN_MORE',
      validationStatus: 'valid',
    },
  };
}

function createCreativeNode(id: string, assetType: 'image' | 'video'): CampaignCanvasNode {
  return {
    id,
    type: 'creative',
    position: basePosition,
    data: {
      label: `Creative ${id}`,
      assetType,
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

describe('ad and creative compatibility rules', () => {
  test('supports expected ad-format to creative-type pairings', () => {
    expect(isAdFormatCompatibleWithCreativeType('IMAGE', 'image')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('IMAGE', 'video')).toBe(false);
    expect(isAdFormatCompatibleWithCreativeType('VIDEO', 'video')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('VIDEO', 'image')).toBe(false);
    expect(isAdFormatCompatibleWithCreativeType('CAROUSEL', 'image')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('CAROUSEL', 'video')).toBe(true);
  });

  test('returns allowed creative types for ad format', () => {
    expect(getAllowedCreativeTypesForAdFormat('IMAGE')).toEqual(['image']);
    expect(getAllowedCreativeTypesForAdFormat('VIDEO')).toEqual(['video']);
    expect(getAllowedCreativeTypesForAdFormat('COLLECTION')).toEqual(['image', 'video']);
  });

  test('returns allowed ad formats for creative type', () => {
    expect(getAllowedAdFormatsForCreativeType('image')).toEqual([
      'IMAGE',
      'CAROUSEL',
      'COLLECTION',
    ]);
    expect(getAllowedAdFormatsForCreativeType('video')).toEqual([
      'VIDEO',
      'CAROUSEL',
      'COLLECTION',
    ]);
  });
});

describe('ad and creative relationship validation', () => {
  test('marks both ad and creative as invalid when pairing is incompatible', () => {
    const nodes = [createAdNode('ad-1', 'VIDEO'), createCreativeNode('creative-1', 'image')];
    const edges = [createEdge('edge-1', 'ad-1', 'creative-1')];

    const issues = collectAdCreativeRelationshipIssues(nodes, edges);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.adId).toBe('ad-1');
    expect(issues[0]?.creativeId).toBe('creative-1');

    const validated = applyAdCreativeRelationshipValidation(nodes, edges);
    const adNode = validated.find((node) => node.id === 'ad-1');
    const creativeNode = validated.find((node) => node.id === 'creative-1');

    expect(adNode?.data.validationStatus).toBe('error');
    expect(creativeNode?.data.validationStatus).toBe('error');
    expect(adNode?.data.validationErrors?.[0]).toContain('not supported by VIDEO');
    expect(creativeNode?.data.validationErrors?.[0]).toContain('not supported by VIDEO');
  });

  test('clears relationship errors while preserving unrelated errors', () => {
    const nodes: CampaignCanvasNode[] = [
      {
        ...createAdNode('ad-1', 'IMAGE'),
        data: {
          ...createAdNode('ad-1', 'IMAGE').data,
          validationStatus: 'error',
          validationErrors: [
            'Ad/Creative compatibility: VIDEO creative is not supported by IMAGE ad format.',
            'Missing destination URL.',
          ],
        },
      },
      createCreativeNode('creative-1', 'image'),
    ];
    const edges = [createEdge('edge-1', 'ad-1', 'creative-1')];

    const validated = applyAdCreativeRelationshipValidation(nodes, edges);
    const adNode = validated.find((node) => node.id === 'ad-1');

    expect(adNode?.data.validationErrors).toEqual(['Missing destination URL.']);
  });
});
