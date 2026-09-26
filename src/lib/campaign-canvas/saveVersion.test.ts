import { describe, expect, it } from 'bun:test';
import type {
  CampaignCanvasEdge,
  CampaignCanvasNode,
  CampaignCanvasNodeData,
} from '@/CampaignCanvas/types';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import type { CanvasHydration } from './hydrate';
import { buildScaffoldSaveRequest, CanvasSaveError } from './saveVersion';

const GROUP_VERSION = '11111111-1111-4111-8111-111111111111';
const ASSET_A = '22222222-2222-4222-8222-222222222222';
const ASSET_B = '33333333-3333-4333-8333-333333333333';
const BASE_VERSION = '44444444-4444-4444-8444-444444444444';

const row = (
  fields: Partial<PaidScaffoldNodeRow> & Pick<PaidScaffoldNodeRow, 'id' | 'level' | 'pathKey'>,
): PaidScaffoldNodeRow => ({
  parentId: null,
  ordinal: 0,
  name: fields.pathKey,
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
  ...fields,
});

const SOURCE_ROWS: Record<string, PaidScaffoldNodeRow> = {
  'row-c': row({
    id: 'row-c',
    level: 'campaign',
    pathKey: 'c0',
    payload: { objective: 'OUTCOME_SALES' },
  }),
  'row-a': row({
    id: 'row-a',
    level: 'adset',
    pathKey: 'c0/a0',
    productKey: 'leggings',
    angleKey: 'comfort',
    dailyBudgetMinorUnits: 5000,
    payload: {
      funnel_stage: 'retargeting',
      placement: { mode: 'manual', publisher_platforms: ['instagram'] },
    },
  }),
  'row-ad': row({ id: 'row-ad', level: 'ad', pathKey: 'c0/a0/ad0', conceptKey: 'ugc_try_on' }),
};

const hydration: CanvasHydration = {
  scaffoldId: 'scaffold-1',
  scaffoldName: 'Easy Fit | Summer',
  versionId: BASE_VERSION,
  version: 2,
  lifecycle: 'proposed',
  adAccountId: 'act_1',
  contentHash: 'a'.repeat(64),
  plan: null,
  sourceRows: SOURCE_ROWS,
};

const node = (
  id: string,
  type: CampaignCanvasNode['type'],
  data: Record<string, unknown>,
  sourceId?: string,
  x = 0,
): CampaignCanvasNode => ({
  id,
  type,
  position: { x, y: 0 },
  data: {
    validationStatus: 'valid',
    ...data,
    ...(sourceId
      ? {
          provenance: {
            sourceId,
            pathKey: SOURCE_ROWS[sourceId]?.pathKey ?? sourceId,
            gate: null,
            metaStatus: null,
          },
        }
      : {}),
  } as CampaignCanvasNodeData,
});

const edge = (source: string, target: string, targetHandle?: string): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(targetHandle ? { targetHandle } : {}),
});

const graph = (overrides: { budgetAmount?: number; broad?: boolean; cards?: number } = {}) => {
  const nodes: CampaignCanvasNode[] = [
    node(
      'c',
      'campaign',
      {
        label: 'Easy Fit | Summer',
        objective: 'OUTCOME_SALES',
        buyingType: 'AUCTION',
        specialAdCategories: [],
      },
      'row-c',
    ),
    node(
      'a',
      'ad-set',
      {
        label: 'Retargeting',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        billingEvent: 'IMPRESSIONS',
        budgetAmount: overrides.budgetAmount ?? 50,
      },
      'row-a',
    ),
    // A drawn ad set with no row: it must still carry every key the compiler requires.
    node(
      'a2',
      'ad-set',
      {
        label: 'New lookalike test',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        billingEvent: 'IMPRESSIONS',
        budgetAmount: 12.5,
      },
      undefined,
      500,
    ),
    node(
      'ad',
      'ad',
      {
        label: 'Try-on reel',
        adFormat: 'CAROUSEL',
        primaryText: '  Stretch that moves with you.  ',
        headline: 'Summer leggings',
        description: '',
        callToAction: 'SHOP_NOW',
        linkUrl: 'https://easyfit.example/summer',
      },
      'row-ad',
    ),
    node('cr', 'creative', {
      label: 'Carousel',
      assetType: 'carousel',
      cards: [
        {
          mediaId: ASSET_A,
          kind: 'image',
          headline: 'Black',
          linkUrl: 'https://easyfit.example/black',
        },
        { mediaId: ASSET_B, kind: 'image', headline: '', linkUrl: '' },
      ].slice(0, overrides.cards ?? 2),
    }),
    node(
      'aud',
      'audience',
      overrides.broad
        ? {
            label: 'Broad',
            mode: 'broad',
            locations: ['mx', 'US', 'Mexico'],
            ageMin: 16,
            ageMax: 70,
            genders: [1, 2],
          }
        : {
            label: 'Purchasers LAL',
            mode: 'group',
            audienceGroupVersionId: GROUP_VERSION,
            locations: [],
          },
    ),
    node('aud2', 'audience', {
      label: 'Women MX',
      mode: 'broad',
      locations: ['MX'],
      ageMin: 25,
      ageMax: 44,
      genders: [2],
    }),
  ];
  const edges = [
    edge('c', 'a'),
    edge('c', 'a2'),
    edge('a', 'ad'),
    edge('ad', 'cr'),
    edge('aud', 'a', 'audience'),
    edge('aud2', 'a2', 'audience'),
  ];
  return { nodes, edges };
};

describe('buildScaffoldSaveRequest', () => {
  it('flattens the graph into the version tree the compiler reads', () => {
    const request = buildScaffoldSaveRequest({ ...graph(), hydration });
    expect(request.base_version_id).toBe(BASE_VERSION);
    expect(request.nodes.map((entry) => entry.path_key)).toEqual([
      'c0',
      'c0/a0',
      'c0/a0/ad0',
      'c0/a1',
    ]);
    const [campaign, adSet, ad, drawn] = request.nodes;
    expect(campaign?.objective).toBe('OUTCOME_SALES');
    expect(campaign?.special_ad_categories).toEqual([]);
    expect(adSet?.special_ad_categories).toBeNull();
    expect(ad?.special_ad_categories).toBeNull();
    // Pass-through keys come from the version's own row, untouched.
    expect(adSet).toMatchObject({
      product_key: 'leggings',
      angle_key: 'comfort',
      funnel_stage: 'retargeting',
      placement_mode: 'manual',
      publisher_platforms: ['instagram'],
      objective: 'OUTCOME_SALES',
      audience_group_version_id: GROUP_VERSION,
      broad_targeting: null,
    });
    // A drawn ad set inherits the version's product and names its own angle.
    expect(drawn).toMatchObject({
      product_key: 'leggings',
      angle_key: 'new_lookalike_test',
      funnel_stage: 'prospecting',
      placement_mode: 'advantage_plus',
      daily_budget_minor_units: 1250,
      broad_targeting: { countries: ['MX'], age_min: 25, age_max: 44, genders: ['female'] },
    });
    expect(ad).toMatchObject({
      product_key: 'leggings',
      angle_key: 'comfort',
      concept_key: 'ugc_try_on',
      message: 'Stretch that moves with you.',
      headline: 'Summer leggings',
      description: null,
      call_to_action_type: 'SHOP_NOW',
      link: 'https://easyfit.example/summer',
      creative: {
        format: 'carousel',
        cards: [
          { asset_id: ASSET_A, headline: 'Black', link: 'https://easyfit.example/black' },
          { asset_id: ASSET_B, headline: null, link: null },
        ],
      },
    });
    // Recommend, every autopilot scope off, when the version carries no plan of its own.
    expect(request.optimizer_enrollment.apply_mode).toBe('recommend');
    expect(Object.values(request.optimizer_enrollment.autopilot_scopes).every((on) => !on)).toBe(
      true,
    );
  });

  it('sends an untouched derived budget as null (re-derive) and an edited one as the person set it', () => {
    const untouched = buildScaffoldSaveRequest({ ...graph({ budgetAmount: 50 }), hydration });
    expect(untouched.nodes[1]?.daily_budget_minor_units).toBeNull();
    const edited = buildScaffoldSaveRequest({ ...graph({ budgetAmount: 75 }), hydration });
    expect(edited.nodes[1]?.daily_budget_minor_units).toBe(7500);
  });

  it('clamps broad targeting to what Meta accepts and reads both genders as all', () => {
    const request = buildScaffoldSaveRequest({ ...graph({ broad: true }), hydration });
    expect(request.nodes[1]?.audience_group_version_id).toBeNull();
    expect(request.nodes[1]?.broad_targeting).toEqual({
      countries: ['MX', 'US'],
      age_min: 18,
      age_max: 65,
      genders: null,
    });
  });

  it('refuses a one-card carousel before anything is sent, naming the ad', () => {
    let error: unknown = null;
    try {
      buildScaffoldSaveRequest({ ...graph({ cards: 1 }), hydration });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(CanvasSaveError);
    expect((error as CanvasSaveError).issues.join(' ')).toContain('Try-on reel');
  });

  const refusal = (build: () => unknown): CanvasSaveError => {
    try {
      build();
    } catch (cause) {
      if (cause instanceof CanvasSaveError) return cause;
      throw cause;
    }
    throw new Error('the save was not refused');
  };

  it('refuses every node the save could not carry, naming each one', () => {
    const { nodes, edges } = graph();
    nodes.push(
      node('loose-set', 'ad-set', { label: 'Loose ad set', optimizationGoal: 'LINK_CLICKS' }),
      node('loose-ad', 'ad', { label: 'Loose ad', adFormat: 'IMAGE', primaryText: '', headline: '' }),
      node('second', 'creative', { label: 'Second creative', assetType: 'image', mediaId: ASSET_A }),
      node('stray-broad', 'audience', { label: 'Stray broad', mode: 'broad', locations: ['MX'] }),
      // A published group left unconnected is a record of its own — nothing is lost.
      node('spare-group', 'audience', {
        label: 'Spare group',
        mode: 'group',
        audienceGroupVersionId: GROUP_VERSION,
        locations: [],
      }),
    );
    edges.push(edge('ad', 'second'));
    const issues = refusal(() => buildScaffoldSaveRequest({ nodes, edges, hydration })).issues.join(
      ' | ',
    );
    expect(issues).toContain('Loose ad set: this ad set is not under the campaign');
    expect(issues).toContain('Loose ad: this ad is not under an ad set');
    expect(issues).toContain('Second creative: an ad takes one creative');
    expect(issues).toContain('Stray broad: this audience feeds no ad set');
    expect(issues).not.toContain('Spare group');
  });

  it('refuses a link that is not http(s), naming the field, instead of dropping it', () => {
    const { nodes, edges } = graph();
    const ad = nodes.find((entry) => entry.id === 'ad');
    if (ad) (ad.data as { linkUrl?: string }).linkUrl = 'javascript:alert(1)';
    const creative = nodes.find((entry) => entry.id === 'cr');
    const cards = (creative?.data as { cards?: { linkUrl?: string }[] }).cards ?? [];
    if (cards[1]) cards[1].linkUrl = 'easyfit.mx/no-scheme';
    const issues = refusal(() => buildScaffoldSaveRequest({ nodes, edges, hydration })).issues;
    expect(issues).toContain('Try-on reel: destination URL "javascript:alert(1)" is not an http(s) link.');
    expect(issues).toContain('Carousel: card 2 link "easyfit.mx/no-scheme" is not an http(s) link.');
  });

  it('refuses a group audience with no group picked, rather than saving stale broad fields', () => {
    const { nodes, edges } = graph();
    const audience = nodes.find((entry) => entry.id === 'aud');
    if (audience) {
      Object.assign(audience.data, {
        mode: 'group',
        audienceGroupVersionId: undefined,
        locations: ['US'],
      });
    }
    expect(refusal(() => buildScaffoldSaveRequest({ nodes, edges, hydration })).issues).toContain(
      'Purchasers LAL: pick a published audience group, or switch the audience to Broad.',
    );
  });
});

