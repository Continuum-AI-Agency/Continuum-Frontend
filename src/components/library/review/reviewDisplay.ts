// How an asset's (or version's) review state reads: its custom state when it holds
// one whose base still matches, otherwise the brand's label for the base status.
// A stale or deleted custom state id falls back to the base, never to blank.

import type { MediaReviewStatus, ReviewCustomState, ReviewStateLabel } from '@continuum/contracts';

export type ReviewDisplay = {
  status: MediaReviewStatus;
  stateId: string | null;
  label: string;
  color: string;
};

export function reviewDisplay(
  status: MediaReviewStatus,
  stateId: string | null | undefined,
  labels: Record<MediaReviewStatus, ReviewStateLabel>,
  customStates: readonly ReviewCustomState[],
): ReviewDisplay {
  const custom = stateId
    ? customStates.find((state) => state.id === stateId && state.baseStatus === status)
    : undefined;
  if (custom) return { status, stateId: custom.id, label: custom.label, color: custom.color };
  return { status, stateId: null, label: labels[status].label, color: labels[status].color };
}
