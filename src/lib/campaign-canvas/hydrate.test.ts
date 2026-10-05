import { describe, expect, it } from 'bun:test';
import type { PaidScaffoldPlan } from '@continuum/contracts';
import { AUDIENCE_HANDLE_ID } from '@/CampaignCanvas/types';
import type { CanvasGate, CanvasScaffoldRead } from '@/lib/paid-media/jaina-activity-client';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { buildHydratedCanvasGraph, creativeFromRow } from './hydrate';

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
