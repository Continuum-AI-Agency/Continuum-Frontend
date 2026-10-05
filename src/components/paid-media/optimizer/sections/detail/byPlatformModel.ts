// The portfolio's "By platform" rows (frontend.html §3, feature 08; §4 for the source rule):
// one text row per platform — cost per result, results and their share, spend and its share,
// state — and no chart; the share column is the comparison a pie would draw worse.
//
// Under 'platform' attribution a row's results are the platform's own KPI. Under GA4 or a
// spreadsheet they are what that source attributed (`conversions`), and the platform's own
// count rides beside them in grey so nobody has to ask which is which.

import {
  metricRatio,
  type PlatformId,
  type PlatformMetricTotals,
  type PortfolioMetrics,
} from '@continuum/contracts';

/** Within ±5% of the target reads as on target: a cent's difference is not news. */
const ON_TARGET_BAND = 0.05;

export type PlatformRowState =
  | { kind: 'on_target'; label: string }
  | { kind: 'under'; label: string }
  | { kind: 'over'; label: string }
  | { kind: 'no_results'; label: string }
  | { kind: 'no_target'; label: string };

export type PlatformRow = {
  platform: PlatformId;
  costPerResult: number | null;
  results: number;
  resultsShare: number | null;
  /** The platform's own count when the source is not the platform; null otherwise. */
  platformResults: number | null;
  spend: number;
  spendShare: number | null;
  state: PlatformRowState;
  /** "2 of 9 delivering" — present is not delivering. */
  delivering: string;
};

export type ByPlatformView = {
  rows: PlatformRow[];
  /** True when the source is GA4 or a spreadsheet: every cost carries its source. */
  sourceIsNotPlatform: boolean;
  /** A portfolio on Meta alone keeps today's screens; the block has nothing to compare. */
  metaOnly: boolean;
};

function resultsOf(row: PlatformMetricTotals, sourceIsNotPlatform: boolean): number {
  return sourceIsNotPlatform ? row.conversions : row.results;
}

function stateOf(
  costPerResult: number | null,
  results: number,
  target: number | null,
): PlatformRowState {
  if (results === 0) return { kind: 'no_results', label: 'no results yet' };
  if (target === null || costPerResult === null)
    return { kind: 'no_target', label: 'no target set' };
  const gap = costPerResult / target - 1;
  if (Math.abs(gap) <= ON_TARGET_BAND) return { kind: 'on_target', label: 'on target' };
  const pct = `${Math.round(Math.abs(gap) * 100)}%`;
  return gap < 0
    ? { kind: 'under', label: `${pct} under target` }
    : { kind: 'over', label: `${pct} over target` };
}

export function buildByPlatform(metrics: PortfolioMetrics): ByPlatformView {
  const sourceIsNotPlatform = metrics.attribution.used !== 'platform';
  const totalResults = metrics.by_platform.reduce(
    (sum, row) => sum + resultsOf(row, sourceIsNotPlatform),
    0,
  );
  const totalSpend = metrics.by_platform.reduce((sum, row) => sum + row.spend, 0);
  const rows = metrics.by_platform.map((row): PlatformRow => {
    const results = resultsOf(row, sourceIsNotPlatform);
    const costPerResult = sourceIsNotPlatform
      ? metricRatio(row.spend, results)
      : row.cost_per_result;
    return {
      platform: row.platform,
      costPerResult,
      results,
      resultsShare: metricRatio(results, totalResults),
      platformResults: sourceIsNotPlatform ? row.results : null,
      spend: row.spend,
      spendShare: metricRatio(row.spend, totalSpend),
      state: stateOf(costPerResult, results, metrics.target.cpa),
      delivering: `${row.delivering_entities} of ${row.entities} delivering`,
    };
  });
  const metaOnly = rows.every((row) => row.platform === 'meta');
  return { rows, sourceIsNotPlatform, metaOnly };
}

export function formatShare(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`;
}

/** Results print whole unless the platform reports fractions (Google's conversions). */
export function formatResults(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
