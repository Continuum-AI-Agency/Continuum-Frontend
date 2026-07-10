// Pure data transforms behind the NEW optimizer visualizations (heat funnel, score
// radar, ROAS profit/loss, CPA projection, pacing gauge). Kept separate from
// chartData.ts so they can be unit-benched against real-shaped optimizer data
// without a DOM, and so the existing transforms stay untouched. Every derivation
// matches how the engine/reporting layer computes the number (CPA = spend/conv,
// ROAS = value/spend) so the charts never disagree with what agents/MCP report.

import type {
  AdDailyTrend,
  CpaSeriesPoint,
  ParsedCycleRunReport,
  RunConfidence,
} from '@continuum/contracts';
import { intFmt } from '@/components/charts/chart-formatters';
import { buildProjectionPath, type ProjectionPoint } from '@/components/charts/projection-utils';
import { deriveEfficiency } from '../format';
import type { CpaTrendPoint } from './chartData';
import { stepHeatFill } from './vizTokens';

// ── Conversion heat funnel ───────────────────────────────────────────────────
// Objective-aware funnel: the ordered events that lead to the objective's KPI,
// read from an AdSetSnapshot window (or a portfolio-summed window). Each stage
// past the first shows its step conversion rate (this stage / previous) and is
// heat-colored by that rate (green = high pass-through, red = big drop-off). The
// top stage shows its absolute count. Stages with a zero upstream are still
// rendered (value 0) so the shape reads honestly instead of vanishing.

/** The event counts a funnel can draw from — a loose subset of engine WindowMetrics. */
export type FunnelWindow = {
  impressions?: number | null;
  clicks?: number | null;
  addToCarts?: number | null;
  purchases?: number | null;
  leads?: number | null;
  appInstalls?: number | null;
  signups?: number | null;
  landingPageViews?: number | null;
  reach?: number | null;
};

export type FunnelStageOut = {
  label: string;
  value: number;
  displayValue: string;
  /** Per-stage heat fill (undefined on the top stage — it has no prior to rate). */
  color?: string;
};

type FunnelStep = { key: keyof FunnelWindow; label: string };

const IMPRESSIONS: FunnelStep = { key: 'impressions', label: 'Impressions' };
const CLICKS: FunnelStep = { key: 'clicks', label: 'Clicks' };

/** Ordered funnel steps per objective. Falls back to the purchase funnel. */
const FUNNEL_STEPS: Record<string, FunnelStep[]> = {
  purchase: [
    IMPRESSIONS,
    CLICKS,
    { key: 'addToCarts', label: 'Add to cart' },
    { key: 'purchases', label: 'Purchases' },
  ],
  lead: [IMPRESSIONS, CLICKS, { key: 'leads', label: 'Leads' }],
  signup: [IMPRESSIONS, CLICKS, { key: 'signups', label: 'Sign-ups' }],
  app_install: [IMPRESSIONS, CLICKS, { key: 'appInstalls', label: 'Installs' }],
  traffic: [IMPRESSIONS, CLICKS, { key: 'landingPageViews', label: 'Landing views' }],
  awareness: [IMPRESSIONS, { key: 'reach', label: 'Reach' }],
};

export function funnelStepsFor(objective: string | null | undefined): FunnelStep[] {
  return FUNNEL_STEPS[(objective ?? '').toLowerCase()] ?? FUNNEL_STEPS.purchase;
}

/** Build objective-aware funnel stages with step conversion % + heat color. */
export function buildConversionFunnel(
  window: FunnelWindow,
  objective: string | null | undefined,
): FunnelStageOut[] {
  const steps = funnelStepsFor(objective);
  const values = steps.map((step) => Math.max(0, Math.round(Number(window[step.key] ?? 0))));

  return steps.map((step, index) => {
    if (index === 0) {
      return { label: step.label, value: values[index], displayValue: intFmt(values[index]) };
    }
    const prev = values[index - 1];
    const rate = prev > 0 ? values[index] / prev : 0;
    return {
      label: step.label,
      value: values[index],
      displayValue: `${Math.round(rate * 100)}%`,
      color: stepHeatFill(rate),
    };
  });
}

// ── Confidence radar ─────────────────────────────────────────────────────────
// The cycle Confidence score decomposed onto a radar so an operator sees WHY a
// run is trusted or not: predictiveness (is this objective's KPI even predictive
// of future CPA), sample size (enough events), consistency (do the 3/7/14d
// windows agree), and the composite overall. All four are already 0–1, scaled to
// the radar's 0–100 domain.

export type RadarMetricT = { key: string; label: string };
export type RadarDatumT = { label: string; color: string; values: Record<string, number> };

const CONFIDENCE_METRICS: RadarMetricT[] = [
  { key: 'predictiveness', label: 'Predictive' },
  { key: 'sampleSize', label: 'Sample' },
  { key: 'consistency', label: 'Consistent' },
  { key: 'score', label: 'Overall' },
];

const clamp01to100 = (value: number | undefined): number =>
  Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)));

/** RunConfidence → radar {metrics, one series}. Returns null when the row carries
 *  no confidence signal at all (so the caller renders an empty state). `color`
 *  lets the caller pass the band accent. */
export function buildConfidenceRadar(
  confidence: RunConfidence | null | undefined,
  color = 'var(--chart-1)',
): { metrics: RadarMetricT[]; data: RadarDatumT[] } | null {
  if (!confidence) return null;
  const anySignal = [
    confidence.score,
    confidence.predictiveness,
    confidence.sampleSize,
    confidence.consistency,
  ].some((value) => typeof value === 'number');
  if (!anySignal) return null;

  return {
    metrics: CONFIDENCE_METRICS,
    data: [
      {
        label: 'This cycle',
        color,
        values: {
          predictiveness: clamp01to100(confidence.predictiveness),
          sampleSize: clamp01to100(confidence.sampleSize),
          consistency: clamp01to100(confidence.consistency),
          score: clamp01to100(confidence.score),
        },
      },
    ],
  };
}

// ── ROAS profit / loss ───────────────────────────────────────────────────────
// The ProfitLossLine colors above/below a HARDCODED zero baseline, so to show
// "ROAS vs break-even" we shift the series to a P&L number: pnl = roas - breakeven
// (default 1.0 = spend break-even). Above 0 = profitable (green), below = losing.

export type RoasPoint = { date: string | Date; roas: number };
export type ProfitPoint = { date: Date; pnl: number; roas: number };

export function roasBreakevenSeries(points: RoasPoint[], breakeven = 1): ProfitPoint[] {
  return points
    .map((point) => ({
      date: point.date instanceof Date ? point.date : new Date(point.date),
      roas: point.roas,
      pnl: point.roas - breakeven,
    }))
    .filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.pnl))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ── CPA projection ───────────────────────────────────────────────────────────
// Forecast the CPA trajectory a few cycles forward. When a target CPA is known
// (portfolio.cpa_target) the projection heads for it (mode "target"); otherwise
// it extends the recent trend (linear regression). Returns the anchor + horizon
// points the <ProjectionLine> renders as a dashed continuation.

export function buildCpaProjection(
  points: CpaTrendPoint[],
  opts: { horizonPoints?: number; targetCpa?: number | null } = {},
): ProjectionPoint[] {
  if (points.length < 2) return [];
  const horizonPoints = opts.horizonPoints ?? 3;
  const target = opts.targetCpa;
  return buildProjectionPath({
    sourceData: points as unknown as Record<string, unknown>[],
    seriesKey: 'cpa',
    xDataKey: 'date',
    mode: typeof target === 'number' && target > 0 ? 'target' : 'auto',
    autoMethod: 'linearRegression',
    horizonPoints,
    endValue: typeof target === 'number' && target > 0 ? target : undefined,
  });
}

/** Projected CPA endpoint (last point of the projection) — for the "$X → $Y" label. */
export function projectionEndpoint(projection: ProjectionPoint[]): number | null {
  const last = projection.at(-1);
  return last ? Math.round(last.value) : null;
}

// ── Pacing snapshot ──────────────────────────────────────────────────────────
// Reduces the engine PacingResult + PacingState (loose jsonb on the run) to the
// three numbers the pacing gauge needs: how much of the period budget is spent,
// the pace ratio vs the ideal burn line, and the projected end-of-period spend.

export type PacingInput = {
  actualSpendToDate?: number | null;
  idealCumulative?: number | null;
  pacingRatio?: number | null;
  periodBudget?: number | null;
  dayIndex?: number | null;
  periodDays?: number | null;
};

export type PacingSnapshot = {
  /** 0–100 for the gauge — share of the period budget spent so far. */
  pctSpent: number | null;
  ratio: number | null;
  status: 'on_track' | 'underpacing' | 'overpacing' | 'unknown';
  projectedEndSpend: number | null;
};

export function pacingSnapshot(input: PacingInput): PacingSnapshot {
  const spent = numeric(input.actualSpendToDate);
  const ideal = numeric(input.idealCumulative);
  const budget = numeric(input.periodBudget);
  const dayIndex = numeric(input.dayIndex);
  const periodDays = numeric(input.periodDays);

  const ratio =
    numeric(input.pacingRatio) ??
    (ideal != null && ideal > 0 && spent != null ? spent / ideal : null);

  let status: PacingSnapshot['status'] = 'unknown';
  if (ratio != null) {
    if (ratio > 1.1) status = 'overpacing';
    else if (ratio < 0.9) status = 'underpacing';
    else status = 'on_track';
  }

  const pctSpent =
    budget != null && budget > 0 && spent != null
      ? Math.max(0, Math.min(100, (spent / budget) * 100))
      : null;

  const projectedEndSpend =
    spent != null && dayIndex != null && dayIndex > 0 && periodDays != null
      ? Math.round((spent / dayIndex) * periodDays)
      : null;

  return { pctSpent, ratio, status, projectedEndSpend };
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ── Hero timeline points + action pins ───────────────────────────────────────
// The Portfolio-detail hero is a CPA timeline where hovering a cycle shows its
// metrics AND the optimizer actions taken that cycle (the screenshot pattern:
// metrics + pinned events in one card). buildCpaHeroPoints enriches each cycle
// with the spend/conversions behind the CPA and the action labels for its date;
// buildCycleActionMap extracts those labels from the parsed report.

export type CpaHeroPoint = {
  date: Date;
  cpa: number;
  spend: number;
  /** Spend is normalized onto the cost scale only for the shared-axis bar layer.
   * Tooltips always expose the unscaled spend value. */
  spendIndex: number;
  conv: number;
  ts: string;
  actions: string[];
};

export function buildCpaHeroPoints(
  series: CpaSeriesPoint[],
  actionsByTs: Record<string, string[]> = {},
  denominatorMultiplier = 1,
): CpaHeroPoint[] {
  const actual = series
    .map((point) => ({
      ts: point.cycle_ts,
      spend: point.spend_d7,
      conv: point.conv_d7,
      cpa: deriveEfficiency(point.spend_d7, point.conv_d7, denominatorMultiplier),
    }))
    .filter(
      (point): point is { ts: string; spend: number; conv: number; cpa: number } =>
        point.cpa != null,
    )
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .map((point) => ({
      date: new Date(point.ts),
      cpa: Math.round(point.cpa),
      spend: Math.round(point.spend),
      conv: point.conv,
      ts: point.ts,
      actions: actionsByTs[point.ts] ?? [],
    }));

  const maxSpend = Math.max(...actual.map((point) => point.spend), 1);
  const maxCost = Math.max(...actual.map((point) => point.cpa), 1);
  return actual.map((point) => ({
    ...point,
    spendIndex: (point.spend / maxSpend) * maxCost,
  }));
}

/** Optimizer actions per cycle from a parsed report, keyed by the run's cycle_ts,
 *  so the hero can pin them onto the timeline. The latest run contributes a
 *  reallocation summary (how many ad sets moved up/down); pending recommendations
 *  contribute their kind + ad set. */
export function buildCycleActionMap(report: ParsedCycleRunReport | null): Record<string, string[]> {
  const ts = report?.latest_run?.cycle_ts;
  if (!ts) return {};

  const actions: string[] = [];
  const gainers = report.latest_items.filter((item) => (item.change_abs ?? 0) > 0).length;
  const losers = report.latest_items.filter((item) => (item.change_abs ?? 0) < 0).length;
  if (gainers > 0 || losers > 0) {
    actions.push(`Reallocated · ↑${gainers} ↓${losers}`);
  }
  for (const rec of report.recommendations) {
    const shortId = rec.adset_id.split('::').pop() ?? rec.adset_id;
    actions.push(`${rec.kind.replace(/_/g, ' ')} · ${shortId}`);
  }

  return actions.length > 0 ? { [ts]: actions } : {};
}

// ── Multi-creative ad-set timeline ───────────────────────────────────────────
// TradingView-style: plot ONE metric for several creatives on one chart, each
// creative its own line keyed by ad_id. mergeAdDailyByMetric pivots the per-ad
// daily series into wide rows the AreaChart consumes (one row per date, one column
// per ad). Null cost-per-event days (cpa/roas) read as 0 so a gap doesn't fake a
// value; spend/ctr are always present.

export type AdMetric = 'spend' | 'cpa' | 'roas' | 'ctr';

export function mergeAdDailyByMetric(
  trends: AdDailyTrend[],
  metric: AdMetric,
): { rows: Record<string, unknown>[]; adIds: string[] } {
  const adIds = trends.filter((trend) => trend.series.length > 0).map((trend) => trend.ad_id);
  const byDate = new Map<string, Record<string, unknown>>();

  for (const trend of trends) {
    for (const point of trend.series) {
      const row = byDate.get(point.date) ?? { date: new Date(point.date) };
      const raw = point[metric];
      row[trend.ad_id] = typeof raw === 'number' ? raw : 0;
      byDate.set(point.date, row);
    }
  }

  const rows = [...byDate.values()].sort(
    (a, b) => (a.date as Date).getTime() - (b.date as Date).getTime(),
  );
  return { rows, adIds };
}

// ── Composition helpers ──────────────────────────────────────────────────────

const FUNNEL_KEYS: (keyof FunnelWindow)[] = [
  'impressions',
  'clicks',
  'addToCarts',
  'purchases',
  'leads',
  'appInstalls',
  'signups',
  'landingPageViews',
  'reach',
];

/** Sum the 7-day WindowMetrics of a portfolio's ENROLLED ad sets into one funnel
 *  window. Snapshots are account-wide; the enrolled ids scope them to this
 *  portfolio so the funnel reflects only the ad sets the optimizer manages. */
export function sumFunnelWindow(
  snapshots: { id: string; windows?: { d7?: FunnelWindow } | null }[],
  enrolledIds: Iterable<string>,
): FunnelWindow {
  const ids = new Set(enrolledIds);
  const out: FunnelWindow = {};
  for (const snapshot of snapshots) {
    if (!ids.has(snapshot.id)) continue;
    const window = snapshot.windows?.d7;
    if (!window) continue;
    for (const key of FUNNEL_KEYS) {
      out[key] = (out[key] ?? 0) + (window[key] ?? 0);
    }
  }
  return out;
}

/** Aggregate per-ad daily trends into one ad-set ROAS series (Σvalue / Σspend per
 *  day), for the drill-in ROAS profitability line. */
export function adSetRoasSeries(trends: AdDailyTrend[]): { date: string; roas: number }[] {
  const byDate = new Map<string, { spend: number; value: number }>();
  for (const trend of trends) {
    for (const point of trend.series) {
      const acc = byDate.get(point.date) ?? { spend: 0, value: 0 };
      acc.spend += point.spend;
      acc.value += point.purchase_value;
      byDate.set(point.date, acc);
    }
  }
  return [...byDate.entries()]
    .map(([date, { spend, value }]) => ({ date, roas: spend > 0 ? value / spend : 0 }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
