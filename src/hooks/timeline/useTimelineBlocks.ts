import { useState, useEffect, useCallback } from 'react';
import { TimelineBlock, TimelineCampaign, TimelineEvent } from '@/types/timeline';

interface UseTimelineBlocksOptions {
    brandId: string;
    accountId: string | null;
    startDate?: string;
    endDate?: string;
    campaignIds?: string[];
}

interface UseTimelineBlocksReturn {
    blocks: TimelineBlock[];
    campaigns: TimelineCampaign[]; // Merged campaigns across blocks
    events: TimelineEvent[]; // Merged events across blocks
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function useTimelineBlocks({
    brandId,
    accountId,
    startDate,
    endDate,
    campaignIds,
}: UseTimelineBlocksOptions): UseTimelineBlocksReturn {
    const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
    const [campaigns, setCampaigns] = useState<TimelineCampaign[]>([]);
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchBlocks = useCallback(async () => {
        if (!brandId || !accountId) {
            setBlocks([]);
            setCampaigns([]);
            setEvents([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/paid-media/timeline', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    brandId,
                    accountId,
                    startDate,
                    endDate,
                    campaignIds,
                }),
                cache: 'no-store',
            });

            if (!response.ok) {
                const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(errorPayload.error ?? 'Failed to fetch timeline blocks');
            }

            const payload = (await response.json()) as { blocks?: unknown };
            const typedBlocks = (payload.blocks || []) as unknown as TimelineBlock[];
            setBlocks(typedBlocks);

            // Merge campaigns and events across blocks
            // This is a naive merge. A more robust merge would stitch segments together.
            // But since the backend builder computes contiguous segments per block, 
            // for the timeline drawing, we might need a dedicated stitcher.
            // For now, let's just collect them.
            const allEvents: TimelineEvent[] = [];
            
            // Map to merge campaigns by ID
            const campaignMap = new Map<string, TimelineCampaign>();

            typedBlocks.forEach(block => {
                // Collect events
                if (block.events && Array.isArray(block.events)) {
                    allEvents.push(...block.events);
                }

                // Merge campaigns
                if (block.campaigns && Array.isArray(block.campaigns)) {
                    block.campaigns.forEach(camp => {
                        if (!campaignMap.has(camp.id)) {
                            // Deep clone to avoid mutating the original block
                            campaignMap.set(camp.id, JSON.parse(JSON.stringify(camp)));
                        } else {
                            const existing = campaignMap.get(camp.id)!;
                            // Merge daily metrics across blocks and dedupe by date.
                            if (camp.metrics_daily && camp.metrics_daily.length > 0) {
                                const mergedMetrics = [
                                    ...(existing.metrics_daily ?? []),
                                    ...camp.metrics_daily,
                                ];
                                const dedupedByDate = new Map(
                                    mergedMetrics.map(metric => [metric.date, metric])
                                );
                                existing.metrics_daily = Array.from(dedupedByDate.values()).sort(
                                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                                );
                            }

                            // Merge AdSets and Ads segments here (simplified for now,
                            // ideal implementation requires a deep merge of `segments` arrays).
                            camp.ad_sets?.forEach(adSet => {
                                const existingAdSet = existing.ad_sets?.find(a => a.id === adSet.id);
                                if (!existingAdSet) {
                                    if (!existing.ad_sets) existing.ad_sets = [];
                                    existing.ad_sets.push(JSON.parse(JSON.stringify(adSet)));
                                } else {
                                    adSet.ads?.forEach(ad => {
                                        const existingAd = existingAdSet.ads?.find(a => a.id === ad.id);
                                        if (!existingAd) {
                                            if (!existingAdSet.ads) existingAdSet.ads = [];
                                            existingAdSet.ads.push(JSON.parse(JSON.stringify(ad)));
                                        } else {
                                            if (ad.segments) {
                                                if (!existingAd.segments) existingAd.segments = [];
                                                existingAd.segments.push(...ad.segments);
                                            }
                                            if (ad.events) {
                                                if (!existingAd.events) existingAd.events = [];
                                                existingAd.events.push(...ad.events);
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });

            // If campaignIds are provided, filter them
            let mergedCampaigns = Array.from(campaignMap.values());
            if (campaignIds && campaignIds.length > 0) {
                mergedCampaigns = mergedCampaigns.filter(c => campaignIds.includes(c.id));
            }

            // Optional: Sort segments in ads to ensure chronological order after merge
            mergedCampaigns.forEach(camp => {
                camp.ad_sets?.forEach(adSet => {
                    adSet.ads?.forEach(ad => {
                        if (ad.segments) {
                            ad.segments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
                            
                            // Stitch contiguous segments of the same status
                            const stitched: typeof ad.segments = [];
                            ad.segments.forEach(seg => {
                                if (stitched.length === 0) {
                                    stitched.push(seg);
                                    return;
                                }
                                const last = stitched[stitched.length - 1];
                                if (last.status === seg.status && new Date(last.end).getTime() >= new Date(seg.start).getTime()) {
                                    // Extend last segment
                                    last.end = new Date(Math.max(new Date(last.end).getTime(), new Date(seg.end).getTime())).toISOString();
                                } else {
                                    stitched.push(seg);
                                }
                            });
                            ad.segments = stitched;
                        }
                    });
                });
            });

            setCampaigns(mergedCampaigns);
            
            // Deduplicate events by ID (or time+adId if no ID)
            const uniqueEvents = Array.from(new Map(allEvents.map(e => [`${e.id || e.date}-${e.adId}-${e.type}`, e])).values());
            uniqueEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setEvents(uniqueEvents);

        } catch (err) {
            console.error('[useTimelineBlocks] Error fetching timeline:', err);
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [brandId, accountId, startDate, endDate, campaignIds]);

    useEffect(() => {
        void fetchBlocks();
    }, [fetchBlocks]);

    return {
        blocks,
        campaigns,
        events,
        loading,
        error,
        refetch: fetchBlocks
    };
}
