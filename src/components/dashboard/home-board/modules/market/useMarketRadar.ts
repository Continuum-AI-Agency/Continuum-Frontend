'use client';

// The market radar's two stored reads; neither starts a scan or a generation:
//   - competitor awareness: GET /api/competitor-ad-spy/awareness?brandId (Backend) → the newest
//     competitor_ad_spy.awareness_reports row's payload, through Brand Spy's own hook and key;
//   - brand trends: GET /api/trends/read?brand_id (Backend) → the latest COMPLETED generation's
//     brand_trends.trends, mapped by the Frontend's existing trends mapper.
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAwarenessReport } from '@/lib/api/competitorSpy';
import { request } from '@/lib/api/http';
import {
  type CompetitorMove,
  competitorMovesOf,
  type TrendItem,
  trendItemsOf,
  trendsFromReadResponse,
} from './marketRadarModel';

export const homeMarketTrendsKey = (brandId: string) => ['home-market-trends', brandId] as const;

export type MarketRadarLoad = {
  reportExists: boolean;
  moves: CompetitorMove[];
  trends: TrendItem[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
};

export function useMarketRadar(brandId: string): MarketRadarLoad {
  const awareness = useAwarenessReport(brandId);
  const trendsRead = useQuery({
    queryKey: homeMarketTrendsKey(brandId),
    queryFn: async () =>
      trendsFromReadResponse(
        await request<unknown>({
          path: `/api/trends/read?${new URLSearchParams({ brand_id: brandId })}`,
        }),
      ),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });

  const moves = useMemo(() => competitorMovesOf(awareness.data ?? null), [awareness.data]);
  const trends = useMemo(() => trendItemsOf(trendsRead.data ?? null), [trendsRead.data]);
  const { refetch: refetchAwareness } = awareness;
  const { refetch: refetchTrends } = trendsRead;
  const retry = useCallback(() => {
    void refetchAwareness();
    void refetchTrends();
  }, [refetchAwareness, refetchTrends]);

  return {
    reportExists: Boolean(awareness.data),
    moves,
    trends,
    loading: awareness.isPending || trendsRead.isPending,
    failed: awareness.isError || trendsRead.isError,
    retry,
  };
}
