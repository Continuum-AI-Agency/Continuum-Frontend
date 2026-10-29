// The P8 account detectors (accountDetectors.ts): each idea fires on the pattern and stays
// silent without it, every card passes its contract with no action, and the two detectors
// that speak for a platform rule hold it back by name.

import { describe, expect, test } from 'bun:test';
import type { PlatformSignals } from '@continuum/contracts';
import { evaluatePlatformSignals, type PlatformSignalsContext } from '../../src';

type Google = NonNullable<PlatformSignals['google']>;
const zero = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
const totals = (spend: number, conversions: number, clicks = 100) => ({
  spend,
  impressions: clicks * 10,
  clicks,
  conversions,
});

function campaign(
  id: string,
  name: string,
  over: Partial<NonNullable<Google['campaigns']>[number]> = {},
): NonNullable<Google['campaigns']>[number] {
  return {
    campaign_id: id,
    name,
    status: 'ENABLED',
    channel_type: 'SEARCH',
    budget_per_day: 100,
    totals: { ...totals(1000, 10), conversions_value: 0 },
    totals_60d: { ...totals(2000, 20), conversions_value: 0 },
    budget_lost_impression_share: 0.1,
    rank_lost_impression_share: 0.1,
    ...over,
  };
}

function action(
  id: string,
  name: string,
  over: Partial<NonNullable<Google['conversion_actions']>[number]> & {
    all?: number;
    reported?: number;
    value?: number;
  } = {},
): NonNullable<Google['conversion_actions']>[number] {
  const { all = 0, reported = 0, value = 0, ...rest } = over;
  return {
    conversion_action_id: id,
    name,
    category: 'SUBMIT_LEAD_FORM',
    type: 'WEBPAGE',
    primary_for_goal: true,
    status: 'ENABLED',
    ga4_event_name: null,
    ga4_engagement: false,
    default_value: 1,
    always_use_default_value: false,
    counted: true,
    excluded_reason: null,
    by_campaign: [{ campaign_id: '1', reported, all, value }],
    ...rest,
  };
}

function profile(
  over: Partial<NonNullable<Google['profile']>> = {},
): NonNullable<Google['profile']> {
  return {
    brand_name: 'Acme Club',
    customer_name: 'Acme Club',
    client_executes: false,
    brand_terms: ['acme club', 'acmeclub'],
    brand_terms_source: 'inferred',
    competitor_terms: ['smart fit'],
    competitor_terms_source: 'inferred',
    course_lines: null,
    checklist: [],
    ...over,
  };
}

function signals(google: Partial<Google>): PlatformSignals {
  return {
    account_id: '123',
    currency: 'MXN',
    window: { since: '2026-09-29', until: '2026-10-28' },
    google: {
      search_terms: [],
      keywords: [],
      bid_targets: [],
      asset_groups: [],
      delivery: [],
      campaigns: [campaign('1', 'Search Main')],
      profile: profile(),
      ...google,
    },
    tiktok: null,
  };
}

const context: PlatformSignalsContext = {
  cpaTarget: null,
  now: '2026-10-29T12:00:00Z',
  snapshots: [],
  kpiField: 'leads',
  crossPlatformComparison: false,
};

const fired = (s: PlatformSignals, ctx: PlatformSignalsContext = context) =>
  evaluatePlatformSignals(s, ctx);
const rules = (s: PlatformSignals, ctx?: PlatformSignalsContext) =>
  fired(s, ctx).recommendations.map((r) => r.rule);

const inflatedActions = [
  action('a1', 'GA4 user_engagement', {
    category: 'CONTACT',
    type: 'GOOGLE_ANALYTICS_4_CUSTOM',
    ga4_event_name: 'user_engagement',
    ga4_engagement: true,
    counted: false,
    excluded_reason: 'ga4_engagement_event',
    reported: 850,
    all: 850,
  }),
  action('a2', 'Lead formulario web', { primary_for_goal: false, reported: 0, all: 35 }),
  action('a3', 'Llamadas', { category: 'PHONE_CALL_LEAD', reported: 150, all: 150 }),
];

describe('P8 account detectors', () => {
  test('a read from before P8 adds nothing — no card and no abstention', () => {
    const s = signals({});
    delete s.google!.campaigns;
    delete s.google!.profile;
    const out = fired(s);
    expect(out.recommendations.filter((r) => r.rule.startsWith('acct_'))).toEqual([]);
    expect(out.abstentions.filter((a) => a.rule.startsWith('acct_'))).toEqual([]);
  });

  test('every P8 card passes the contract, carries no action, and states recommend_only', () => {
    const out = fired(
      signals({ conversion_actions: inflatedActions, profile: profile({ client_executes: true }) }),
    );
    const acct = out.recommendations.filter((r) => r.rule.startsWith('acct_'));
    expect(acct.length).toBeGreaterThan(0);
    for (const r of acct) {
      expect(r.action).toBeNull();
      expect(r.platform_card.variant).toBe('google_account_finding');
      if (r.platform_card.variant === 'google_account_finding')
        expect(r.platform_card.recommend_only).toBe(true);
      expect(r.reason).toContain('The client runs this account');
    }
  });

  test('inflated primary: fires when attention events dominate, silent otherwise', () => {
    expect(rules(signals({ conversion_actions: inflatedActions }))).toContain(
      'acct_inflated_primary_conversion',
    );
    const clean = [
      action('a3', 'Llamadas', { category: 'PHONE_CALL_LEAD', reported: 150, all: 150 }),
    ];
    expect(rules(signals({ conversion_actions: clean }))).not.toContain(
      'acct_inflated_primary_conversion',
    );
  });

  test('capped budget locked: holds G03 back by name while the conversion is inflated', () => {
    const capped = campaign('1', 'EKATAR', { budget_lost_impression_share: 0.7 });
    const s = signals({ conversion_actions: inflatedActions, campaigns: [capped] });
    const out = fired(s);
    expect(out.recommendations.map((r) => r.rule)).toContain('acct_capped_budget_locked');
    expect(out.recommendations.some((r) => r.rule === 'G03')).toBe(false);
    const clean = signals({ campaigns: [capped] });
    expect(rules(clean)).not.toContain('acct_capped_budget_locked');
  });

  test('brand vs non-brand: brand terms inside mixed campaigns over 30% of term spend', () => {
    const terms = [
      { term: 'acme club', spend: 600, conv: 20 },
      { term: 'gimnasio cerca', spend: 400, conv: 2 },
    ].map((t) => ({
      term: t.term,
      campaign_id: '1',
      ad_group_id: '11',
      status: 'NONE' as const,
      matched_keyword: null,
      totals: totals(t.spend, t.conv),
    }));
    expect(rules(signals({ search_terms: terms }))).toContain('acct_brand_vs_nonbrand');
    expect(
      rules(signals({ search_terms: terms.map((t) => ({ ...t, term: 'gimnasio' })) })),
    ).not.toContain('acct_brand_vs_nonbrand');
  });

  test('pmax rescue: dear PMax with weak assets fires and speaks for G18 coverage', () => {
    const pmax = campaign('9', 'PMAX OCT', {
      channel_type: 'PERFORMANCE_MAX',
      totals: { ...totals(4043, 1), conversions_value: 0 },
      rank_lost_impression_share: 0.82,
    });
    const s = signals({
      campaigns: [pmax],
      bid_targets: [
        {
          campaign_id: '9',
          strategy: 'target_cpa',
          target_cpa: 400,
          target_roas: null,
          system_status: null,
          last_changed_at: null,
        },
      ],
      asset_groups: [
        {
          asset_group_id: 'g',
          campaign_id: '9',
          name: 'AG',
          ad_strength: 'AVERAGE',
          primary_status: null,
          missing: ['3 videos'],
        },
      ],
    });
    expect(rules(s)).toContain('acct_pmax_rescue_or_pause');
    expect(rules(s)).not.toContain('G18_pmax_coverage');
    const cheap = { ...pmax, totals: { ...totals(400, 4), conversions_value: 0 } };
    expect(rules(signals({ ...s.google!, campaigns: [cheap] }))).not.toContain(
      'acct_pmax_rescue_or_pause',
    );
  });

  test('continuity calendar: a dark run after serving fires; an always-served month is silent', () => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10);
      const dark = date >= '2026-10-15' && date <= '2026-10-19';
      return {
        date,
        spend: dark ? 0 : 100,
        impressions: dark ? 0 : 1000,
        clicks: dark ? 0 : 50,
        conversions: dark ? 0 : 2,
      };
    });
    expect(rules(signals({ account_daily: days }))).toContain('acct_continuity_calendar');
    const served = days.map((x) => ({ ...x, impressions: 1000 }));
    expect(rules(signals({ account_daily: served }))).not.toContain('acct_continuity_calendar');
  });

  test('paused beat active: a paused campaign at half the active cost fires', () => {
    const old = campaign('2', 'Easy Fit (old PMax)', {
      status: 'PAUSED',
      totals: { ...zero, conversions_value: 0 },
      totals_60d: { ...totals(5578, 270), conversions_value: 0 },
    });
    const active = campaign('1', 'PMax Oct', {
      totals: { ...totals(7976, 100), conversions_value: 0 },
    });
    expect(rules(signals({ campaigns: [old, active] }))).toContain('acct_paused_beat_active');
    const weak = { ...old, totals_60d: { ...totals(5578, 20), conversions_value: 0 } };
    expect(rules(signals({ campaigns: [weak, active] }))).not.toContain('acct_paused_beat_active');
  });

  test('competitor and intent negatives: grouped lists, competitor terms never double-listed', () => {
    const term = (t: string, spend: number) => ({
      term: t,
      campaign_id: '1',
      ad_group_id: '11',
      status: 'NONE' as const,
      matched_keyword: null,
      totals: totals(spend, 0),
    });
    const s = signals({
      search_terms: [
        term('smart fit precios', 340),
        term('que estudiar a los 50 años', 120),
        term('cursos disponibles gratis', 90),
        term('empleo gimnasio', 80),
        term('gimnasio en guadalajara', 1400),
      ],
    });
    const out = fired(s);
    const comp = out.recommendations.find((r) => r.rule === 'acct_competitor_terms');
    const intent = out.recommendations.find((r) => r.rule === 'acct_intent_negatives');
    expect(comp).toBeDefined();
    expect(intent).toBeDefined();
    if (intent?.platform_card.variant === 'google_account_finding') {
      const listed = intent.platform_card.negatives?.flatMap((n) => n.terms) ?? [];
      expect(listed).not.toContain('smart fit precios');
      expect(listed).not.toContain('gimnasio en guadalajara');
    }
  });

  test('device split: mobile spends, desktop converts', () => {
    const devices = [
      { campaign_id: '1', device: 'MOBILE', totals: totals(6000, 1, 3400) },
      { campaign_id: '1', device: 'DESKTOP', totals: totals(1000, 6, 212) },
    ];
    expect(rules(signals({ devices }))).toContain('acct_device_split');
    const even = devices.map((x) => ({
      ...x,
      totals: totals(x.totals.spend, x.totals.spend / 500, x.totals.clicks),
    }));
    expect(rules(signals({ devices: even }))).not.toContain('acct_device_split');
  });

  test('course line split: only with stored lines, and only when a line is off its share', () => {
    const lines = [
      { id: 'itsm', name: 'ITSM', target_share: 0.4, campaign_ids: ['2'], name_patterns: ['itsm'] },
      { id: 'iso', name: 'ISO', target_share: 0.6, campaign_ids: [], name_patterns: ['iso'] },
    ];
    const campaigns = [
      campaign('1', 'Cursos ISO', { totals: { ...totals(9000, 7), conversions_value: 0 } }),
      campaign('2', 'ITSM 2026', { totals: { ...totals(1000, 0), conversions_value: 0 } }),
    ];
    expect(rules(signals({ campaigns, profile: profile({ course_lines: lines }) }))).toContain(
      'acct_course_line_split',
    );
    expect(rules(signals({ campaigns }))).not.toContain('acct_course_line_split');
  });

  test('client checklist: statuses from change history, only on a client-executes account', () => {
    const checklist = [
      {
        id: 'display',
        label: 'Remove Display from Search',
        agreed_on: '2026-10-09',
        verify: {
          resource_type: 'CAMPAIGN',
          name_contains: null,
          field_pattern: 'network_settings',
          new_status: null,
        },
      },
    ];
    const changes = [
      {
        changed_at: '2026-10-12T10:00:00-06:00',
        resource_type: 'CAMPAIGN',
        operation: 'UPDATE',
        campaign_id: '1',
        ad_group_id: null,
        changed_fields: ['network_settings.target_content_network'],
        client_type: 'GOOGLE_ADS_WEB_CLIENT',
        new_status: null,
      },
    ];
    const out = fired(signals({ changes, profile: profile({ client_executes: true, checklist }) }));
    const card = out.recommendations.find((r) => r.rule === 'acct_client_executes_checklist');
    expect(
      card?.platform_card.variant === 'google_account_finding' &&
        card.platform_card.checklist[0]?.status,
    ).toBe('done');
    expect(rules(signals({ changes, profile: profile({ checklist }) }))).not.toContain(
      'acct_client_executes_checklist',
    );
  });

  test('lead to sale: leads that do not buy fire and say the funnel half is blocked', () => {
    const actions = [
      action('l', 'Lead', { all: 8, reported: 8 }),
      action('s', 'Compra', { category: 'PURCHASE', all: 1, reported: 1, value: 737 }),
    ];
    const s = signals({
      conversion_actions: actions,
      campaigns: [campaign('1', 'C', { totals: { ...totals(7350, 9), conversions_value: 737 } })],
    });
    const card = fired(s).recommendations.find((r) => r.rule === 'acct_lead_to_sale_funnel');
    expect(card).toBeDefined();
    expect(
      card?.platform_card.variant === 'google_account_finding' && card.platform_card.blocked,
    ).toContain('no connector');
    expect(rules(signals({ conversion_actions: [actions[0]!] }))).not.toContain(
      'acct_lead_to_sale_funnel',
    );
  });
  test('inflated primary also counts non-outcome primaries (directions), not only GA4 events', () => {
    const directions = [
      action('d', 'Local actions - Directions', {
        category: 'GET_DIRECTIONS',
        reported: 300,
        all: 300,
      }),
      action('w', 'Lead WhatsApp web', { category: 'CONTACT', reported: 100, all: 100 }),
    ];
    expect(rules(signals({ conversion_actions: directions }))).toContain(
      'acct_inflated_primary_conversion',
    );
  });

  test('continuity calendar: weekend-only dark days are an ad schedule, named as such', () => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 8, 29 + i)).toISOString().slice(0, 10);
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      const dark = day === 0 || day === 6;
      return {
        date,
        spend: dark ? 0 : 100,
        impressions: dark ? 0 : 1000,
        clicks: 10,
        conversions: 1,
      };
    });
    const out = fired(signals({ account_daily: days }));
    expect(out.recommendations.map((r) => r.rule)).not.toContain('acct_continuity_calendar');
    expect(out.abstentions.find((a) => a.rule === 'acct_continuity_calendar')?.reason).toContain(
      'ad schedule',
    );
  });

  test('lead to sale: zero recorded sales abstains — unmeasured is not "the leads do not buy"', () => {
    const actions = [
      action('l', 'Lead', { all: 500, reported: 500 }),
      action('s', 'Compra', { category: 'PURCHASE', all: 0, reported: 0 }),
    ];
    const out = fired(signals({ conversion_actions: actions }));
    expect(out.recommendations.map((r) => r.rule)).not.toContain('acct_lead_to_sale_funnel');
    expect(out.abstentions.find((a) => a.rule === 'acct_lead_to_sale_funnel')?.reason).toContain(
      'sale tracking',
    );
  });
  test('client checklist reads Google camelCase fields, counts a removed group as paused, skips later campaigns', () => {
    const checklist = [
      {
        id: 'group',
        label: 'Pause the Gestión de Proyectos ad group',
        agreed_on: '2026-10-09',
        verify: {
          resource_type: 'AD_GROUP',
          name_contains: 'gestión de proyectos',
          field_pattern: 'status',
          new_status: 'PAUSED',
        },
      },
      {
        id: 'display',
        label: 'Remove Display from Search',
        agreed_on: '2026-10-09',
        verify: {
          resource_type: 'CAMPAIGN',
          name_contains: null,
          field_pattern: 'network_settings',
          new_status: null,
        },
      },
    ];
    const change = (over: Record<string, unknown>) => ({
      changed_at: '2026-10-12T10:00:00-06:00',
      resource_type: 'CAMPAIGN',
      operation: 'UPDATE',
      campaign_id: '1',
      ad_group_id: null,
      changed_fields: [] as string[],
      client_type: 'GOOGLE_ADS_WEB_CLIENT',
      new_status: null,
      ...over,
    });
    const s = signals({
      campaigns: [campaign('1', 'Cursos'), campaign('2', 'ITSM 2026')],
      ad_groups: [
        {
          ad_group_id: '77',
          campaign_id: '1',
          name: 'Gestión de Proyectos',
          status: 'REMOVED',
          final_urls: [],
        },
      ],
      changes: [
        change({ changed_fields: ['networkSettings.targetContentNetwork'] }),
        change({
          resource_type: 'AD_GROUP',
          ad_group_id: '77',
          changed_fields: ['status'],
          new_status: 'REMOVED',
        }),
        change({
          campaign_id: '2',
          operation: 'CREATE',
          changed_at: '2026-10-15T10:00:00-06:00',
          changed_fields: ['name'],
        }),
      ],
      profile: profile({ client_executes: true, checklist }),
    });
    const card = fired(s).recommendations.find((r) => r.rule === 'acct_client_executes_checklist');
    const statuses =
      card?.platform_card.variant === 'google_account_finding'
        ? card.platform_card.checklist.map((c) => c.status)
        : [];
    expect(statuses).toEqual(['done', 'done']);
  });
});
