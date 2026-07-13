// Client helpers for the review-ping API (/api/library/ping): member targets
// for the picker and the ping submission, plus the pure self-exclusion filter.

import {
  type ReviewPingRequest,
  type ReviewPingResponse,
  reviewPingResponseSchema,
} from '@continuum/contracts';

export type ReviewPingTarget = {
  id: string;
  email: string | null;
  role: string;
};

export function selectablePingTargets(
  members: ReviewPingTarget[],
  selfUserId: string | null,
): ReviewPingTarget[] {
  return members.filter((member) => member.id !== selfUserId);
}

export async function fetchReviewPingTargets(brandId: string): Promise<ReviewPingTarget[]> {
  const response = await fetch(`/api/library/ping?brandId=${encodeURIComponent(brandId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load brand members (${response.status})`);
  }
  const data = (await response.json()) as { members?: ReviewPingTarget[] };
  return data.members ?? [];
}

export async function sendReviewPing(request: ReviewPingRequest): Promise<ReviewPingResponse> {
  const response = await fetch('/api/library/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Review ping failed (${response.status})`);
  }
  return reviewPingResponseSchema.parse(await response.json());
}
