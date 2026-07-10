// End-to-end bench for the optimizer data-visualization layer.
//
// It drives the REAL boundary the frontend uses: every fixture below is the exact
// shape an optimizer RPC / edge returns, and each is parsed through its actual
// @continuum/contracts Zod schema FIRST (the same safeParse the read hooks run) —
// so the bench fails if a transform is fed anything the wire can't deliver. It then
// runs the full transform pipeline behind every new chart and asserts the observable
// chart-ready output (funnel stages + drop-off %, radar 0–100, projection endpoint,
// P&L zero-baseline crossing, pacing verdict, hero points + action pins, merged
// multi-creative rows, summed funnel window, ad-set ROAS series).
//
// COVERAGE NOTE (honest): the optimizer service (cycle_runs / cpa_series / angle_matrix)
// and the ad_daily_trends edge are NOT deployed yet, so the LIVE network hop is not
// exercised here — these fixtures stand in for it as CONTRACT-VALID reads. When the
// service + edge are live, point the fixtures at real reads for the Pizza Test owner
// to close that last hop. Everything from the contract boundary through to the
// chart-ready output IS exercised.

import {
  AdDailyTrendsResponseSchema,
  AdSetSnapshotSchema,
  AngleMatrixCellSchema,
  CpaSeriesPointSchema,
  getOptimizationMetricDefinition,
  ParsedCycleRunReportSchema,
  RunConfidenceSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import {
  adSetRoasSeries,
  buildConfidenceRadar,
  buildConversionFunnel,
  buildCpaHeroPoints,
  buildCpaProjection,
  buildCycleActionMap,
  mergeAdDailyByMetric,
  pacingSnapshot,
  projectionEndpoint,
  roasBreakevenSeries,
  sumFunnelWindow,
} from './vizData';

let checks = 0;
const failures: string[] = [];
function assert(condition: boolean, message: string) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ── 1. optimizer_get_cpa_series → CpaSeriesPoint[] ────────────────────────────
const cpaSeries = z.array(CpaSeriesPointSchema).parse([
  {
    cycle_ts: '2026-06-01T00:00:00.000Z',
    spend_d3: 400,
    conv_d3: 10,
    spend_d7: 800,
    conv_d7: 20,
    spend_d14: 1600,
    conv_d14: 40,
    adsets: 4,
  },
  {
    cycle_ts: '2026-06-08T00:00:00.000Z',
    spend_d3: 360,
    conv_d3: 10,
    spend_d7: 720,
    conv_d7: 20,
    spend_d14: 1500,
    conv_d14: 40,
    adsets: 4,
  },
  {
    cycle_ts: '2026-06-15T00:00:00.000Z',
    spend_d3: 320,
    conv_d3: 10,
    spend_d7: 640,
    conv_d7: 20,
    spend_d14: 1400,
    conv_d14: 40,
    adsets: 4,
  },
  {
    cycle_ts: '2026-06-22T00:00:00.000Z',
    spend_d3: 250,
    conv_d3: 10,
    spend_d7: 500,
    conv_d7: 20,
    spend_d14: 1200,
    conv_d14: 40,
    adsets: 4,
  },
]);

// ── 2. optimizer-status → CycleRunReport → ParsedCycleRunReport ───────────────
const report = ParsedCycleRunReportSchema.parse({
  portfolio: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Prospecting — purchases',
    mode: 'balanced',
    apply_mode: 'recommend',
    status: 'active',
    daily_total: 300,
    period_budget: 6000,
    cpa_target: 22,
  },
  latest_run: {
    id: '22222222-2222-4222-8222-222222222222',
    cycle_ts: '2026-06-22T00:00:00.000Z',
    mode: 'balanced',
    allocated_total: 300,
    conserved: true,
    confidence: {
      score: 0.72,
      predictiveness: 0.88,
      sampleSize: 0.55,
      consistency: 0.61,
      events: 67,
      band: 'high',
    },
    // pacing rides as loose jsonb on the run row
    pacing: {
      actualSpendToDate: 2400,
      idealCumulative: 2500,
      pacingRatio: 0.96,
      periodBudget: 6000,
      dayIndex: 10,
      periodDays: 30,
    },
  },
  latest_items: [
    {
      adset_id: 'act_1::adset_gainer',
      current_budget: 100,
      final_budget: 140,
      change_abs: 40,
      change_pct: 40,
      diagnostics: { ci: { cpa: 20, lo: 15, hi: 27, events: 60 } },
    },
    {
      adset_id: 'act_1::adset_loser',
      current_budget: 100,
      final_budget: 70,
      change_abs: -30,
      change_pct: -30,
      diagnostics: { ci: { cpa: 44, lo: 28, hi: 70, events: 12 } },
    },
    {
      adset_id: 'act_1::adset_held',
      current_budget: 100,
      final_budget: 100,
      change_abs: 0,
      change_pct: 0,
      diagnostics: { freezeReason: 'unsupported_budget' },
    },
  ],
  recommendations: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      adset_id: 'act_1::adset_loser',
      kind: 'pause',
      trigger: 'P2_sustained_poor',
      severity: 'high',
      reason: 'sustained poor efficiency',
      status: 'pending',
    },
  ],
  history: [],
});

// ── 3. optimizer_get_angle_matrix → AngleMatrixCell[] ─────────────────────────
const angleCells = z.array(AngleMatrixCellSchema).parse([
  { audience_type: 'prospecting', angle: 'social_proof', spend: 240, conversions: 12, adsets: 1 },
  { audience_type: 'retargeting', angle: 'urgency', spend: 210, conversions: 3, adsets: 1 },
]);
assert(angleCells.length === 2, 'angle matrix parsed');

// ── 4. paid-media-metrics scope=adset_snapshots → AdSetSnapshot[] ─────────────
const window7 = (over: Record<string, number>) => ({
  spend: 0,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
  ...over,
});
const snapshots = z.array(AdSetSnapshotSchema).parse([
  {
    id: 'act_1::adset_gainer',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    audienceType: 'prospecting',
    windows: {
      d3: window7({}),
      d7: window7({ impressions: 8000, clicks: 400, addToCarts: 80, purchases: 20 }),
      d14: window7({}),
    },
  },
  {
    id: 'act_1::adset_loser',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    audienceType: 'retargeting',
    windows: {
      d3: window7({}),
      d7: window7({ impressions: 4000, clicks: 150, addToCarts: 20, purchases: 4 }),
      d14: window7({}),
    },
  },
  {
    id: 'act_1::not_enrolled',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    audienceType: 'unknown',
    windows: {
      d3: window7({}),
      d7: window7({ impressions: 99_999, clicks: 9999, addToCarts: 999, purchases: 99 }),
      d14: window7({}),
    },
  },
]);

// ── 5. paid-media-metrics scope=ad_daily_trends → AdDailyTrend[] ──────────────
const dayPoint = (date: string, over: Record<string, number | null>) => ({
  date,
  spend: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  cpc: 0,
  cpa: 0,
  roas: 0,
  purchases: 0,
  purchase_value: 0,
  ...over,
});
const { ads: trends } = AdDailyTrendsResponseSchema.parse({
  ads: [
    {
      ad_id: 'ad_a',
      ad_name: 'UGC — testimonial',
      series: [
        dayPoint('2026-06-20', { spend: 100, purchase_value: 250, roas: 2.5 }),
        dayPoint('2026-06-21', { spend: 120, purchase_value: 96, roas: 0.8 }),
      ],
    },
    {
      ad_id: 'ad_b',
      ad_name: 'Static — offer',
      series: [
        dayPoint('2026-06-20', { spend: 80, purchase_value: 160, roas: 2 }),
        dayPoint('2026-06-21', { spend: 90, purchase_value: 40, roas: 0.44 }),
      ],
    },
  ],
});

// ── Assertions on the chart-ready outputs ─────────────────────────────────────

// Heat funnel from the ENROLLED ad sets (excludes not_enrolled).
const funnelWindow = sumFunnelWindow(snapshots, ['act_1::adset_gainer', 'act_1::adset_loser']);
assert(
  funnelWindow.impressions === 12_000,
  `funnel impressions summed enrolled only (got ${funnelWindow.impressions})`,
);
const funnel = buildConversionFunnel(funnelWindow, 'purchase');
assert(
  funnel.length === 4 && funnel[0].value === 12_000,
  'funnel has 4 objective stages from the top count',
);
assert(
  funnel[3].displayValue.endsWith('%') && Boolean(funnel[3].color),
  'funnel tail stage shows step % + heat color',
);

// Confidence radar 0–100.
const confidence = RunConfidenceSchema.parse(report.latest_run?.confidence);
const radar = buildConfidenceRadar(confidence, 'var(--success)');
assert(
  radar?.data[0].values.predictiveness === 88 && radar?.data[0].values.score === 72,
  'radar scales 0–1 sub-scores to 0–100',
);

// Pacing verdict + gauge share.
const pace = pacingSnapshot(
  (report.latest_run as unknown as { pacing: Parameters<typeof pacingSnapshot>[0] }).pacing,
);
assert(pace.status === 'on_track', `pacing on_track (got ${pace.status})`);
assert(
  pace.pctSpent != null && Math.round(pace.pctSpent) === 40,
  'pacing gauge shows 40% of period budget',
);

// Hero points enriched + action pins from the report.
const actionsByTs = buildCycleActionMap(report);
const heroPoints = buildCpaHeroPoints(cpaSeries, actionsByTs);
assert(
  heroPoints.length === 4 && heroPoints.at(-1)?.cpa === 25,
  'hero points derive CPA = spend/conv',
);
const awarenessMetric = getOptimizationMetricDefinition('awareness');
const cpmHeroPoints = buildCpaHeroPoints(cpaSeries, {}, awarenessMetric.denominatorMultiplier);
assert(
  awarenessMetric.costLabel === 'CPM' && cpmHeroPoints.at(-1)?.cpa === 25_000,
  'objective metric maps awareness to CPM without changing the conv_d* wire shape',
);
assert(
  (heroPoints.at(-1)?.actions.length ?? 0) >= 2,
  'latest cycle carries reallocation + recommendation pins',
);

// CPA projection heads for the target.
const projection = buildCpaProjection(
  heroPoints.map((p) => ({ date: p.date, cpa: p.cpa })),
  { targetCpa: report.portfolio?.cpa_target ?? null },
);
assert(projectionEndpoint(projection) === 22, 'projection heads to the cpa_target');

// Multi-creative merge + ad-set ROAS profitability.
const { rows, adIds } = mergeAdDailyByMetric(trends, 'spend');
assert(adIds.length === 2 && rows.length === 2, 'two creatives merged across two days');
const roasSeries = adSetRoasSeries(trends);
const pnl = roasBreakevenSeries(roasSeries);
assert(
  pnl.length === 2 && pnl[0].pnl > 0 && pnl[1].pnl < 0,
  'ROAS P&L crosses break-even day 1 → day 2',
);

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`optimizer:viz:bench — FAIL (${failures.length}/${checks})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(
  `optimizer:viz:bench — GREEN · ${checks} chart-ready assertions over contract-parsed reads`,
);
console.log(
  '  covered: cpa_series, cycle report, angle_matrix, adset_snapshots, ad_daily_trends → every new chart transform',
);
console.log(
  '  NOT covered (undeployed): live optimizer service + ad_daily_trends edge network hop — fixtures are contract-valid stand-ins',
);
