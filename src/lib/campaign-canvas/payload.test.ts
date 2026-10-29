import { describe, expect, it } from 'bun:test';
import {
  AUDIENCE_HANDLE_ID,
  type CampaignCanvasEdge,
  type CampaignCanvasNode,
} from '@/CampaignCanvas/types';
import {
  buildCampaignCanvasPayload,
  buildCampaignCanvasProposalBlock,
  campaignCanvasPayloadSchema,
} from './payload';

const nodes: CampaignCanvasNode[] = [
  {
    id: 'campaign',
    type: 'campaign',
    position: { x: 0, y: 0 },
    data: {
      label: 'Launch',
      objective: 'OUTCOME_SALES',
      buyingType: 'AUCTION',
      specialAdCategories: [],
    },
  },
  {
    id: 'adset',
    type: 'ad-set',
    position: { x: 440, y: 340 },
    data: {
      label: 'Prospecting',
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      budgetAmount: 40,
      budgetCurrency: 'MXN',
      placementMode: 'manual',
      publisherPlatforms: ['instagram'],
      instagramPositions: ['reels'],
      pacingType: ['instagram', 'ig:reels'],
    },
  },
  {
    id: 'group',
    type: 'audience',
    position: { x: 0, y: 340 },
    data: {
      label: 'Local families',
      mode: 'group',
      audienceGroupId: 'group-1',
      audienceGroupVersionId: 'group-version-1',
      locations: ['MX'],
      genders: [],
    },
  },
  {
    id: 'ad',
    type: 'ad',
    position: { x: 440, y: 680 },
    data: {
      label: 'Hero',
      adFormat: 'CAROUSEL',
      primaryText: 'Body',
      headline: 'Headline',
      callToAction: 'SHOP_NOW',
      linkUrl: 'https://shop.example',
    },
  },
  {
    id: 'creative',
    type: 'creative',
    position: { x: 440, y: 1020 },
    data: {
      label: 'Cards',
      assetType: 'carousel',
      cards: [
        { mediaId: 'asset-a', kind: 'image', headline: 'First' },
        { mediaId: 'asset-b', kind: 'video', linkUrl: 'https://shop.example/b' },
      ],
    },
  },
];

const edges: CampaignCanvasEdge[] = [
  { id: 'c->s', source: 'campaign', target: 'adset' },
  { id: 'g->s', source: 'group', target: 'adset', targetHandle: AUDIENCE_HANDLE_ID },
  { id: 's->a', source: 'adset', target: 'ad' },
  { id: 'a->cr', source: 'ad', target: 'creative' },
];

describe('buildCampaignCanvasPayload', () => {
  it('carries audience mode and group ids, the ad link, carousel cards and placements', () => {
    const payload = buildCampaignCanvasPayload(nodes, edges, { source: 'propose' });
    const optionsOf = (id: string) =>
      payload.nodes.find((node) => node.nodeId === id)?.options as Record<string, unknown>;

    expect(optionsOf('group')).toMatchObject({
      mode: 'group',
      audienceGroupId: 'group-1',
      audienceGroupVersionId: 'group-version-1',
    });
    expect(optionsOf('ad')).toMatchObject({
      adFormat: 'CAROUSEL',
      linkUrl: 'https://shop.example',
    });
    expect(optionsOf('creative')).toMatchObject({
      assetType: 'carousel',
      cards: [
        { mediaId: 'asset-a', kind: 'image', headline: 'First', linkUrl: null, thumbnailUrl: null },
        {
          mediaId: 'asset-b',
          kind: 'video',
          headline: null,
          linkUrl: 'https://shop.example/b',
          thumbnailUrl: null,
        },
      ],
    });
    expect(optionsOf('adset')).toMatchObject({
      placementMode: 'manual',
      publisherPlatforms: ['instagram'],
      instagramPositions: ['reels'],
    });
    expect(payload.edges.find((edge) => edge.edgeId === 'g->s')).toMatchObject({
      relationship: 'audience_to_ad-set',
      targetHandle: AUDIENCE_HANDLE_ID,
    });
  });

  it('reads an audience drawn before modes existed as broad', () => {
    const payload = buildCampaignCanvasPayload(
      [
        {
          id: 'old',
          type: 'audience',
          position: { x: 0, y: 0 },
          data: { label: 'Old', locations: [] },
        },
      ],
      [],
    );
    expect(payload.nodes[0]?.options).toMatchObject({
      mode: 'broad',
      audienceGroupVersionId: null,
    });
  });
});

describe('buildCampaignCanvasProposalBlock', () => {
  it("walks an ad set's audience as its INCOMING side edge, not as a child", () => {
    const block = buildCampaignCanvasProposalBlock(
      buildCampaignCanvasPayload(nodes, edges, { source: 'propose' }),
    );
    const lines = block.split('\n');

    expect(lines).toContain(
      '    audience c0/a0/audience "Local families" mode=group audience_group_version_id=group-version-1 geo=MX',
    );
    expect(block).toContain('link=https://shop.example');
    expect(block).toContain('cards=2');
    expect(block).not.toContain('unattached:');
    // The audience line sits under its ad set, before the ad set's ads.
    const adSetLine = lines.findIndex((line) => line.includes('ad-set c0/a0 '));
    const audienceLine = lines.findIndex((line) => line.includes('audience c0/a0/audience'));
    const adLine = lines.findIndex((line) => line.includes('ad c0/a0/ad0'));
    expect(adSetLine).toBeLessThan(audienceLine);
    expect(audienceLine).toBeLessThan(adLine);
  });

  it('reports an audience that feeds no ad set as unattached', () => {
    const block = buildCampaignCanvasProposalBlock(
      buildCampaignCanvasPayload(
        nodes,
        edges.filter((edge) => edge.id !== 'g->s'),
        { source: 'propose' },
      ),
    );
    expect(block).toContain('unattached:');
    expect(block).toContain('audience (unattached) "Local families"');
  });
});

describe('P5 options: budget mode, bid, schedule, event, URL tags', () => {
  it('parses a stored payload written before the options existed', () => {
    const [campaign] = buildCampaignCanvasPayload([nodes[0]!], []).nodes;
    const stored = structuredClone(campaign) as { options: Record<string, unknown> };
    for (const key of ['budgetMode', 'campaignBudgetAmount', 'bidStrategy', 'bidAmount', 'roasFloor']) {
      delete stored.options[key];
    }
    expect(campaignCanvasPayloadSchema.shape.nodes.element.safeParse(stored).success).toBe(true);
  });

  it('tells Jaina the campaign budget, the bid, the schedule, the event and the URL tags', () => {
    const p5Nodes: CampaignCanvasNode[] = nodes.map((node) =>
      node.type === 'campaign'
        ? {
            ...node,
            data: {
              ...node.data,
              budgetMode: 'cbo',
              campaignBudgetAmount: 120,
              bidStrategy: 'COST_CAP',
              bidAmount: 15,
            },
          }
        : node.type === 'ad-set'
          ? {
              ...node,
              data: {
                ...node.data,
                startTime: '2026-11-01T09:00:00-06:00',
                customEventType: 'PURCHASE',
                pixelId: '123456789012',
              },
            }
          : node.type === 'ad'
            ? { ...node, data: { ...node.data, urlTags: 'utm_source=meta' } }
            : node,
    );
    const block = buildCampaignCanvasProposalBlock(buildCampaignCanvasPayload(p5Nodes, edges));
    expect(block).toContain('budget_mode=cbo campaign_daily_budget=120 bid_strategy=COST_CAP bid_amount=15');
    expect(block).toContain('start_time=2026-11-01T09:00:00-06:00');
    expect(block).toContain('custom_event_type=PURCHASE pixel_id=123456789012');
    expect(block).toContain('url_tags=utm_source=meta');
  });
});
