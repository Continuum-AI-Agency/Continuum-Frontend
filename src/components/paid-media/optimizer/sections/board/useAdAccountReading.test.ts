import { describe, expect, it } from 'bun:test';
import {
  type AccountCandidate,
  AccountPlatformMetricsSchema,
  type AdAccount,
  accountCandidateSchema,
  type PortfolioListItem,
  PortfolioListItemSchema,
  readAdAccount,
} from '@continuum/contracts';
import { adAccountSignalsFrom } from '@/lib/optimizer/adAccountSignals';
import { type AdAccountQueries, readsFromQueries } from './useAdAccountReading';

// Easy Fit's production rows of 2026-11-02 (brands 6f597f42 for Google, 148583e0 for Meta):
// optimizer_list_portfolios, two of optimizer_get_platform_cards('google_ads'),
// optimizer_get_account_platform_metrics('d7') of each brand and optimizer_get_account_read's
// candidates.
const REAL = {
  portfolios: [
    {
      id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
      name: 'Leads // Google Ads only',
      ad_account_id: '5251780631',
      objective: 'lead',
      level: 'campaign',
      mode: 'efficiency',
      apply_mode: 'recommend',
      daily_total: 1870,
      period_budget: null,
      budget_source: 'observed',
      cpa_target: 99,
      status: 'active',
      next_realloc_at: '2026-11-03T06:58:48.519718+00:00',
      adset_count: 4,
      pending_recommendations: 12,
      pending_budget_moves: 0,
      autopilot_paused: false,
      conserved_daily_total: 670,
      stale_for_days: null,
      roster_state: 'present',
      roster_missing_count: 0,
      last_cycle_current: true,
      withdrawn_reason: null,
      platforms: ['google_ads'],
      currency: 'MXN',
      platform_writes: { google_ads: false },
      max_change_pct_per_cycle: null,
      target_metric: null,
    },
    {
      id: '5aaf5931-7407-4940-aab6-52e914bced45',
      name: 'Test — Google Ads (Easy Fit)',
      ad_account_id: '5251780631',
      objective: 'lead',
      level: 'campaign',
      mode: 'balanced',
      apply_mode: 'recommend',
      daily_total: 0,
      period_budget: null,
      budget_source: 'observed',
      cpa_target: null,
      status: 'active',
      next_realloc_at: '2026-11-03T02:28:31.532675+00:00',
      adset_count: 1,
      pending_recommendations: 0,
      pending_budget_moves: 0,
      autopilot_paused: false,
      conserved_daily_total: null,
      stale_for_days: 24,
      roster_state: 'present',
      roster_missing_count: 0,
      last_cycle_current: false,
      withdrawn_reason: 'missed_cycles',
      platforms: ['google_ads'],
      currency: 'MXN',
      platform_writes: { google_ads: false },
      max_change_pct_per_cycle: null,
      target_metric: null,
    },
  ],
  metaPortfolios: [
    {
      id: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
      name: 'Leads // Google Ads only',
      ad_account_id: 'act_521903353286118',
      objective: 'lead',
      level: 'adset',
      mode: 'balanced',
      apply_mode: 'recommend',
      daily_total: 2795,
      period_budget: null,
      budget_source: 'observed',
      cpa_target: null,
      status: 'active',
      next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
      adset_count: 1,
      pending_recommendations: 0,
      pending_budget_moves: 0,
      autopilot_paused: false,
      conserved_daily_total: 50,
      stale_for_days: null,
      roster_state: 'present',
      roster_missing_count: 0,
      last_cycle_current: true,
      withdrawn_reason: null,
      platforms: ['meta'],
      currency: 'MXN',
      platform_writes: {},
      max_change_pct_per_cycle: null,
      target_metric: null,
    },
    {
      id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
      name: 'Conversaciones Whatsapp',
      ad_account_id: 'act_521903353286118',
      objective: 'conversations',
      level: 'adset',
      mode: 'efficiency',
      apply_mode: 'autopilot',
      daily_total: 3000,
      period_budget: 90000,
      budget_source: 'fixed',
      cpa_target: 45,
      status: 'active',
      next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
      adset_count: 7,
      pending_recommendations: 6,
      pending_budget_moves: 0,
      autopilot_paused: false,
      conserved_daily_total: 2994.436551724138,
      stale_for_days: null,
      roster_state: 'present',
      roster_missing_count: 0,
      last_cycle_current: true,
      withdrawn_reason: null,
      platforms: ['meta'],
      currency: 'MXN',
      platform_writes: {},
      max_change_pct_per_cycle: 0.2,
      target_metric: null,
    },
    {
      id: 'ec956b3d-c9b1-48ea-b55b-bda303e68f79',
      name: 'Tours Programados - Octubre',
      ad_account_id: 'act_521903353286118',
      objective: 'purchase',
      level: 'adset',
      mode: 'balanced',
      apply_mode: 'autopilot',
      daily_total: 460,
      period_budget: null,
      budget_source: 'fixed',
      cpa_target: 296,
      status: 'active',
      next_realloc_at: '2026-11-03T17:08:47.360392+00:00',
      adset_count: 3,
      pending_recommendations: 0,
      pending_budget_moves: 0,
      autopilot_paused: false,
      conserved_daily_total: 460,
      stale_for_days: 19,
      roster_state: 'absent',
      roster_missing_count: 3,
      last_cycle_current: false,
      withdrawn_reason: 'roster_absent',
      platforms: ['meta'],
      currency: 'MXN',
      platform_writes: {},
      max_change_pct_per_cycle: 0.2,
      target_metric: null,
    },
  ],
  cards: [
    {
      id: 'platform_signal:0e8990e3-7411-4121-bbeb-',
      detector: 'delivery_collapse',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'Search | Octubre | Easy Fit is ELIGIBLE with $350 MXN/day of budget and showed no ad for 7 days. Google says: SERVING_STATUS_SUSPENDED. Fix it in Google Ads; nothing here changes it.',
      evidence: { rule: 'G12', severity: 'high' },
      platform_card: {
        reasons: ['SERVING_STATUS_SUSPENDED'],
        variant: 'google_delivery_issue',
        currency: 'MXN',
        dark_days: 7,
        dark_since: '2026-10-26',
        account_wide: false,
        campaign_name: 'Search | Octubre | Easy Fit',
        budget_per_day: 350,
        disapproved_ads: 0,
      },
    },
    {
      id: 'platform_signal:5a20d848-c372-40bc-8b37-',
      detector: 'optimization_event',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'All 6 conversion actions carry the same value, so Google cannot tell a contact from a map click.',
      evidence: { rule: 'acct_conversion_value_map', severity: 'medium' },
      platform_card: {
        bars: [
          {
            label: 'Local actions - Other engagements',
            share: 0.82,
            value: 6881,
            flagged: false,
            target_share: null,
          },
          {
            label: 'Local actions - Directions',
            share: 0.09,
            value: 791,
            flagged: false,
            target_share: null,
          },
          {
            label: 'Lead WhatsApp web',
            share: 0.05,
            value: 410,
            flagged: false,
            target_share: null,
          },
          { label: 'Clicks to call', share: 0.02, value: 151, flagged: false, target_share: null },
          {
            label: 'Local actions - Website visits',
            share: 0.01,
            value: 101,
            flagged: false,
            target_share: null,
          },
          { label: 'Lead formulario web', share: 0, value: 21, flagged: false, target_share: null },
        ],
        idea: 'conversion_value_map',
        unit: 'count',
        facts: [
          {
            label: 'Primary today',
            value:
              'Local actions - Other engagements, Local actions - Directions, Lead WhatsApp web, Clicks to call, Local actions - Website visits, Lead formulario web',
          },
          { label: 'Local actions - Other engagements', value: '6881 · primary · value 1' },
          { label: 'Local actions - Directions', value: '791 · primary · value 1' },
          { label: 'Lead WhatsApp web', value: '410 · primary · value 1' },
          { label: 'Clicks to call', value: '151 · primary · value 1' },
          { label: 'Local actions - Website visits', value: '101 · primary · value 1' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Which conversion is worth what',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
  ],
  metrics: {
    window: { label: 'd7', since: '2026-10-25', until: '2026-10-31', ends_yesterday: false },
    read_at: '2026-11-02T19:43:05.779080Z',
    brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    autopilot: { on: 0, total: 2 },
    portfolios: { counted: 0, excluded: [] },
    prior_window: { label: 'd7', since: '2026-10-18', until: '2026-10-24', ends_yesterday: false },
    headline_facts: { cheapest: [], top_spend: { platform: 'google_ads', share_of_spend: 1 } },
    results_by_kind: [
      {
        kind: 'leads',
        spend: 29.094547,
        results: 1,
        currency: 'MXN',
        platforms: [
          { spend: 29.094547, results: 1, platform: 'google_ads', cost_per_result: 29.094547 },
        ],
        cost_per_result: 29.094547,
      },
    ],
    decisions_waiting: 12,
    spend_by_currency: [{ spend: 29.094547, currency: 'MXN' }],
    totals_by_platform: [
      {
        spend: null,
        accounts: [
          { currency: 'USD', ingested: false, account_id: '1230084535936402' },
          { currency: 'USD', ingested: false, account_id: '1277692437548208' },
          { currency: 'USD', ingested: false, account_id: '1317403313414407' },
          { currency: 'USD', ingested: false, account_id: '1472300554278005' },
          { currency: 'MXN', ingested: false, account_id: '1474284901098956' },
          { currency: 'MXN', ingested: false, account_id: '521903353286118' },
          { currency: 'USD', ingested: false, account_id: '719747577886315' },
          { currency: 'MXN', ingested: false, account_id: '788361201542233' },
          { currency: 'USD', ingested: false, account_id: '905635138680924' },
        ],
        coverage: 'portfolios',
        currency: null,
        platform: 'meta',
        connected: true,
        prior_spend: null,
        share_of_spend: null,
        results_by_kind: [],
        spend_delta_pct: null,
        unclassified_spend: null,
      },
      {
        spend: 29.094547,
        accounts: [{ currency: 'MXN', ingested: true, account_id: '5251780631' }],
        coverage: 'account',
        currency: 'MXN',
        platform: 'google_ads',
        connected: true,
        prior_spend: 4288.836477,
        share_of_spend: 1,
        results_by_kind: [
          {
            kind: 'leads',
            spend: 29.094547,
            results: 1,
            prior_results: 178,
            cost_per_result: 29.094547,
            prior_cost_per_result: 24.094586949438202,
          },
        ],
        spend_delta_pct: -0.9932162144311104,
        unclassified_spend: 0,
      },
      {
        spend: null,
        accounts: [],
        coverage: 'account',
        currency: null,
        platform: 'tiktok_ads',
        connected: false,
        prior_spend: null,
        share_of_spend: null,
        results_by_kind: [],
        spend_delta_pct: null,
        unclassified_spend: null,
      },
    ],
  },
  metaRead: [
    {
      id: 'delivery_collapse:94ca5d79-77cd-4973-9d9',
      detector: 'delivery_collapse',
      portfolio_ids: ['94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4'],
      impact_per_day: 2795,
      impact_class: 'recoverable',
      impact_basis:
        'Leads // Google Ads only: budgeted 2795/day and spent nothing across the 7-day window — 1 of 1 active ad sets dark across the 7-day window',
      evidence: {
        scope: 'portfolio',
        sample: 'ledger: the daily budget against the spend recorded',
        sample_k: null,
        sample_n: null,
        days_dark: null,
        portfolio: 'Leads // Google Ads only',
        adsets_dark: 1,
        sample_kind: 'ledger',
        adsets_active: 1,
        delivered_pct: 0,
        planned_per_day: 2795,
        collapse_line_pct: 10,
        delivered_per_day: 0,
        undelivered_per_day: 2795,
        oldest_dark_adset_days: 245,
      },
    },
  ],
  metaMetrics: {
    window: { label: 'd7', since: '2026-10-26', until: '2026-11-01', ends_yesterday: false },
    read_at: '2026-11-02T19:43:09.786494Z',
    brand_id: '148583e0-5538-462b-8d3a-acd25b80344e',
    autopilot: { on: 2, total: 3 },
    portfolios: {
      counted: 2,
      excluded: [{ reason: 'window', portfolio_id: 'ec956b3d-c9b1-48ea-b55b-bda303e68f79' }],
    },
    prior_window: { label: 'd7', since: '2026-10-19', until: '2026-10-25', ends_yesterday: false },
    headline_facts: { cheapest: [], top_spend: { platform: 'meta', share_of_spend: 1 } },
    results_by_kind: [
      {
        kind: 'conversations',
        spend: 24543.57,
        results: 462,
        currency: 'MXN',
        platforms: [
          { spend: 24543.57, results: 462, platform: 'meta', cost_per_result: 53.12461038961039 },
        ],
        cost_per_result: 53.12461038961039,
      },
      {
        kind: 'leads',
        spend: 0,
        results: 0,
        currency: 'MXN',
        platforms: [{ spend: 0, results: 0, platform: 'meta', cost_per_result: null }],
        cost_per_result: null,
      },
    ],
    decisions_waiting: 6,
    spend_by_currency: [{ spend: 24543.57, currency: 'MXN' }],
    totals_by_platform: [
      {
        spend: 24543.57,
        accounts: [
          { currency: 'USD', ingested: false, account_id: '1296885445611472' },
          { currency: 'USD', ingested: false, account_id: '1472300554278005' },
          { currency: 'MXN', ingested: false, account_id: '1474284901098956' },
          { currency: 'MXN', ingested: true, account_id: '521903353286118' },
        ],
        coverage: 'portfolios',
        currency: 'MXN',
        platform: 'meta',
        connected: true,
        prior_spend: 18092.600000000002,
        share_of_spend: 1,
        results_by_kind: [
          {
            kind: 'conversations',
            spend: 24543.57,
            results: 462,
            prior_results: 469,
            cost_per_result: 53.12461038961039,
            prior_cost_per_result: 38.5769722814499,
          },
          {
            kind: 'leads',
            spend: 0,
            results: 0,
            prior_results: 0,
            cost_per_result: null,
            prior_cost_per_result: null,
          },
        ],
        spend_delta_pct: 0.35655295535191167,
        unclassified_spend: 0,
      },
      {
        spend: 0,
        accounts: [{ currency: 'MXN', ingested: true, account_id: '5251780631' }],
        coverage: 'account',
        currency: 'MXN',
        platform: 'google_ads',
        connected: true,
        prior_spend: 4317.931024,
        share_of_spend: 0,
        results_by_kind: [],
        spend_delta_pct: -1,
        unclassified_spend: 0,
      },
      {
        spend: null,
        accounts: [],
        coverage: 'account',
        currency: null,
        platform: 'tiktok_ads',
        connected: false,
        prior_spend: null,
        share_of_spend: null,
        results_by_kind: [],
        spend_delta_pct: null,
        unclassified_spend: null,
      },
    ],
  },
};

const GOOGLE_PORTFOLIOS: PortfolioListItem[] = REAL.portfolios.map((row) =>
  PortfolioListItemSchema.parse(row),
);
const META_PORTFOLIOS: PortfolioListItem[] = REAL.metaPortfolios.map((row) =>
  PortfolioListItemSchema.parse(row),
);
const CARDS: AccountCandidate[] = REAL.cards.map((row) => accountCandidateSchema.parse(row));
const METRICS = AccountPlatformMetricsSchema.parse(REAL.metrics);
const META_METRICS = AccountPlatformMetricsSchema.parse(REAL.metaMetrics);
const ACCOUNTS: AdAccount[] = [
  {
    platform: 'meta_ads',
    account_id: 'act_521903353286118',
    name: 'Easyfit',
    status: null,
    currency: 'MXN',
  },
  {
    platform: 'google_ads',
    account_id: '5251780631',
    name: 'Easy Fit 2026',
    status: null,
    currency: null,
  },
];

const google = (overrides: Partial<AdAccountQueries> = {}): AdAccountQueries => ({
  platform: 'google_ads',
  adAccountId: null,
  currency: null,
  portfolios: GOOGLE_PORTFOLIOS,
  accounts: { status: 'ready', data: ACCOUNTS },
  approval: { status: 'ready', data: false },
  metrics: { status: 'ready', metrics: METRICS },
  googleCards: { status: 'ready', cards: CARDS },
  googleCampaigns: { status: 'idle' },
  metaRead: { status: 'idle' },
  metaSnapshots: { status: 'idle' },
  ...overrides,
});

const meta = (overrides: Partial<AdAccountQueries> = {}): AdAccountQueries => ({
  ...google(),
  platform: 'meta',
  adAccountId: 'act_521903353286118',
  currency: 'MXN',
  portfolios: META_PORTFOLIOS,
  metrics: { status: 'ready', metrics: META_METRICS },
  googleCards: { status: 'ready', cards: [] },
  metaRead: { status: 'ready', data: null },
  metaSnapshots: { status: 'ready', data: [] },
  ...overrides,
});

describe('readsFromQueries', () => {
  it("resolves the brand's Google Ads customer on the Google tab and keeps its portfolios", () => {
    const { reads, loading } = readsFromQueries(google());
    expect(loading).toBe(false);
    expect(reads.accountId).toBe('5251780631');
    expect(reads.portfolios.map((portfolio) => portfolio.name)).toEqual([
      'Leads // Google Ads only',
      'Test — Google Ads (Easy Fit)',
    ]);
    // The grant row carries no currency; the portfolio stamped at creation does.
    expect(reads.currency).toBe('MXN');
    expect(reads.googleCards).toHaveLength(2);
  });

  it('holds the reading while an input the platform needs is still reading', () => {
    expect(readsFromQueries(google({ googleCards: { status: 'loading' } })).loading).toBe(true);
    expect(readsFromQueries(google({ googleCampaigns: { status: 'loading' } })).loading).toBe(true);
    expect(readsFromQueries(google({ metrics: { status: 'loading' } })).loading).toBe(true);
    expect(readsFromQueries(google({ approval: { status: 'loading' } })).loading).toBe(true);
    // A Meta read in flight does not hold the Google tab.
    expect(readsFromQueries(google({ metaRead: { status: 'loading' } })).loading).toBe(false);
    expect(readsFromQueries(meta({ metaSnapshots: { status: 'loading' } })).loading).toBe(true);
  });

  it('reads without what failed and says which input is missing', () => {
    const { reads } = readsFromQueries(
      google({
        googleCards: { status: 'error' },
        approval: { status: 'error', message: 'brand_profiles unreachable' },
        googleCampaigns: { status: 'error', message: 'Google refused the login.' },
        metrics: { status: 'unavailable' },
      }),
    );
    expect(reads.googleCards).toBeNull();
    expect(reads.approvalRequired).toBe(false);
    expect(reads.missing?.map((line) => line.input)).toEqual([
      'approval',
      'window',
      'cards',
      'campaigns',
    ]);
    expect(reads.missing?.find((line) => line.input === 'campaigns')?.reason).toBe(
      'No se leyeron las campañas de Google ("Google refused the login.").',
    );
  });

  it('says so when the brand has no Google Ads customer granted', () => {
    const { reads } = readsFromQueries(
      google({ accounts: { status: 'ready', data: ACCOUNTS.slice(0, 1) } }),
    );
    expect(reads.accountId).toBeNull();
    expect(reads.missing?.find((line) => line.input === 'campaigns')?.reason).toBe(
      'No se leyeron las campañas: la marca no tiene una cuenta de Google Ads concedida.',
    );
  });

  it('on Meta reads an absent account read as no findings, and a failed one as missing', () => {
    expect(readsFromQueries(meta()).reads.metaRead).toBeNull();
    const failed = readsFromQueries(meta({ metaRead: { status: 'error', message: 'x' } })).reads;
    expect(failed.metaRead).toBeUndefined();
    expect(failed.missing?.[0]?.input).toBe('cards');
  });

  it('feeds the reading: Easy Fit Google opens with its suspension, Easy Fit Meta on autopilot', () => {
    const googleReading = readAdAccount(adAccountSignalsFrom(readsFromQueries(google()).reads));
    expect(googleReading.mode).toBe('fix');
    expect(googleReading.board[0]?.module).toBe('auction');
    const read = {
      utc_day: '2026-11-02',
      ready_at: '2026-11-02T00:04:59.764227+00:00',
      refresh: null,
      read: {
        candidates: REAL.metaRead.map((row) => accountCandidateSchema.parse(row)),
        guards: [],
        narrative: '',
        lead_reason: null,
        justification_if_not_max: null,
        conflicts: [],
        starved: [],
        deck: null,
        assumptions: [],
        ceiling_defaults: {},
        scale_per_day: null,
        currency: 'MXN',
        model: 'deterministic',
      },
    };
    const metaReading = readAdAccount(
      adAccountSignalsFrom(
        readsFromQueries(meta({ metaRead: { status: 'ready', data: read } })).reads,
      ),
    );
    expect(metaReading.mode).toBe('operate');
    expect(metaReading.notices?.[0]?.reason).toContain('Leads // Google Ads only');
  });
});
