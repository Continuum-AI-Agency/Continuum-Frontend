'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { scaleEntitiesQueryOptions } from './campaignsClient';

/** Warms the Campaigns tab's campaign list from the tab trigger's hover/focus, under the SAME
 *  query key the tab reads, so the switch paints from cache. */
export function usePrefetchScaleCampaigns(brandId: string, adAccountId: string | null) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (!brandId || !adAccountId) return;
    void queryClient.prefetchQuery(
      scaleEntitiesQueryOptions('campaign', { brandId, adAccountId }, null),
    );
  }, [adAccountId, brandId, queryClient]);
}
