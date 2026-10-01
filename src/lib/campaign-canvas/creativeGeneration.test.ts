import { describe, expect, it } from 'bun:test';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import {
  buildCampaignCreativeRequest,
  campaignCreativeRevision,
  creativeCanvasUpdate,
} from './creativeGeneration';

const BRAND = '11111111-1111-4111-8111-111111111111';
const graph = () => ({
  nodes: [
    {
      id: 'campaign',
      type: 'campaign',
      position: { x: 0, y: 0 },
      data: {
        label: 'Engagement',
        objective: 'OUTCOME_ENGAGEMENT',
        buyingType: 'AUCTION',
        specialAdCategories: [],
      },
    },
    {
      id: 'set',
      type: 'ad-set',
      position: { x: 0, y: 0 },
      data: {
        label: 'Lead buyers',
        optimizationGoal: 'LEAD_GENERATION',
        billingEvent: 'IMPRESSIONS',
        budgetAmount: 5,
        budgetCurrency: 'MXN',
        funnelStage: 'retargeting',
      },
    },
    {
      id: 'ad',
      type: 'ad',
      position: { x: 0, y: 0 },
      data: {
        label: 'Ad',
        adFormat: 'IMAGE',
        primaryText: 'Book a trial',
        headline: 'Try it',
        callToAction: 'SIGN_UP',
      },
    },
    {
      id: 'creative',
      type: 'creative',
      position: { x: 0, y: 0 },
      data: { label: 'Creative', assetType: 'image' },
    },
    {
      id: 'audience',
      type: 'audience',
      position: { x: 0, y: 0 },
      data: { label: 'Audience', locations: ['MX'], interests: ['Fitness'] },
    },
  ] as CampaignCanvasNode[],
  edges: [
    ['campaign', 'set'],
    ['set', 'ad'],
    ['ad', 'creative'],
    ['set', 'audience'],
  ].map(([source, target], i) => ({ id: String(i), source, target })) as CampaignCanvasEdge[],
  hydration: null,
  isDirty: true,
});

describe('campaign creative connection', () => {
  it('captures latest goal, currency, audience and copy, then applies only to that unchanged slot', async () => {
    const current = graph();
    const request = await buildCampaignCreativeRequest({
      ...current,
      nodeId: 'creative',
      brandId: BRAND,
      adAccountId: 'act_1',
    });
    expect(request.query).toContain('LEAD_GENERATION');
    expect(request.query).toContain('MXN');
    expect(request.query).toContain('retargeting');
    expect(request.query).toContain('Book a trial');
    const artifact = {
      id: 'asset',
      asset_id: 'asset',
      type: 'creative' as const,
      format: 'image' as const,
      url: 'https://example.test/asset.jpg',
      canvas_target: {
        brand_id: BRAND,
        ad_account_id: 'act_1',
        node_id: 'creative',
        revision: await campaignCreativeRevision(current.nodes, current.edges),
      },
    };
    expect(
      (await creativeCanvasUpdate(artifact, { brandId: BRAND, adAccountId: '1' }, current))?.nodeId,
    ).toBe('creative');
    expect(
      await creativeCanvasUpdate(artifact, { brandId: BRAND, adAccountId: '2' }, current),
    ).toBeNull();
    expect(
      await creativeCanvasUpdate(artifact, { brandId: 'other', adAccountId: '1' }, current),
    ).toBeNull();
    current.nodes = current.nodes.map((node) =>
      node.id === 'ad' ? { ...node, data: { ...node.data, headline: 'Human edited' } } : node,
    );
    expect(
      await creativeCanvasUpdate(artifact, { brandId: BRAND, adAccountId: '1' }, current),
    ).toBeNull();
  });
  it('ignores selection and position changes, and refuses disconnected slots', async () => {
    const current = graph();
    const revision = await campaignCreativeRevision(current.nodes, current.edges);
    current.nodes = current.nodes.map((node) => ({
      ...node,
      selected: true,
      position: { x: 20, y: 30 },
    }));
    expect(await campaignCreativeRevision(current.nodes, current.edges)).toBe(revision);
    await expect(
      buildCampaignCreativeRequest({
        ...current,
        edges: [],
        nodeId: 'creative',
        brandId: BRAND,
        adAccountId: '1',
      }),
    ).rejects.toThrow('Connect');
  });
});
