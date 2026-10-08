'use client';

import type { ReviewDecision, ReviewQueueItem } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideReviewItem, listReviewQueue } from '@/lib/api/reviewQueue';

export const reviewQueueQueryKey = (brandId: string) => ['organic-review-queue', brandId] as const;

/** Puts one refused card back where it was, leaving every other swipe made since in place. */
export function restoreItem(
  items: readonly ReviewQueueItem[],
  item: ReviewQueueItem,
  index: number,
): ReviewQueueItem[] {
  if (items.some((existing) => existing.draftId === item.draftId)) return [...items];
  const next = [...items];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

/** The swipe deck's data: every decision leaves the deck at once and comes back if refused. */
export function useReviewQueue(brandId: string) {
  const queryClient = useQueryClient();
  const queryKey = reviewQueueQueryKey(brandId);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listReviewQueue(brandId, signal),
    enabled: brandId.length > 0,
  });

  const decision = useMutation({
    mutationFn: ({ draftId, decision }: { draftId: string; decision: ReviewDecision }) =>
      decideReviewItem(brandId, draftId, decision),
    onMutate: async ({ draftId }) => {
      await queryClient.cancelQueries({ queryKey });
      const items = queryClient.getQueryData<ReviewQueueItem[]>(queryKey) ?? [];
      const index = items.findIndex((item) => item.draftId === draftId);
      queryClient.setQueryData<ReviewQueueItem[]>(queryKey, (current) =>
        current?.filter((item) => item.draftId !== draftId),
      );
      return index < 0 ? undefined : { item: items[index], index };
    },
    onError: (_error, _variables, removed) => {
      if (!removed) return;
      queryClient.setQueryData<ReviewQueueItem[]>(queryKey, (current) =>
        restoreItem(current ?? [], removed.item, removed.index),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    decide: decision.mutateAsync,
  };
}
