/**
 * P5 design 08 on the Frontend: a campaign COPY's version, as the Backend stores it (rows whose
 * ad set targeting is a live ad set's verbatim, ads on their source creative, a plan whose
 * audience is `copied`). The card names each audience "copied from <source>" and counts no ad
 * as missing a creative; the canvas shows the copied audience and refuses to save it, by name,
 * with where to edit it instead.
 */

import { describe, expect, it } from 'bun:test';
import {
  type PaidScaffoldPlan,
  paidScaffoldCopiedAudienceSaveIssue,
  paidScaffoldPlanSchema,
} from '@continuum/contracts';
import {
  audienceLinesOf,
  deployBlockersOf,
  creativeTilesOf,
} from '@/components/paid-media/jaina/scaffold/scaffoldPlanView';
import type { CanvasScaffoldRead } from '@/lib/paid-media/jaina-activity-client';
import {
  buildScaffoldTree,
  type PaidScaffoldNodeRow,
  scaffoldBlockersOf,
} from '@/lib/paid-media/scaffoldTree';
import { buildHydratedCanvasGraph } from './hydrate';
import { buildScaffoldSaveRequest, CanvasSaveError } from './saveVersion';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const SOURCE_ADSET = 'Monterrey · WhatsApp 11';

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

const COPIED_TARGETING = {
  geo_locations: { cities: [{ key: '1522604', radius: 10, distance_unit: 'kilometer' }] },
  age_min: 22,
  age_max: 45,
  custom_audiences: [{ id: '23850000000000099' }],
};

const ROWS: PaidScaffoldNodeRow[] = [
  row({
    id: 'campaign',
    name: 'MENSAJES // MONTERREY (copy)',
    payload: { objective: 'OUTCOME_ENGAGEMENT' },
  }),
  row({
    id: 'adset',
    parentId: 'campaign',
    level: 'adset',
    pathKey: 'c0/a0',
    name: SOURCE_ADSET,
    productKey: 'copy',
    angleKey: 'copy:120200000000000111',
    dailyBudgetMinorUnits: 25_000,
    payload: {
      objective: 'OUTCOME_ENGAGEMENT',
      optimization_goal: 'CONVERSATIONS',
      funnel_stage: 'prospecting',
      placement: { mode: 'advantage_plus' },
      targeting: COPIED_TARGETING,
      destination_type: 'WHATSAPP',
    },
  }),
  row({
    id: 'ad',
    parentId: 'adset',
    level: 'ad',
    pathKey: 'c0/a0/ad0',
    name: 'Ad 21',
    productKey: 'copy',
    angleKey: 'copy:120200000000000111',
    conceptKey: 'copy:120200000000000121',
    payload: { source_creative_id: '120200000000000901' },
  }),
];

const PLAN: PaidScaffoldPlan = paidScaffoldPlanSchema.parse({
  schema_version: 1,
  objective: 'OUTCOME_ENGAGEMENT',
  currency: 'MXN',
  adsets: [
    {
      path_key: 'c0/a0',
      name: SOURCE_ADSET,
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      daily_budget_minor_units: 25_000,
      budget_basis: "the source ad set's own daily budget",
      budget_source: 'derived',
      meta_floor_minor_units: null,
      raised_to_floor: false,
      expected_conversions_per_day: null,
      audience: {
        kind: 'copied',
        source_adset_id: '120200000000000111',
        source_adset_name: SOURCE_ADSET,
        targeting_summary: '1 city · 22-45 · all genders · 1 custom audience',
        reach: null,
      },
      promoted_object: { page_id: '102030405060708' },
    },
  ],
  ads: [
    {
      path_key: 'c0/a0/ad0',
      adset_path_key: 'c0/a0',
      name: 'Ad 21',
      angle_key: 'copy:120200000000000111',
      creative: null,
    },
  ],
  evidence: [],
  expected: {
    daily_budget_minor_units: 25_000,
    currency: 'MXN',
    cpa: null,
    cpa_window: null,
    conversions_per_day: null,
    basis: 'a copy',
  },
  optimizer_enrollment: {
    portfolio: { new_name: 'MENSAJES // MONTERREY (copy)' },
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
});

const read = (): CanvasScaffoldRead => ({
  scaffold: {
    id: 'scaffold-1',
    name: 'MENSAJES // MONTERREY (copy)',
    adAccountId: 'act_1',
    currentVersionId: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-10-29T09:00:00.000Z',
  },
  version: {
    id: '44444444-4444-4444-8444-444444444444',
    version: 1,
    lifecycle: 'proposed',
    createdAt: '2026-10-29T09:00:00.000Z',
  },
  versions: [],
  tree: { versionId: '44444444-4444-4444-8444-444444444444', rows: ROWS },
  gates: {},
  audiences: [],
  contentHash: 'a'.repeat(64),
  plan: PLAN,
  specialAdCategories: [],
  assetKinds: {},
});

describe('the scaffold card of a campaign copy', () => {
  it('names each audience as copied from its source ad set', () => {
    expect(audienceLinesOf(PLAN)).toMatchObject([
      {
        key: 'copied:120200000000000111',
        name: `copied from ${SOURCE_ADSET}`,
        kind: 'copied',
        summary: '1 city · 22-45 · all genders · 1 custom audience',
      },
    ]);
  });

  it('counts an ad on its source creative as having one, and shows it', () => {
    const tree = buildScaffoldTree(ROWS);
    expect(scaffoldBlockersOf(tree).adsWithoutCreative).toBe(0);
    expect(
      deployBlockersOf({ plan: PLAN, planLoaded: true, tree, contentHash: 'a'.repeat(64) }).map(
        (blocker) => blocker.code,
      ),
    ).toEqual([]);
    expect(creativeTilesOf(tree, PLAN)[0]?.reusedCreativeId).toBe('120200000000000901');
  });
});

describe('the canvas of a campaign copy', () => {
  it('shows the copied audience for what it is, never as broad targeting', () => {
    const graph = buildHydratedCanvasGraph(read());
    const audience = graph.nodes.find((node) => node.type === 'audience');
    expect(audience?.data).toMatchObject({
      mode: 'copied',
      label: `Copied from ${SOURCE_ADSET}`,
      copiedFromAdSetName: SOURCE_ADSET,
    });
  });

  it('refuses to save it, by name, saying where to edit it', () => {
    const graph = buildHydratedCanvasGraph(read());
    let refusal: unknown = null;
    try {
      buildScaffoldSaveRequest({ ...graph, now: NOW });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(CanvasSaveError);
    expect((refusal as CanvasSaveError).issues).toContain(
      paidScaffoldCopiedAudienceSaveIssue(SOURCE_ADSET),
    );
    expect(paidScaffoldCopiedAudienceSaveIssue(SOURCE_ADSET)).toBe(
      `This audience was copied from ${SOURCE_ADSET}; edit it by asking Jaina or in Ads Manager.`,
    );
  });
});
