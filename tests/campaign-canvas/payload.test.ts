import { describe, expect, test } from 'bun:test';
import type { Position } from '@xyflow/react';

import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';

const basePosition: Position = { x: 100, y: 100 };

function createEdge(id: string, source: string, target: string): CampaignCanvasEdge {
  return {
    id,
    source,
    target,
  };
}

describe('campaign canvas canonical payload', () => {
  test('captures all node option groups in a consistent handoff shape', () => {
    const nodes: CampaignCanvasNode[] = [
      {
        id: 'campaign-1',
        type: 'campaign',
        position: basePosition,
        selected: false,
        data: {
          label: 'Spring Launch',
          objective: 'OUTCOME_SALES',
          buyingType: 'AUCTION',
          specialAdCategories: ['HOUSING'],
          validationStatus: 'valid',
        },
      },
      {
        id: 'adset-1',
        type: 'ad-set',
        position: { x: 350, y: 100 },
        selected: true,
        data: {
          label: 'Prospecting Set',
          optimizationGoal: 'CONVERSIONS',
          billingEvent: 'IMPRESSIONS',
          bidStrategy: 'COST_CAP',
          budgetType: 'DAILY',
          budgetAmount: 180,
          budgetCurrency: 'USD',
          pacingType: ['standard'],
          validationStatus: 'warning',
          validationErrors: ['Audience is narrow.'],
        },
      },
      {
        id: 'ad-1',
        type: 'ad',
        position: { x: 650, y: 100 },
        data: {
          label: 'Ad Variant A',
          adFormat: 'VIDEO',
          primaryText: 'Shop the spring collection.',
          headline: 'New season drop',
          description: 'Limited-time launch pricing.',
          callToAction: 'SHOP_NOW',
          validationStatus: 'valid',
        },
      },
      {
        id: 'aud-1',
        type: 'audience',
        position: { x: 350, y: 380 },
        data: {
          label: 'LATAM Growth',
          locations: ['MX', 'BR', 'AR'],
          ageMin: 25,
          ageMax: 44,
          genders: [1, 2],
          interests: ['fitness', 'ecommerce'],
          behaviors: ['engaged_shoppers'],
          customAudiences: ['crm_list_q1'],
          validationStatus: 'valid',
        },
      },
      {
        id: 'creative-1',
        type: 'creative',
        position: { x: 950, y: 100 },
        data: {
          label: 'Creative Video A',
          assetType: 'video',
          assetUrl: 'https://cdn.example.com/creative-a.mp4',
          thumbnailUrl: 'https://cdn.example.com/creative-a.jpg',
          mediaId: 'meta_media_123',
          aspectRatio: '16:9',
          validationStatus: 'error',
          validationErrors: ['Missing legal disclaimer overlay.'],
        },
      },
    ];

    const edges: CampaignCanvasEdge[] = [
      createEdge('e1', 'campaign-1', 'adset-1'),
      createEdge('e2', 'adset-1', 'ad-1'),
      createEdge('e3', 'adset-1', 'aud-1'),
      createEdge('e4', 'ad-1', 'creative-1'),
    ];

    const payload = buildCampaignCanvasPayload(nodes, edges, {
      source: 'agent-check-in',
      brandProfileId: 'brand_1',
      adAccountId: 'act_1',
      campaignId: 'cmp_1',
    });

    expect(payload.schemaVersion).toBe('campaign-canvas.v1');
    expect(payload.summary.nodeCount).toBe(5);
    expect(payload.summary.edgeCount).toBe(4);
    expect(payload.summary.byType).toEqual({
      campaign: 1,
      'ad-set': 1,
      ad: 1,
      audience: 1,
      creative: 1,
    });
    expect(payload.summary.validation.errorCount).toBe(1);
    expect(payload.summary.validation.warningCount).toBe(1);

    const adSet = payload.nodes.find((node) => node.nodeId === 'adset-1');
    expect(adSet?.nodeType).toBe('ad-set');
    if (adSet?.nodeType === 'ad-set') {
      expect(adSet.options.bidStrategy).toBe('COST_CAP');
      expect(adSet.options.budgetAmount).toBe(180);
      expect(adSet.options.pacingType).toEqual(['standard']);
    }

    const audience = payload.nodes.find((node) => node.nodeId === 'aud-1');
    if (audience?.nodeType === 'audience') {
      expect(audience.options.locations).toEqual(['MX', 'BR', 'AR']);
      expect(audience.options.interests).toEqual(['fitness', 'ecommerce']);
    }

    expect(payload.agentCheckIn.validationIssues).toHaveLength(2);
    expect(payload.agentCheckIn.checklist.length).toBeGreaterThan(0);
  });

  test('applies stable defaults when node options are missing', () => {
    const nodes: CampaignCanvasNode[] = [
      {
        id: 'adset-defaults',
        type: 'ad-set',
        position: basePosition,
        data: {
          label: 'Ad Set Defaults',
          validationStatus: 'valid',
        },
      },
      {
        id: 'ad-defaults',
        type: 'ad',
        position: { x: 350, y: 100 },
        data: {
          label: 'Ad Defaults',
          validationStatus: 'valid',
        },
      },
      {
        id: 'creative-defaults',
        type: 'creative',
        position: { x: 650, y: 100 },
        data: {
          label: 'Creative Defaults',
          validationStatus: 'valid',
        },
      },
    ];

    const edges: CampaignCanvasEdge[] = [createEdge('e1', 'ad-defaults', 'creative-defaults')];
    const payload = buildCampaignCanvasPayload(nodes, edges, { source: 'export' });

    const adSet = payload.nodes.find((node) => node.nodeId === 'adset-defaults');
    const ad = payload.nodes.find((node) => node.nodeId === 'ad-defaults');
    const creative = payload.nodes.find((node) => node.nodeId === 'creative-defaults');

    if (adSet?.nodeType === 'ad-set') {
      expect(adSet.options.optimizationGoal).toBe('CONVERSIONS');
      expect(adSet.options.billingEvent).toBe('IMPRESSIONS');
      expect(adSet.options.bidStrategy).toBe('LOWEST_COST_WITHOUT_CAP');
      expect(adSet.options.budgetType).toBe('DAILY');
      expect(adSet.options.budgetCurrency).toBe('USD');
    } else {
      throw new Error('Expected ad-set payload node');
    }

    if (ad?.nodeType === 'ad') {
      expect(ad.options.adFormat).toBe('IMAGE');
      expect(ad.options.callToAction).toBe('LEARN_MORE');
    } else {
      throw new Error('Expected ad payload node');
    }

    if (creative?.nodeType === 'creative') {
      expect(creative.options.assetType).toBe('image');
    } else {
      throw new Error('Expected creative payload node');
    }
  });
});
