import {
  fetchOrganicAnalytics,
  type OrganicAnalyticsRequest,
} from "@/lib/api/organicAnalytics.client";
import type { InstagramOrganicMetricsResponse } from "@/lib/schemas/organicMetrics";

type CacheKey = string;
type CacheEntry = {
  promise: Promise<InstagramOrganicMetricsResponse>;
  timestamp: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<CacheKey, CacheEntry>();

function buildKey(
  brandId: string,
  integrationAccountId: string,
  platform: "instagram" | "facebook",
  rangePreset: string,
  scope: string,
): CacheKey {
  return `${brandId}:${integrationAccountId}:${platform}:${rangePreset}:${scope}`;
}

function isStale(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

/**
 * Prefetch the default metrics dashboard data (KPIs + demographics) in the background.
 * Call this while the user is on the planner tab so the data is warm when they switch.
 */
export function prefetchMetricsDashboard(params: {
  brandId: string;
  integrationAccountId: string;
  platform: "instagram" | "facebook";
  rangePreset?: string;
}): void {
  const { brandId, integrationAccountId, platform, rangePreset = "last_7d" } = params;

  if (!integrationAccountId) return;

  const base: Omit<OrganicAnalyticsRequest, "scope"> = {
    brandId,
    integrationAccountId,
    platform,
    range: { preset: rangePreset as OrganicAnalyticsRequest["range"]["preset"] },
  };

  // Prefetch KPIs
  const kpiKey = buildKey(brandId, integrationAccountId, platform, rangePreset, "kpis");
  if (!cache.has(kpiKey) || isStale(cache.get(kpiKey)!)) {
    cache.set(kpiKey, {
      promise: fetchOrganicAnalytics({ ...base, scope: "kpis" }),
      timestamp: Date.now(),
    });
  }

  // Prefetch demographics (Instagram only)
  if (platform === "instagram") {
    const demoKey = buildKey(brandId, integrationAccountId, platform, rangePreset, "demographics");
    if (!cache.has(demoKey) || isStale(cache.get(demoKey)!)) {
      cache.set(demoKey, {
        promise: fetchOrganicAnalytics({ ...base, scope: "demographics" }),
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Consume a prefetched result. Returns the cached promise if available and fresh,
 * otherwise returns null so the caller falls back to a normal fetch.
 * The entry is NOT removed — it stays warm for the duration of its TTL.
 */
export function consumePrefetched(
  brandId: string,
  integrationAccountId: string,
  platform: "instagram" | "facebook",
  rangePreset: string,
  scope: string,
): Promise<InstagramOrganicMetricsResponse> | null {
  const key = buildKey(brandId, integrationAccountId, platform, rangePreset, scope);
  const entry = cache.get(key);
  if (!entry || isStale(entry)) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.promise;
}

export function clearPrefetchCache(): void {
  cache.clear();
}
