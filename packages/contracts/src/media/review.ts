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
    createdAt: z.string(),
  })
  .strict();
export type AssetReviewEvent = z.infer<typeof assetReviewEventSchema>;

export const reviewTransitionRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    toStatus: mediaReviewStatusSchema,
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
    reviewStatus: mediaReviewStatusSchema,
    reviewStatusUpdatedAt: z.string().nullable(),
    event: assetReviewEventSchema,
  })
  .strict();
export type ReviewTransitionResponse = z.infer<typeof reviewTransitionResponseSchema>;

export const listReviewEventsResponseSchema = z
  .object({
    events: z.array(assetReviewEventSchema),
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
