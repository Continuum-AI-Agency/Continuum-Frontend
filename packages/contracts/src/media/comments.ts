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

export const pointAnnotationSchema = z
  .object({
    kind: z.literal('point'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();
export type PointAnnotation = z.infer<typeof pointAnnotationSchema>;

const freehandPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

export const freehandAnnotationSchema = z
  .object({
    kind: z.literal('freehand'),
    points: z.array(freehandPointSchema).min(2).max(1024),
  })
  .strict();
export type FreehandAnnotation = z.infer<typeof freehandAnnotationSchema>;

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
  pointAnnotationSchema,
  freehandAnnotationSchema,
  timeAnnotationSchema,
]);
export type CommentAnnotation = z.infer<typeof commentAnnotationSchema>;

// A mention tags an internal brand member inside a comment body. Identity is
// the Continuum user id; display text lives in the body token itself so a
// comment renders correctly even before membership lookup.
export const commentMentionSchema = z.object({ userId: z.string().min(1) }).strict();
export type CommentMention = z.infer<typeof commentMentionSchema>;

// Body token format: @[Display Name](continuum-user://<userId>). Markdown-link
// shaped so unrendered contexts degrade to readable prose.
export const MENTION_TOKEN_PATTERN = /@\[([^\]\n]+)\]\(continuum-user:\/\/([^)\n]+)\)/g;

export type CommentBodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string; label: string };

export function splitCommentBodyForRender(body: string): CommentBodySegment[] {
  const segments: CommentBodySegment[] = [];
  let cursor = 0;
  for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', text: body.slice(cursor, start) });
    segments.push({ kind: 'mention', label: match[1], userId: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < body.length) segments.push({ kind: 'text', text: body.slice(cursor) });
  return segments.length > 0 ? segments : [{ kind: 'text', text: body }];
}

export function buildMentionToken(userId: string, label: string): string {
  return `@[${label}](continuum-user://${userId})`;
}

export function parseCommentMentions(body: string): CommentMention[] {
  const seen = new Set<string>();
  const mentions: CommentMention[] = [];
  for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
    const userId = match[2];
    if (!seen.has(userId)) {
      seen.add(userId);
      mentions.push({ userId });
    }
  }
  return mentions;
}

export function stripMentionTokensForExcerpt(body: string, maxLength = 140): string {
  const plain = body.replace(MENTION_TOKEN_PATTERN, '@$1');
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}

export const mediaCommentSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    versionId: z.string().nullable().optional(),
    parentCommentId: z.string().nullable().optional(),
    body: z.string(),
    // User ids tagged in the body at write time; validated against brand
    // membership server-side. Drives rendering and notification fan-out.
    mentions: z.array(commentMentionSchema).default([]),
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
    // Redundant with tokens parsed from body, but explicit — the server
    // validates this list against brand membership before fanning out.
    mentions: z.array(commentMentionSchema).max(20).optional(),
    annotation: commentAnnotationSchema.optional(),
    parentCommentId: z.string().min(1).optional(),
    versionId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const createCommentOperationSchema = createCommentRequestSchema.extend({
  action: z.literal('create_asset_comment'),
});

export const updateCommentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    commentId: z.string().min(1),
    body: z.string().min(1).max(5000).optional(),
    // true resolves the thread, false re-opens it.
    resolved: z.boolean().optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((v) => v.body !== undefined || v.resolved !== undefined, {
    message: 'body or resolved is required',
  });
export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;
export const updateCommentOperationSchema = updateCommentRequestSchema.extend({
  action: z.literal('update_asset_comment'),
});

export const deleteCommentRequestSchema = z
  .object({
    brandId: z.string().min(1),
    commentId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export type DeleteCommentRequest = z.infer<typeof deleteCommentRequestSchema>;
export const deleteCommentOperationSchema = deleteCommentRequestSchema.extend({
  action: z.literal('delete_asset_comment'),
});
export const deleteCommentResponseSchema = z
  .object({ ok: z.literal(true), commentId: z.string().min(1) })
  .strict();

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
