// Canonical presentation metadata for the media review workflow
// (none/draft/in_review/needs_changes/approved). Shared by the detail-modal
// status control and the Kanban board so both surfaces color a status the
// same way. Tones resolve through the same semantic tokens PillIndicator uses.

import { type MediaReviewStatus, mediaReviewStatusSchema } from '@continuum/contracts';

export const REVIEW_STATUS_ORDER: readonly MediaReviewStatus[] = [
  'none',
  'draft',
  'in_review',
  'needs_changes',
  'approved',
];

export type ReviewStatusIndicator = 'success' | 'error' | 'warning' | 'info' | null;

export type ReviewStatusMeta = {
  /** Pill label in the detail modal. */
  label: string;
  /** Column header on the Kanban board. */
  columnLabel: string;
  /** PillIndicator tone; null renders a muted dot (no workflow signal). */
  indicator: ReviewStatusIndicator;
  /** Tailwind class for the raw status dot (board headers, dropdown items). */
  dotClass: string;
};

export const REVIEW_STATUS_META: Record<MediaReviewStatus, ReviewStatusMeta> = {
  none: {
    label: 'No status',
    columnLabel: 'Unsorted',
    indicator: null,
    dotClass: 'bg-muted-foreground/40',
  },
  draft: {
    label: 'Draft',
    columnLabel: 'Draft',
    indicator: 'info',
    dotClass: 'bg-primary',
  },
  in_review: {
    label: 'In review',
    columnLabel: 'In review',
    indicator: 'warning',
    dotClass: 'bg-warning',
  },
  needs_changes: {
    label: 'Needs changes',
    columnLabel: 'Needs changes',
    indicator: 'error',
    dotClass: 'bg-destructive',
  },
  approved: {
    label: 'Approved',
    columnLabel: 'Approved',
    indicator: 'success',
    dotClass: 'bg-success',
  },
};

// Assets written before the review workflow (or by writers that do not map
// review_status yet) must land in the 'none' bucket, never crash a surface.
export function normalizeReviewStatus(value: unknown): MediaReviewStatus {
  const parsed = mediaReviewStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : 'none';
}
