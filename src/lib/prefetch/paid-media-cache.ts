import {
  fetchCampaignPerformanceRows,
  type CampaignPerformanceParams,
} from "@/lib/paid-media/campaign-performance-loader";
import type { CampaignPerformanceRow } from "@/lib/paid-media/performance-types";

type CacheEntry = {
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
 * Prefetch paid media dashboard data (campaign list + campaign indexes) in the background.
 * Call this while the user is on the Jaina tab so data is warm when they switch to Dashboard.
 * Mirrors the pattern in src/lib/prefetch/organic-metrics-cache.ts.
 */
export function prefetchPaidMediaDashboard(params: {
  brandId: string;
  adAccountId: string;
}): void {
  const { brandId, adAccountId } = params;
  const campaignParams: CampaignPerformanceParams = {
    brandId,
    adAccountId,
    platform: "meta",
    range: { preset: "last_7d" },
  };

  const campaignsKey = buildCampaignsKey(campaignParams);
  if (!campaignsCache.has(campaignsKey) || isStale(campaignsCache.get(campaignsKey)!)) {
    campaignsCache.set(campaignsKey, {
      promise: fetchCampaignPerformanceRows(campaignParams),
      timestamp: Date.now(),
    });
  }

  const indexesKey = buildIndexesKey(brandId, adAccountId);
  if (!indexesCache.has(indexesKey) || isStale(indexesCache.get(indexesKey)!)) {
    const params = new URLSearchParams({
      brandId,
      metaAccountId: adAccountId,
    });
    indexesCache.set(indexesKey, {
      promise: fetch(`/api/paid-media/campaign-indexes?${params.toString()}`).then((r) => r.json()),
      timestamp: Date.now(),
    });
  }
}

/**
 * Consume a prefetched campaigns promise if fresh, otherwise returns null for fallback fetch.
 * The entry stays warm for the TTL duration after consumption.
 */
export function consumePrefetchedCampaigns(
  params: CampaignPerformanceParams
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
  adAccountId: string
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
    params.range.preset === "custom"
      ? `custom:${params.range.since}:${params.range.until}`
      : params.range.preset;
  return `${params.brandId}:${params.adAccountId}:${params.platform}:${rangeKey}:campaigns`;
}

function buildIndexesKey(brandId: string, adAccountId: string): string {
  return `${brandId}:${adAccountId}:indexes`;
}
