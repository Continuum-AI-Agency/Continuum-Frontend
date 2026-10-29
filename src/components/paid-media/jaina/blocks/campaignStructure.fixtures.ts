// The mock-up campaigns of P5 §5 as `paid.campaign_structure` payloads, one per design.
// Shared by the renderer's tests and `jaina:structure:visual:bench`. Figures are already
// printed, the way the Backend prints them (`structureNodesOf`).

import {
  type CampaignStructureLayout,
  type CampaignStructurePayload,
  campaignStructurePartId,
  type StructureDiff,
  type StructureNode,
} from '@continuum/contracts';

export const FIXTURE_BRAND_ID = '66666666-6666-4666-8666-666666666666';
export const FIXTURE_PARENT_ID = '22222222-2222-4222-8222-222222222222';
export const FIXTURE_VERSION_ID = '11111111-1111-4111-8111-111111111111';

const adSet = (
  path_key: string,
  name: string,
  budget: string,
  audience: string,
  stage: StructureNode['funnel_stage'],
  budgetBy: 'user_gave' | 'jaina_filled' = 'jaina_filled',
): StructureNode => ({
  path_key,
  parent_path_key: 'c0',
  level: 'adset',
  name,
  funnel_stage: stage,
  audience_key: `aud:${path_key}`,
  creative_key: null,
  fields: [
    {
      key: 'optimization_goal',
      label: 'Optimization',
      value: 'Lead generation',
      provenance: 'jaina_filled',
    },
    { key: 'audience', label: 'Audience', value: audience, provenance: 'jaina_filled' },
    {
      key: 'placement_mode',
      label: 'Placements',
      value: 'Advantage+ (Meta places the ads)',
      provenance: 'jaina_filled',
    },
    { key: 'daily_budget_minor_units', label: 'Daily budget', value: budget, provenance: budgetBy },
    {
      key: 'bid_strategy',
      label: 'Bid strategy',
      value: 'Lowest cost (Meta default)',
      provenance: 'jaina_filled',
    },
    {
      key: 'start_time',
      label: 'Schedule',
      value: 'Starts when activated · no end date',
      provenance: 'jaina_filled',
    },
  ],
});

const ad = (
  path_key: string,
  name: string,
  creative: string,
  hasCreative = true,
): StructureNode => ({
  path_key,
  parent_path_key: path_key.slice(0, path_key.lastIndexOf('/')),
  level: 'ad',
  name,
  funnel_stage: null,
  audience_key: null,
  creative_key: creative,
  fields: [
    hasCreative
      ? { key: 'creative', label: 'Creative', value: 'Image', provenance: 'jaina_filled' }
      : { key: 'creative', label: 'Creative', value: null, provenance: 'jaina_asks' },
    {
      key: 'message',
      label: 'Primary text',
      value: 'Tu primer mes por $99. Inscríbete hoy en Monterrey.',
      provenance: 'user_gave',
    },
    { key: 'call_to_action_type', label: 'Button', value: 'Sign up', provenance: 'jaina_filled' },
    { key: 'link', label: 'URL', value: 'https://easyfit.mx/promo', provenance: 'user_gave' },
  ],
});

export const LEADS_MTY_NODES: StructureNode[] = [
  {
    path_key: 'c0',
    parent_path_key: null,
    level: 'campaign',
    name: 'Leads MTY',
    funnel_stage: null,
    audience_key: null,
    creative_key: null,
    fields: [
      { key: 'objective', label: 'Objective', value: 'Leads', provenance: 'user_gave' },
      {
        key: 'budget_mode',
        label: 'Budget',
        value: 'Ad set budgets (ABO)',
        provenance: 'jaina_filled',
      },
    ],
  },
  adSet(
    'c0/a0',
    'LAL 1%',
    '$300 MXN',
    'Lookalike 1% · leads · MX · Monterrey +15 km',
    'prospecting',
    'user_gave',
  ),
  ad('c0/a0/ad0', 'UGC-01 · LAL', 'ugc-01'),
  ad('c0/a0/ad1', 'UGC-02 · LAL', 'ugc-02', false),
  adSet('c0/a1', 'Broad 25-45', '$300 MXN', 'Broad · MX · 25-45 · all genders', 'prospecting'),
  ad('c0/a1/ad0', 'UGC-01 · Broad', 'ugc-01'),
  adSet('c0/a2', 'Retargeting 30d', '$200 MXN', 'Broad · MX · 18-65 · all genders', 'conversion'),
  ad('c0/a2/ad0', 'Promo-A · Retarg', 'promo-a'),
];

const countsOf = (nodes: StructureNode[]): CampaignStructurePayload['counts'] => {
  const fields = nodes.flatMap((node) => node.fields);
  return {
    campaigns: nodes.filter((node) => node.level === 'campaign').length,
    adSets: nodes.filter((node) => node.level === 'adset').length,
    ads: nodes.filter((node) => node.level === 'ad').length,
    userGave: fields.filter((field) => field.provenance === 'user_gave').length,
    jainaFilled: fields.filter((field) => field.provenance === 'jaina_filled').length,
    jainaAsks: fields.filter((field) => field.provenance === 'jaina_asks').length,
  };
};

export const PROMO_DIFF: StructureDiff = {
  source: { kind: 'campaign', id: '120200000000000001', name: 'Promo Oct' },
  entries: [
    {
      path_key: 'c0',
      source_path_key: 'c0',
      level: 'campaign',
      name: 'Promo Nov',
      change: 'changed',
      fields: [{ key: 'name', label: 'Name', before: 'Promo Oct', after: 'Promo Nov' }],
    },
    {
      path_key: 'c0/a0',
      source_path_key: 'c0/a0',
      level: 'adset',
      name: 'AS Retarg',
      change: 'changed',
      fields: [
        {
          key: 'daily_budget_minor_units',
          label: 'Daily budget',
          before: '$300 MXN',
          after: '$450 MXN',
        },
      ],
    },
    {
      path_key: 'c0/a1',
      source_path_key: 'c0/a1',
      level: 'adset',
      name: 'AS LAL · Carousel',
      change: 'removed',
      fields: [],
    },
    {
      path_key: 'c0/a2',
      source_path_key: null,
      level: 'adset',
      name: 'AS Broad',
      change: 'added',
      fields: [
        { key: 'daily_budget_minor_units', label: 'Daily budget', before: null, after: '$250 MXN' },
      ],
    },
    {
      path_key: 'c0/a0/ad0',
      source_path_key: 'c0/a0/ad0',
      level: 'ad',
      name: 'UGC-01 · Retarg',
      change: 'unchanged',
      fields: [],
    },
  ],
};

/** The compiled-HTML pointer the Backend files at `<brand>/paid-structure/`. */
export const fixtureHtmlPath = (layout: CampaignStructureLayout): string =>
  `${FIXTURE_BRAND_ID}/paid-structure/structure-${FIXTURE_VERSION_ID}-${layout}.html`;

/** One payload per design, as the Backend would emit it for the mock-up campaign. */
export function fixtureStructure(
  layout: CampaignStructureLayout,
  over: Partial<CampaignStructurePayload> = {},
): CampaignStructurePayload {
  const compiled = layout === 'tree' || layout === 'matrix' || layout === 'funnel';
  return {
    scaffoldId: FIXTURE_VERSION_ID,
    parentScaffoldId: FIXTURE_PARENT_ID,
    version: 1,
    layout,
    partId: campaignStructurePartId(FIXTURE_PARENT_ID, layout),
    title: layout === 'diff' ? 'Promo Nov' : 'Leads MTY',
    counts: countsOf(LEADS_MTY_NODES),
    nodes: LEADS_MTY_NODES,
    truncated: false,
    diff: layout === 'diff' ? PROMO_DIFF : null,
    html: compiled
      ? {
          bucket: 'hyperframes-compositions',
          path: fixtureHtmlPath(layout),
          width: 720,
          height: 420,
        }
      : null,
    canvasHref: null,
    ...over,
  };
}
