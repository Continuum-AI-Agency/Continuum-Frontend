import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

  // Prefetch campaign list via Supabase Edge Function
  const campaignsKey = `${brandId}:${adAccountId}:campaigns`;
  if (!campaignsCache.has(campaignsKey) || isStale(campaignsCache.get(campaignsKey)!)) {
    const supabase = createSupabaseBrowserClient();
    campaignsCache.set(campaignsKey, {
      promise: supabase.functions
        .invoke(`fetch-meta-campaigns?brandId=${brandId}&adAccountId=${adAccountId}`)
        .then((r) => r.data),
      timestamp: Date.now(),
    });
  }

  // Prefetch campaign indexes
  const indexesKey = `${brandId}:indexes`;
  if (!indexesCache.has(indexesKey) || isStale(indexesCache.get(indexesKey)!)) {
    indexesCache.set(indexesKey, {
      promise: fetch(`/api/paid-media/campaign-indexes?brandId=${brandId}`).then((r) =>
        r.json()
      ),
      timestamp: Date.now(),
    });
  }
}

/**
 * Consume a prefetched campaigns promise if fresh, otherwise returns null for fallback fetch.
 * The entry stays warm for the TTL duration after consumption.
 */
export function consumePrefetchedCampaigns(
  brandId: string,
  adAccountId: string,
): Promise<unknown> | null {
  const key = `${brandId}:${adAccountId}:campaigns`;
  const entry = campaignsCache.get(key);
  if (!entry || isStale(entry)) {
    if (entry) campaignsCache.delete(key);
    return null;
  }
  return entry.promise;
}

/**
 * Consume a prefetched campaign indexes promise if fresh, otherwise returns null.
 */
export function consumePrefetchedIndexes(brandId: string): Promise<unknown> | null {
  const key = `${brandId}:indexes`;
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
