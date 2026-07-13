// Browser fetchers for the review-workflow API. Responses are validated
// against the contracts schemas at the boundary.

import {
  type AssetReviewEvent,
  listReviewEventsResponseSchema,
  type ReviewTransitionRequest,
  type ReviewTransitionResponse,
  reviewTransitionResponseSchema,
} from '@continuum/contracts';

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
  const response = await fetch('/api/library/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Updating the review status failed'));
  }
  const parsed = reviewTransitionResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Review transition response was malformed');
  return parsed.data;
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
