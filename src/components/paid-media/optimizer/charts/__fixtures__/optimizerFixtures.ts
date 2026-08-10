// Real-shaped fixtures for the optimizer chart render tests. Because the optimizer
// service is not live yet, populated data never flows in dev — these stand in for
// the "cycle has scored" path so the redesigned chart chrome is provable, while
// the empty/held variants exercise the states that actually render today.

import type {
  AngleMatrixCell,
  CpaSeriesPoint,
  CycleItemRow,
  PortfolioListItem,
  RunConfidence,
} from '@continuum/contracts';

function seriesPoint(cycle_ts: string, spend_d7: number, conv_d7: number): CpaSeriesPoint {
  return {
    cycle_ts,
    spend_d3: spend_d7 / 2,
    conv_d3: conv_d7 / 2,
    spend_d7,
    conv_d7,
    spend_d14: spend_d7 * 2,
    conv_d14: conv_d7 * 2,
    adsets: 4,
  };
}

// Four scored cycles, CPA falling 40 → 25 (improving, deltaPct negative).
export const cpaSeriesTrend: CpaSeriesPoint[] = [
  seriesPoint('2026-06-01T00:00:00.000Z', 800, 20),
  seriesPoint('2026-06-08T00:00:00.000Z', 720, 20),
  seriesPoint('2026-06-15T00:00:00.000Z', 640, 20),
  seriesPoint('2026-06-22T00:00:00.000Z', 500, 20),
];

// One point → fewer than two scored cycles → the trend stays empty.
export const cpaSeriesSparse: CpaSeriesPoint[] = [seriesPoint('2026-06-22T00:00:00.000Z', 500, 20)];

export const cpaSeriesEmpty: CpaSeriesPoint[] = [];

function item(
  adset_id: string,
  change_abs: number,
  diagnostics: CycleItemRow['diagnostics'],
): CycleItemRow {
  return {
    adset_id,
    current_budget: 100,
    final_budget: 100 + change_abs,
    change_abs,
    change_pct: change_abs,
    diagnostics,
  };
}

export const cycleItemsMixed: CycleItemRow[] = [
  item('act_1::adset_gainer', 40, { ci: { cpa: 22, lo: 16, hi: 30, events: 55 } }),
  item('act_1::adset_loser', -40, { ci: { cpa: 48, lo: 30, hi: 74, events: 12 } }),
  item('act_1::adset_held', 0, { freezeReason: 'unsupported_budget' }),
];

export const cycleItemsHeldOnly: CycleItemRow[] = [
  item('act_1::adset_cbo', 0, { freezeReason: 'unsupported_budget' }),
  item('act_1::adset_thin', 0, { freezeReason: 'no_conversions' }),
];

export const cycleItemsEmpty: CycleItemRow[] = [];

function cell(
  audience_type: string,
  angle: string,
  spend: number,
  conversions: number,
  adsets = 1,
): AngleMatrixCell {
  return { audience_type, angle, spend, conversions, adsets };
}

export const angleCellsPopulated: AngleMatrixCell[] = [
  cell('prospecting', 'social_proof', 240, 12),
  cell('prospecting', 'urgency', 300, 6),
  cell('retargeting', 'social_proof', 180, 15),
  cell('retargeting', 'urgency', 210, 3),
];

// Real audience axis but angles unresolved until the v2 tagging worker runs.
export const angleCellsUntagged: AngleMatrixCell[] = [
  cell('prospecting', 'untagged', 240, 12),
  cell('retargeting', 'untagged', 180, 9),
];

export const angleCellsEmpty: AngleMatrixCell[] = [];

export const confidenceHigh: RunConfidence = { score: 0.82, band: 'high', events: 67 };

export const portfoliosPopulated: PortfolioListItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Prospecting — purchases',
    ad_account_id: 'act_1',
    objective: 'purchase',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 300,
    period_budget: null,
    status: 'active',
    next_realloc_at: '2026-06-23T00:00:00.000Z',
    adset_count: 4,
    pending_recommendations: 2,
    pending_budget_moves: 3,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Retargeting — leads',
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'campaign',
    mode: 'conservative',
    apply_mode: 'recommend',
    daily_total: 120,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    pending_budget_moves: 0,
  },
];
