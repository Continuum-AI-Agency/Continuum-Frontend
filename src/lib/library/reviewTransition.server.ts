import 'server-only';

// The single server-side writer of a review verdict. A transition is two writes
// that must stay together: the head's review_status and one immutable audit row
// naming who moved it and from where. Both the /api/library/review route (a
// human clicking a status) and the version-register route (a new upload
// invalidating a stale verdict) go through here so the audit trail can never be
// bypassed by a second hand-rolled insert.
//
// Always runs on the ADMIN client: the actor is pinned server-side from the
// authenticated session, never taken from the request body.

import type { MediaReviewStatus } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from '@/lib/media/supabase-media';
import { REVIEW_EVENT_SELECT, type ReviewEventRow } from './reviewMapping';

export type ReviewTransition = {
  brandId: string;
  assetId: string;
  fromStatus: MediaReviewStatus;
  toStatus: MediaReviewStatus;
  actor: string;
  note: string | null;
};

export type ReviewTransitionWrite = {
  reviewStatusUpdatedAt: string;
  event: ReviewEventRow;
};

export async function writeReviewTransition(
  admin: SupabaseClient,
  transition: ReviewTransition,
): Promise<ReviewTransitionWrite> {
  const reviewStatusUpdatedAt = new Date().toISOString();

  const { error: updateError } = await mediaSchema(admin)
    .from('assets')
    .update({ review_status: transition.toStatus, review_status_updated_at: reviewStatusUpdatedAt })
    .eq('id', transition.assetId)
    .eq('brand_id', transition.brandId);
  if (updateError) {
    console.error('[library/review] status update failed', updateError);
    throw new Error('Review status update failed');
  }

  const { data, error: eventError } = await mediaSchema(admin)
    .from('asset_review_events')
    .insert({
      brand_id: transition.brandId,
      asset_id: transition.assetId,
      from_status: transition.fromStatus,
      to_status: transition.toStatus,
      actor: transition.actor,
      note: transition.note,
    })
    .select(REVIEW_EVENT_SELECT)
    .single();
  if (eventError || !data) {
    console.error('[library/review] event insert failed', eventError);
    throw new Error('Review event insert failed');
  }

  return { reviewStatusUpdatedAt, event: data as unknown as ReviewEventRow };
}

// Only 'approved' and 'needs_changes' are verdicts — someone looked at the file
// and ruled on it. A new upload replaces the file that ruling was cast on, so
// the ruling no longer describes the asset. 'none', 'draft' and 'in_review' are
// not verdicts: forcing them to in_review would drag every re-upload of an asset
// nobody asked to review onto the review board.
export function isStaleVerdict(status: MediaReviewStatus): boolean {
  return status === 'approved' || status === 'needs_changes';
}

// A failed reset must never lose the version the user just uploaded, so this
// swallows its errors and reports the status that actually stuck.
export async function resetReviewForNewVersion(
  admin: SupabaseClient,
  params: {
    brandId: string;
    assetId: string;
    currentStatus: MediaReviewStatus;
    versionNumber: number;
    actor: string;
  },
): Promise<MediaReviewStatus> {
  if (!isStaleVerdict(params.currentStatus)) return params.currentStatus;

  try {
    await writeReviewTransition(admin, {
      brandId: params.brandId,
      assetId: params.assetId,
      fromStatus: params.currentStatus,
      toStatus: 'in_review',
      actor: params.actor,
      note: `v${params.versionNumber} uploaded — review reset`,
    });
    return 'in_review';
  } catch (error) {
    console.error('[library/versions] review reset failed', error);
    return params.currentStatus;
  }
}
