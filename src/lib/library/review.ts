// Browser fetchers for the review-workflow API. Responses are validated
// against the contracts schemas at the boundary.

import {
  type AssetReviewEvent,
  listReviewEventsResponseSchema,
  type ReviewTransitionRequest,
  type ReviewTransitionResponse,
  reviewTransitionResponseSchema,
} from '@continuum/contracts';
import { transitionAssetReviewOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `${fallback} (${response.status})`;
}

export async function transitionReviewStatus(
  request: ReviewTransitionRequest,
): Promise<ReviewTransitionResponse> {
  const result = await transitionAssetReviewOperation(createSupabaseBrowserClient(), {
    ...request,
    idempotencyKey: crypto.randomUUID(),
  });
  return reviewTransitionResponseSchema.parse(result);
}

export async function listReviewEvents(params: {
  brandId: string;
  assetId: string;
}): Promise<AssetReviewEvent[]> {
  const query = new URLSearchParams({ brandId: params.brandId, assetId: params.assetId });
  const response = await fetch(`/api/library/review?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading review history failed'));
  }
  const parsed = listReviewEventsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Review history response was malformed');
  return parsed.data.events;
}
