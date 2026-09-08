import { describe, expect, it } from 'bun:test';
import type { CanvasGate, CanvasScaffoldRead } from '@/lib/paid-media/jaina-activity-client';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { buildHydratedCanvasGraph } from './hydrate';

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
      gate: { gate: 'audience_group_publish', status: 'denied', approvedBy: null, approvedAt: null },
    },
  ],
  ...overrides,
});

describe('buildHydratedCanvasGraph', () => {
  it('maps a scaffold to a campaign -> ad set -> ad graph with its audience group', () => {
    const graph = buildHydratedCanvasGraph(read());

    expect(graph.nodes.map((node) => node.type)).toEqual([
      'campaign',
      'ad-set',
      'ad',
      'audience',
    ]);
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
      'campaign->adset',
      'adset->ad',
      'adset->audience:audience-1',
    ]);
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
    expect(graph.edges.some((edge) => edge.target === 'audience:audience-1')).toBe(false);
  });
});
