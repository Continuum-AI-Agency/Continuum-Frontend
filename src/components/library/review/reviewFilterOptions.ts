// The review options a Library filter offers: each base status under the brand's own
// label, followed by the brand's custom states within it. A base option filters on
// review_status; a custom-state option filters on review_state_id (its assets also
// carry the base, so choosing the base alone still includes them).

import type { MediaReviewStatus, ReviewCustomState, ReviewStateLabel } from '@continuum/contracts';

export type ReviewFilterOption =
  | { kind: 'status'; value: MediaReviewStatus; label: string; color: string }
  | {
      kind: 'state';
      value: string;
      baseStatus: MediaReviewStatus;
      label: string;
      color: string;
    };

// The statuses a filter offers ('none' is "never reviewed", not a choice people filter to).
export const FILTERABLE_REVIEW_STATUSES: readonly MediaReviewStatus[] = [
  'in_review',
  'needs_changes',
  'approved',
  'draft',
];

export function reviewFilterOptions(
  labels: Record<MediaReviewStatus, ReviewStateLabel>,
  customStates: readonly ReviewCustomState[],
): ReviewFilterOption[] {
  return FILTERABLE_REVIEW_STATUSES.flatMap((status) => [
    {
      kind: 'status' as const,
      value: status,
      label: labels[status].label,
      color: labels[status].color,
    },
    ...customStates
      .filter((state) => state.baseStatus === status)
      .map((state) => ({
        kind: 'state' as const,
        value: state.id,
        baseStatus: status,
        label: state.label,
        color: state.color,
      })),
  ]);
}
