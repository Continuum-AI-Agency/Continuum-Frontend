// The objective/cost recap over the dashboard's chosen range.
//
// Sums the enrolled ad sets' DAILY series (already on the account-snapshot read) between
// the range's dates, and the same for the prior window, so "spend / results / cost per
// result" carry a real "vs previous period" delta instead of a hardcoded 7- or 14-day
// window nobody chose. When the daily series is absent (older snapshot rows) the recap
// falls back to the engine window nearest the range and says so — a number with its
// window named beats a blank tile.

import type { OptimizationMetricDefinition } from '@continuum/contracts';
import { deriveEfficiency } from '../../format';
import type { ResolvedRange } from './rangeModel';

export type RecapDay = { date: string; spend: number; results: number };

export type RecapTotals = {
  spend: number;
  results: number;
  impressions: number;
  clicks: number;
  /** Cost per result in the metric's display unit (CPM already ×1000), null with 0 results. */
  costPerResult: number | null;
  /** Days with at least one row — how much of the range the data actually covers. */
  daysCovered: number;
};

export type RecapModel = {
  source: 'daily' | 'window' | 'none';
  /** The window used when `source === 'window'`. */
  windowUsed: 'd3' | 'd7' | 'd14' | null;
  current: RecapTotals;
  previous: RecapTotals | null;
  /** Per-day series for sparklines (current range only, gaps filled with zeros). */
  series: RecapDay[];
  /** Fractional change vs previous (0.12 = +12%); null when previous is empty. */
  delta: { spend: number | null; results: number | null; costPerResult: number | null };
  /** cost / target − 1 (0.1 = 10% above target); null without a target or cost. */
  vsTarget: number | null;
};

/** Loose structural inputs: zod-inferred WindowMetrics / DailyMetrics (type aliases, so
 *  their implicit index signature applies), partial test fixtures and older rows all fit. */
type WindowLike = { [key: string]: number | null | undefined };
type DayLike = { date: string } & { [key: string]: string | number | null | undefined };
export type RecapSnapshot = {
  id: string;
  windows?: Partial<Record<'d3' | 'd7' | 'd14', WindowLike | null>> | null;
  daily?: ReadonlyArray<DayLike> | null;
};
type SnapshotLike = RecapSnapshot;

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyTotals(): RecapTotals {
  return { spend: 0, results: 0, impressions: 0, clicks: 0, costPerResult: null, daysCovered: 0 };
}

function finish(totals: RecapTotals, metric: OptimizationMetricDefinition): RecapTotals {
  return {
    ...totals,
    costPerResult: deriveEfficiency(totals.spend, totals.results, metric.denominatorMultiplier),
  };
}

function sumDaily(
  snapshots: SnapshotLike[],
  ids: Set<string>,
  from: string,
  to: string,
  kpiField: string,
): { totals: RecapTotals; byDate: Map<string, RecapDay>; sawDaily: boolean } {
  const totals = emptyTotals();
  const byDate = new Map<string, RecapDay>();
  let sawDaily = false;
  for (const snapshot of snapshots) {
    if (!ids.has(snapshot.id)) continue;
    const daily = snapshot.daily;
    if (!daily || daily.length === 0) continue;
    sawDaily = true;
    for (const day of daily) {
      if (day.date < from || day.date > to) continue;
      const spend = num(day.spend);
      const results = num(day[kpiField]);
      totals.spend += spend;
      totals.results += results;
      totals.impressions += num(day.impressions);
      totals.clicks += num(day.clicks);
      const acc = byDate.get(day.date) ?? { date: day.date, spend: 0, results: 0 };
      acc.spend += spend;
      acc.results += results;
      byDate.set(day.date, acc);
    }
  }
  totals.daysCovered = byDate.size;
  return { totals, byDate, sawDaily };
}

function sumWindow(
  snapshots: SnapshotLike[],
  ids: Set<string>,
  window: 'd3' | 'd7' | 'd14',
  kpiField: string,
): RecapTotals | null {
  const totals = emptyTotals();
  let saw = false;
  for (const snapshot of snapshots) {
    if (!ids.has(snapshot.id)) continue;
    const w = snapshot.windows?.[window];
    if (!w) continue;
    saw = true;
    totals.spend += num(w.spend);
    totals.results += num(w[kpiField]);
    totals.impressions += num(w.impressions);
    totals.clicks += num(w.clicks);
  }
  return saw ? totals : null;
}

function ratio(current: number, previous: number | null | undefined): number | null {
  if (previous == null || previous <= 0) return null;
  return current / previous - 1;
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return out;
}

export function buildRecap(args: {
  snapshots: SnapshotLike[];
  enrolledIds: Iterable<string>;
  range: ResolvedRange;
  metric: OptimizationMetricDefinition;
  /** Target in the metric's DISPLAY unit (e.g. CPM), like the cost it is compared to. */
  target: number | null | undefined;
}): RecapModel {
  const { snapshots, range, metric } = args;
  const ids = new Set(args.enrolledIds);
  const kpiField = metric.kpiField;

  const current = sumDaily(snapshots, ids, range.from, range.to, kpiField);
  let model: RecapModel;
  if (current.sawDaily) {
    const previous = range.previous
      ? sumDaily(snapshots, ids, range.previous.from, range.previous.to, kpiField)
      : null;
    const cur = finish(current.totals, metric);
    const prev =
      previous && previous.totals.daysCovered > 0 ? finish(previous.totals, metric) : null;
    model = {
      source: 'daily',
      windowUsed: null,
      current: cur,
      previous: prev,
      series: eachDay(range.from, range.to).map(
        (date) => current.byDate.get(date) ?? { date, spend: 0, results: 0 },
      ),
      delta: {
        spend: ratio(cur.spend, prev?.spend),
        results: ratio(cur.results, prev?.results),
        costPerResult:
          cur.costPerResult != null && prev?.costPerResult != null
            ? cur.costPerResult / prev.costPerResult - 1
            : null,
      },
      vsTarget: null,
    };
  } else {
    const windowTotals = sumWindow(snapshots, ids, range.window, kpiField);
    model = {
      source: windowTotals ? 'window' : 'none',
      windowUsed: windowTotals ? range.window : null,
      current: windowTotals ? finish(windowTotals, metric) : emptyTotals(),
      previous: null,
      series: [],
      delta: { spend: null, results: null, costPerResult: null },
      vsTarget: null,
    };
  }

  const target = args.target;
  if (target != null && target > 0 && model.current.costPerResult != null) {
    model.vsTarget = model.current.costPerResult / target - 1;
  }
  return model;
}
