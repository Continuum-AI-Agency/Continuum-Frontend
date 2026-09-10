import { describe, expect, it } from 'bun:test';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';
import { executeOpenAiPublish, seedExistingIds } from './executeOpenAiPublish';
import { buildHydratedOpenAiGraph } from './hydrateOpenAi';
import { captureOpenAiBaseline, planOpenAiPublish } from './publishOpenAi';

const campaignNode = (data: Record<string, unknown> = {}): CampaignCanvasNode =>
  ({
    id: 'c1',
    type: 'openai-campaign',
    position: { x: 0, y: 0 },
    data: {
      label: 'Spring launch',
      biddingType: 'impressions',
      lifetimeSpendLimitMicros: 25_000_000,
      ...data,
    },
  }) as unknown as CampaignCanvasNode;

const adGroupNode = (data: Record<string, unknown> = {}, id = 'g1'): CampaignCanvasNode =>
  ({
    id,
    type: 'openai-ad-group',
    position: { x: 0, y: 0 },
    data: {
      label: 'US English',
      billingEventType: 'impression',
      maxBidMicros: 60_000,
      ...data,
    },
  }) as unknown as CampaignCanvasNode;

const adNode = (data: Record<string, unknown> = {}, id = 'a1'): CampaignCanvasNode =>
  ({
    id,
    type: 'openai-ad',
    position: { x: 0, y: 0 },
    data: {
      label: 'Planner card',
      creativeType: 'chat_card',
      title: 'Try the planner',
      body: 'Tasks, docs and meetings in one place.',
      targetUrl: 'https://example.com/planner',
      fileId: 'file_901',
      ...data,
    },
  }) as unknown as CampaignCanvasNode;

const edge = (source: string, target: string): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
});

describe('planOpenAiPublish — a fresh draft', () => {
  it('creates campaign, then ad group, then ad, in that order', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode(), adGroupNode(), adNode()],
      edges: [edge('c1', 'g1'), edge('g1', 'a1')],
    });
    expect(plan.issues).toEqual([]);
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'create-campaign',
      'create-ad-group',
      'create-ad',
    ]);
  });

  it('always creates the campaign paused, whatever the node says', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode({ status: 'active' })],
      edges: [],
    });
    const step = plan.steps[0];
    expect(step.kind).toBe('create-campaign');
    expect(step.kind === 'create-campaign' && step.body.status).toBe('paused');
  });

  it('blocks a campaign with no budget', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode({ lifetimeSpendLimitMicros: undefined })],
      edges: [],
    });
    expect(plan.issues.join(' ')).toContain('lifetime budget');
  });

  it('blocks a conversions campaign with no conversion event', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode({ biddingType: 'conversions' })],
      edges: [],
    });
    expect(plan.issues.join(' ')).toContain('conversion event');
  });

  it('blocks an orphan ad group and an orphan ad', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode(), adGroupNode(), adNode()],
      edges: [],
    });
    expect(plan.issues.join(' ')).toContain('not attached to a campaign');
    expect(plan.issues.join(' ')).toContain('not attached to an ad group');
  });

  it('blocks a chat_card ad missing its image or destination', () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode(), adGroupNode(), adNode({ fileId: undefined, targetUrl: undefined })],
      edges: [edge('c1', 'g1'), edge('g1', 'a1')],
    });
    expect(plan.issues.join(' ')).toContain('needs an image');
    expect(plan.issues.join(' ')).toContain('needs a destination URL');
  });

  it('refuses two campaigns on one canvas', () => {
    const second = { ...campaignNode(), id: 'c2' } as CampaignCanvasNode;
    const plan = planOpenAiPublish({ nodes: [campaignNode(), second], edges: [] });
    expect(plan.issues.join(' ')).toContain('one campaign at a time');
  });
});

describe('planOpenAiPublish — an edited record', () => {
  const hydrated = () =>
    buildHydratedOpenAiGraph(
      {
        campaign: {
          id: 'cmpn_101',
          name: 'Spring launch',
          status: 'paused',
          budget: { lifetime_spend_limit_micros: 25_000_000 },
          bidding_type: 'impressions',
        },
        ad_groups: [
          {
            ad_group: {
              id: 'adgrp_301',
              name: 'US English',
              status: 'paused',
              bidding_config: { billing_event_type: 'impression', max_bid_micros: 60_000 },
            },
            ads: [
              {
                id: 'ad_501',
                name: 'Planner card',
                status: 'paused',
                creative: {
                  type: 'chat_card',
                  title: 'Try the planner',
                  body: 'Tasks and docs.',
                  target_url: 'https://example.com/planner',
                  file_id: 'file_901',
                },
              },
            ],
          },
        ],
      },
      { adAccountId: 'adacct_1' },
    );

  it('plans nothing when nothing changed', () => {
    const graph = hydrated();
    const plan = planOpenAiPublish({
      nodes: graph.nodes,
      edges: graph.edges,
      baseline: captureOpenAiBaseline(graph.nodes),
    });
    expect(plan.steps).toEqual([]);
    expect(plan.issues).toEqual([]);
  });

  it('names exactly the fields that changed', () => {
    const graph = hydrated();
    const baseline = captureOpenAiBaseline(graph.nodes);
    const edited = graph.nodes.map((node) =>
      node.id === 'cmpn_101'
        ? { ...node, data: { ...node.data, lifetimeSpendLimitMicros: 30_000_000 } }
        : node,
    );
    const plan = planOpenAiPublish({ nodes: edited, edges: graph.edges, baseline });
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0];
    expect(step.kind).toBe('update-campaign');
    expect(step.kind === 'update-campaign' && step.changed).toEqual(['budget']);
  });

  it('updates rather than re-creates anything carrying an openAiId', () => {
    const graph = hydrated();
    const edited = graph.nodes.map((node) => ({
      ...node,
      data: { ...node.data, label: `${(node.data as { label: string }).label} v2` },
    }));
    const plan = planOpenAiPublish({
      nodes: edited,
      edges: graph.edges,
      baseline: captureOpenAiBaseline(graph.nodes),
    });
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'update-campaign',
      'update-ad-group',
      'update-ad',
    ]);
  });

  it('archives a node the baseline knew about and the graph dropped', () => {
    const graph = hydrated();
    const baseline = captureOpenAiBaseline(graph.nodes);
    const withoutAd = graph.nodes.filter((node) => node.id !== 'ad_501');
    const plan = planOpenAiPublish({ nodes: withoutAd, edges: graph.edges, baseline });
    const archive = plan.steps.find((step) => step.kind === 'archive');
    expect(archive).toBeDefined();
    expect(archive?.kind === 'archive' && archive.entity).toBe('ad');
    expect(archive?.kind === 'archive' && archive.openAiId).toBe('ad_501');
  });

  // Status is deliberately not a publishable field: activating is the one action that can
  // spend money, and it stays an explicit button.
  it('never emits a status change', () => {
    const graph = hydrated();
    const baseline = captureOpenAiBaseline(graph.nodes);
    const edited = graph.nodes.map((node) => ({
      ...node,
      data: { ...node.data, status: 'active' },
    }));
    const plan = planOpenAiPublish({ nodes: edited, edges: graph.edges, baseline });
    expect(plan.steps).toEqual([]);
  });
});

describe('executeOpenAiPublish', () => {
  const api = (overrides: Record<string, unknown> = {}) => {
    const calls: Array<{ fn: string; args: unknown[] }> = [];
    const record =
      (fn: string, result: unknown) =>
      async (...args: unknown[]) => {
        calls.push({ fn, args });
        return result as { id: string };
      };
    return {
      calls,
      api: {
        createCampaign: record('createCampaign', { id: 'cmpn_new' }),
        updateCampaign: record('updateCampaign', { id: 'cmpn_101' }),
        createAdGroup: record('createAdGroup', { id: 'adgrp_new' }),
        updateAdGroup: record('updateAdGroup', { id: 'adgrp_301' }),
        createAd: record('createAd', { id: 'ad_new' }),
        updateAd: record('updateAd', { id: 'ad_501' }),
        archive: record('archive', {}),
        ...overrides,
      } as never,
    };
  };

  it('threads a created campaign id into its ad group and ad', async () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode(), adGroupNode(), adNode()],
      edges: [edge('c1', 'g1'), edge('g1', 'a1')],
    });
    const { api: fake, calls } = api();
    const outcome = await executeOpenAiPublish(plan, fake);

    expect(outcome.failure).toBeUndefined();
    expect((calls[1].args[0] as { campaign_id: string }).campaign_id).toBe('cmpn_new');
    expect((calls[2].args[0] as { ad_group_id: string }).ad_group_id).toBe('adgrp_new');
    expect(outcome.idsByNodeId).toEqual({ c1: 'cmpn_new', g1: 'adgrp_new', a1: 'ad_new' });
  });

  it('resolves a parent that already existed and was not part of the plan', async () => {
    // The campaign is unchanged, so it produces no step — but the new ad group still needs
    // its id. Seeding is what keeps that from failing as "not created yet".
    const nodes = [campaignNode({ openAiId: 'cmpn_101' }), adGroupNode()];
    const plan = planOpenAiPublish({
      nodes,
      edges: [edge('c1', 'g1')],
      baseline: captureOpenAiBaseline([nodes[0]]),
    });
    const { api: fake, calls } = api();
    const outcome = await executeOpenAiPublish(plan, fake, { seed: seedExistingIds(nodes) });

    expect(outcome.failure).toBeUndefined();
    expect((calls[0].args[0] as { campaign_id: string }).campaign_id).toBe('cmpn_101');
  });

  it('stops at the first failure and reports what already landed', async () => {
    const plan = planOpenAiPublish({
      nodes: [campaignNode(), adGroupNode(), adNode()],
      edges: [edge('c1', 'g1'), edge('g1', 'a1')],
    });
    const { api: fake } = api({
      createAdGroup: async () => {
        throw new Error('max_bid_micros too low');
      },
    });
    const outcome = await executeOpenAiPublish(plan, fake);

    expect(outcome.applied).toHaveLength(1);
    expect(outcome.applied[0].step.kind).toBe('create-campaign');
    expect(outcome.failure?.step.kind).toBe('create-ad-group');
    expect(outcome.failure?.message).toContain('max_bid_micros');
    // The campaign really exists upstream now; the map says so, so a retry updates it.
    expect(outcome.idsByNodeId.c1).toBe('cmpn_new');
  });
});
