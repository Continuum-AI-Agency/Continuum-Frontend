import { describe, expect, it } from 'bun:test';
import {
  type PaidScaffoldDraftNode,
  type PaidScaffoldPlan,
  type PaidScaffoldVersionSaveRequest,
  paidScaffoldPlanSchema,
} from '@continuum/contracts';
import { AUDIENCE_HANDLE_ID } from '@/CampaignCanvas/types';
import type { CanvasGate, CanvasScaffoldRead } from '@/lib/paid-media/jaina-activity-client';
import { toNodeRow } from '@/lib/paid-media/scaffold-tree-client';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { buildHydratedCanvasGraph, creativeFromRow } from './hydrate';
import { buildScaffoldSaveRequest } from './saveVersion';

const APPROVED_BUILD: CanvasGate = {
  gate: 'build',
  status: 'approved',
  approvedBy: 'Bench Owner',
  approvedAt: '2026-09-07T10:00:00.000Z',
};

const row = (overrides: Partial<PaidScaffoldNodeRow>): PaidScaffoldNodeRow => ({
  id: 'node',
  parentId: null,
  level: 'campaign',
  ordinal: 0,
  pathKey: 'c0',
  name: 'Node',
  productKey: null,
  angleKey: null,
  conceptKey: null,
  payload: {},
  status: 'pending',
  metaObjectId: null,
  metaCreativeId: null,
  errorMessage: null,
  attempt: 0,
  creativeAssetId: null,
  creativeMedia: null,
  dailyBudgetMinorUnits: null,
  ...overrides,
});

const read = (overrides: Partial<CanvasScaffoldRead> = {}): CanvasScaffoldRead => ({
  scaffold: {
    id: 'scaffold-1',
    name: 'Bench scaffold',
    adAccountId: 'act_1',
    currentVersionId: 'version-1',
    createdAt: '2026-09-07T09:00:00.000Z',
  },
  version: {
    id: 'version-1',
    version: 2,
    lifecycle: 'built',
    createdAt: '2026-09-07T09:00:00.000Z',
  },
  versions: [],
  tree: {
    versionId: 'version-1',
    rows: [
      row({ id: 'campaign', payload: { objective: 'OUTCOME_SALES' } }),
      row({
        id: 'adset',
        parentId: 'campaign',
        level: 'adset',
        pathKey: 'c0/a0',
        name: 'Ad set',
        productKey: 'p',
        angleKey: 'a',
        payload: {
          optimization_goal: 'CONVERSATIONS',
          audience_group_version_id: 'audience-version-1',
        },
        status: 'created',
        metaObjectId: '120000000000000001',
      }),
      row({
        id: 'ad',
        parentId: 'adset',
        level: 'ad',
        pathKey: 'c0/a0/ad0',
        name: 'Ad',
        productKey: 'p',
        angleKey: 'a',
        conceptKey: 'c',
        payload: {
          creative: {
            message: 'Body copy',
            headline: 'Headline',
            call_to_action_type: 'CONTACT_US',
          },
        },
      }),
    ],
  },
  gates: { build: APPROVED_BUILD },
  audiences: [
    {
      id: 'audience-1',
      name: 'Local families',
      versionId: 'audience-version-1',
      memberCount: 2,
      targeting: { age_min: 25, age_max: 50, geo_locations: { countries: ['MX'] } },
      includedKeys: ['seed'],
      gate: {
        gate: 'audience_group_publish',
        status: 'denied',
        approvedBy: null,
        approvedAt: null,
      },
      versionStatus: 'ready',
    },
  ],
  contentHash: 'a'.repeat(64),
  plan: null,
  specialAdCategories: [],
  assetKinds: {},
  ...overrides,
});

describe('buildHydratedCanvasGraph', () => {
  it('preserves measured account currency and its minor-unit scale', () => {
    const base = read();
    const adSet = base.tree.rows.find((row) => row.level === 'adset')!;
    adSet.dailyBudgetMinorUnits = 6199;
    const graph = buildHydratedCanvasGraph({
      ...base,
      version: { ...base.version, budgetCurrency: 'JPY' },
    });
    expect(graph.nodes.find((node) => node.type === 'ad-set')?.data).toMatchObject({
      budgetAmount: 6199,
      budgetCurrency: 'JPY',
    });
  });
  it('maps a scaffold to a campaign -> ad set -> ad graph with its audience group', () => {
    const graph = buildHydratedCanvasGraph(read());

    expect(graph.nodes.map((node) => node.type)).toEqual([
      'campaign',
      'ad-set',
      'audience',
      'ad',
      'creative',
    ]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'campaign->adset',
      'audience:audience-1->adset',
      'adset->ad',
      'ad->ad:creative',
    ]);
    expect(graph.nodes.find((node) => node.type === 'creative')?.data.mediaId).toBeUndefined();
    expect(graph.hydration).toMatchObject({ version: 2, lifecycle: 'built', adAccountId: 'act_1' });
  });

  it('gives every node the gate that governs it, with the approver already resolved', () => {
    const graph = buildHydratedCanvasGraph(read());
    const provenanceOf = (id: string) =>
      graph.nodes.find((node) => node.id === id)?.data.provenance;

    expect(provenanceOf('campaign')?.gate).toEqual(APPROVED_BUILD);
    expect(provenanceOf('ad')?.gate?.approvedBy).toBe('Bench Owner');
    // The audience node reads the OTHER gate table, not the scaffold's build gate.
    expect(provenanceOf('audience:audience-1')?.gate?.status).toBe('denied');
  });

  it('reports a Meta status only for a node that actually reached Meta', () => {
    const graph = buildHydratedCanvasGraph(read());
    const byId = (id: string) => graph.nodes.find((node) => node.id === id)?.data;

    expect(byId('adset')?.provenance?.metaStatus).toBe('PAUSED');
    expect(byId('adset')?.metaId).toBe('120000000000000001');
    // Nothing was created for these, so claiming a Meta status would be an invention.
    expect(byId('campaign')?.provenance?.metaStatus).toBeNull();
    expect(byId('ad')?.provenance?.metaStatus).toBeNull();
  });

  it('carries the ad copy the tree drops, and the path key the propose tool speaks in', () => {
    const graph = buildHydratedCanvasGraph(read());
    const ad = graph.nodes.find((node) => node.id === 'ad');

    expect(ad?.data).toMatchObject({
      primaryText: 'Body copy',
      headline: 'Headline',
      callToAction: 'CONTACT_US',
    });
    expect(ad?.data.provenance?.pathKey).toBe('c0/a0/ad0');
  });

  it('keeps an audience group nobody targets, unattached rather than dropped', () => {
    const base = read();
    const graph = buildHydratedCanvasGraph({
      ...base,
      audiences: [{ ...base.audiences[0]!, versionId: 'orphan-version' }],
    });

    expect(graph.nodes.some((node) => node.id === 'audience:audience-1')).toBe(true);
    expect(graph.edges.some((edge) => edge.source === 'audience:audience-1')).toBe(false);
    // The ad set still targets the version it was compiled from, drawn as its own node.
    expect(
      graph.edges.find(
        (edge) => edge.target === 'adset' && edge.targetHandle === AUDIENCE_HANDLE_ID,
      )?.source,
    ).toBe('audience-version:audience-version-1');
  });

  it('feeds each ad set from the side: audience -> ad set on the audience handle, to its left', () => {
    const graph = buildHydratedCanvasGraph(read());
    const audienceEdge = graph.edges.find((edge) => edge.source === 'audience:audience-1');
    const positionOf = (id: string) => graph.nodes.find((node) => node.id === id)?.position;

    expect(audienceEdge).toMatchObject({ target: 'adset', targetHandle: AUDIENCE_HANDLE_ID });
    expect(
      graph.edges.some((edge) => edge.source === 'adset' && edge.target.startsWith('audience')),
    ).toBe(false);
    expect(positionOf('audience:audience-1')!.x).toBeLessThan(positionOf('adset')!.x);
    expect(positionOf('audience:audience-1')!.y).toBe(positionOf('adset')!.y);
    expect(graph.nodes.find((node) => node.id === 'audience:audience-1')?.data).toMatchObject({
      mode: 'group',
      audienceGroupId: 'audience-1',
      audienceGroupVersionId: 'audience-version-1',
      locations: ['MX'],
      ageMin: 25,
      ageMax: 50,
    });
  });

  it('draws a group two ad sets share once, left of the first, with no overlapping blocks', () => {
    const base = read();
    const rows = base.tree.rows;
    const secondAdSet = { ...rows[1]!, id: 'adset-2', pathKey: 'c0/a1', ordinal: 1 };
    const graph = buildHydratedCanvasGraph({
      ...base,
      tree: { ...base.tree, rows: [...rows, secondAdSet] },
    });
    const positionOf = (id: string) => graph.nodes.find((node) => node.id === id)!.position;

    expect(graph.nodes.filter((node) => node.id === 'audience:audience-1')).toHaveLength(1);
    expect(
      graph.edges
        .filter((edge) => edge.source === 'audience:audience-1')
        .map((edge) => edge.target),
    ).toEqual(['adset', 'adset-2']);
    expect(positionOf('audience:audience-1').x).toBeLessThan(positionOf('adset').x);
    // A node is 384px wide: the second block starts clear of the first ad set's ads.
    expect(positionOf('adset-2').x - positionOf('adset').x).toBeGreaterThanOrEqual(384 * 2);
  });

  it('builds a broad audience from an ad set that carries targeting but no group version', () => {
    const base = read();
    const rows = base.tree.rows.map((entry) =>
      entry.id === 'adset'
        ? {
            ...entry,
            payload: {
              optimization_goal: 'LINK_CLICKS',
              targeting: {
                geo_locations: { countries: ['MX', 'CO'] },
                age_min: 21,
                age_max: 45,
                genders: [2],
              },
            },
          }
        : entry,
    );
    const graph = buildHydratedCanvasGraph({
      ...base,
      audiences: [],
      tree: { ...base.tree, rows },
    });

    const broad = graph.nodes.find((node) => node.id === 'adset:audience');
    expect(broad?.type).toBe('audience');
    expect(broad?.data).toMatchObject({
      mode: 'broad',
      locations: ['MX', 'CO'],
      ageMin: 21,
      ageMax: 45,
      genders: [2],
    });
    expect(graph.edges).toContainEqual({
      id: 'adset:audience->adset',
      source: 'adset:audience',
      target: 'adset',
      targetHandle: AUDIENCE_HANDLE_ID,
    });
  });

  it('prefers the version plan: its audience, budget, currency and creative', () => {
    const plan: PaidScaffoldPlan = {
      schema_version: 1,
      objective: 'OUTCOME_LEADS',
      currency: 'MXN',
      adsets: [
        {
          path_key: 'c0/a0',
          name: 'Ad set',
          optimization_goal: 'LEAD_GENERATION',
          billing_event: 'IMPRESSIONS',
          daily_budget_minor_units: 25_000,
          budget_basis: 'derived',
          budget_source: 'derived',
          meta_floor_minor_units: 10_000,
          raised_to_floor: false,
          expected_conversions_per_day: null,
          audience: {
            kind: 'broad',
            targeting: { countries: ['AR'], age_min: 30, age_max: 65, genders: ['male'] },
            targeting_summary: 'AR · 30-65 · men',
            reach: null,
          },
          promoted_object: null,
        },
      ],
      ads: [
        {
          path_key: 'c0/a0/ad0',
          adset_path_key: 'c0/a0',
          name: 'Ad',
          angle_key: null,
          creative: {
            format: 'carousel',
            cards: [
              { asset_id: '00000000-0000-4000-8000-000000000001', headline: 'One', link: null },
              {
                asset_id: '00000000-0000-4000-8000-000000000002',
                headline: null,
                link: 'https://example.com/two',
              },
            ],
          },
        },
      ],
      evidence: [],
      expected: {
        daily_budget_minor_units: 25_000,
        currency: 'MXN',
        cpa: null,
        cpa_window: null,
        conversions_per_day: null,
        basis: 'no cpa',
      },
      optimizer_enrollment: {
        portfolio: { new_name: 'Bench' },
        apply_mode: 'recommend',
        autopilot_scopes: {
          budget: false,
          creative_swap: false,
          audience_change: false,
          new_audience: false,
          new_creatives: false,
        },
      },
      blockers: [],
    } as PaidScaffoldPlan;
    const graph = buildHydratedCanvasGraph(read({ plan }));
    const dataOf = (id: string) => graph.nodes.find((node) => node.id === id)?.data;

    expect(dataOf('campaign')).toMatchObject({ objective: 'OUTCOME_LEADS' });
    expect(dataOf('adset')).toMatchObject({
      optimizationGoal: 'LEAD_GENERATION',
      budgetAmount: 250,
      budgetCurrency: 'MXN',
    });
    expect(dataOf('adset:audience')).toMatchObject({
      mode: 'broad',
      locations: ['AR'],
      ageMin: 30,
      ageMax: 65,
      genders: [1],
    });
    expect(dataOf('ad')).toMatchObject({ adFormat: 'CAROUSEL' });
    expect(dataOf('ad:creative')).toMatchObject({
      assetType: 'carousel',
      cards: [
        { mediaId: '00000000-0000-4000-8000-000000000001', kind: 'image', headline: 'One' },
        {
          mediaId: '00000000-0000-4000-8000-000000000002',
          kind: 'image',
          linkUrl: 'https://example.com/two',
        },
      ],
    });
    expect(graph.hydration.plan).toBe(plan);
  });

  it('carries the version hash and every source row for the save', () => {
    const graph = buildHydratedCanvasGraph(read());

    expect(graph.hydration.contentHash).toBe('a'.repeat(64));
    expect(graph.hydration.plan).toBeNull();
    expect(Object.keys(graph.hydration.sourceRows)).toEqual(['campaign', 'adset', 'ad']);
    expect(graph.hydration.sourceRows.adset?.productKey).toBe('p');
  });

  it("reads the ad's destination from link_url, falling back to link", () => {
    const withCreative = (creative: Record<string, unknown>) => {
      const base = read();
      const rows = base.tree.rows.map((entry) =>
        entry.id === 'ad' ? { ...entry, payload: { creative } } : entry,
      );
      return buildHydratedCanvasGraph({ ...base, tree: { ...base.tree, rows } }).nodes.find(
        (node) => node.id === 'ad',
      )?.data;
    };

    expect(
      withCreative({ link_url: 'https://a.example', link: 'https://b.example' }),
    ).toMatchObject({ linkUrl: 'https://a.example' });
    expect(withCreative({ link: 'https://b.example' })).toMatchObject({
      linkUrl: 'https://b.example',
    });
  });

  it('reads the creative format off the row instead of assuming an image', () => {
    const base = read();
    const rows = base.tree.rows.map((entry) =>
      entry.id === 'ad'
        ? {
            ...entry,
            creativeAssetId: 'asset-video',
            creativeMedia: { kind: 'video', url: 'https://cdn.example/v.mp4', name: 'Launch cut' },
          }
        : entry,
    );
    const graph = buildHydratedCanvasGraph({ ...base, tree: { ...base.tree, rows } });

    expect(graph.nodes.find((node) => node.id === 'ad')?.data).toMatchObject({
      adFormat: 'VIDEO',
    });
    expect(graph.nodes.find((node) => node.id === 'ad:creative')?.data).toMatchObject({
      label: 'Launch cut',
      assetType: 'video',
      mediaId: 'asset-video',
      assetUrl: 'https://cdn.example/v.mp4',
    });
    expect(graph.edges).toContainEqual({
      id: 'ad->ad:creative',
      source: 'ad',
      target: 'ad:creative',
    });
  });
});

describe('creativeFromRow', () => {
  it('returns null when nothing is attached', () => {
    expect(creativeFromRow({ creativeAssetId: null, creativeMedia: null })).toBeNull();
  });

  it('reads a single image', () => {
    expect(
      creativeFromRow({
        creativeAssetId: 'asset-1',
        creativeMedia: { kind: 'image', thumbnail_url: 'https://cdn.example/t.jpg' },
      }),
    ).toEqual({
      label: 'Attached creative',
      assetType: 'image',
      mediaId: 'asset-1',
      thumbnailUrl: 'https://cdn.example/t.jpg',
    });
  });

  it('reads an agent-attached carousel, keeping card order and tolerating missing thumbnails', () => {
    expect(
      creativeFromRow({
        creativeAssetId: null,
        creativeMedia: {
          kind: 'carousel',
          cards: [
            { asset_id: 'b', kind: 'video', headline: 'Second', link: 'https://x.example' },
            { asset_id: 'a', thumbnail_url: 'https://cdn.example/a.jpg' },
            { headline: 'no asset: dropped' },
          ],
        },
      }),
    ).toEqual({
      label: 'Attached creative',
      assetType: 'carousel',
      cards: [
        { mediaId: 'b', kind: 'video', headline: 'Second', linkUrl: 'https://x.example' },
        { mediaId: 'a', kind: 'image', thumbnailUrl: 'https://cdn.example/a.jpg' },
      ],
    });
  });

  it("takes a plan carousel card's kind from the asset's media type, not a blanket image", () => {
    expect(
      creativeFromRow(
        { creativeAssetId: null, creativeMedia: null },
        {
          format: 'carousel',
          cards: [
            { asset_id: 'clip', headline: null, link: null },
            { asset_id: 'still', headline: null, link: null },
            { asset_id: 'unknown', headline: null, link: null },
          ],
        },
        { clip: 'video', still: 'image' },
      )?.cards?.map((card) => card.kind),
    ).toEqual(['video', 'image', 'image']);
  });

  it('lets the plan win, borrowing the row thumbnail for the same asset', () => {
    expect(
      creativeFromRow(
        {
          creativeAssetId: 'asset-1',
          creativeMedia: { kind: 'image', thumbnail_url: 'https://cdn.example/t.jpg' },
        },
        { format: 'image', cards: [{ asset_id: 'asset-1', headline: null, link: null }] },
      ),
    ).toMatchObject({
      assetType: 'image',
      mediaId: 'asset-1',
      thumbnailUrl: 'https://cdn.example/t.jpg',
    });
  });
});

/*
 * The canvas seam end to end: rows -> hydrate -> save -> what the Backend stores -> hydrate ->
 * save. Byte-equal, or a person who opens and re-saves a version changes it without touching it.
 */
describe('hydrate <-> save round trip (P5 fields)', () => {
  const GROUP = '11111111-1111-4111-8111-111111111111';
  const ASSET = '22222222-2222-4222-8222-222222222222';
  const NOW = Date.parse('2026-10-29T12:00:00Z');

  const P5_ROWS: PaidScaffoldNodeRow[] = [
    row({
      id: 'campaign',
      name: 'Easy Fit | Summer',
      payload: { objective: 'OUTCOME_SALES' },
      budgetMode: 'cbo',
      campaignDailyBudgetMinorUnits: 25_000,
      bidStrategy: 'COST_CAP',
      bidAmountMinorUnits: 1_800,
      fieldProvenance: { budget_mode: 'user_gave', name: 'jaina_filled' },
    }),
    row({
      id: 'adset',
      parentId: 'campaign',
      level: 'adset',
      pathKey: 'c0/a0',
      name: 'Prospecting',
      productKey: 'leggings',
      angleKey: 'comfort',
      payload: {
        optimization_goal: 'OFFSITE_CONVERSIONS',
        funnel_stage: 'prospecting',
        placement: { mode: 'advantage_plus' },
        audience_group_version_id: GROUP,
      },
      bidAmountMinorUnits: 1_200,
      // PostgREST's own rendering of a timestamptz.
      startTime: '2099-01-01T06:00:00+00:00',
      endTime: '2099-02-01T06:00:00+00:00',
      customEventType: 'PURCHASE',
      pixelId: '123456789012',
      fieldProvenance: { start_time: 'user_gave', custom_event_type: 'jaina_filled' },
    }),
    row({
      id: 'ad',
      parentId: 'adset',
      level: 'ad',
      pathKey: 'c0/a0/ad0',
      name: 'Try-on',
      productKey: 'leggings',
      angleKey: 'comfort',
      conceptKey: 'try_on',
      payload: {
        creative: {
          message: 'Stretch that moves with you.',
          headline: 'Summer leggings',
          call_to_action_type: 'SHOP_NOW',
          link_url: 'https://easyfit.example/summer',
        },
      },
      creativeAssetId: ASSET,
      creativeMedia: { kind: 'image' },
      urlTags: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}',
      fieldProvenance: { url_tags: 'user_gave' },
    }),
  ];

  const p5Read = (rows: PaidScaffoldNodeRow[], plan: PaidScaffoldPlan | null = null) =>
    read({
      tree: { versionId: 'version-1', rows },
      audiences: [],
      plan,
      version: {
        id: '44444444-4444-4444-8444-444444444444',
        version: 2,
        lifecycle: 'proposed',
        createdAt: '2026-09-07T09:00:00.000Z',
        budgetCurrency: 'USD',
      },
    });

  const save = (rows: PaidScaffoldNodeRow[], plan: PaidScaffoldPlan | null = null) => {
    const graph = buildHydratedCanvasGraph(p5Read(rows, plan));
    return buildScaffoldSaveRequest({ ...graph, now: NOW });
  };

  /** What the Backend writes for each saved node — with jsonb's own key order for provenance. */
  const storedRows = (request: PaidScaffoldVersionSaveRequest): PaidScaffoldNodeRow[] => {
    const idOf = (pathKey: string | null) =>
      pathKey === null
        ? null
        : (P5_ROWS.find((entry) => entry.pathKey === pathKey)?.id ?? pathKey);
    return request.nodes.map((node: PaidScaffoldDraftNode) =>
      row({
        id: idOf(node.path_key) ?? node.path_key,
        parentId: idOf(node.parent_path_key),
        level: node.level,
        ordinal: node.ordinal,
        pathKey: node.path_key,
        name: node.name,
        productKey: node.product_key,
        angleKey: node.angle_key,
        conceptKey: node.concept_key,
        payload:
          node.level === 'campaign'
            ? { objective: node.objective }
            : node.level === 'adset'
              ? {
                  optimization_goal: node.optimization_goal,
                  funnel_stage: node.funnel_stage,
                  placement: { mode: node.placement_mode },
                  audience_group_version_id: node.audience_group_version_id,
                }
              : {
                  creative: {
                    message: node.message,
                    headline: node.headline,
                    call_to_action_type: node.call_to_action_type,
                    link_url: node.link,
                  },
                },
        creativeAssetId: node.creative?.cards[0]?.asset_id ?? null,
        creativeMedia: node.creative ? { kind: node.creative.format } : null,
        dailyBudgetMinorUnits: node.daily_budget_minor_units,
        budgetMode: node.budget_mode,
        campaignDailyBudgetMinorUnits: node.campaign_daily_budget_minor_units,
        bidStrategy: node.bid_strategy,
        bidAmountMinorUnits: node.bid_amount_minor_units,
        roasFloor: node.roas_floor,
        startTime: node.start_time,
        endTime: node.end_time,
        customEventType: node.custom_event_type,
        pixelId: node.pixel_id,
        urlTags: node.url_tags,
        fieldProvenance: node.field_provenance
          ? Object.fromEntries(Object.entries(node.field_provenance).reverse())
          : null,
      }),
    );
  };

  it('saves exactly what the rows hold, on the right level', () => {
    const request = save(P5_ROWS);
    const [campaign, adSet, ad] = request.nodes;
    expect(campaign).toMatchObject({
      budget_mode: 'cbo',
      campaign_daily_budget_minor_units: 25_000,
      bid_strategy: 'COST_CAP',
      bid_amount_minor_units: 1_800,
      field_provenance: { name: 'jaina_filled', budget_mode: 'user_gave' },
    });
    expect(adSet).toMatchObject({
      daily_budget_minor_units: null,
      bid_strategy: null,
      bid_amount_minor_units: 1_200,
      start_time: '2099-01-01T06:00:00+00:00',
      end_time: '2099-02-01T06:00:00+00:00',
      custom_event_type: 'PURCHASE',
      pixel_id: '123456789012',
      field_provenance: { custom_event_type: 'jaina_filled', start_time: 'user_gave' },
    });
    expect(ad).toMatchObject({
      url_tags: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}',
      field_provenance: { url_tags: 'user_gave' },
    });
  });

  it('round-trips save -> rows -> hydrate -> save byte for byte', () => {
    const first = save(P5_ROWS);
    const second = save(storedRows(first));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('hydrates rows read before the migration (no P5 columns) to null, and saves nulls', () => {
    const raw = (entry: PaidScaffoldNodeRow) => ({
      id: entry.id,
      parent_id: entry.parentId,
      level: entry.level,
      ordinal: entry.ordinal,
      path_key: entry.pathKey,
      name: entry.name,
      product_key: entry.productKey,
      angle_key: entry.angleKey,
      concept_key: entry.conceptKey,
      payload: entry.payload,
      status: entry.status,
      creative_asset_id: entry.creativeAssetId,
      creative_media: entry.creativeMedia,
      daily_budget_minor_units: entry.dailyBudgetMinorUnits,
    });
    const legacy = P5_ROWS.map((entry) => toNodeRow(raw(entry)));
    expect(legacy[0]).toMatchObject({ budgetMode: null, bidStrategy: null, fieldProvenance: null });
    expect(legacy[2]?.urlTags).toBeNull();

    const graph = buildHydratedCanvasGraph(p5Read(legacy));
    const campaign = graph.nodes.find((entry) => entry.type === 'campaign')?.data;
    expect(campaign?.budgetMode).toBeUndefined();
    expect(campaign?.fieldProvenance).toBeUndefined();

    const request = buildScaffoldSaveRequest({ ...graph, now: NOW });
    for (const node of request.nodes) {
      expect(node).toMatchObject({
        budget_mode: null,
        bid_strategy: null,
        bid_amount_minor_units: null,
        start_time: null,
        custom_event_type: null,
        url_tags: null,
        field_provenance: null,
      });
    }
  });

  it('maps the P5 columns off a row read with select(*)', () => {
    const mapped = toNodeRow({
      id: 'adset',
      level: 'adset',
      path_key: 'c0/a0',
      payload: {},
      budget_mode: 'cbo',
      campaign_daily_budget_minor_units: 25_000,
      bid_strategy: 'LOWEST_COST_WITH_MIN_ROAS',
      bid_amount_minor_units: null,
      // A numeric column PostgREST may render as a string.
      roas_floor: '2.5',
      start_time: '2099-01-01T06:00:00+00:00',
      end_time: null,
      custom_event_type: 'NOT_AN_EVENT',
      pixel_id: '123456789012',
      url_tags: 'utm_source=meta',
      field_provenance: { name: 'user_gave', headline: 'made_up' },
    });
    expect(mapped).toMatchObject({
      budgetMode: 'cbo',
      campaignDailyBudgetMinorUnits: 25_000,
      bidStrategy: 'LOWEST_COST_WITH_MIN_ROAS',
      bidAmountMinorUnits: null,
      roasFloor: 2.5,
      startTime: '2099-01-01T06:00:00+00:00',
      endTime: null,
      customEventType: null,
      pixelId: '123456789012',
      urlTags: 'utm_source=meta',
      fieldProvenance: { name: 'user_gave' },
    });
  });

  it("shows a plan's budget mode, bid and schedule when the row predates the columns", () => {
    const plan = paidScaffoldPlanSchema.parse({
      schema_version: 1,
      objective: 'OUTCOME_SALES',
      currency: 'USD',
      adsets: [
        {
          path_key: 'c0/a0',
          name: 'Prospecting',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget_minor_units: null,
          budget_basis: 'held by the campaign',
          budget_source: 'derived',
          meta_floor_minor_units: null,
          raised_to_floor: false,
          expected_conversions_per_day: null,
          audience: {
            kind: 'group',
            group_version_id: GROUP,
            group_name: 'Purchasers',
            member_count: 1,
            members: [],
            targeting_summary: null,
            reach: null,
          },
          promoted_object: null,
          budget_held_by_campaign: true,
          schedule: { start_time: '2099-01-01T06:00:00+00:00', end_time: null },
        },
      ],
      ads: [{ path_key: 'c0/a0/ad0', adset_path_key: 'c0/a0', name: 'Try-on', angle_key: null, creative: null, url_tags: 'utm_source=meta' }],
      evidence: [],
      expected: {
        daily_budget_minor_units: 25_000,
        currency: 'USD',
        cpa: null,
        cpa_window: null,
        conversions_per_day: null,
        basis: 'no cpa',
      },
      optimizer_enrollment: {
        portfolio: { new_name: 'Bench' },
        apply_mode: 'recommend',
        autopilot_scopes: {
          budget: false,
          creative_swap: false,
          audience_change: false,
          new_audience: false,
          new_creatives: false,
        },
      },
      blockers: [],
      budget_mode: 'cbo',
      campaign_daily_budget_minor_units: 25_000,
      campaign_bid: { strategy: 'COST_CAP', bid_amount_minor_units: 1_800, roas_floor: null },
    });
    const bare = P5_ROWS.map((entry) => row({ ...entry, budgetMode: undefined, campaignDailyBudgetMinorUnits: undefined, bidStrategy: undefined, bidAmountMinorUnits: undefined, startTime: undefined, endTime: undefined, customEventType: undefined, pixelId: undefined, urlTags: undefined, fieldProvenance: undefined }));
    const graph = buildHydratedCanvasGraph(p5Read(bare, plan));
    const dataOf = (type: string) => graph.nodes.find((entry) => entry.type === type)?.data;
    expect(dataOf('campaign')).toMatchObject({
      budgetMode: 'cbo',
      campaignBudgetAmount: 250,
      bidStrategy: 'COST_CAP',
      bidAmount: 18,
    });
    expect(dataOf('ad-set')).toMatchObject({ startTime: '2099-01-01T06:00:00+00:00' });
    expect(dataOf('ad')).toMatchObject({ urlTags: 'utm_source=meta' });
  });
});
