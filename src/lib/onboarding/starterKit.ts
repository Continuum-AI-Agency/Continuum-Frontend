'use client';

import {
  type OnboardingInspirationSelection,
  type OnboardingStarterRun,
  onboardingStarterRunSchema,
  STARTER_ATTEMPT_LIMIT,
  STARTER_SLOTS,
  type StarterSlotKey,
  starterProgress,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { http } from '@/lib/api/http';

export const starterKitQueryKey = (brandId: string | null) =>
  ['onboarding-starter-kit', brandId] as const;
export const STARTER_LABELS: Record<StarterSlotKey, string> = {
  product: 'Product',
  character: 'Customer character',
  style: 'Visual style',
  setting: 'Setting',
  creative_product: 'Promo',
  creative_brand_awareness: 'Brand values',
  creative_hybrid: 'Customer story',
};

export function starterStateLine(run: OnboardingStarterRun) {
  if (run.status === 'prepared')
    return 'Your Elements are prepared · Ready to create your first creatives';
  const progress = starterProgress(run);
  const working = STARTER_SLOTS.filter((key) => run.slots[key].status === 'running').map((key) =>
    STARTER_LABELS[key].toLowerCase(),
  );
  return `${progress.ready} of ${progress.total} ready${working.length ? ` · Creating ${working.join(' and ')}` : progress.active ? ' · Preparing your kit' : progress.failed ? ` · ${progress.failed} need attention` : ' · Saved to your library'}`;
}
export const retryableStarterSlots = (run: OnboardingStarterRun) =>
  STARTER_SLOTS.filter(
    (key) => run.slots[key].status === 'failed' && run.slots[key].attempts < STARTER_ATTEMPT_LIMIT,
  );

export function prepareOnboardingStarter(brandId: string) {
  return http.request<OnboardingStarterRun>({
    path: '/api/onboarding/starter-kit',
    method: 'POST',
    body: { brandId, prepareOnly: true },
    schema: onboardingStarterRunSchema,
  });
}

export function useOnboardingStarter(brandId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: starterKitQueryKey(brandId),
    enabled: Boolean(brandId),
    queryFn: ({ signal }) =>
      http.request<OnboardingStarterRun | null>({
        path: `/api/onboarding/starter-kit?brandId=${encodeURIComponent(brandId ?? '')}`,
        schema: onboardingStarterRunSchema.nullable(),
        signal,
        cache: 'no-store',
      }),
    refetchInterval: (query) =>
      query.state.data && starterProgress(query.state.data).active ? 2000 : false,
    refetchIntervalInBackground: true,
  });
  const start = useCallback(
    async (inspiration: OnboardingInspirationSelection | null) => {
      if (!brandId) return;
      const run = await http.request<OnboardingStarterRun>({
        path: '/api/onboarding/starter-kit',
        method: 'POST',
        body: { brandId, inspiration },
        schema: onboardingStarterRunSchema,
      });
      queryClient.setQueryData(starterKitQueryKey(brandId), run);
      return run;
    },
    [brandId, queryClient],
  );
  const retry = useCallback(
    async (slots: StarterSlotKey[]) => {
      if (!brandId || !slots.length) return;
      const run = await http.request<OnboardingStarterRun>({
        path: `/api/onboarding/starter-kit/${encodeURIComponent(brandId)}/retry`,
        method: 'POST',
        body: { slots },
        schema: onboardingStarterRunSchema,
      });
      queryClient.setQueryData(starterKitQueryKey(brandId), run);
    },
    [brandId, queryClient],
  );
  return { ...query, run: query.data, start, retry };
}
