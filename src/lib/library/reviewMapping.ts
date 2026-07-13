// Pure row-level helpers for the review audit trail
// (media.asset_review_events): DB row shape and the snake→camel mapping to
// the contracts AssetReviewEvent. Kept free of server-only imports so the
// logic is unit-testable.

import { type AssetReviewEvent, assetReviewEventSchema } from '@continuum/contracts';
import { normalizeReviewStatus } from './reviewStatus';

export type ReviewEventRow = {
  id: string;
  brand_id: string;
  asset_id: string;
  from_status: string;
  to_status: string;
  actor: string | null;
  note: string | null;
  created_at: string;
};

export const REVIEW_EVENT_SELECT =
  'id, brand_id, asset_id, from_status, to_status, actor, note, created_at';

export function reviewEventRowToContract(
  row: ReviewEventRow,
  actorName: string | null,
): AssetReviewEvent {
  return assetReviewEventSchema.parse({
    id: row.id,
    brandId: row.brand_id,
    assetId: row.asset_id,
    fromStatus: normalizeReviewStatus(row.from_status),
    toStatus: normalizeReviewStatus(row.to_status),
    actor: row.actor,
    actorName,
    note: row.note,
    createdAt: row.created_at,
  });
}
