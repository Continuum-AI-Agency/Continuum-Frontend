import { useCallback, useEffect, useState } from 'react';
import type { TimelineBlock, TimelineCampaign, TimelineEvent } from '@/types/timeline';

type TimelineResolution = 'daily' | 'hourly';

interface UseTimelineBlocksOptions {
  brandId: string;
  accountId: string | null;
  startDate?: string;
  endDate?: string;
  campaignIds?: string[];
  resolution?: TimelineResolution;
}

interface UseTimelineBlocksReturn {
  blocks: TimelineBlock[];
  campaigns: TimelineCampaign[];
  events: TimelineEvent[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

type ResolutionCacheEntry = {
  blocks: TimelineBlock[];
  rangeStart: string;
  rangeEnd: string;
  fetchedAt: number;
};

type AccountTimelineCacheEntry = Partial<Record<TimelineResolution, ResolutionCacheEntry>>;

const PREFETCH_WINDOW_DAYS = 30;
const TIMELINE_ACCOUNT_CACHE = new Map<string, AccountTimelineCacheEntry>();
const TIMELINE_ACCOUNT_BOOTSTRAP = new Map<string, Promise<AccountTimelineCacheEntry>>();

function buildResolutionCacheEntry(
  blocks: TimelineBlock[],
  rangeStart: string,
  rangeEnd: string,
): ResolutionCacheEntry {
  return {
    blocks,
    rangeStart,
    rangeEnd,
    fetchedAt: Date.now(),
  };
}

function buildAccountCacheKey(brandId: string, accountId: string): string {
  return `${brandId}:${accountId}`;
}

function toDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computePrefetchRange(
  startDate?: string,
  endDate?: string,
): { start: string; end: string } {
  const parsedEnd = toDateOrNull(endDate) ?? new Date();
  const parsedStart = toDateOrNull(startDate);

  const defaultStart = new Date(parsedEnd);
  defaultStart.setDate(defaultStart.getDate() - PREFETCH_WINDOW_DAYS);

  const effectiveStart = parsedStart && parsedStart < defaultStart ? parsedStart : defaultStart;

  return {
    start: effectiveStart.toISOString(),
    end: parsedEnd.toISOString(),
  };
}

function isRangeCovered(
  cacheEntry: ResolutionCacheEntry,
  requestedStart: Date | null,
  requestedEnd: Date | null,
): boolean {
  const cacheStart = new Date(cacheEntry.rangeStart);
  const cacheEnd = new Date(cacheEntry.rangeEnd);

  if (requestedStart && cacheStart > requestedStart) return false;
  if (requestedEnd && cacheEnd < requestedEnd) return false;
  return true;
}

function filterBlocksByRange(
  blocks: TimelineBlock[],
  requestedStart: Date | null,
  requestedEnd: Date | null,
): TimelineBlock[] {
  if (!requestedStart && !requestedEnd) {
    return blocks;
  }

  return blocks.filter((block) => {
    const blockStart = new Date(block.block_start);
    const blockEnd = new Date(block.block_end);

    if (requestedStart && blockEnd < requestedStart) return false;
    if (requestedEnd && blockStart > requestedEnd) return false;
    return true;
  });
}

function mergeTimelineData(
  typedBlocks: TimelineBlock[],
  campaignIds?: string[],
): { campaigns: TimelineCampaign[]; events: TimelineEvent[] } {
  const allEvents: TimelineEvent[] = [];
  const campaignMap = new Map<string, TimelineCampaign>();

  typedBlocks.forEach((block) => {
    if (block.events && Array.isArray(block.events)) {
      allEvents.push(...block.events);
    }

    if (block.campaigns && Array.isArray(block.campaigns)) {
      block.campaigns.forEach((campaign) => {
        if (!campaignMap.has(campaign.id)) {
          campaignMap.set(campaign.id, JSON.parse(JSON.stringify(campaign)));
          return;
        }

        const existing = campaignMap.get(campaign.id)!;

        if (campaign.metrics_daily && campaign.metrics_daily.length > 0) {
          const mergedMetrics = [...(existing.metrics_daily ?? []), ...campaign.metrics_daily];
          const dedupedByDate = new Map(mergedMetrics.map((metric) => [metric.date, metric]));
          existing.metrics_daily = Array.from(dedupedByDate.values()).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
        }

        campaign.ad_sets?.forEach((adSet) => {
          const existingAdSet = existing.ad_sets?.find((item) => item.id === adSet.id);
          if (!existingAdSet) {
            if (!existing.ad_sets) existing.ad_sets = [];
            existing.ad_sets.push(JSON.parse(JSON.stringify(adSet)));
            return;
          }

          adSet.ads?.forEach((ad) => {
            const existingAd = existingAdSet.ads?.find((item) => item.id === ad.id);
            if (!existingAd) {
              if (!existingAdSet.ads) existingAdSet.ads = [];
              existingAdSet.ads.push(JSON.parse(JSON.stringify(ad)));
              return;
            }

            if (ad.segments) {
              if (!existingAd.segments) existingAd.segments = [];
              existingAd.segments.push(...ad.segments);
            }

            if (ad.events) {
              if (!existingAd.events) existingAd.events = [];
              existingAd.events.push(...ad.events);
            }
          });
        });
      });
    }
  });

  let mergedCampaigns = Array.from(campaignMap.values());
  if (campaignIds && campaignIds.length > 0) {
    const campaignSet = new Set(campaignIds);
    mergedCampaigns = mergedCampaigns.filter((campaign) => campaignSet.has(campaign.id));
  }

  mergedCampaigns.forEach((campaign) => {
    campaign.ad_sets?.forEach((adSet) => {
      adSet.ads?.forEach((ad) => {
        if (!ad.segments) return;

        ad.segments.sort((left, right) => {
          return new Date(left.start).getTime() - new Date(right.start).getTime();
        });

        const stitched: typeof ad.segments = [];
        ad.segments.forEach((segment) => {
          if (stitched.length === 0) {
            stitched.push(segment);
            return;
          }

          const last = stitched[stitched.length - 1];
          const lastEnd = new Date(last.end).getTime();
          const currentStart = new Date(segment.start).getTime();
          const currentEnd = new Date(segment.end).getTime();

          if (last.status === segment.status && lastEnd >= currentStart) {
            last.end = new Date(Math.max(lastEnd, currentEnd)).toISOString();
            return;
          }

          stitched.push(segment);
        });

        ad.segments = stitched;
      });
    });
  });

  const uniqueEvents = Array.from(
    new Map(
      allEvents.map((event) => [`${event.id || event.date}-${event.adId}-${event.type}`, event]),
    ).values(),
  );
  uniqueEvents.sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
  );

  return {
    campaigns: mergedCampaigns,
    events: uniqueEvents,
  };
}

export function useTimelineBlocks({
  brandId,
  accountId,
  startDate,
  endDate,
  campaignIds,
  resolution = 'daily',
}: UseTimelineBlocksOptions): UseTimelineBlocksReturn {
  const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
  const [campaigns, setCampaigns] = useState<TimelineCampaign[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchResolutionBlocks = useCallback(
    async (
      targetResolution: TimelineResolution,
      fetchStart: string,
      fetchEnd: string,
    ): Promise<TimelineBlock[]> => {
      const response = await fetch('/api/paid-media/timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandId,
          accountId,
          startDate: fetchStart,
          endDate: fetchEnd,
          resolution: targetResolution,
        }),
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorPayload.error ?? 'Failed to fetch timeline blocks');
      }

      const payload = (await response.json()) as { blocks?: unknown };
      return (payload.blocks || []) as TimelineBlock[];
    },
    [accountId, brandId],
  );

  const fetchBlocks = useCallback(
    async (forceRefresh = false) => {
      if (!brandId || !accountId) {
        setBlocks([]);
        setCampaigns([]);
        setEvents([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const cacheKey = buildAccountCacheKey(brandId, accountId);
        const requestedStart = toDateOrNull(startDate);
        const requestedEnd = toDateOrNull(endDate);

        let accountCache = TIMELINE_ACCOUNT_CACHE.get(cacheKey);

        if (!accountCache) {
          const inFlight = TIMELINE_ACCOUNT_BOOTSTRAP.get(cacheKey);
          if (inFlight) {
            accountCache = await inFlight;
          } else {
            const bootstrapRange = computePrefetchRange(startDate, endDate);

            const bootstrapPromise = (async () => {
              const primaryBlocks = await fetchResolutionBlocks(
                resolution,
                bootstrapRange.start,
                bootstrapRange.end,
              );
              const primaryCacheEntry = buildResolutionCacheEntry(
                primaryBlocks,
                bootstrapRange.start,
                bootstrapRange.end,
              );

              const nextEntry: AccountTimelineCacheEntry = {
                [resolution]: primaryCacheEntry,
              };

              TIMELINE_ACCOUNT_CACHE.set(cacheKey, nextEntry);

              const secondaryResolution: TimelineResolution =
                resolution === 'daily' ? 'hourly' : 'daily';

              void fetchResolutionBlocks(
                secondaryResolution,
                bootstrapRange.start,
                bootstrapRange.end,
              )
                .then((secondaryBlocks) => {
                  const secondaryCacheEntry = buildResolutionCacheEntry(
                    secondaryBlocks,
                    bootstrapRange.start,
                    bootstrapRange.end,
                  );
                  const currentCache = TIMELINE_ACCOUNT_CACHE.get(cacheKey) ?? nextEntry;

                  TIMELINE_ACCOUNT_CACHE.set(cacheKey, {
                    ...currentCache,
                    [secondaryResolution]: secondaryCacheEntry,
                  });
                })
                .catch((prefetchError) => {
                  console.warn(
                    `[useTimelineBlocks] Failed to prefetch ${secondaryResolution} timeline blocks`,
                    prefetchError,
                  );
                });

              return TIMELINE_ACCOUNT_CACHE.get(cacheKey) ?? nextEntry;
            })().finally(() => {
              TIMELINE_ACCOUNT_BOOTSTRAP.delete(cacheKey);
            });

            TIMELINE_ACCOUNT_BOOTSTRAP.set(cacheKey, bootstrapPromise);
            accountCache = await bootstrapPromise;
          }
        }

        let resolutionCache = accountCache[resolution];

        if (
          forceRefresh ||
          !resolutionCache ||
          !isRangeCovered(resolutionCache, requestedStart, requestedEnd)
        ) {
          const refreshRange = computePrefetchRange(startDate, endDate);
          const refreshedBlocks = await fetchResolutionBlocks(
            resolution,
            refreshRange.start,
            refreshRange.end,
          );

          resolutionCache = buildResolutionCacheEntry(
            refreshedBlocks,
            refreshRange.start,
            refreshRange.end,
          );

          accountCache = {
            ...accountCache,
            [resolution]: resolutionCache,
          };
          TIMELINE_ACCOUNT_CACHE.set(cacheKey, accountCache);
        }

        const visibleBlocks = filterBlocksByRange(
          resolutionCache.blocks,
          requestedStart,
          requestedEnd,
        );
        const merged = mergeTimelineData(visibleBlocks, campaignIds);

        setBlocks(visibleBlocks);
        setCampaigns(merged.campaigns);
        setEvents(merged.events);
      } catch (err) {
        console.error('[useTimelineBlocks] Error fetching timeline:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    },
    [accountId, brandId, campaignIds, endDate, fetchResolutionBlocks, resolution, startDate],
  );

  useEffect(() => {
    void fetchBlocks(false);
  }, [fetchBlocks]);

  const refetch = useCallback(() => {
    void fetchBlocks(true);
  }, [fetchBlocks]);

  return {
    blocks,
    campaigns,
    events,
    loading,
    error,
    refetch,
  };
}
