// Within-platform (and selection-wide) blend of organic account snapshots.
// Same ingestion data as Account view — pure math over SnapshotAccountResult[].
// Summable metrics: sum totals and align daily trends. Rates/stock: unsupported.

import type {
  MetricComparison,
  OrganicMetricId,
  OrganicMetricPlatform,
  OrganicMetrics,
} from '@continuum/contracts';
import { getOrganicMetric, isMetricAvailableOnPlatform } from '@continuum/contracts';
import {
  metricValueForAccount,
  type SnapshotAccountResult,
  type TrendSeriesPoint,
  trendSeriesForMetric,
} from '@/lib/organic/brandOrganicSnapshot';

export type SeriesMode = 'decompose' | 'blend' | 'both';

export type ChartSeriesKind = 'account' | 'platform_blend' | 'selection_blend';

export type ChartSeriesDef = {
  key: string;
  kind: ChartSeriesKind;
  label: string;
  platform?: OrganicMetricPlatform;
  color: string;
  dashed: boolean;
  points: TrendSeriesPoint[];
};

export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'hsl(var(--primary))',
] as const;

export const BLEND_COLOR = 'var(--foreground)';

export function accountSeriesKey(
  platform: OrganicMetricPlatform,
  integrationAccountId: string,
): string {
  return `${platform}:${integrationAccountId}`;
}

export function platformBlendKey(platform: OrganicMetricPlatform): string {
  return `blend:${platform}`;
}

export const SELECTION_BLEND_KEY = 'blend:selection';

export type BlendMetricResult =
  | {
      kind: 'sum';
      total: number;
      comparison: MetricComparison | null;
      trends: TrendSeriesPoint[];
    }
  | { kind: 'unsupported' };

function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function isSummable(metricId: OrganicMetricId): boolean {
  return getOrganicMetric(metricId)?.summable === true;
}

/** Sum daily series across accounts; missing day on an account contributes 0. */
export function blendTrendSeries(
  accounts: SnapshotAccountResult[],
  metricId: OrganicMetricId,
): TrendSeriesPoint[] {
  if (!isSummable(metricId) || accounts.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const account of accounts) {
    if (!isMetricAvailableOnPlatform(metricId, account.platform)) continue;
    for (const point of trendSeriesForMetric(account, metricId)) {
      byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.value);
    }
  }

  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Blend one metric across accounts.
 * Prefer accounts that share a platform for within-platform blend; works for
 * mixed platforms when the metric is available on each contributor.
 */
export function blendMetric(
  accounts: SnapshotAccountResult[],
  metricId: OrganicMetricId,
): BlendMetricResult {
  if (!isSummable(metricId)) return { kind: 'unsupported' };
  if (accounts.length === 0) return { kind: 'unsupported' };

  const eligible = accounts.filter((account) =>
    isMetricAvailableOnPlatform(metricId, account.platform),
  );
  if (eligible.length === 0) return { kind: 'unsupported' };

  let total = 0;
  let hasTotal = false;
  let previousSum = 0;
  let hasPrevious = false;

  for (const account of eligible) {
    const value = metricValueForAccount(account, metricId);
    if (value !== undefined) {
      total += value;
      hasTotal = true;
    }
    const cmp = account.comparison?.[metricId];
    if (cmp && typeof cmp.previous === 'number' && Number.isFinite(cmp.previous)) {
      previousSum += cmp.previous;
      hasPrevious = true;
    } else if (cmp && typeof cmp.current === 'number' && Number.isFinite(cmp.current)) {
      // Fall back: if only current is known, still accumulate previous when present
      // via current-only rows as 0 previous would skew — skip incomplete rows.
    }
  }

  if (!hasTotal) return { kind: 'unsupported' };

  // Prefer summing comparison.current when present (should match headline totals).
  let currentFromCmp = 0;
  let cmpCurrentCount = 0;
  for (const account of eligible) {
    const cmp = account.comparison?.[metricId];
    if (cmp && typeof cmp.current === 'number' && Number.isFinite(cmp.current)) {
      currentFromCmp += cmp.current;
      cmpCurrentCount += 1;
    }
  }
  const current = cmpCurrentCount === eligible.length ? currentFromCmp : total;

  const comparison: MetricComparison | null =
    hasPrevious && cmpCurrentCount === eligible.length
      ? {
          current,
          previous: previousSum,
          percentageChange: percentageChange(current, previousSum),
        }
      : null;

  return {
    kind: 'sum',
    total: current,
    comparison,
    trends: blendTrendSeries(eligible, metricId),
  };
}

export function groupAccountsByPlatform(
  accounts: SnapshotAccountResult[],
): Map<OrganicMetricPlatform, SnapshotAccountResult[]> {
  const map = new Map<OrganicMetricPlatform, SnapshotAccountResult[]>();
  for (const account of accounts) {
    const list = map.get(account.platform) ?? [];
    list.push(account);
    map.set(account.platform, list);
  }
  return map;
}

/** Within-platform blend: all accounts must be the same platform (or empty). */
export function blendPlatformAccounts(
  accounts: SnapshotAccountResult[],
  metricId: OrganicMetricId,
): BlendMetricResult {
  if (accounts.length === 0) return { kind: 'unsupported' };
  const platform = accounts[0]!.platform;
  if (!accounts.every((a) => a.platform === platform)) {
    // Still blend only same-platform subset
    const same = accounts.filter((a) => a.platform === platform);
    return blendMetric(same, metricId);
  }
  return blendMetric(accounts, metricId);
}

export type BlendSnapshotRow = {
  platform: OrganicMetricPlatform;
  accountCount: number;
  metrics: Partial<Record<OrganicMetricId, number>>;
  comparisons: Partial<Record<OrganicMetricId, MetricComparison>>;
};

export function blendAccountSnapshot(
  accounts: SnapshotAccountResult[],
  metricIds: OrganicMetricId[],
): BlendSnapshotRow | null {
  if (accounts.length === 0) return null;
  const platform = accounts[0]!.platform;
  const same = accounts.filter((a) => a.platform === platform);
  const metrics: Partial<Record<OrganicMetricId, number>> = {};
  const comparisons: Partial<Record<OrganicMetricId, MetricComparison>> = {};

  for (const metricId of metricIds) {
    const result = blendMetric(same, metricId);
    if (result.kind !== 'sum') continue;
    metrics[metricId] = result.total;
    if (result.comparison) comparisons[metricId] = result.comparison;
  }

  return {
    platform,
    accountCount: same.length,
    metrics,
    comparisons,
  };
}

const PLATFORM_LABELS: Record<OrganicMetricPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

export function buildSeriesSet(input: {
  accounts: SnapshotAccountResult[];
  metricId: OrganicMetricId;
  mode: SeriesMode;
  /** Stable color index by account key */
  colorByKey?: Map<string, string>;
}): { series: ChartSeriesDef[]; chartRows: Array<Record<string, number | string>> } {
  const { accounts, metricId, mode, colorByKey } = input;
  const series: ChartSeriesDef[] = [];

  const colorFor = (key: string, index: number) =>
    colorByKey?.get(key) ?? SERIES_COLORS[index % SERIES_COLORS.length]!;

  if (mode === 'decompose' || mode === 'both') {
    accounts.forEach((account, index) => {
      if (!isMetricAvailableOnPlatform(metricId, account.platform)) return;
      const key = accountSeriesKey(account.platform, account.integrationAccountId);
      const points = trendSeriesForMetric(account, metricId);
      if (points.length === 0) return;
      series.push({
        key,
        kind: 'account',
        label: `${PLATFORM_LABELS[account.platform]} · ${account.name}`,
        platform: account.platform,
        color: colorFor(key, index),
        dashed: false,
        points,
      });
    });
  }

  if (mode === 'blend' || mode === 'both') {
    const byPlatform = groupAccountsByPlatform(accounts);
    let blendIndex = 0;
    for (const [platform, platformAccounts] of byPlatform) {
      if (platformAccounts.length < 1) continue;
      if (!isMetricAvailableOnPlatform(metricId, platform)) continue;

      // Single-account platforms still produce a platform_blend series so the
      // Blend tab is never empty — identity with that account's metrics.
      // In Both mode with one account, skip the duplicate dashed line.
      if (platformAccounts.length === 1) {
        if (mode === 'both') continue;
        const only = platformAccounts[0]!;
        const key = platformBlendKey(platform);
        const points = trendSeriesForMetric(only, metricId);
        if (points.length === 0) continue;
        series.push({
          key,
          kind: 'platform_blend',
          label: `${PLATFORM_LABELS[platform]} (all)`,
          platform,
          color: colorFor(key, accounts.length + blendIndex),
          dashed: true,
          points,
        });
        blendIndex += 1;
        continue;
      }

      const blended = blendMetric(platformAccounts, metricId);
      if (blended.kind !== 'sum' || blended.trends.length === 0) continue;
      const key = platformBlendKey(platform);
      series.push({
        key,
        kind: 'platform_blend',
        label: `${PLATFORM_LABELS[platform]} (all · ${platformAccounts.length})`,
        platform,
        color: colorFor(key, accounts.length + blendIndex),
        dashed: true,
        points: blended.trends,
      });
      blendIndex += 1;
    }

    // Selection-wide blend: multi-platform, or single-platform multi-account.
    // One account total → selection blend is identity; only emit in Blend mode
    // so the user can still pick "top-level blend" and see the same numbers.
    if (byPlatform.size > 1 || accounts.length >= 2) {
      const blended = blendMetric(accounts, metricId);
      if (blended.kind === 'sum' && blended.trends.length > 0) {
        series.push({
          key: SELECTION_BLEND_KEY,
          kind: 'selection_blend',
          label: 'All selected (Σ)',
          color: BLEND_COLOR,
          dashed: true,
          points: blended.trends,
        });
      }
    } else if (mode === 'blend' && accounts.length === 1) {
      const only = accounts[0]!;
      if (isMetricAvailableOnPlatform(metricId, only.platform)) {
        const points = trendSeriesForMetric(only, metricId);
        if (points.length > 0) {
          series.push({
            key: SELECTION_BLEND_KEY,
            kind: 'selection_blend',
            label: 'All selected (Σ)',
            color: BLEND_COLOR,
            dashed: true,
            points,
          });
        }
      }
    }
  }

  // Merge points into chart rows
  const byDate = new Map<string, Record<string, number | string>>();
  for (const def of series) {
    for (const point of def.points) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[def.key] = point.value;
      byDate.set(point.date, row);
    }
  }
  const chartRows = Array.from(byDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  return { series, chartRows };
}

/** Assign stable colors for account keys in a fixed order. */
export function assignSeriesColors(keys: string[]): Map<string, string> {
  const map = new Map<string, string>();
  keys.forEach((key, index) => {
    map.set(key, SERIES_COLORS[index % SERIES_COLORS.length]!);
  });
  return map;
}

export function blendedMetricsBag(accounts: SnapshotAccountResult[]): OrganicMetrics {
  const out: OrganicMetrics = {};
  if (accounts.length === 0) return out;

  const metricIds = new Set<OrganicMetricId>();
  for (const account of accounts) {
    for (const key of Object.keys(account.metrics) as OrganicMetricId[]) {
      metricIds.add(key);
    }
  }

  for (const metricId of metricIds) {
    const result = blendMetric(accounts, metricId);
    if (result.kind === 'sum') {
      (out as Record<string, number>)[metricId] = result.total;
    }
  }
  return out;
}
