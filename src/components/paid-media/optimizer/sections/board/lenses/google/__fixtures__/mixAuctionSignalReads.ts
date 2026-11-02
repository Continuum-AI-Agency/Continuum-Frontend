// Real reads for the G05 Mix, G06 Auction and G10 Signal tests.
//
// Cards: the platform_card of each pending recommendation exactly as optimizer_query pending_recs
// returned it on 2026-11-02 (that day's cycles: Vivo 47 portfolio e642c737, Pink Elephant
// e4db2796, Easy Fit b9cebbcf), wrapped the way optimizer_get_platform_cards serves it
// (supabase/migrations/20261029170000_p8_google_account_detectors.sql). Easy Fit's account-wide
// G12 card is the 2026-10-31 one: the account was dark then (it showed $0.29 of ads on Nov 1, so
// today's cycle wrote E1's calendar instead).
//
// The `…_ES` cards are the same findings as the engine writes them after its Spanish rewrite
// (decision 3, packages/optimization-engine accountDetectors.ts): every figure unchanged, every
// word the engine's new Spanish wording. Live rows stay English until deploy:optimizer.
//
// Campaign reads: the figures of the live reads of 2026-10-31 (last 30 days, Oct 1–31). A field
// those reads did not carry is null, never filled in; ids the notes did not keep are named after
// the campaign.

import {
  type AccountCandidate,
  accountCandidateSchema,
  type GoogleAccountOverview,
  GoogleAccountOverviewSchema,
  type GoogleCampaignFields,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
  PlatformCardSchema,
} from '@continuum/contracts';

export const VIVO_PORTFOLIO = 'e642c737-ddde-4622-af8f-4b5622da98d0';
export const PINK_PORTFOLIO = 'e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed';
export const EASYFIT_PORTFOLIO = 'b9cebbcf-2832-440a-b326-3af20c19be37';

/** The detector optimizer_get_platform_cards files each rule under. */
const DETECTOR: Record<string, string> = {
  G12: 'delivery_collapse',
  acct_inflated_primary_conversion: 'optimization_event',
  acct_conversion_value_map: 'optimization_event',
  acct_capped_budget_locked: 'scale_readiness',
  acct_continuity_calendar: 'delivery_collapse',
  acct_lead_to_sale_funnel: 'post_click',
  acct_course_line_split: 'market_allocation',
};

function candidate(args: {
  recommendation: string;
  portfolio: string;
  rule: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  card: unknown;
}): AccountCandidate {
  return accountCandidateSchema.parse({
    id: `platform_signal:${args.recommendation}`,
    detector: DETECTOR[args.rule],
    portfolio_ids: [args.portfolio],
    impact_per_day: 0,
    impact_class: 'deferred',
    impact_basis: args.reason.slice(0, 240),
    evidence: { rule: args.rule, severity: args.severity },
    result_label: 'results',
    platform_card: PlatformCardSchema.parse(args.card),
    card_action: null,
    cta: { kind: 'portfolio', target_id: args.portfolio },
  });
}

// ── Vivo 47 (3710693645) ─────────────────────────────────────────────────────────────────────

export const VIVO_INFLATED = candidate({
  recommendation: 'ca0bc3b7-6acb-4217-bb7c-905343740145',
  portfolio: VIVO_PORTFOLIO,
  rule: 'acct_inflated_primary_conversion',
  severity: 'high',
  reason:
    '85% of the 4051 conversions Google reports are visits or attention events ("www.vivo47.com.mx - GA4 (web) user_engagement") marked primary. Only 592 are leads or sales. Google bids toward what is primary, so it is buying visits. Our own reads already leave these events out; Google\'s bidding does not.',
  card: {
    bars: [
      {
        label: 'Visits and attention events',
        share: 0.85,
        value: 3460.78,
        flagged: true,
        target_share: null,
      },
      { label: 'Leads and sales', share: 0.15, value: 591.56, flagged: false, target_share: null },
    ],
    idea: 'inflated_primary_conversion',
    unit: 'count',
    facts: [
      { label: 'Conversions Google reports', value: '4051' },
      { label: 'Of them, visits and attention events', value: '3461 (85%)' },
      { label: 'Real results (leads, sales)', value: '592' },
      { label: 'Reported cost per conversion', value: '$10.09 MXN' },
      { label: 'Real cost per result', value: '$69.08 MXN' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'Most of what Google calls a conversion is a visit',
    checklist: [
      {
        label:
          'Set "www.vivo47.com.mx - GA4 (web) user_engagement" to secondary in Google Ads: it counts a visit, not a contact',
        detail: null,
        status: null,
      },
      {
        label: 'Make "www.vivo47.com.mx - GA4 (web) consulta_membresias" a primary conversion',
        detail: '495 in the window',
        status: null,
      },
      {
        label: 'Make "www.vivo47.com.mx - GA4 (web) contacto" a primary conversion',
        detail: '49 in the window',
        status: null,
      },
      {
        label: 'Give the bidding two weeks to relearn before judging its cost',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
});

export const VIVO_VALUE_MAP = candidate({
  recommendation: '524e08a8-8e57-4fb0-88e0-15cbaee30d1d',
  portfolio: VIVO_PORTFOLIO,
  rule: 'acct_conversion_value_map',
  severity: 'medium',
  reason:
    '"www.vivo47.com.mx - GA4 (web) consulta_membresias", "www.vivo47.com.mx - GA4 (web) contacto" are leads that are not primary, while Google bids toward "Lead formulario web". All 5 conversion actions carry the same value, so Google cannot tell a contact from a map click.',
  card: {
    bars: [
      {
        label: 'www.vivo47.com.mx - GA4 (web) user_engagement',
        share: 0.85,
        value: 3469.78,
        flagged: true,
        target_share: null,
      },
      {
        label: 'www.vivo47.com.mx - GA4 (web) consulta_membresias',
        share: 0.12,
        value: 494.93,
        flagged: true,
        target_share: null,
      },
      {
        label: 'www.vivo47.com.mx - GA4 (web) contacto',
        share: 0.01,
        value: 48.62,
        flagged: true,
        target_share: null,
      },
      { label: 'Lead formulario web', share: 0.01, value: 45, flagged: false, target_share: null },
      {
        label: '(Evento de Google Analytics file_download)',
        share: 0,
        value: 3,
        flagged: false,
        target_share: null,
      },
    ],
    idea: 'conversion_value_map',
    unit: 'count',
    facts: [
      { label: 'Primary today', value: 'Lead formulario web' },
      {
        label: 'www.vivo47.com.mx - GA4 (web) user_engagement',
        value: '3470 · secondary · value 1',
      },
      {
        label: 'www.vivo47.com.mx - GA4 (web) consulta_membresias',
        value: '495 · secondary · value 1',
      },
      { label: 'www.vivo47.com.mx - GA4 (web) contacto', value: '49 · secondary · value 1' },
      { label: 'Lead formulario web', value: '45 · primary · value 1' },
      {
        label: '(Evento de Google Analytics file_download)',
        value: '3 · secondary · value 1',
      },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'Which conversion is worth what',
    checklist: [
      {
        label: 'Make "www.vivo47.com.mx - GA4 (web) consulta_membresias" primary',
        detail: null,
        status: null,
      },
      {
        label: 'Make "www.vivo47.com.mx - GA4 (web) contacto" primary',
        detail: null,
        status: null,
      },
      {
        label: 'Give each action its value to the business (a form, a WhatsApp chat, a map click)',
        detail: 'Today they are all valued the same',
        status: null,
      },
      {
        label: 'Match the primaries to what the Optimizer counts as a result on Meta',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
});

export const VIVO_CAPPED = candidate({
  recommendation: 'dc27018a-136d-4789-be10-f17343045d8d',
  portfolio: VIVO_PORTFOLIO,
  rule: 'acct_capped_budget_locked',
  severity: 'medium',
  reason:
    "VIVO 47-EKATAR loses 75% of its impressions to budget, but the account's primary conversion counts visits: a bigger budget today buys more visits, not more leads. The raise waits until the conversion is fixed.",
  card: {
    bars: [
      { label: 'Shown', share: 0.25, value: 0.25, flagged: false, target_share: null },
      { label: 'Lost to budget', share: 0.75, value: 0.75, flagged: true, target_share: null },
    ],
    idea: 'capped_budget_locked',
    unit: 'share',
    facts: [
      { label: 'Lost to budget', value: '75%' },
      { label: 'Budget', value: '$1,179 MXN/day' },
      { label: 'Reported cost per conversion', value: '$8.28 MXN' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: '75% lost to budget — raise only after fixing the conversion',
    checklist: [
      {
        label: 'Fix the primary conversion first (the inflated-conversion card)',
        detail: null,
        status: null,
      },
      {
        label: 'Then let the budget card propose the raise against real leads',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: 'VIVO 47-EKATAR',
    recommend_only: false,
  },
});

/** One dark campaign (G12, not account-wide): its own card, never the account's calendar. */
export const VIVO_GOURMETERIA_DARK = candidate({
  recommendation: 'aee6eff2-a229-4707-aaaf-7356d99e38b7',
  portfolio: VIVO_PORTFOLIO,
  rule: 'G12',
  severity: 'high',
  reason:
    'Gourmetería is LEARNING with $567 MXN/day of budget and showed no ad for 30 days. Google says: BIDDING_STRATEGY_LEARNING. Fix it in Google Ads; nothing here changes it.',
  card: {
    reasons: ['BIDDING_STRATEGY_LEARNING'],
    variant: 'google_delivery_issue',
    currency: 'MXN',
    dark_days: 30,
    dark_since: '2026-10-03',
    account_wide: false,
    campaign_name: 'Gourmetería',
    budget_per_day: 567,
    disapproved_ads: 0,
  },
});

export const VIVO_CARDS = [VIVO_GOURMETERIA_DARK, VIVO_VALUE_MAP, VIVO_INFLATED, VIVO_CAPPED];

// ── Pink Elephant (6619636193): the client executes ─────────────────────────────────────────

export const PINK_FUNNEL = candidate({
  recommendation: '6f238110-bfd6-446c-9efe-1916984a804c',
  portfolio: PINK_PORTFOLIO,
  rule: 'acct_lead_to_sale_funnel',
  severity: 'high',
  reason:
    '11 leads became 1 sale worth $737 MXN on $9,507 MXN of spend (ROAS 0.08). The lead count looks fine; the leads do not buy.',
  card: {
    bars: [
      { label: 'Clicks', share: null, value: 1608, flagged: false, target_share: null },
      { label: 'Leads', share: null, value: 11, flagged: false, target_share: null },
      { label: 'Sales', share: null, value: 1, flagged: true, target_share: null },
    ],
    idea: 'lead_to_sale_funnel',
    unit: 'count',
    facts: [
      { label: 'Clicks', value: '1608' },
      { label: 'Leads', value: '11' },
      { label: 'Sales', value: '1 · $737 MXN' },
      { label: 'ROAS', value: '0.08' },
      { label: '"iso 27000"', value: 'QS 1' },
      { label: '"ISO 42001"', value: 'QS 3' },
      { label: '"continuidad del negocio"', value: 'QS 2' },
    ],
    blocked:
      'Lead → sale in GoHighLevel → WooCommerce: no connector exists yet (Backend, MCP and Supabase searched 2026-10-29). This card uses Google’s own sale conversion and GA4 when it is linked.',
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'Leads that do not become sales',
    checklist: [
      {
        label: 'Judge campaigns on sales, not leads, once the sale is measured',
        detail: null,
        status: null,
      },
      {
        label: 'One landing page per course for the low-score keywords',
        detail: 'iso 27000, ISO 42001, continuidad del negocio',
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: true,
  },
});

/**
 * Pink's course lines as Ramiro measured them on 2026-10-29: ITSM 40%, COBIT · BRM · IA · eventos
 * 17%, ISO 44% of the spend, against the 40 / 20 / 40 agreed with the client. Every line sits
 * within the finding's tolerance, so the engine writes no P4 card for Pink today; this one carries
 * the measured shares in the P4 shape, with each line's spend derived from October's real
 * $9,507.49 by its share.
 */
export const PINK_LINES = PlatformCardSchema.parse({
  variant: 'google_account_finding',
  idea: 'course_line_split',
  headline: 'Spend by course line vs the agreed split',
  campaign_name: null,
  currency: 'MXN',
  window_days: 30,
  recommend_only: true,
  facts: [{ label: 'Spend, 30 days', value: '$9,507 MXN' }],
  bars: [
    { label: 'ITSM', value: 3803, share: 0.4, target_share: 0.4, flagged: false },
    {
      label: 'COBIT · BRM · IA · eventos',
      value: 1616.27,
      share: 0.17,
      target_share: 0.2,
      flagged: false,
    },
    { label: 'ISO', value: 4183.3, share: 0.44, target_share: 0.4, flagged: false },
  ],
  unit: 'money',
  checklist: [],
  blocked: null,
});

// ── Easy Fit (5251780631) ────────────────────────────────────────────────────────────────────

/** E1's bars: the account's spend per day from its first served day to Nov 1. */
const EASYFIT_DAYS: readonly (readonly [string, number])[] = [
  ['10-08', 5099.6],
  ['10-09', 5098.98],
  ['10-10', 4719.24],
  ['10-11', 4693.53],
  ['10-12', 2931.19],
  ['10-13', 36.18],
  ['10-14', 1.43],
  ['10-15', 0],
  ['10-16', 0],
  ['10-17', 0],
  ['10-18', 0],
  ['10-19', 0],
  ['10-20', 765.71],
  ['10-21', 882.92],
  ['10-22', 1029.13],
  ['10-23', 1201.13],
  ['10-24', 409.94],
  ['10-25', 29.09],
  ['10-26', 0],
  ['10-27', 0],
  ['10-28', 0],
  ['10-29', 0],
  ['10-30', 0],
  ['10-31', 0],
  ['11-01', 0.29],
];

export const EASYFIT_CONTINUITY = candidate({
  recommendation: 'b86de5ca-2ff8-4972-914a-09ad49540fb4',
  portfolio: EASYFIT_PORTFOLIO,
  rule: 'acct_continuity_calendar',
  severity: 'medium',
  reason:
    'The account showed no ad on 11 days after it had started serving (2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31). At its served-day average that is about 409.4 conversions lost. Nothing raised an alarm while it happened.',
  card: {
    bars: EASYFIT_DAYS.map(([label, value]) => ({
      label,
      share: null,
      value,
      // The producer flags the days with no impression; on these 25 they are the zero-spend days.
      flagged: value === 0,
      target_share: null,
    })),
    idea: 'continuity_calendar',
    unit: 'money',
    facts: [
      { label: 'Dark days', value: '11' },
      { label: 'Conversions lost (served-day average)', value: '409.4' },
      { label: 'Dark', value: '2026-10-15 → 2026-10-19' },
      { label: 'Dark', value: '2026-10-26 → 2026-10-31' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'Dark 2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31',
    checklist: [
      {
        label: 'Find the cause in the change history and billing (payment, budget, policy)',
        detail: null,
        status: null,
      },
      {
        label: 'This card fires again the day the account goes dark',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
});

export const EASYFIT_VALUE_MAP = candidate({
  recommendation: '5a20d848-c372-40bc-8b37-63e34b4229a9',
  portfolio: EASYFIT_PORTFOLIO,
  rule: 'acct_conversion_value_map',
  severity: 'medium',
  reason:
    'All 6 conversion actions carry the same value, so Google cannot tell a contact from a map click.',
  card: {
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
      { label: 'Lead WhatsApp web', share: 0.05, value: 410, flagged: false, target_share: null },
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
    checklist: [
      {
        label: 'Give each action its value to the business (a form, a WhatsApp chat, a map click)',
        detail: 'Today they are all valued the same',
        status: null,
      },
      {
        label: 'Match the primaries to what the Optimizer counts as a result on Meta',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
});

/** 2026-10-31: every enabled campaign dark since Oct 26, Google suspended serving. */
export const EASYFIT_SUSPENDED_1031 = candidate({
  recommendation: 'de541e8e',
  portfolio: EASYFIT_PORTFOLIO,
  rule: 'G12',
  severity: 'high',
  reason: 'This account has 2 campaigns that should be serving…',
  card: {
    variant: 'google_delivery_issue',
    campaign_name: 'Search | Octubre | Easy Fit',
    reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
    dark_days: 5,
    dark_since: '2026-10-26',
    currency: 'MXN',
    budget_per_day: 670,
    disapproved_ads: 0,
    account_wide: true,
  },
});

export const EASYFIT_CARDS = [EASYFIT_CONTINUITY, EASYFIT_VALUE_MAP];

// ── Campaign reads, 2026-10-01 → 2026-10-31 ──────────────────────────────────────────────────

const OCTOBER = { since: '2026-10-01', until: '2026-10-31' };
const BASIS = (bucket: string | null, unambiguous = true) => ({
  rule: 'google_conversion_rule_v1',
  bucket,
  unambiguous,
});

/** What top_campaigns carries about a campaign (E1); the fields the notes did not keep are null. */
function serving(fields: Partial<GoogleCampaignFields>): GoogleCampaignFields {
  return {
    status: 'ENABLED',
    bidding_strategy_type: null,
    bidding_strategy_system_status: null,
    target_cpa: null,
    target_roas: null,
    budget_per_day: null,
    search_impression_share: null,
    search_budget_lost_impression_share: null,
    search_rank_lost_impression_share: null,
    ...fields,
  };
}

function row(
  id: string,
  name: string,
  channel: string,
  [spend, impressions, clicks, conversions]: [number, number, number, number | null],
  google?: Partial<GoogleCampaignFields>,
) {
  return {
    id,
    name,
    labels: { channel_type: channel },
    metrics: { spend, impressions, clicks, conversions },
    ...(google ? { google: serving(google) } : {}),
  };
}

/** Easy Fit's five largest campaigns of October (of nine), leads counted. */
export const EASYFIT_CAMPAIGNS: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  rows: [
    row('24274603133', 'Easy Fit | Search | Leads formulario', 'SEARCH', [6317.45, 14334, 722, 20]),
    row('ga-1-easy', 'GA 1 EASY', 'SEARCH', [6196.14, 34562, 984, 5.07]),
    row('24298408295', 'Easy Fit', 'PERFORMANCE_MAX', [5577.88, 80493, 4756, 180]),
    row(
      '24321868026',
      'PMax | Octubre | Easy Fit | Leads',
      'PERFORMANCE_MAX',
      [4720.67, 83423, 3223, 198.97],
    ),
    row('24321097869', 'Search | Octubre | Easy Fit', 'SEARCH', [4086.75, 19252, 1334, 8]),
  ],
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

/** The account read over the same five: 412 leads at $65 MXN. */
export const EASYFIT_ACCOUNT: GoogleAccountOverview = GoogleAccountOverviewSchema.parse({
  metrics: { spend: 26898.89, impressions: 232064, clicks: 11019, ctr: 4.75, cpa: 65.28 },
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

/** Vivo 47's two spending campaigns of October. The lead rule counted 0 at campaign level. */
export const VIVO_CAMPAIGNS: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  rows: [
    row('20775796216', 'VIVO 47-EKATAR', 'SEARCH', [35606.55, 151153, 4168, 0], {
      budget_per_day: 1179,
      search_budget_lost_impression_share: 0.74,
    }),
    row('sales-pmax-octubre', 'SALES-PMAX-OCTUBRE', 'PERFORMANCE_MAX', [7189.83, 69344, 2714, 0], {
      budget_per_day: 450,
      search_rank_lost_impression_share: 0.78,
    }),
  ],
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

export const VIVO_ACCOUNT: GoogleAccountOverview = GoogleAccountOverviewSchema.parse({
  metrics: { spend: 42796.38, impressions: 220506, clicks: 6882, ctr: 3.12, cpa: null },
  comparison: { spend: { current: 42796.38, previous: 58344.56 } },
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

/** Pink Elephant's three Search campaigns of October. Purchases per campaign were not in the
 *  notes, so conversions are null: the read counts no single result for them here. */
export const PINK_CAMPAIGNS: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  rows: [
    row('22550284746', 'Cursos-pink-elephant-2025', 'SEARCH', [5305, 21560, 1303, null], {
      budget_per_day: 200,
      search_budget_lost_impression_share: 0.16,
    }),
    row('itsm-2026', 'ITSM 2026', 'SEARCH', [3122.91, 9990, 256, null], {
      budget_per_day: 200,
      search_budget_lost_impression_share: 0.21,
    }),
    row('23921941100', 'Eventos 2026', 'SEARCH', [1079.58, 1218, 50, null], {
      budget_per_day: 100,
      search_budget_lost_impression_share: 0.38,
    }),
  ],
  result_basis: BASIS(null, false),
  range: OCTOBER,
  currency: 'MXN',
});

export const PINK_ACCOUNT: GoogleAccountOverview = GoogleAccountOverviewSchema.parse({
  metrics: { spend: 9507.49, impressions: 32768, clicks: 1609, ctr: 4.91, cpa: null },
  comparison: { spend: { current: 9507.49, previous: 9393.61 } },
  result_basis: BASIS(null, false),
  range: OCTOBER,
  currency: 'MXN',
});

/** Tangassi's two spending campaigns of October: 15 contacts, no portfolio. */
export const TANGASSI_CAMPAIGNS: GoogleTopCampaigns = GoogleTopCampaignsSchema.parse({
  rows: [
    row('necesidades-slp', 'Necesidades SLP', 'PERFORMANCE_MAX', [2653.56, 9673, 713, 8]),
    row('landing-goto', 'Landing-Goto', 'SEARCH', [1119.02, 1213, 176, 7]),
  ],
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

export const TANGASSI_ACCOUNT: GoogleAccountOverview = GoogleAccountOverviewSchema.parse({
  metrics: { spend: 3772.59, impressions: 10886, clicks: 889, ctr: 8.17, cpa: 251.51 },
  comparison: { spend: { current: 3772.59, previous: 4408.49 } },
  result_basis: BASIS('leads'),
  range: OCTOBER,
  currency: 'MXN',
});

// ── The same findings after the engine's Spanish rewrite (decision 3) ──────────────────────────

/** The English candidate with the card the engine writes in Spanish, figures unchanged. */
function inSpanish(english: AccountCandidate, reason: string, card: unknown): AccountCandidate {
  return accountCandidateSchema.parse({
    ...english,
    impact_basis: reason.slice(0, 240),
    platform_card: PlatformCardSchema.parse(card),
  });
}

const GA4 = 'www.vivo47.com.mx - GA4 (web)';

export const VIVO_INFLATED_ES = inSpanish(
  VIVO_INFLATED,
  `85% de las 4051 conversiones que Google reporta son visitas o eventos de interacción de una acción marcada como principal ("${GA4} user_engagement"). Solo 592 son leads o ventas. Google puja por lo que está marcado como principal, así que está comprando visitas. Nuestras lecturas ya excluyen estos eventos, pero la puja de Google no.`,
  {
    bars: [
      {
        label: 'Visitas y eventos de interacción',
        share: 0.85,
        value: 3460.78,
        flagged: true,
        target_share: null,
      },
      { label: 'Leads y ventas', share: 0.15, value: 591.56, flagged: false, target_share: null },
    ],
    idea: 'inflated_primary_conversion',
    unit: 'count',
    facts: [
      { label: 'Conversiones que Google reporta', value: '4051' },
      { label: 'De ellas, visitas y eventos de interacción', value: '3461 (85%)' },
      { label: 'Resultados reales (leads, ventas)', value: '592' },
      { label: 'Costo por conversión reportado', value: '$10.09 MXN' },
      { label: 'Costo real por resultado', value: '$69.08 MXN' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'La mayor parte de lo que Google cuenta como conversión es una visita',
    checklist: [
      {
        label: `Pon "${GA4} user_engagement" como secundaria en Google Ads: cuenta una visita, no un contacto`,
        detail: null,
        status: null,
      },
      {
        label: `Pon "${GA4} consulta_membresias" como conversión principal`,
        detail: '495 en el periodo',
        status: null,
      },
      {
        label: `Pon "${GA4} contacto" como conversión principal`,
        detail: '49 en el periodo',
        status: null,
      },
      {
        label: 'Dale a la puja dos semanas para volver a aprender antes de juzgar su costo',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
);

export const VIVO_VALUE_MAP_ES = inSpanish(
  VIVO_VALUE_MAP,
  `"${GA4} consulta_membresias", "${GA4} contacto" son acciones de lead que no son principales, mientras Google puja por "Lead formulario web". Las 5 acciones de conversión tienen el mismo valor, así que Google no distingue un contacto de un clic en el mapa.`,
  {
    bars: [
      {
        label: `${GA4} user_engagement`,
        share: 0.85,
        value: 3469.78,
        flagged: true,
        target_share: null,
      },
      {
        label: `${GA4} consulta_membresias`,
        share: 0.12,
        value: 494.93,
        flagged: true,
        target_share: null,
      },
      { label: `${GA4} contacto`, share: 0.01, value: 48.62, flagged: true, target_share: null },
      { label: 'Lead formulario web', share: 0.01, value: 45, flagged: false, target_share: null },
      {
        label: '(Evento de Google Analytics file_download)',
        share: 0,
        value: 3,
        flagged: false,
        target_share: null,
      },
    ],
    idea: 'conversion_value_map',
    unit: 'count',
    facts: [
      { label: 'Principales hoy', value: 'Lead formulario web' },
      { label: `${GA4} user_engagement`, value: '3470 · secundaria · valor 1' },
      { label: `${GA4} consulta_membresias`, value: '495 · secundaria · valor 1' },
      { label: `${GA4} contacto`, value: '49 · secundaria · valor 1' },
      { label: 'Lead formulario web', value: '45 · principal · valor 1' },
      { label: '(Evento de Google Analytics file_download)', value: '3 · secundaria · valor 1' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline:
      '2 acciones de lead no son principales y las 5 acciones de conversión tienen el mismo valor',
    checklist: [
      { label: `Pon "${GA4} consulta_membresias" como principal`, detail: null, status: null },
      { label: `Pon "${GA4} contacto" como principal`, detail: null, status: null },
      {
        label:
          'Dale a cada acción su valor para el negocio (un formulario, un chat de WhatsApp, un clic en el mapa)',
        detail: 'Hoy todas tienen el mismo valor',
        status: null,
      },
      {
        label:
          'Haz que las principales coincidan con lo que el Optimizer cuenta como resultado en Meta',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
);

export const VIVO_CAPPED_ES = inSpanish(
  VIVO_CAPPED,
  'VIVO 47-EKATAR pierde 75% de sus impresiones por presupuesto, pero la conversión principal de la cuenta registra visitas: más presupuesto hoy compra más visitas, no más leads. El aumento espera a que se corrija la conversión.',
  {
    bars: [
      { label: 'Mostradas', share: 0.25, value: 0.25, flagged: false, target_share: null },
      {
        label: 'Perdidas por presupuesto',
        share: 0.75,
        value: 0.75,
        flagged: true,
        target_share: null,
      },
    ],
    idea: 'capped_budget_locked',
    unit: 'share',
    facts: [
      { label: 'Perdido por presupuesto', value: '75%' },
      { label: 'Presupuesto', value: '$1,179 MXN/día' },
      { label: 'Costo por conversión reportado', value: '$8.28 MXN' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline:
      'VIVO 47-EKATAR: 75% de las impresiones perdidas por presupuesto, con una conversión principal que registra visitas',
    checklist: [
      {
        label: 'Corrige primero la conversión principal (la tarjeta de la conversión inflada)',
        detail: null,
        status: null,
      },
      {
        label:
          'Después, deja que la tarjeta de presupuesto proponga el aumento con base en leads reales',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: 'VIVO 47-EKATAR',
    recommend_only: false,
  },
);

export const VIVO_CARDS_ES = [
  VIVO_GOURMETERIA_DARK,
  VIVO_VALUE_MAP_ES,
  VIVO_INFLATED_ES,
  VIVO_CAPPED_ES,
];

export const PINK_FUNNEL_ES = inSpanish(
  PINK_FUNNEL,
  '11 leads se convirtieron en 1 venta por $737 MXN con $9,507 MXN de gasto (ROAS 0.08). La cantidad de leads se ve bien; los leads no compran.',
  {
    bars: [
      { label: 'Clics', share: null, value: 1608, flagged: false, target_share: null },
      { label: 'Leads', share: null, value: 11, flagged: false, target_share: null },
      { label: 'Ventas', share: null, value: 1, flagged: true, target_share: null },
    ],
    idea: 'lead_to_sale_funnel',
    unit: 'count',
    facts: [
      { label: 'Clics', value: '1608' },
      { label: 'Leads', value: '11' },
      { label: 'Ventas', value: '1 · $737 MXN' },
      { label: 'ROAS', value: '0.08' },
      { label: '"iso 27000"', value: 'QS 1' },
      { label: '"ISO 42001"', value: 'QS 3' },
      { label: '"continuidad del negocio"', value: 'QS 2' },
    ],
    blocked:
      'Lead → venta en GoHighLevel → WooCommerce: todavía no existe un conector (se buscó en el Backend, MCP y Supabase el 2026-10-29). Esta tarjeta usa la conversión de venta de Google y GA4 cuando está vinculado.',
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: '11 leads y 1 venta por $737 MXN: ROAS 0.08',
    checklist: [
      {
        label: 'Evalúa las campañas por ventas, no por leads, cuando la venta se mida',
        detail: null,
        status: null,
      },
      {
        label: 'Una página de destino por curso para las palabras clave con QS bajo',
        detail: 'iso 27000, ISO 42001, continuidad del negocio',
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: true,
  },
);

export const EASYFIT_CONTINUITY_ES = inSpanish(
  EASYFIT_CONTINUITY,
  'La cuenta no mostró anuncios durante 11 días después de haber empezado a mostrarlos (2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31). Al promedio de sus días con anuncios, son unas 409.4 conversiones perdidas. Ninguna alerta avisó mientras ocurría.',
  {
    bars: EASYFIT_DAYS.map(([label, value]) => ({
      label,
      share: null,
      value,
      flagged: value === 0,
      target_share: null,
    })),
    idea: 'continuity_calendar',
    unit: 'money',
    facts: [
      { label: 'Días sin anuncios', value: '11' },
      { label: 'Conversiones perdidas (promedio de los días con anuncios)', value: '409.4' },
      { label: 'Sin anuncios', value: '2026-10-15 → 2026-10-19' },
      { label: 'Sin anuncios', value: '2026-10-26 → 2026-10-31' },
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: '11 días sin anuncios: 2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31',
    checklist: [
      {
        label:
          'Busca la causa en el historial de cambios y en la facturación (pago, presupuesto, políticas)',
        detail: null,
        status: null,
      },
      {
        label: 'Esta tarjeta vuelve a aparecer el día en que la cuenta deje de mostrar anuncios',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
);

const EASYFIT_ACTIONS: readonly (readonly [string, number, number])[] = [
  ['Local actions - Other engagements', 6881, 0.82],
  ['Local actions - Directions', 791, 0.09],
  ['Lead WhatsApp web', 410, 0.05],
  ['Clicks to call', 151, 0.02],
  ['Local actions - Website visits', 101, 0.01],
  ['Lead formulario web', 21, 0],
];

export const EASYFIT_VALUE_MAP_ES = inSpanish(
  EASYFIT_VALUE_MAP,
  'Las 6 acciones de conversión tienen el mismo valor, así que Google no distingue un contacto de un clic en el mapa.',
  {
    bars: EASYFIT_ACTIONS.map(([label, value, share]) => ({
      label,
      share,
      value,
      flagged: false,
      target_share: null,
    })),
    idea: 'conversion_value_map',
    unit: 'count',
    facts: [
      { label: 'Principales hoy', value: EASYFIT_ACTIONS.map(([label]) => label).join(', ') },
      // The producer states the first five actions; the sixth is in the bars only.
      ...EASYFIT_ACTIONS.slice(0, 5).map(([label, value]) => ({
        label,
        value: `${value} · principal · valor 1`,
      })),
    ],
    blocked: null,
    variant: 'google_account_finding',
    currency: 'MXN',
    headline: 'Las 6 acciones de conversión tienen el mismo valor',
    checklist: [
      {
        label:
          'Dale a cada acción su valor para el negocio (un formulario, un chat de WhatsApp, un clic en el mapa)',
        detail: 'Hoy todas tienen el mismo valor',
        status: null,
      },
      {
        label:
          'Haz que las principales coincidan con lo que el Optimizer cuenta como resultado en Meta',
        detail: null,
        status: null,
      },
    ],
    window_days: 30,
    campaign_name: null,
    recommend_only: false,
  },
);

export const EASYFIT_CARDS_ES = [EASYFIT_CONTINUITY_ES, EASYFIT_VALUE_MAP_ES];
