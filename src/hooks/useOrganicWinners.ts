'use client';

import {
  type OrganicPromotionAdsets,
  type OrganicWinners,
  organicPromotionAdsetsSchema,
  organicWinnersSchema,
  type PromoteOrganicWinnerRequest,
  type PromoteOrganicWinnerResponse,
  promoteOrganicWinnerResponseSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/lib/api/http';

const winnersKey = (brandId: string | undefined) => ['organic-winners', brandId] as const;

export function useOrganicWinners(brandId: string | undefined) {
  return useQuery<OrganicWinners>({
    queryKey: winnersKey(brandId),
    queryFn: () =>
      http.request({
        path: `/api/organic/winners?brandId=${encodeURIComponent(brandId as string)}`,
        schema: organicWinnersSchema,
      }),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });
}

export function usePromotionAdsets(brandId: string | undefined, enabled: boolean) {
  return useQuery<OrganicPromotionAdsets>({
    queryKey: ['organic-winner-adsets', brandId],
    queryFn: () =>
      http.request({
        path: `/api/organic/winners/adsets?brandId=${encodeURIComponent(brandId as string)}`,
        schema: organicPromotionAdsetsSchema,
      }),
    enabled: enabled && Boolean(brandId),
    staleTime: 10 * 60_000,
  });
}

export function usePromoteWinner(brandId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<
    PromoteOrganicWinnerResponse,
    Error,
    Omit<PromoteOrganicWinnerRequest, 'brandId'>
  >({
    mutationFn: (input) =>
      http.request({
        path: '/api/organic/winners/promote',
        method: 'POST',
        body: { ...input, brandId },
        schema: promoteOrganicWinnerResponseSchema,
      }),
    // Not awaited: a slow refetch must not keep the dialog spinning after the ad exists.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: winnersKey(brandId) }),
  });
}
