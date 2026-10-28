// Fixture reads for the Google views, shaped by the contracts (the tests parse each through its
// schema). Invented MXN figures for a gym brand on Search + Performance Max; no client content.

import type {
  GoogleBreakdownRead,
  GoogleCampaignFields,
  GoogleKeywordQualityRead,
  GoogleSignalsRead,
  GoogleTopCampaigns,
  KeywordQuality,
  PlatformCard,
} from '@continuum/contracts';

export const RANGE = { since: '2026-10-21', until: '2026-10-27' };
const BASIS = { rule: 'google_conversion_rule_v1', bucket: 'leads', unambiguous: true };

function keyword(
  id: string,
  text: string,
  score: number | null,
  spend: number,
  conversions: number | null,
  components: [string | null, string | null, string | null] = ['AVERAGE', 'AVERAGE', 'AVERAGE'],
): KeywordQuality {
  return {
    criterion_id: id,
    keyword: text,
    match_type: 'PHRASE',
    campaign: 'Search · Gimnasio CDMX',
    ad_group: 'Membresías',
    quality_score: score,
    expected_ctr: components[0],
    ad_relevance: components[1],
    landing_page_experience: components[2],
    metrics: { spend, impressions: spend * 40, clicks: Math.round(spend / 8), conversions },
  };
}

export function keywordQualityFixture(
  overrides: Partial<GoogleKeywordQualityRead> = {},
): GoogleKeywordQualityRead {
  const keywords = [
    keyword('1', 'gimnasio cdmx', 8, 4210.5, 31, ['ABOVE_AVERAGE', 'ABOVE_AVERAGE', 'AVERAGE']),
    keyword('2', 'gym cerca de mi', 6, 2380, 12),
    keyword('3', 'gimnasio barato', 3, 1850.25, 0, ['BELOW_AVERAGE', 'AVERAGE', 'BELOW_AVERAGE']),
    keyword('4', 'clases de box', 2, 640, 0, ['BELOW_AVERAGE', 'BELOW_AVERAGE', 'AVERAGE']),
    keyword('5', 'crossfit polanco', 3, 512.4, 2),
    keyword('6', 'membresía gym', null, 85.47, 0, [null, null, null]),
  ];
  const scored = keywords.filter((row) => row.quality_score !== null);
  return {
    scope: 'keyword_quality',
    range: RANGE,
    total_keywords: keywords.length,
    scored_keywords: scored.length,
    average_quality_score: 4.4,
    keywords,
    currency: 'MXN',
    ...overrides,
  };
}

const E1: GoogleCampaignFields = {
  status: 'ENABLED',
  bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  bidding_strategy_system_status: 'ENABLED',
  target_cpa: null,
  target_roas: null,
  budget_per_day: 600,
  search_impression_share: 0.42,
  search_budget_lost_impression_share: 0.1,
  search_rank_lost_impression_share: 0.48,
};

function campaign(
  id: string,
  name: string,
  channel: string,
  spend: number,
  conversions: number | null,
  google?: Partial<GoogleCampaignFields>,
) {
  return {
    id,
    name,
    labels: { channel_type: channel },
    metrics: { spend, impressions: spend * 30, clicks: Math.round(spend / 7), conversions },
    ...(google ? { google: { ...E1, ...google } } : {}),
  };
}

export function campaignsFixture(overrides: Partial<GoogleTopCampaigns> = {}): GoogleTopCampaigns {
  return {
    rows: [
      campaign('111', 'Search · Gimnasio CDMX', 'SEARCH', 4200, 35, {}),
      campaign('222', 'PMax · Membresías', 'PERFORMANCE_MAX', 3500, 14, {
        budget_per_day: 500,
        search_impression_share: 0.3,
        search_budget_lost_impression_share: 0.35,
        search_rank_lost_impression_share: 0.35,
      }),
      campaign('333', 'Search · Marca', 'SEARCH', 700, 9, {
        budget_per_day: 150,
        search_impression_share: 0.9001,
        search_budget_lost_impression_share: 0,
        search_rank_lost_impression_share: 0.0999,
      }),
      campaign('444', 'Display · Remarketing', 'DISPLAY', 900, 2, {
        search_impression_share: null,
        search_budget_lost_impression_share: null,
        search_rank_lost_impression_share: null,
      }),
    ],
    result_basis: BASIS,
    range: RANGE,
    currency: 'MXN',
    ...overrides,
  };
}

/** The same campaigns as a 12h-old cache serves them, before the edge read E1. */
export function campaignsBeforeE1(): GoogleTopCampaigns {
  const read = campaignsFixture();
  return { ...read, rows: read.rows.map(({ google: _google, ...row }) => row) };
}

function term(text: string, campaignId: string, spend: number, conversions: number, pmax = false) {
  return {
    term: text,
    campaign_id: campaignId,
    ad_group_id: pmax ? null : '9001',
    status: pmax ? null : ('NONE' as const),
    matched_keyword: pmax ? null : 'gimnasio',
    totals: { spend, impressions: spend * 20, clicks: Math.round(spend / 6), conversions },
  };
}

function signals(
  google: NonNullable<GoogleSignalsRead['signals']>['google'],
  blocks: GoogleSignalsRead['blocks'],
): GoogleSignalsRead {
  return {
    scope: 'google_signals',
    accountId: '3710693645',
    timezone: 'America/Mexico_City',
    fetched_at: '2026-10-28T06:00:00Z',
    blocks,
    signals: {
      account_id: '3710693645',
      currency: 'MXN',
      window: { since: '2026-09-28', until: '2026-10-27' },
      google,
    },
    skipped: {},
    rejected: [],
  };
}

export function searchTermsFixture(): GoogleSignalsRead {
  return signals(
    {
      search_terms: [
        term('gimnasio cdmx', '111', 1200, 14),
        term('gimnasios en polanco', '111', 640, 3),
        term('gimnasio 24 horas', '111', 410.8, 0),
        term('clases de box', '111', 380, 0),
        term('clases de yoga cerca de mi', '222', 95.5, 1, true),
        term('precio membresia gym', '222', 220, 2, true),
      ],
    },
    ['search_terms'],
  );
}

export function emptySearchTermsFixture(): GoogleSignalsRead {
  return signals({ search_terms: [] }, ['search_terms']);
}

export function pmaxFixture(): GoogleSignalsRead {
  return signals(
    {
      asset_groups: [
        {
          asset_group_id: 'ag-1',
          campaign_id: '222',
          name: 'Membresías · Todos',
          ad_strength: 'GOOD',
          primary_status: 'ELIGIBLE',
          missing: [],
        },
        {
          asset_group_id: 'ag-2',
          campaign_id: '222',
          name: 'Clases grupales',
          ad_strength: 'POOR',
          primary_status: 'LIMITED',
          missing: ['Add more headlines', 'Add a video'],
        },
      ],
      pmax_assets: [
        ...['h1', 'h2', 'h3'].map((id) => ({
          asset_id: id,
          asset_group_id: 'ag-1',
          asset_group_name: 'Membresías · Todos',
          campaign_id: '222',
          field_type: 'HEADLINE',
          text: `Headline ${id}`,
          primary_status: 'ELIGIBLE',
          totals: { spend: 0, impressions: 100, clicks: 3, conversions: 0 },
        })),
        {
          asset_id: 'i1',
          asset_group_id: 'ag-2',
          asset_group_name: 'Clases grupales',
          campaign_id: '222',
          field_type: 'MARKETING_IMAGE',
          text: null,
          primary_status: 'LIMITED',
          totals: { spend: 0, impressions: 40, clicks: 1, conversions: 0 },
        },
      ],
    },
    ['asset_groups', 'pmax_assets'],
  );
}

export function noPmaxFixture(): GoogleSignalsRead {
  return signals({ asset_groups: [], pmax_assets: [] }, ['asset_groups', 'pmax_assets']);
}

export function networkFixture(
  conversions: 'counted' | 'ambiguous' = 'counted',
): GoogleBreakdownRead {
  const counted = conversions === 'counted';
  const row = (name: string, spend: number, results: number) => ({
    id: `network:${name}`,
    dimension: 'network' as const,
    name,
    campaign_id: '222',
    metrics: {
      spend,
      clicks: Math.round(spend / 7),
      impressions: spend * 30,
      conversions: counted ? results : null,
      cpa: counted && results > 0 ? spend / results : null,
      ctr: 2.1,
      cpm: 33,
      cvr: null,
    },
  });
  return {
    scope: 'breakdown',
    rows: [
      row('SEARCH', 2100, 10),
      row('YOUTUBE_WATCH', 300, 0),
      row('YOUTUBE_SEARCH', 100, 1),
      row('CONTENT', 1000, 3),
    ],
    result_basis: counted ? BASIS : { ...BASIS, bucket: null, unambiguous: false },
    range: RANGE,
    currency: 'MXN',
  };
}

export const CARDS: PlatformCard[] = [
  {
    variant: 'google_budget_limited',
    campaign_name: 'PMax · Membresías',
    budget_lost_impression_share: 0.35,
    days_limited: 6,
    currency: 'MXN',
    cost_per_result: 250,
    result_label: 'leads',
    budget_per_day: 500,
    proposed_budget_per_day: 600,
    projection: {
      results_per_day_now: 2,
      results_per_day_low: 2,
      results_per_day_high: 2.4,
      basis_days: 14,
    },
  },
  {
    variant: 'google_negative_terms',
    campaign_name: 'Search · Gimnasio CDMX',
    currency: 'MXN',
    window_days: 30,
    terms: [{ term: 'gimnasio 24 horas', spend: 410.8, clicks: 68, conversions: 0 }],
    savings_per_day: 13.69,
    match_type: 'PHRASE',
  },
  {
    variant: 'google_promote_term',
    campaign_name: 'PMax · Membresías',
    ad_group_name: 'Membresías',
    term: 'precio membresia gym',
    currency: 'MXN',
    window_days: 30,
    conversions: 2,
    cost_per_result: 110,
    matched_keyword: null,
  },
];
