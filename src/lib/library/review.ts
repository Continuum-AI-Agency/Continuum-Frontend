// Browser fetchers for the review-workflow API. Responses are validated
// against the contracts schemas at the boundary.

import {
  type ListReviewEventsResponse,
  listReviewEventsResponseSchema,
  listReviewStateLabelsResponseSchema,
  REVIEW_EDGE_FUNCTION,
  type RequestCollectionReviewResult,
  type ReviewCustomState,
  type ReviewEdgeRequest,
  type ReviewStateLabel,
  type ReviewTransitionRequest,
  type ReviewTransitionResponse,
  requestCollectionReviewResultSchema,
  resolveReviewStateLabels,
  reviewTransitionResponseSchema,
  type SetAssetReviewStateResult,
  setAssetReviewStateResultSchema,
  setReviewStateLabelsResultSchema,
} from '@continuum/contracts';
import type { z } from 'zod';
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

// The audit trail, newest first, and each version's own decided state.
export async function listReviewEvents(params: {
  brandId: string;
  assetId: string;
}): Promise<ListReviewEventsResponse> {
  const query = new URLSearchParams({ brandId: params.brandId, assetId: params.assetId });
  const response = await fetch(`/api/library/review?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading review history failed'));
  }
  const parsed = listReviewEventsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Review history response was malformed');
  return parsed.data;
}

export type BrandReviewStates = { labels: ReviewStateLabel[]; customStates: ReviewCustomState[] };

export async function fetchReviewStateLabels(brandId: string): Promise<BrandReviewStates> {
  const response = await fetch(`/api/library/review/labels?${new URLSearchParams({ brandId })}`);
  if (!response.ok)
    throw new Error(await readErrorMessage(response, 'Loading status labels failed'));
  return listReviewStateLabelsResponseSchema.parse(await response.json());
}

// Review writes run through the library-review edge function with the user's
// JWT: it verifies the caller and pins them as the dispatcher's actor.
async function invokeReviewEdge<T>(request: ReviewEdgeRequest, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    REVIEW_EDGE_FUNCTION,
    { body: request },
  );
  if (error) {
    const response = (error as { context?: unknown }).context;
    let detail: string | null = null;
    if (response instanceof Response) {
      try {
        const body = (await response.clone().json()) as { error?: unknown };
        if (typeof body.error === 'string') detail = body.error;
      } catch {
        // A platform failure may not send JSON; the invoke error names it instead.
      }
    }
    throw new Error(detail ?? error.message);
  }
  return schema.parse(data);
}

// The five labels and the brand's whole custom-state list in one write; a custom
// state left out of the list is deleted.
export async function saveReviewStateLabels(
  brandId: string,
  labels: ReviewStateLabel[],
  customStates: Array<Omit<ReviewCustomState, 'id'> & { id?: string }>,
): Promise<BrandReviewStates> {
  const result = await invokeReviewEdge(
    { action: 'set_review_state_labels', brandId, labels, customStates },
    setReviewStateLabelsResultSchema,
  );
  return {
    labels: Object.values(resolveReviewStateLabels(result.labels)).sort(
      (a, b) => a.position - b.position,
    ),
    customStates: result.customStates,
  };
}

// A base status or a custom state on the head, or on one older version.
export function setAssetReviewState(
  input: Omit<Extract<ReviewEdgeRequest, { action: 'set_asset_review_state' }>, 'action'>,
): Promise<SetAssetReviewStateResult> {
  return invokeReviewEdge(
    { action: 'set_asset_review_state', ...input },
    setAssetReviewStateResultSchema,
  );
}

export function requestCollectionReview(
  input: Omit<Extract<ReviewEdgeRequest, { action: 'request_collection_review' }>, 'action'>,
): Promise<RequestCollectionReviewResult> {
  return invokeReviewEdge(
    { action: 'request_collection_review', ...input },
    requestCollectionReviewResultSchema,
  );
}

export function approvalReportHref(params: {
  brandId: string;
  collectionId?: string;
  assetId?: string;
}): string {
  const query = new URLSearchParams({ brandId: params.brandId });
  if (params.collectionId) query.set('collectionId', params.collectionId);
  if (params.assetId) query.set('assetId', params.assetId);
  return `/api/library/review/report?${query.toString()}`;
}
