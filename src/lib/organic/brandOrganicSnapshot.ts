// Brand-level organic snapshot for the Compare metrics view.
// Fans out over the SAME existing ingestion path (fetchOrganicAnalytics /
// organic-analytics edge) — no new producer. Cache-first by default.

import type {
  MetricComparison,
  OrganicMetricId,
  OrganicMetricPlatform,
  OrganicMetrics,
} from '@continuum/contracts';
import { getOrganicMetric, isMetricAvailableOnPlatform } from '@continuum/contracts';
import {
  fetchOrganicAnalytics,
  type OrganicAnalyticsRequest,
} from '@/lib/api/organicAnalytics.client';
import type { OrganicDateRangePreset, OrganicMetricsResponse } from '@/lib/schemas/organicMetrics';

export type SnapshotAccountRef = {
  platform: OrganicMetricPlatform;
  integrationAccountId: string;
  name: string;
};

export type SnapshotAccountResult = SnapshotAccountRef & {
  status: 'ok';
  metrics: OrganicMetrics;
  comparison: Record<string, MetricComparison> | null | undefined;
  trends: OrganicMetricsResponse['trends'];
  range: OrganicMetricsResponse['range'];
  fetchedAt?: string;
};

export type SnapshotAccountMissing = SnapshotAccountRef & {
  status: 'error';
  message: string;
};

export type BrandOrganicSnapshot = {
  accounts: SnapshotAccountResult[];
  missing: SnapshotAccountMissing[];
  loadedAt: string;
};

const DEFAULT_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export type LoadBrandOrganicSnapshotInput = {
  brandId: string;
  accounts: SnapshotAccountRef[];
  rangePreset: OrganicDateRangePreset;
  forceRefresh?: boolean;
  concurrency?: number;
  /** Injected for tests; defaults to fetchOrganicAnalytics. */
  fetchAccount?: (request: OrganicAnalyticsRequest) => Promise<OrganicMetricsResponse>;
};

export async function loadBrandOrganicSnapshot(
  input: LoadBrandOrganicSnapshotInput,
): Promise<BrandOrganicSnapshot> {
  const {
    brandId,
    accounts,
    rangePreset,
    forceRefresh = false,
    concurrency = DEFAULT_CONCURRENCY,
    fetchAccount = fetchOrganicAnalytics,
  } = input;

  const rows = await mapPool(accounts, concurrency, async (account) => {
    try {
      const data = await fetchAccount({
        brandId,
        integrationAccountId: account.integrationAccountId,
        platform: account.platform,
        range: { preset: rangePreset },
        scope: 'kpis',
        forceRefresh,
      });
      const ok: SnapshotAccountResult = {
        ...account,
        status: 'ok',
        metrics: data.metrics,
        comparison: data.comparison,
        trends: data.trends,
        range: data.range,
        fetchedAt: data.fetchedAt,
      };
      return ok;
    } catch (error) {
      const missing: SnapshotAccountMissing = {
        ...account,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unable to load organic analytics.',
      };
      return missing;
    }
  });

  const ok: SnapshotAccountResult[] = [];
  const missing: SnapshotAccountMissing[] = [];
  for (const row of rows) {
    if (row.status === 'ok') ok.push(row);
    else missing.push(row);
  }

  return { accounts: ok, missing, loadedAt: new Date().toISOString() };
}

export function flattenAccountsByPlatform(accountsByPlatform: {
  instagram: Array<{ integrationAccountId: string; name: string }>;
  facebook: Array<{ integrationAccountId: string; name: string }>;
  tiktok: Array<{ integrationAccountId: string; name: string }>;
  youtube: Array<{ integrationAccountId: string; name: string }>;
  linkedin: Array<{ integrationAccountId: string; name: string }>;
}): SnapshotAccountRef[] {
  const platforms: OrganicMetricPlatform[] = [
    'instagram',
    'facebook',
    'tiktok',
    'youtube',
    'linkedin',
  ];
  const out: SnapshotAccountRef[] = [];
  for (const platform of platforms) {
    for (const account of accountsByPlatform[platform]) {
      out.push({
        platform,
        integrationAccountId: account.integrationAccountId,
        name: account.name,
      });
    }
  }
  return out;
}

export function metricValueForAccount(
  account: SnapshotAccountResult,
  metricId: OrganicMetricId,
): number | undefined {
  if (!isMetricAvailableOnPlatform(metricId, account.platform)) return undefined;
  const value = account.metrics[metricId];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function metricDeltaForAccount(
  account: SnapshotAccountResult,
  metricId: OrganicMetricId,
): number | undefined {
  if (!isMetricAvailableOnPlatform(metricId, account.platform)) return undefined;
  const pct = account.comparison?.[metricId]?.percentageChange;
  return typeof pct === 'number' && Number.isFinite(pct) ? pct : undefined;
}

export type RollupItem = {
  metricId: OrganicMetricId;
  label: string;
  value: number | null;
  /** False when metric is not summable or no accounts contributed. */
  isSum: boolean;
};

export function summableRollups(
  accounts: SnapshotAccountResult[],
  metricIds: OrganicMetricId[],
): RollupItem[] {
  return metricIds.map((metricId) => {
    const entry = getOrganicMetric(metricId);
    const label = entry?.label ?? metricId;
    if (!entry?.summable) {
      return { metricId, label, value: null, isSum: false };
    }
    let sum = 0;
    let count = 0;
    for (const account of accounts) {
      const value = metricValueForAccount(account, metricId);
      if (value === undefined) continue;
      sum += value;
      count += 1;
    }
    return {
      metricId,
      label,
      value: count > 0 ? sum : null,
      isSum: count > 0,
    };
  });
}

export type TrendSeriesPoint = { date: string; value: number };

export function trendSeriesForMetric(
  account: SnapshotAccountResult,
  metricId: OrganicMetricId,
): TrendSeriesPoint[] {
  if (!isMetricAvailableOnPlatform(metricId, account.platform)) return [];
  const trends = (account.trends ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const points: TrendSeriesPoint[] = [];
  for (const trend of trends) {
    const raw = (trend as Record<string, unknown>)[metricId];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      points.push({ date: trend.date, value: raw });
    }
  }
  return points;
}
