// Review-workflow envelopes for the Library system of record: status
// transitions on media.assets plus the immutable audit trail rows
// (media.asset_review_events) that answer "who approved what, and when".

import { z } from 'zod';
import { mediaReviewStatusSchema } from './asset';

export const assetReviewEventSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    fromStatus: mediaReviewStatusSchema,
    toStatus: mediaReviewStatusSchema,
    actor: z.string().nullable().optional(),
    // Transient display name resolved from brand membership at read time.
    actorName: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    // The version the decision was cast on (the head when the writer named none),
    // and the brand's custom state when one was chosen.
    versionId: z.string().nullable().optional(),
    toStateId: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .strict();
export type AssetReviewEvent = z.infer<typeof assetReviewEventSchema>;

export const reviewTransitionRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    toStatus: mediaReviewStatusSchema,
    expectedCurrentStatus: mediaReviewStatusSchema.optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type ReviewTransitionRequest = z.infer<typeof reviewTransitionRequestSchema>;

export const transitionAssetReviewOperationSchema = reviewTransitionRequestSchema.extend({
  action: z.literal('transition_asset_review'),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export const reviewTransitionResponseSchema = z
  .object({
    assetId: z.string().min(1),
    // The head version at the moment of the transition. The Creative Operations
    // edge function has always returned this; the schema did not declare it, and
    // `.strict()` turned a LANDED review change into a thrown parse error on both
    // the MCP tool and the Frontend's Library review panel. Optional because the
    // Next route (/api/library/review) builds this envelope itself and has no
    // version in hand, and nullable because an asset need not have a head version.
    versionId: z.string().min(1).nullable().optional(),
    reviewStatus: mediaReviewStatusSchema,
    reviewStatusUpdatedAt: z.string().nullable(),
    changed: z.boolean(),
    event: assetReviewEventSchema.nullable(),
  })
  .strict();
export type ReviewTransitionResponse = z.infer<typeof reviewTransitionResponseSchema>;

// One version's own decided state; null status = never decided on that version.
export const versionReviewStateSchema = z
  .object({
    versionId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    isHead: z.boolean(),
    reviewStatus: mediaReviewStatusSchema.nullable(),
    reviewStateId: z.string().uuid().nullable(),
  })
  .strict();
export type VersionReviewState = z.infer<typeof versionReviewStateSchema>;

export const listReviewEventsResponseSchema = z
  .object({
    events: z.array(assetReviewEventSchema),
    // Each version's own decided state (see versionReviewStateSchema).
    versions: z.array(versionReviewStateSchema).optional(),
  })
  .strict();
export type ListReviewEventsResponse = z.infer<typeof listReviewEventsResponseSchema>;

export const requestAssetReviewOperationSchema = z
  .object({
    action: z.literal('request_asset_review'),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    reviewerUserIds: z.array(z.string().uuid()).min(1),
    note: z.string().max(2000).optional(),
    dueAt: z.string().datetime().optional(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const decideAssetReviewOperationSchema = z
  .object({
    action: z.literal('decide_asset_review'),
    brandId: z.string().uuid(),
    reviewRequestId: z.string().uuid(),
    decision: z.enum(['approved', 'needs_changes']),
    note: z.string().max(2000).optional(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const reviewCommandResponseSchema = z
  .object({
    requestId: z.string().uuid(),
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    reviewStatus: mediaReviewStatusSchema,
  })
  .strict();
export type ReviewCommandResponse = z.infer<typeof reviewCommandResponseSchema>;

const REVIEW_LABEL_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// A brand's display name + colour for one review state (media.review_state_labels).
// The states themselves are fixed; only how they read is the brand's call.
export const reviewStateLabelSchema = z
  .object({
    state: mediaReviewStatusSchema,
    label: z.string().trim().min(1).max(40),
    color: z.string().regex(REVIEW_LABEL_COLOR_PATTERN),
    position: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewStateLabel = z.infer<typeof reviewStateLabelSchema>;

export const reviewStateLabelsSchema = z
  .array(reviewStateLabelSchema)
  .min(1)
  .max(5)
  .refine((labels) => new Set(labels.map((label) => label.state)).size === labels.length, {
    message: 'Each review state may be labelled once',
  });

/** What a brand that never customized its labels sees. */
export const DEFAULT_REVIEW_STATE_LABELS: readonly ReviewStateLabel[] = [
  { state: 'none', label: 'None', color: '#9CA3AF', position: 0 },
  { state: 'draft', label: 'Draft', color: '#6B7280', position: 1 },
  { state: 'in_review', label: 'In review', color: '#3B82F6', position: 2 },
  { state: 'needs_changes', label: 'Needs changes', color: '#F59E0B', position: 3 },
  { state: 'approved', label: 'Approved', color: '#10B981', position: 4 },
];

// A brand-owned review state (media.review_custom_states): the brand's own name
// for a refinement of ONE base category. An asset holding it still carries the
// base in review_status, so every filter, lane and report keeps working.
export const reviewCustomStateSchema = z
  .object({
    id: z.string().uuid(),
    baseStatus: mediaReviewStatusSchema,
    label: z.string().trim().min(1).max(40),
    color: z.string().regex(REVIEW_LABEL_COLOR_PATTERN),
    position: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewCustomState = z.infer<typeof reviewCustomStateSchema>;

export const listReviewStateLabelsResponseSchema = z
  .object({
    labels: z.array(reviewStateLabelSchema),
    customStates: z.array(reviewCustomStateSchema).default([]),
  })
  .strict();
export type ListReviewStateLabelsResponse = z.infer<typeof listReviewStateLabelsResponseSchema>;

// Every brand state resolved to a label, falling back to the default for any
// state the brand never customized.
export function resolveReviewStateLabels(
  custom: readonly ReviewStateLabel[],
): Record<ReviewStateLabel['state'], ReviewStateLabel> {
  const byState = new Map(custom.map((label) => [label.state, label]));
  return Object.fromEntries(
    DEFAULT_REVIEW_STATE_LABELS.map((fallback) => [
      fallback.state,
      byState.get(fallback.state) ?? fallback,
    ]),
  ) as Record<ReviewStateLabel['state'], ReviewStateLabel>;
}

// Payload of the notifications the review-due sweep writes
// (library_internal.enqueue_review_due_notifications, run by pg_cron):
// 'review_reminder' to a reviewer who has not decided before dueAt, and
// 'review_escalation' to the requester and brand admins once dueAt has passed.
export const REVIEW_DUE_NOTIFICATION_KINDS = ['review_reminder', 'review_escalation'] as const;
export const reviewDueNotificationPayloadSchema = z
  .object({
    assetId: z.string().min(1),
    assetName: z.string().min(1),
    actorName: z.string().min(1),
    reviewRequestId: z.string().uuid(),
    dueAt: z.string().min(1),
    pendingReviewerIds: z.array(z.string().uuid()),
  })
  .strict();
export type ReviewDueNotificationPayload = z.infer<typeof reviewDueNotificationPayloadSchema>;

// What media.review_set_asset_state answers: the state now held by the head or by
// the one version named (isHead false leaves the asset's own status untouched).
export const setAssetReviewStateResultSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    isHead: z.boolean(),
    reviewStatus: mediaReviewStatusSchema,
    reviewStateId: z.string().uuid().nullable(),
    changed: z.boolean(),
    eventId: z.string().uuid().nullable(),
    notificationIds: z.array(z.string().uuid()),
  })
  .strict();
export type SetAssetReviewStateResult = z.infer<typeof setAssetReviewStateResultSchema>;
