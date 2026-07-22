// Maps a tracked Competitor row onto the shared health-chip input and derives its
// per-competitor operational chip (IMP-009 / FEAT-009). Thin, no durable monitor:
// it composes the status enums the row already carries plus the one durable
// timestamp we hold (meta_page_resolved_at) and the live ad count. Per-competitor
// post counts are not tracked on this surface, so postsFound is left unknown and
// the chip stays in "collecting" until a paid page resolves.

import {
  type Competitor,
  type CompetitorHealthChip,
  type CompetitorHealthInput,
  type CompetitorHealthState,
  deriveCompetitorHealthChip,
} from '@continuum/contracts';

export function toCompetitorHealthInput(
  competitor: Competitor,
  adsFound?: number | null,
): CompetitorHealthInput {
  return {
    organicStatus: competitor.organicStatus ?? null,
    paidStatus: competitor.paidStatus ?? null,
    metaPageResolutionStatus: competitor.metaPageResolutionStatus ?? null,
    adsFound: adsFound ?? null,
    lastSyncedAt: competitor.metaPageResolvedAt ?? null,
    lastSyncError: competitor.metaPageResolutionError ?? null,
  };
}

export function competitorHealthChip(
  competitor: Competitor,
  adsFound?: number | null,
): CompetitorHealthChip {
  return deriveCompetitorHealthChip(toCompetitorHealthInput(competitor, adsFound));
}

// Remediation copy — what the user does next to move a competitor toward healthy.
const HEALTH_GUIDANCE: Record<CompetitorHealthState, string> = {
  healthy: 'Configured and collecting. Posts and ads are flowing in.',
  collecting: 'Set up and gathering data. Results appear here as they sync.',
  needs_handle: "Add this competitor's Instagram handle to pull their organic posts.",
  no_posts_found: 'Resolved, but no posts or ads found yet — the account may be inactive.',
  page_unresolved: "We couldn't match a Meta ad-library page. Resolve its paid page to track ads.",
  needs_review: 'Several page matches were found. Review and confirm the right one.',
  sync_error: "The last sync failed. Retry, or re-check this competitor's details.",
};

export function competitorHealthGuidance(state: CompetitorHealthState): string {
  return HEALTH_GUIDANCE[state];
}
