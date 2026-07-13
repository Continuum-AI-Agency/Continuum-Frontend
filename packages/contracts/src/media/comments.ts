// Threaded comments with spatial/temporal annotations on Library assets.
// An annotation pins a comment to the creative itself: a normalized box on an
// image (Figma-style) or a timestamp (optionally with a box) on a video
// (Air-style scrubber markers). Backed by media.comments; live updates flow
// over Supabase Realtime postgres_changes like media.assets does.

import { z } from 'zod';
import { boundingBoxSchema } from './asset';

export const boxAnnotationSchema = z
  .object({
    kind: z.literal('box'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();
export type BoxAnnotation = z.infer<typeof boxAnnotationSchema>;

// A point is a zero-extent range: `endMs` present means the comment spans
// [timeMs, endMs] on the scrubber (Frame.io-style), absent means a moment.
// Extending the `time` kind rather than adding a `range` kind keeps every
// existing row parseable and every existing branch (box | time) intact.
export const timeAnnotationSchema = z
  .object({
    kind: z.literal('time'),
    timeMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive().optional(),
    box: boundingBoxSchema.nullable().optional(),
  })
  .strict()
  .refine((annotation) => annotation.endMs === undefined || annotation.endMs > annotation.timeMs, {
    message: 'endMs must be greater than timeMs',
    path: ['endMs'],
  });
export type TimeAnnotation = z.infer<typeof timeAnnotationSchema>;

export const commentAnnotationSchema = z.discriminatedUnion('kind', [
  boxAnnotationSchema,
  timeAnnotationSchema,
]);
export type CommentAnnotation = z.infer<typeof commentAnnotationSchema>;

export const mediaCommentSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    versionId: z.string().nullable().optional(),
    parentCommentId: z.string().nullable().optional(),
    body: z.string(),
    annotation: commentAnnotationSchema.nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    // Transient display fields resolved from brand membership at read time.
    authorName: z.string().nullable().optional(),
    authorEmail: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type MediaComment = z.infer<typeof mediaCommentSchema>;

export const createCommentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    body: z.string().min(1).max(5000),
    annotation: commentAnnotationSchema.optional(),
    parentCommentId: z.string().min(1).optional(),
    versionId: z.string().min(1).optional(),
  })
  .strict();
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const updateCommentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    commentId: z.string().min(1),
    body: z.string().min(1).max(5000).optional(),
    // true resolves the thread, false re-opens it.
    resolved: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.body !== undefined || v.resolved !== undefined, {
    message: 'body or resolved is required',
  });
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

export const deleteCommentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    commentId: z.string().min(1),
  })
  .strict();
export type DeleteCommentRequest = z.infer<typeof deleteCommentRequestSchema>;

// headVersionId is the version row the asset's current file came from. Every
// comment is pinned to a version, so a consumer needs it to tell "written on
// what you are looking at" from "written on a superseded cut" — a box drawn on
// v1 must not be painted over v2's pixels. It is null only for an asset whose
// v1 row has not been materialized yet (history is backfilled lazily).
export const listCommentsResponseSchema = z
  .object({
    comments: z.array(mediaCommentSchema),
    headVersionId: z.string().nullable().optional(),
  })
  .strict();
export type ListCommentsResponse = z.infer<typeof listCommentsResponseSchema>;
