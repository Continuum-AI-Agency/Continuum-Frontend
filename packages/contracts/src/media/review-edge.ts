// Requests to the `library-review` edge function — the write side of review
// labels, custom states, per-version state and collection review. The browser calls it with the user's JWT; the
// function verifies the caller and runs media.library_execute_operation as the
// service role with that verified user as the actor. It lives in an edge
// function because the service-role key does not belong on Vercel.
//
// Imports nothing but zod on purpose: the edge function imports this file by
// path (see supabase/functions/projects), and a barrel would drag the package.

import { z } from 'zod';

export const REVIEW_EDGE_FUNCTION = 'library-review';

// Mirrors mediaReviewStatusSchema (asset.ts cannot be imported here); pinned by
// review-edge.test.ts so the two cannot drift.
export const REVIEW_EDGE_STATES = [
  'none',
  'draft',
  'in_review',
  'needs_changes',
  'approved',
] as const;

const uuid = () => z.string().uuid();

const color = () => z.string().regex(/^#[0-9a-fA-F]{6}$/);

// The five base labels and/or the brand's whole custom-state list (an omitted
// custom state is deleted). At least one of the two.
export const reviewEdgeRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('set_review_state_labels'),
      brandId: uuid(),
      labels: z
        .array(
          z
            .object({
              state: z.enum(REVIEW_EDGE_STATES),
              label: z.string().trim().min(1).max(40),
              color: color(),
              position: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .min(1)
        .max(5)
        .optional(),
      customStates: z
        .array(
          z
            .object({
              id: uuid().optional(),
              baseStatus: z.enum(REVIEW_EDGE_STATES),
              label: z.string().trim().min(1).max(40),
              color: color(),
              position: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .max(20)
        .optional(),
    })
    .strict()
    .refine((request) => request.labels !== undefined || request.customStates !== undefined, {
      message: 'Send labels, customStates, or both',
    }),
  // A base status or a custom state on the head, or on one named version (a
  // decision on an older cut stays on that cut).
  z
    .object({
      action: z.literal('set_asset_review_state'),
      brandId: uuid(),
      assetId: uuid(),
      versionId: uuid().optional(),
      toStatus: z.enum(REVIEW_EDGE_STATES).optional(),
      stateId: uuid().optional(),
      note: z.string().max(2000).optional(),
    })
    .strict()
    .refine((request) => request.toStatus !== undefined || request.stateId !== undefined, {
      message: 'Send toStatus, stateId, or both',
    }),
  z
    .object({
      action: z.literal('request_collection_review'),
      brandId: uuid(),
      collectionId: uuid(),
      reviewerUserIds: z.array(uuid()).min(1).max(50),
      note: z.string().max(2000).optional(),
      dueAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
]);
export type ReviewEdgeRequest = z.infer<typeof reviewEdgeRequestSchema>;
