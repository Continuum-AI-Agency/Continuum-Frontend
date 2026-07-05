// Competitor health-chip projection. A single, renderable chip model that
// composes the existing competitor status enums (organic / paid /
// meta-page-resolution) plus a last-synced timestamp and observed post/ad
// counts into one { state, label, tone, last_synced_at } shape. Brand Spy shows
// this per tracked competitor so "tracked" no longer reads as "working" — the
// user can tell whether a source is collecting, needs a handle, produced no
// results, is unresolved, needs review, or errored (IMP-009 / IMP-023 /
// FEAT-009). This is a thin derivation, NOT a new persisted status: the caller
// maps whichever timestamp column is authoritative for its surface (e.g.
// last_resolved_at / meta_page_resolved_at) into `lastSyncedAt`.

import { z } from "zod";

import type {
  CompetitorOrganicStatus,
  CompetitorPaidStatus,
  MetaPageResolutionStatus,
} from "./index";

export const competitorHealthStateSchema = z.enum([
  "healthy",
  "collecting",
  "needs_handle",
  "no_posts_found",
  "page_unresolved",
  "needs_review",
  "sync_error",
]);
export type CompetitorHealthState = z.infer<typeof competitorHealthStateSchema>;

export const competitorHealthToneSchema = z.enum([
  "positive",
  "info",
  "warning",
  "danger",
  "neutral",
]);
export type CompetitorHealthTone = z.infer<typeof competitorHealthToneSchema>;

export const competitorHealthChipSchema = z.object({
  state: competitorHealthStateSchema,
  label: z.string(),
  tone: competitorHealthToneSchema,
  last_synced_at: z.string().nullable(),
});
export type CompetitorHealthChip = z.infer<typeof competitorHealthChipSchema>;

// Loose input so any Brand Spy surface can compose the chip from whatever fields
// it holds. All optional: a competitor with only a resolution status and no sync
// yet still resolves to a meaningful chip ("collecting").
export interface CompetitorHealthInput {
  organicStatus?: CompetitorOrganicStatus | null;
  paidStatus?: CompetitorPaidStatus | null;
  metaPageResolutionStatus?: MetaPageResolutionStatus | null;
  postsFound?: number | null;
  adsFound?: number | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

const STATE_PRESENTATION: Record<
  CompetitorHealthState,
  { label: string; tone: CompetitorHealthTone }
> = {
  healthy: { label: "Healthy", tone: "positive" },
  collecting: { label: "Collecting", tone: "info" },
  needs_handle: { label: "Needs handle", tone: "warning" },
  no_posts_found: { label: "No posts found", tone: "warning" },
  page_unresolved: { label: "Page unresolved", tone: "warning" },
  needs_review: { label: "Needs review", tone: "warning" },
  sync_error: { label: "Sync error", tone: "danger" },
};

// Worst-first precedence: an error trumps everything, then hard config gaps
// (handle / unresolved page / needs review), then in-flight collection, and only
// a fully-resolved, synced source that produced nothing is "no posts found".
function deriveCompetitorHealthState(input: CompetitorHealthInput): CompetitorHealthState {
  const {
    organicStatus,
    paidStatus,
    metaPageResolutionStatus,
    postsFound,
    adsFound,
    lastSyncedAt,
    lastSyncError,
  } = input;

  if (lastSyncError || paidStatus === "error" || metaPageResolutionStatus === "error") {
    return "sync_error";
  }
  if (organicStatus === "needs_instagram") return "needs_handle";
  if (metaPageResolutionStatus === "unresolved" || paidStatus === "unresolved") {
    return "page_unresolved";
  }
  if (paidStatus === "needs_review" || metaPageResolutionStatus === "needs_review") {
    return "needs_review";
  }

  const resolving = paidStatus === "resolving" || metaPageResolutionStatus === "resolving";
  if (resolving || !lastSyncedAt) return "collecting";

  if ((postsFound ?? 0) === 0 && (adsFound ?? 0) === 0) return "no_posts_found";
  return "healthy";
}

export function deriveCompetitorHealthChip(input: CompetitorHealthInput): CompetitorHealthChip {
  const state = deriveCompetitorHealthState(input);
  const presentation = STATE_PRESENTATION[state];
  return {
    state,
    label: presentation.label,
    tone: presentation.tone,
    last_synced_at: input.lastSyncedAt ?? null,
  };
}
