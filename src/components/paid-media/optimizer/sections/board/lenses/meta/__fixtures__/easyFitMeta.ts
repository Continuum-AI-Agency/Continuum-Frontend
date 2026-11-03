// Easy Fit's Meta account act_521903353286118 (MXN), read live on 2026-11-02 through the
// Continuum MCP: analytics_query top_campaigns / top_adsets / top_ads (paid-media-reporting/
// metrics, the edge fetchPaidRanking calls, last_30d = Oct 3 – Nov 2) and optimizer_query
// portfolios / adsets for brand 148583e0.
//
// The MCP prints metrics in snake_case and caps a ranking at ten rows; the edge sends camelCase
// (meta/compute.ts mapMetaEntityRowToMetrics) and up to fifty, so the rows are spelled here as
// the Frontend receives them, and they are the top ten. The MCP leaves conversations and leads
// out of a ranking row, so they are absent here too; CAMPAIGN_CONVERSATIONS carries them for the
// five MENSAJES campaigns from the campaign scope read of the same window. Every row goes
// through the contract's own schema, so a fixture the producer could never emit fails here.

import {
  type PaidRankedEntity,
  type PortfolioAdset,
  PortfolioAdsetSchema,
  type PortfolioListItem,
  PortfolioListItemSchema,
  paidRankedEntitySchema,
} from '@continuum/contracts';

export const EASY_FIT_META_ACCOUNT = 'act_521903353286118';
export const EASY_FIT_META_BRAND = '148583e0-5538-462b-8d3a-acd25b80344e';

type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  cpm: number;
};

type Ref = { id: string; name: string };

function ranked(
  level: 'campaign' | 'adset' | 'ad',
  refs: { campaign: Ref; adset?: Ref; ad?: Ref },
  metrics: Metrics,
  rank: number,
): PaidRankedEntity {
  const self = refs.ad ?? refs.adset ?? refs.campaign;
  return paidRankedEntitySchema.parse({
    id: self.id,
    name: self.name,
    level,
    hierarchy: refs,
    path_label: [refs.campaign.name, refs.adset?.name, refs.ad?.name].filter(Boolean).join(' › '),
    labels: refs.adset
      ? { campaign: refs.campaign.name, ...(refs.ad ? { adset: refs.adset.name } : {}) }
      : undefined,
    metrics: { ...metrics, costPerConversion: metrics.cpa },
    rank,
    kpi: 'spend',
    kpi_value: metrics.spend,
    kpi_unit: 'currency',
  });
}

const m = (
  spend: number,
  impressions: number,
  clicks: number,
  conversions: number,
  conversionValue: number,
  roas: number,
  cpa: number,
  ctr: number,
  cpc: number,
  cpm: number,
): Metrics => ({
  spend,
  impressions,
  clicks,
  conversions,
  conversionValue,
  roas,
  cpa,
  ctr,
  cpc,
  cpm,
});

export const CAMPAIGN = {
  canadas: { id: '120250871735930236', name: 'CAÑADAS // MENSAJES //Octubre  2026' },
  aleira: { id: '120250870388300236', name: 'OCTUBRE// ALEIRA // MENSAJES //  2026' },
  camacho: { id: '120250871609960236', name: 'AV CAMACHO // MENSAJES // AGOSTO 2026' },
  iteso: { id: '120250871917580236', name: 'ITESO // MENSAJES // AGOSTO 2026' },
  easy: { id: '120253159392820236', name: 'OCTUBRE// EASY// MENSAJES' },
  canadasForm: { id: '120250872485040236', name: 'CAÑADAS // FORMULARIO // AGOSTO 2026' },
  itesoForm: { id: '120250872653610236', name: 'ITESO // FORMULARIO // AGOSTO 2026' },
  camachoForm: { id: '120250872422840236', name: 'AV CAMACHO // FORMULARIO // AGOSTO 2026' },
  aleiraForm: { id: '120250872006340236', name: 'ALEIRA // FORMULARIO // AGOSTO 2026' },
  itesoTours: {
    id: '120253141147230236',
    name: 'ITESO // TOURS // OCTUBRE 2026 // CONTINUUM - Copy',
  },
} as const;

/** top_campaigns by spend: 10 of the 13 campaigns that spent. */
export const TOP_CAMPAIGNS: PaidRankedEntity[] = [
  ranked(
    'campaign',
    { campaign: CAMPAIGN.canadas },
    m(22562.13, 471480, 4956, 46, 22500, 0.9972, 490.4811, 1.0512, 4.5525, 47.8538),
    1,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.aleira },
    m(18562.21, 431349, 3693, 51, 25500, 1.3738, 363.9649, 0.8562, 5.0263, 43.0329),
    2,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.camacho },
    m(18509.74, 358863, 3903, 45, 22500, 1.2156, 411.3276, 1.0876, 4.7424, 51.5788),
    3,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.iteso },
    m(16303.01, 323044, 3102, 32, 16000, 0.9814, 509.4691, 0.9602, 5.2556, 50.4668),
    4,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.easy },
    m(8551.89, 139961, 1693, 28, 14000, 1.6371, 305.4246, 1.2096, 5.0513, 61.1019),
    5,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.canadasForm },
    m(1349.26, 21559, 266, 7, 3500, 2.594, 192.7514, 1.2338, 5.0724, 62.5845),
    6,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.itesoForm },
    m(986.34, 12717, 223, 3, 1500, 1.5208, 328.78, 1.7536, 4.423, 77.5607),
    7,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.camachoForm },
    m(596.65, 7734, 82, 3, 1500, 2.514, 198.8833, 1.0603, 7.2762, 77.1464),
    8,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.aleiraForm },
    m(472.56, 7767, 61, 1, 500, 1.0581, 472.56, 0.7854, 7.7469, 60.842),
    9,
  ),
  ranked(
    'campaign',
    { campaign: CAMPAIGN.itesoTours },
    m(168.57, 11812, 175, 1, 500, 2.9661, 168.57, 1.4815, 0.9633, 14.2711),
    10,
  ),
];

/** Messaging conversations and leads of the five MENSAJES campaigns, from the campaign scope
 *  read (same window, read minutes after the ranking). */
export const CAMPAIGN_CONVERSATIONS: Record<string, { conversations: number; leads: number }> = {
  [CAMPAIGN.canadas.id]: { conversations: 478, leads: 1 },
  [CAMPAIGN.aleira.id]: { conversations: 391, leads: 1 },
  [CAMPAIGN.camacho.id]: { conversations: 419, leads: 0 },
  [CAMPAIGN.iteso.id]: { conversations: 336, leads: 0 },
  [CAMPAIGN.easy.id]: { conversations: 138, leads: 14 },
};

export const ADSET = {
  aleiraBau: { id: '120252387298200236', name: 'ALEIRA // AGOSTO - BAU - Mensajes' },
  aleiraLkl: { id: '120252387327740236', name: 'ALEIRA // AGOSTO - LKL - Mensajes' },
  canadasLkl: { id: '120252366915460236', name: 'CAÑADAS // AGOSTO - LKL - Mensajes' },
  camachoLkl: { id: '120252387195420236', name: 'AV CAMACHO // AGOSTO - LKL - Mensajes' },
  itesoBroad: { id: '120252366741610236', name: 'ITESO // OCTUBRE - BROAD - Mensajes' },
  itesoLkl: { id: '120252366801240236', name: 'ITESO // OCTUBRE - LKL - Mensajes' },
  canadasBroad: { id: '120252366934240236', name: 'CAÑADAS // AGOSTO - BROAD - Mensajes' },
  camachoBroad: { id: '120252387183480236', name: 'AV CAMACHO // AGOSTO - Broad - Mensajes' },
  easyBroad: { id: '120253159557750236', name: 'EASY/BROAD/OCTUBRE' },
  easyGeo: { id: '120253159699820236', name: 'CONJUNTO GEO' },
  easyBau: { id: '120253159392710236', name: 'EASY /BAU/ OCTUBRE' },
  camachoBau: { id: '120252387201880236', name: 'AV CAMACHO // AGOSTO - BAU - Mensajes' },
  leadsAnnual: { id: '120241771550480236', name: 'EST // ANUALIDAD DESDE $399 AL MES (1-9)' },
} as const;

/** top_adsets by spend: 10 of the 38 ad sets that spent. */
export const TOP_ADSETS: PaidRankedEntity[] = [
  ranked(
    'adset',
    { campaign: CAMPAIGN.aleira, adset: ADSET.aleiraBau },
    m(17717.19, 417358, 3578, 48, 24000, 1.3546, 369.1081, 0.8573, 4.9517, 42.4508),
    1,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.canadas, adset: ADSET.canadasLkl },
    m(14184.99, 338878, 3197, 32, 15500, 1.0927, 443.2809, 0.9434, 4.437, 41.8587),
    2,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.camacho, adset: ADSET.camachoLkl },
    m(10336.19, 235686, 2270, 29, 14500, 1.4028, 356.4203, 0.9631, 4.5534, 43.8558),
    3,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.iteso, adset: ADSET.itesoBroad },
    m(7668.15, 144617, 1486, 17, 8500, 1.1085, 451.0676, 1.0275, 5.1603, 53.0238),
    4,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.iteso, adset: ADSET.itesoLkl },
    m(7458.19, 161358, 1484, 14, 7000, 0.9386, 532.7279, 0.9197, 5.0257, 46.2214),
    5,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.canadas, adset: ADSET.canadasBroad },
    m(7309.68, 110357, 1609, 13, 6500, 0.8892, 562.2831, 1.458, 4.543, 66.2367),
    6,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.camacho, adset: ADSET.camachoBroad },
    m(6128.46, 94625, 1313, 13, 6500, 1.0606, 471.42, 1.3876, 4.6675, 64.7658),
    7,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.easy, adset: ADSET.easyBroad },
    m(4227.71, 68633, 941, 17, 8500, 2.0105, 248.6888, 1.3711, 4.4928, 61.5988),
    8,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.easy, adset: ADSET.easyGeo },
    m(2286.54, 38957, 439, 8, 4000, 1.7494, 285.8175, 1.1269, 5.2085, 58.6939),
    9,
  ),
  ranked(
    'adset',
    { campaign: CAMPAIGN.camacho, adset: ADSET.camachoBau },
    m(2042.64, 28494, 319, 3, 1500, 0.7343, 680.88, 1.1195, 6.4033, 71.6867),
    10,
  ),
];

const ad = (id: string, name: string, adset: Ref): { campaign: Ref; adset: Ref; ad: Ref } => ({
  campaign: CAMPAIGN.aleira,
  adset,
  ad: { id, name },
});

/** top_ads inside the ALEIRA MENSAJES campaign: 10 of its 11 ads. */
export const ALEIRA_ADS: PaidRankedEntity[] = [
  ranked(
    'ad',
    ad('120253434535240236', 'OCTUBRE//ALEIRA // 1 VIDEO $31', ADSET.aleiraBau),
    m(6000.36, 166404, 1262, 9, 4500, 0.75, 666.7067, 0.7584, 4.7546, 36.059),
    1,
  ),
  ranked(
    'ad',
    ad('120252693820890236', 'OCT//ALEIRA // $31 PRIMER MES //', ADSET.aleiraBau),
    m(5534.95, 115051, 1022, 18, 9000, 1.626, 307.4972, 0.8883, 5.4158, 48.1087),
    2,
  ),
  ranked(
    'ad',
    ad('120253434546930236', 'OCTUBRE//ALEIRA // 1 IMAGEN $31', ADSET.aleiraBau),
    m(5425.14, 125900, 1158, 19, 9500, 1.7511, 285.5337, 0.9198, 4.6849, 43.0909),
    3,
  ),
  ranked(
    'ad',
    ad('120253176556400236', 'OCTUBRE//ALEIRA // PRIMER MES $31 - Copia', ADSET.aleiraLkl),
    m(485.51, 6976, 66, 0, 0, 0, 0, 0.9461, 7.3562, 69.5972),
    4,
  ),
  ranked(
    'ad',
    ad('120253434541840236', 'OCTUBRE//ALEIRA // 2 VIDEO $31', ADSET.aleiraBau),
    m(438.36, 5764, 87, 1, 500, 1.1406, 438.36, 1.5094, 5.0386, 76.0514),
    5,
  ),
  ranked(
    'ad',
    ad('120253176556370236', 'OCT//ALEIRA // $31 PRIMER MES // - Copia', ADSET.aleiraLkl),
    m(346.51, 6725, 48, 3, 1500, 4.3289, 115.5033, 0.7138, 7.219, 51.5257),
    6,
  ),
  ranked(
    'ad',
    ad('120252387303100236', 'OCTUBRE//ALEIRA // PRIMER MES $31', ADSET.aleiraBau),
    m(226.48, 2646, 37, 0, 0, 0, 0, 1.3983, 6.1211, 85.5933),
    7,
  ),
  ranked(
    'ad',
    ad('120252387303110236', 'OCTUBRE//ALEIRA // DAYPASS //', ADSET.aleiraBau),
    m(60.97, 980, 10, 0, 0, 0, 0, 1.0204, 6.097, 62.2143),
    8,
  ),
  ranked(
    'ad',
    ad('120252693820900236', 'OCTUBRE//ALEIRA // DAY PASS //', ADSET.aleiraBau),
    m(30.93, 613, 2, 1, 500, 16.1655, 30.93, 0.3263, 15.465, 50.4568),
    9,
  ),
  ranked(
    'ad',
    ad('120253176556380236', 'OCTUBRE//ALEIRA // DAY PASS // - Copia', ADSET.aleiraLkl),
    m(10.56, 215, 1, 0, 0, 0, 0, 0.4651, 10.56, 49.1163),
    10,
  ),
];

const PORTFOLIO_COMMON = {
  ad_account_id: EASY_FIT_META_ACCOUNT,
  level: 'adset',
  budget_source: 'fixed',
  lookback_window: 'd14',
  creative_analysis: 'on',
  scale_growth_pct: null,
  scale_cadence_days: null,
  scale_max_daily: null,
  last_scaled_at: null,
  velocity_cap_pct: 0.3,
  status: 'active',
  autopilot_paused: false,
  autopilot_scopes: {
    budget: true,
    creative_swap: false,
    audience_change: false,
    new_audience: false,
    new_creatives: false,
  },
  autopilot_scopes_changed_by: null,
  conversion_descriptor: null,
  target_metric: null,
  platforms: ['meta'],
  currency: 'MXN',
  platform_writes: {},
  goal_as_platform_cost_cap: false,
};

export const PORTFOLIO_IDS = {
  conversaciones: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
  tours: 'ec956b3d-c9b1-48ea-b55b-bda303e68f79',
  leads: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
} as const;

/** optimizer_list_portfolios for the account, as read. */
export const PORTFOLIOS: PortfolioListItem[] = [
  PortfolioListItemSchema.parse({
    ...PORTFOLIO_COMMON,
    id: PORTFOLIO_IDS.leads,
    name: 'Leads // Google Ads only',
    objective: 'lead',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 2795,
    period_budget: null,
    budget_source: 'observed',
    period_start: null,
    period_end: null,
    cpa_target: null,
    budget_granularity: 'daily',
    next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
    adset_count: 1,
    pending_recommendations: 0,
    pending_budget_moves: 0,
    apply_mode_changed_by: null,
    max_daily_apply_minor: null,
    max_change_pct_per_cycle: null,
    last_actual_cycle_at: '2026-11-02T05:06:35.255+00:00',
    conserved_daily_total: 50,
    stale_for_days: null,
    roster_state: 'present',
    roster_absent_since: null,
    roster_missing_count: 0,
    last_cycle_current: true,
    withdrawn_reason: null,
  }),
  PortfolioListItemSchema.parse({
    ...PORTFOLIO_COMMON,
    id: PORTFOLIO_IDS.conversaciones,
    name: 'Conversaciones Whatsapp',
    objective: 'conversations',
    mode: 'efficiency',
    apply_mode: 'autopilot',
    daily_total: 3000,
    period_budget: 90000,
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    cpa_target: 45,
    budget_granularity: 'monthly',
    next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
    adset_count: 7,
    pending_recommendations: 6,
    pending_budget_moves: 0,
    apply_mode_changed_by: 'e6d86770-4928-4fd5-ba40-dbc47f565823',
    max_daily_apply_minor: 320000,
    max_change_pct_per_cycle: 0.2,
    last_actual_cycle_at: '2026-11-02T05:04:55.126+00:00',
    conserved_daily_total: 2994.436551724138,
    stale_for_days: null,
    roster_state: 'present',
    roster_absent_since: null,
    roster_missing_count: 0,
    last_cycle_current: true,
    withdrawn_reason: null,
  }),
  PortfolioListItemSchema.parse({
    ...PORTFOLIO_COMMON,
    id: PORTFOLIO_IDS.tours,
    name: 'Tours Programados - Octubre',
    objective: 'purchase',
    mode: 'balanced',
    apply_mode: 'autopilot',
    daily_total: 460,
    period_budget: null,
    period_start: null,
    period_end: null,
    cpa_target: 296,
    budget_granularity: 'daily',
    next_realloc_at: '2026-11-03T17:08:47.360392+00:00',
    adset_count: 3,
    pending_recommendations: 0,
    pending_budget_moves: 0,
    apply_mode_changed_by: 'e6d86770-4928-4fd5-ba40-dbc47f565823',
    max_daily_apply_minor: 50000,
    max_change_pct_per_cycle: 0.2,
    last_actual_cycle_at: '2026-10-14T16:58:08.965+00:00',
    conserved_daily_total: 460,
    stale_for_days: 19,
    roster_state: 'absent',
    roster_absent_since: '2026-10-15T16:58:32.02+00:00',
    roster_missing_count: 3,
    last_cycle_current: false,
    withdrawn_reason: 'roster_absent',
  }),
];

const member = (adset: Ref, lastSeen: string, missingSince: string | null): PortfolioAdset =>
  PortfolioAdsetSchema.parse({
    adset_id: adset.id,
    adset_name: adset.name,
    active: true,
    last_seen_at: lastSeen,
    missing_since: missingSince,
  });

const SEEN_TODAY = '2026-11-02T05:04:55.126+00:00';

/** optimizer_list_portfolio_adsets for each portfolio, as read. */
export const ROSTERS: Record<string, PortfolioAdset[]> = {
  [PORTFOLIO_IDS.conversaciones]: [
    member(ADSET.aleiraBau, SEEN_TODAY, null),
    member(ADSET.camachoBroad, SEEN_TODAY, null),
    member(ADSET.camachoLkl, SEEN_TODAY, null),
    member(ADSET.canadasBroad, SEEN_TODAY, null),
    member(ADSET.canadasLkl, SEEN_TODAY, null),
    member(ADSET.itesoBroad, SEEN_TODAY, null),
    member(ADSET.itesoLkl, SEEN_TODAY, null),
  ],
  [PORTFOLIO_IDS.tours]: [
    member(ADSET.easyGeo, '2026-10-14T16:58:08.965+00:00', '2026-10-15T16:58:32.02+00:00'),
    member(ADSET.easyBau, '2026-10-13T16:57:18.99+00:00', '2026-10-14T16:58:08.965+00:00'),
    member(ADSET.easyBroad, '2026-10-14T16:58:08.965+00:00', '2026-10-15T16:58:32.02+00:00'),
  ],
  [PORTFOLIO_IDS.leads]: [member(ADSET.leadsAnnual, '2026-11-02T05:06:35.255+00:00', null)],
};
