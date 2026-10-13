import {
  type CampaignPerformanceParams,
  fetchCampaignPerformanceRows,
} from '@/lib/paid-media/campaign-performance-loader';
import type { CampaignPerformanceRow } from '@/lib/paid-media/performance-types';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';

export type CacheEntry = {
  promise: Promise<unknown>;
  timestamp: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const campaignsCache = new Map<string, CacheEntry>();
const indexesCache = new Map<string, CacheEntry>();

function isStale(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

/**
 * Stores a prefetch promise and owns its failure. A cached promise nobody has consumed yet has
 * no handler, so a 500 from the edge became an unhandled rejection on the Jaina tab
 * (PP-L1-jaina-tab-uncaught-campaign-prefetch-rejection). The entry is dropped so the next
 * consumer fetches afresh and sees the error on its own path; the cause goes to the log. The
 * stored promise is the original one: a consumer that picks it up still gets the rejection.
 */
export function remember(
  cache: Map<string, CacheEntry>,
  key: string,
  promise: Promise<unknown>,
): void {
  const entry: CacheEntry = { promise, timestamp: Date.now() };
  cache.set(key, entry);
  promise.catch((cause: unknown) => {
    if (cache.get(key) === entry) cache.delete(key);
    console.warn('[paid-media-cache] prefetch failed; dropped the cache entry', { key, cause });
  });
}

/**
 * Prefetch paid media dashboard data (campaign list + campaign indexes) in the background.
 * Call this while the user is on the Jaina tab so data is warm when they switch to Dashboard.
 * Mirrors the pattern in src/lib/prefetch/organic-metrics-cache.ts.
 */
export function prefetchPaidMediaDashboard(params: { brandId: string; adAccountId: string }): void {
  const { brandId, adAccountId } = params;
  const campaignParams: CampaignPerformanceParams = {
    brandId,
    adAccountId,
    platform: 'meta',
    // The Dashboard's default ask (toMetricsRange of last_7d): the cache key must be the same.
    range: lastCompleteDays(7),
  };

  const campaignsKey = buildCampaignsKey(campaignParams);
  const cachedCampaigns = campaignsCache.get(campaignsKey);
  if (!cachedCampaigns || isStale(cachedCampaigns)) {
    remember(campaignsCache, campaignsKey, fetchCampaignPerformanceRows(campaignParams));
  }

  const indexesKey = buildIndexesKey(brandId, adAccountId);
  const cachedIndexes = indexesCache.get(indexesKey);
  if (!cachedIndexes || isStale(cachedIndexes)) {
    const params = new URLSearchParams({
      brandId,
      metaAccountId: adAccountId,
    });
    remember(
      indexesCache,
      indexesKey,
      fetch(`/api/paid-media/campaign-indexes?${params.toString()}`).then((r) => r.json()),
    );
  }
}

/**
 * Consume a prefetched campaigns promise if fresh, otherwise returns null for fallback fetch.
 * The entry stays warm for the TTL duration after consumption.
 */
export function consumePrefetchedCampaigns(
  params: CampaignPerformanceParams,
): Promise<CampaignPerformanceRow[]> | null {
  const key = buildCampaignsKey(params);
  const entry = campaignsCache.get(key);
  if (!entry || isStale(entry)) {
    if (entry) campaignsCache.delete(key);
    return null;
  }
  return entry.promise as Promise<CampaignPerformanceRow[]>;
}

/**
 * Consume a prefetched campaign indexes promise if fresh, otherwise returns null.
 */
export function consumePrefetchedIndexes(
  brandId: string,
  adAccountId: string,
): Promise<unknown> | null {
  const key = buildIndexesKey(brandId, adAccountId);
  const entry = indexesCache.get(key);
  if (!entry || isStale(entry)) {
    if (entry) indexesCache.delete(key);
    return null;
  }
  return entry.promise;
}

export function clearPaidMediaPrefetchCache(): void {
  campaignsCache.clear();
  indexesCache.clear();
}

function buildCampaignsKey(params: CampaignPerformanceParams): string {
  const rangeKey =
    params.range.preset === 'custom'
      ? `custom:${params.range.since}:${params.range.until}`
      : params.range.preset;
  return `${params.brandId}:${params.adAccountId}:${params.platform}:${rangeKey}:campaigns`;
}

function buildIndexesKey(brandId: string, adAccountId: string): string {
  return `${brandId}:${adAccountId}:indexes`;
}
