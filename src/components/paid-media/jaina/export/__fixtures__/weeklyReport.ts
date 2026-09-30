import type { TemplateFigure } from '@continuum/contracts';

// A weekly report as the Backend composes it: the `data_scope` frame and the `weekly_report`
// answer template, with every figure a tool read. Raw JSON on purpose — the render bench's
// harness parses it through the real report schema exactly as it parses the live artifact
// (artifacts/jaina/weekly-report-live.json), and falls back to this only when that is absent.
//
// Three objectives: two active (leads over target, conversations under it) and one with no
// active campaigns, so every branch of the section renders. Three recommendation cards cover
// both priorities and all three impact levels.

const PERIOD_A = { since: '2026-09-21', until: '2026-09-27', label: 'Week of Sep 21 – Sep 27' };
const PERIOD_B = { since: '2026-09-01', until: '2026-09-27', label: 'September to date' };
const PRIOR_A = { since: '2026-09-14', until: '2026-09-20', label: 'Week of Sep 14 – Sep 20' };

type Window = typeof PERIOD_A;

const INSIGHTS = 'get_campaign_batch_analysis';
const PORTFOLIOS = 'optimizer_list_portfolios';
const PENDING = 'get_optimizer_pending_recs';

function fig(
  id: string,
  label: string,
  value: number | null,
  unit: TemplateFigure['unit'],
  window: Window,
  tool = INSIGHTS,
): TemplateFigure {
  return {
    id,
    label,
    value,
    unit,
    currency: unit === 'money' ? 'MXN' : null,
    window,
    source: { tool, datasetId: `ds_${tool}`, level: 'campaign', entityId: null },
    derivation: null,
  };
}

const FIGURES: TemplateFigure[] = [
  fig('spend_a', 'Spend', 58240.5, 'money', PERIOD_A),
  fig('spend_prior', 'Spend', 54110, 'money', PRIOR_A),
  fig('results_a', 'Results', 1412, 'count', PERIOD_A),
  fig('results_prior', 'Results', 1288, 'count', PRIOR_A),
  fig('cpr_a', 'Cost per result', 41.25, 'money', PERIOD_A),
  fig('cpr_prior', 'Cost per result', 42.01, 'money', PRIOR_A),
  fig('ctr_a', 'CTR', 0.0187, 'percent', PERIOD_A),
  fig('ctr_prior', 'CTR', 0.0187, 'percent', PRIOR_A),

  fig('leads_spend_a', 'Spend', 21480, 'money', PERIOD_A),
  fig('leads_results_a', 'Leads', 312, 'count', PERIOD_A),
  fig('leads_cpr_a', 'Cost per lead', 68.85, 'money', PERIOD_A),
  fig('leads_target', 'Target cost per lead', 60, 'money', PERIOD_B, PORTFOLIOS),
  fig('leads_delta_a', 'Δ vs target', 0.1475, 'percent', PERIOD_A),
  fig('leads_spend_b', 'Spend', 79950, 'money', PERIOD_B),
  fig('leads_results_b', 'Leads', 1236, 'count', PERIOD_B),
  fig('leads_cpr_b', 'Cost per lead', 64.68, 'money', PERIOD_B),
  fig('leads_delta_b', 'Δ vs target', 0.078, 'percent', PERIOD_B),

  fig('conv_spend_a', 'Spend', 36760.5, 'money', PERIOD_A),
  fig('conv_results_a', 'Conversations', 1100, 'count', PERIOD_A),
  fig('conv_cpr_a', 'Cost per conversation', 33.42, 'money', PERIOD_A),
  fig('conv_target', 'Target cost per conversation', 38, 'money', PERIOD_B, PORTFOLIOS),
  fig('conv_delta_a', 'Δ vs target', -0.1205, 'percent', PERIOD_A),
  fig('conv_spend_b', 'Spend', 131020, 'money', PERIOD_B),
  fig('conv_results_b', 'Conversations', 3804, 'count', PERIOD_B),
  fig('conv_cpr_b', 'Cost per conversation', 34.44, 'money', PERIOD_B),
  fig('conv_delta_b', 'Δ vs target', -0.0937, 'percent', PERIOD_B),

  fig('rec1_cpl', 'Cost per lead', 112.4, 'money', PERIOD_A, PENDING),
  fig('rec2_cpc', 'Cost per conversation', 24.9, 'money', PERIOD_A, PENDING),
  fig('rec3_freq', 'Frequency', 3.4, 'ratio', PERIOD_A, PENDING),
];

const WEEKLY_REPORT_BLOCK = {
  block_id: 'answer_template_weekly_report',
  category: 'answer_template',
  scope: 'account',
  title: 'Weekly report',
  priority: 'primary',
  provenance: {
    source: 'computed',
    tool: INSIGHTS,
    period: { since: PERIOD_A.since, until: PERIOD_A.until, requested_label: 'last_week_mon_sun' },
    entity_label: null,
    record_count: 42,
  },
  grounding: null,
  template_id: 'weekly_report',
  layout: 'steps',
  executive: {
    sentence:
      'Last week the account spent {spend_a} for {results_a} results at {cpr_a} each — conversations beat their target while leads ran {leads_delta_a} over theirs.',
    hero_chart: null,
  },
  justification: {
    sections: [
      {
        kind: 'measured',
        title: 'What we measured',
        text: 'Campaign insights for the last complete Monday–Sunday week and September to date, cut in America/Mexico_City, against the Optimizer portfolios’ targets.',
      },
    ],
  },
  figures: FIGURES,
  fallback_from: null,
  weekly_report: {
    header: {
      brand_name: 'Easy Fit',
      ad_account_id: 'act_521903353286118',
      timezone: 'America/Mexico_City',
      currency: 'MXN',
      period_a: PERIOD_A,
      period_b: PERIOD_B,
      prior_a: PRIOR_A,
    },
    tiles: [
      {
        id: 'spend',
        label: 'Spend',
        figure_id: 'spend_a',
        prior_figure_id: 'spend_prior',
        read: 'igual',
        lower_is_better: false,
      },
      {
        id: 'results',
        label: 'Results',
        figure_id: 'results_a',
        prior_figure_id: 'results_prior',
        read: 'mejor',
        lower_is_better: false,
      },
      {
        id: 'cpr',
        label: 'Cost per result',
        figure_id: 'cpr_a',
        prior_figure_id: 'cpr_prior',
        read: 'mejor',
        lower_is_better: true,
      },
      {
        id: 'ctr',
        label: 'CTR',
        figure_id: 'ctr_a',
        prior_figure_id: 'ctr_prior',
        read: 'igual',
        lower_is_better: false,
      },
    ],
    objectives: [
      {
        objective: 'leads',
        label: 'Leads',
        portfolio_ids: ['pf_leads'],
        active: true,
        no_active_note: null,
        period_a: {
          spend: 'leads_spend_a',
          results: 'leads_results_a',
          cost_per_result: 'leads_cpr_a',
          target: 'leads_target',
          delta_vs_target: 'leads_delta_a',
        },
        period_b: {
          spend: 'leads_spend_b',
          results: 'leads_results_b',
          cost_per_result: 'leads_cpr_b',
          target: 'leads_target',
          delta_vs_target: 'leads_delta_b',
        },
        signal: { text: 'Over target by {leads_delta_a} last week.', tone: 'bad' },
        what: 'A lead cost {leads_cpr_a} last week against a {leads_target} target.',
        so_what: 'The month is still {leads_delta_b} over, so the week pulled it further away.',
        now_what: 'Pause the ad set pulling the cost up and hold the rest of the budget.',
      },
      {
        objective: 'conversations',
        label: 'Conversations',
        portfolio_ids: ['pf_messages'],
        active: true,
        no_active_note: null,
        period_a: {
          spend: 'conv_spend_a',
          results: 'conv_results_a',
          cost_per_result: 'conv_cpr_a',
          target: 'conv_target',
          delta_vs_target: 'conv_delta_a',
        },
        period_b: {
          spend: 'conv_spend_b',
          results: 'conv_results_b',
          cost_per_result: 'conv_cpr_b',
          target: 'conv_target',
          delta_vs_target: 'conv_delta_b',
        },
        signal: { text: 'Under target by {conv_delta_a}.', tone: 'good' },
        what: 'A conversation cost {conv_cpr_a} against a {conv_target} target.',
        so_what: 'There is headroom to spend more at this price.',
        now_what: 'Move budget toward the cheapest conversation ad set.',
      },
      {
        objective: 'purchases',
        label: 'Purchases',
        portfolio_ids: ['pf_purchases'],
        active: false,
        no_active_note: 'No active campaigns in either period.',
        period_a: null,
        period_b: null,
        signal: { text: 'Nothing to read: no purchase campaign spent.', tone: 'neutral' },
        what: 'No purchase campaign delivered in either window.',
        so_what: 'The portfolio has no signal to optimize against.',
        now_what: 'Relaunch a purchase campaign or archive the portfolio.',
      },
    ],
    recommendations: [
      {
        id: 'card_leads_pause',
        recommendation_id: 'rec_01',
        portfolio_id: 'pf_leads',
        what: 'Pause the lead ad set pulling the cost up.',
        where: {
          entity_id: '120214001122330',
          entity_name: 'SEDE 2 // LEADS // SEP',
          level: 'adset',
        },
        why: {
          text: 'Its cost per lead was {rec1_cpl} last week.',
          figure_ids: ['rec1_cpl'],
          source: { tool: PENDING, window: PERIOD_A },
        },
        impact: {
          level: 'high',
          note: 'Brings the leads portfolio back toward target.',
          basis: 'estimate',
        },
        priority: 'this_week',
      },
      {
        id: 'card_conv_scale',
        recommendation_id: 'rec_02',
        portfolio_id: 'pf_messages',
        what: 'Raise the budget of the cheapest conversation ad set.',
        where: { entity_id: '120214009988770', entity_name: 'MENSAJES // TODOS', level: 'adset' },
        why: {
          text: 'It bought conversations at {rec2_cpc}.',
          figure_ids: ['rec2_cpc'],
          source: { tool: PENDING, window: PERIOD_A },
        },
        impact: {
          level: 'medium',
          note: 'More conversations at the same price.',
          basis: 'estimate',
        },
        priority: 'this_week',
      },
      {
        id: 'card_creative_refresh',
        recommendation_id: 'rec_03',
        portfolio_id: 'pf_messages',
        what: 'Refresh the creative on the tours ad.',
        where: {
          entity_id: '120214005544332',
          entity_name: 'Septiembre - Tours Programados',
          level: 'ad',
        },
        why: {
          text: 'Frequency reached {rec3_freq}.',
          figure_ids: ['rec3_freq'],
          source: { tool: PENDING, window: PERIOD_A },
        },
        impact: { level: 'low', note: 'Slows fatigue before it shows in cost.', basis: 'estimate' },
        priority: 'next_2_weeks',
      },
    ],
  },
};

/** The full report the render bench falls back to when no live artifact exists. */
export const WEEKLY_REPORT_FIXTURE = {
  language: 'en',
  executive_summary: '',
  reasoning_trace: '',
  blocks: [
    {
      block_id: 'data_scope',
      category: 'data_scope',
      scope: 'account',
      title: 'Data scope',
      priority: 'secondary',
      provenance: {
        source: 'computed',
        tool: INSIGHTS,
        period: { since: PERIOD_B.since, until: PERIOD_A.until, requested_label: 'weekly_report' },
        entity_label: null,
        record_count: null,
      },
      dates: 'Sep 21 – Sep 27, 2026 (Period A) · Sep 1 – Sep 27, 2026 (Period B)',
      timezone: 'America/Mexico_City',
      source: 'api',
      notes: [],
    },
    WEEKLY_REPORT_BLOCK,
  ],
  follow_up_questions: [],
  media_map: {},
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  _meta: {
    schema_version: '2',
    block_count: 2,
    has_charts: false,
    has_media: false,
    primary_scope: 'account',
  },
};
