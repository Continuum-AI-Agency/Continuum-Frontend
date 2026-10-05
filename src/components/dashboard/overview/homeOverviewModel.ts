// Pure math behind the Home overview: sums the ad accounts in scope into one set of totals,
// and turns an objective into the figure its tile shows (value, change, cost per result, series).
// No fetching here, so every number the Home prints can be checked against its inputs.

import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  type HomeObjectiveMetric,
  type HomeResultTotals,
} from '@continuum/contracts';
import type { PaidAccountOverview } from '@/lib/paid-media/paid-overview.client';

const COUNTED: HomeObjectiveMetric[] = [
  'spend',
  'purchases',
  'purchase_value',
  'conversations',
  'leads',
  'clicks',
  'impressions',
];

export type OverviewTotals = {
  /** Metrics absent from every payload are missing, not zero: an older edge never counted them. */
  current: Partial<Record<HomeObjectiveMetric, number>>;
  previous: Partial<Record<HomeObjectiveMetric, number>>;
  series: Partial<Record<HomeObjectiveMetric, number[]>>;
  accountCount: number;
};

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function currentOf(overview: PaidAccountOverview, metric: HomeObjectiveMetric): number | undefined {
  return finite((overview.metrics as Record<string, unknown>)[metric]);
}

function previousOf(
  overview: PaidAccountOverview,
  metric: HomeObjectiveMetric,
): number | undefined {
  const comparison = overview.comparison ?? {};
  if (metric === 'purchase_value') {
    const roas = finite(comparison.roas?.previous);
    const spend = finite(comparison.spend?.previous);
    return roas !== undefined && spend !== undefined ? roas * spend : undefined;
  }
  return finite(comparison[metric]?.previous);
}

function dailyValue(
  point: Record<string, unknown>,
  metric: HomeObjectiveMetric,
): number | undefined {
  if (metric === 'purchase_value') {
    const roas = finite(point.roas);
    const spend = finite(point.spend);
    return roas !== undefined && spend !== undefined ? roas * spend : undefined;
  }
  return finite(point[metric]);
}

export function sumOverviews(overviews: PaidAccountOverview[]): OverviewTotals {
  const totals: OverviewTotals = {
    current: {},
    previous: {},
    series: {},
    accountCount: overviews.length,
  };

  for (const metric of COUNTED) {
    let current: number | undefined;
    let previous: number | undefined;
    let previousComplete = true;
    const byDate = new Map<string, number>();

    for (const overview of overviews) {
      const value = currentOf(overview, metric);
      if (value !== undefined) current = (current ?? 0) + value;
      const before = previousOf(overview, metric);
      if (before === undefined) previousComplete = false;
      else previous = (previous ?? 0) + before;

      for (const point of overview.trends ?? []) {
        const date = typeof point.date === 'string' ? point.date : null;
        const day = date ? dailyValue(point as Record<string, unknown>, metric) : undefined;
        if (date && day !== undefined) byDate.set(date, (byDate.get(date) ?? 0) + day);
      }
    }

    if (current !== undefined) totals.current[metric] = current;
    if (previous !== undefined && previousComplete) totals.previous[metric] = previous;
    if (byDate.size > 1) {
      totals.series[metric] = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => value);
    }
  }
  return totals;
}

export function resultTotalsOf(totals: OverviewTotals): HomeResultTotals {
  return totals.current;
}

export type CostReading = {
  label: string;
  value: number;
  previous: number | null;
  kind: 'money' | 'ratio';
};

export type ObjectiveFigure = {
  objective: HomeObjective;
  available: boolean;
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  unit: 'count' | 'currency';
  cost: CostReading | null;
  series: number[];
};

function costFor(
  metric: HomeObjectiveMetric,
  value: number | undefined,
  spend: number | undefined,
): number | null {
  if (value === undefined || spend === undefined) return null;
  if (metric === 'purchase_value') return spend > 0 ? value / spend : null;
  if (metric === 'impressions') return value > 0 ? (spend / value) * 1000 : null;
  return value > 0 ? spend / value : null;
}

export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function objectiveFigure(objective: HomeObjective, totals: OverviewTotals): ObjectiveFigure {
  const { metric } = objective;
  const meta = HOME_OBJECTIVE_METRICS[metric];
  const value = totals.current[metric];
  const previous = totals.previous[metric];

  let cost: CostReading | null = null;
  if (meta.costLabel) {
    const now = costFor(metric, value, totals.current.spend);
    if (now !== null) {
      cost = {
        label: meta.costLabel,
        value: now,
        previous: costFor(metric, previous, totals.previous.spend),
        kind: metric === 'purchase_value' ? 'ratio' : 'money',
      };
    }
  }

  return {
    objective,
    available: value !== undefined,
    value: value ?? null,
    previous: previous ?? null,
    deltaPct: deltaPercent(value ?? null, previous ?? null),
    unit: meta.unit,
    cost,
    series: totals.series[metric] ?? [],
  };
}

/** Which ranking KPI orders campaigns and ads for an objective: the count, and its cost. */
export function rankingKpisFor(metric: HomeObjectiveMetric): {
  volume:
    | 'conversions'
    | 'conversations'
    | 'leads'
    | 'conversions_value'
    | 'clicks'
    | 'impressions'
    | 'spend';
  efficiency:
    | 'cost_per_conversion'
    | 'cost_per_conversation'
    | 'cost_per_lead'
    | 'roas'
    | 'cpc'
    | 'cpm'
    | null;
} {
  switch (metric) {
    case 'purchases':
      return { volume: 'conversions', efficiency: 'cost_per_conversion' };
    case 'purchase_value':
      return { volume: 'conversions_value', efficiency: 'roas' };
    case 'conversations':
      return { volume: 'conversations', efficiency: 'cost_per_conversation' };
    case 'leads':
      return { volume: 'leads', efficiency: 'cost_per_lead' };
    case 'clicks':
      return { volume: 'clicks', efficiency: 'cpc' };
    case 'impressions':
      return { volume: 'impressions', efficiency: 'cpm' };
    case 'spend':
      return { volume: 'spend', efficiency: null };
  }
}
