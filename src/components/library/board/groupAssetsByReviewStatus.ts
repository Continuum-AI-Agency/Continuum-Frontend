// Pure grouping for the Kanban board: buckets assets by review status,
// preserving list order inside each column. Assets whose reviewStatus is
// missing or unknown (written before the review workflow) land in 'none'.

import type { MediaAsset, MediaReviewStatus } from '@continuum/contracts';
import { normalizeReviewStatus, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';

export type BoardColumns = Record<MediaReviewStatus, MediaAsset[]>;

export function groupAssetsByReviewStatus(assets: MediaAsset[]): BoardColumns {
  const columns = Object.fromEntries(
    REVIEW_STATUS_ORDER.map((status) => [status, [] as MediaAsset[]]),
  ) as BoardColumns;
  for (const asset of assets) {
    columns[normalizeReviewStatus(asset.reviewStatus)].push(asset);
  }
  return columns;
}
