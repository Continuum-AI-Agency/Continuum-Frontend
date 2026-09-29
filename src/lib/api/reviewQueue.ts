import {
  type ReviewDecision,
  type ReviewQueueItem,
  reviewDecisionResponseSchema,
  reviewDecisionSchema,
  reviewQueueListResponseSchema,
} from '@continuum/contracts';
import type { z } from 'zod';
import { http } from '@/lib/api/http';

export type ReviewDecisionResponse = z.infer<typeof reviewDecisionResponseSchema>;

const brandQuery = (brandId: string): string => `brandId=${encodeURIComponent(brandId)}`;

/** Drafts whose media is made and that carry their blocks, waiting for a person's swipe. */
export async function listReviewQueue(
  brandId: string,
  signal?: AbortSignal,
): Promise<ReviewQueueItem[]> {
  const response = await http.request<z.infer<typeof reviewQueueListResponseSchema>>({
    path: `/api/organic/agent/review-queue?${brandQuery(brandId)}`,
    schema: reviewQueueListResponseSchema,
    signal,
  });
  return response.items;
}

export function decideReviewItem(
  brandId: string,
  draftId: string,
  decision: ReviewDecision,
): Promise<ReviewDecisionResponse> {
  return http.request({
    path: `/api/organic/agent/review-queue/${encodeURIComponent(draftId)}/decision?${brandQuery(brandId)}`,
    method: 'POST',
    body: reviewDecisionSchema.parse(decision),
    schema: reviewDecisionResponseSchema,
  });
}
