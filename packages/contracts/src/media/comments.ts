// Threaded comments with spatial/temporal annotations on Library assets.
// An annotation pins a comment to the creative itself: a normalized box on an
// image (Figma-style) or a timestamp (optionally with a box) on a video
// (Air-style scrubber markers). Backed by media.comments; live updates flow
// over Supabase Realtime postgres_changes like media.assets does.

import { z } from 'zod';
import { boundingBoxSchema } from './asset';

// Anchors a mark carries besides its geometry. `page` (1-based, as printed) puts a pin, box
// or drawing on one page of a paged file — INDD `page_N` renditions now, PDF/Office later;
// the database holds it to a positive integer. `orbit` is the 3D equivalent of time: the
// camera a pin was placed from, so the viewer can fly back to it.
export const commentPageSchema = z.number().int().positive();

export const orbitAnchorSchema = z
  .object({
    azimuthDeg: z.number().finite(),
    polarDeg: z.number().min(0).max(180),
    distance: z.number().positive().optional(),
  })
  .strict();
export type OrbitAnchor = z.infer<typeof orbitAnchorSchema>;

export const boxAnnotationSchema = z
  .object({
    kind: z.literal('box'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
    page: commentPageSchema.optional(),
  })
  .strict();
export type BoxAnnotation = z.infer<typeof boxAnnotationSchema>;

const freehandPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

// A reviewer's marks on a frame (Frame.io-style draw tools). Each shape carries
// its own colour and normalized 0..1 geometry against the media's intrinsic
// frame, so it re-renders exactly where it was drawn at any stage size.
// Shapes ride on an existing anchor — the pin of a `point` annotation on an
// image, or the moment of a `time` annotation on a video — rather than on a new
// annotation kind, so every reader that switches on `kind` keeps working and
// simply ignores marks it does not draw yet.
export const DRAWING_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const drawingColorSchema = z.string().regex(DRAWING_COLOR_PATTERN);

export const drawingShapeSchema = z.discriminatedUnion('tool', [
  z
    .object({
      tool: z.literal('box'),
      color: drawingColorSchema,
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      tool: z.literal('arrow'),
      color: drawingColorSchema,
      from: freehandPointSchema,
      to: freehandPointSchema,
    })
    .strict(),
  z
    .object({
      tool: z.literal('line'),
      color: drawingColorSchema,
      from: freehandPointSchema,
      to: freehandPointSchema,
    })
    .strict(),
  z
    .object({
      tool: z.literal('freehand'),
      color: drawingColorSchema,
      points: z.array(freehandPointSchema).min(2).max(1024),
    })
    .strict(),
]);
export type DrawingShape = z.infer<typeof drawingShapeSchema>;
export type DrawingTool = DrawingShape['tool'];

export const MAX_DRAWING_SHAPES = 32;
export const drawingShapesSchema = z.array(drawingShapeSchema).min(1).max(MAX_DRAWING_SHAPES);

export const pointAnnotationSchema = z
  .object({
    kind: z.literal('point'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    shapes: drawingShapesSchema.optional(),
    page: commentPageSchema.optional(),
    // x/y are then viewport coordinates as seen from this camera.
    orbit: orbitAnchorSchema.optional(),
  })
  .strict();
export type PointAnnotation = z.infer<typeof pointAnnotationSchema>;

export const freehandAnnotationSchema = z
  .object({
    kind: z.literal('freehand'),
    points: z.array(freehandPointSchema).min(2).max(1024),
    page: commentPageSchema.optional(),
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
    shapes: drawingShapesSchema.optional(),
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

// #tag → 'tag': lower-cased, distinct, in order of first use. A tag needs a letter ("fix #2"
// is not one) and must not follow a word character, '/', '&' or '#' (URL fragments, HTML
// entities, "##"). Mention tokens are removed first so a display name cannot smuggle one in.
// Mirrors media.comment_hashtags, the trigger that fills media.comments.hashtags.
export const HASHTAG_TOKEN_PATTERN =
  /(?:^|[^\p{L}\p{Nd}_/&#])#([\p{L}\p{Nd}_]*\p{L}[\p{L}\p{Nd}_]*)/gu;

export function parseCommentHashtags(body: string): string[] {
  const text = body.replace(MENTION_TOKEN_PATTERN, ' ');
  const tags = [...text.matchAll(HASHTAG_TOKEN_PATTERN)].map((match) => match[1].toLowerCase());
  return [...new Set(tags)];
}

export function stripMentionTokensForExcerpt(body: string, maxLength = 140): string {
  const plain = body.replace(MENTION_TOKEN_PATTERN, '@$1');
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}

// An asset (optionally an exact version) attached to a comment as reference —
// "use this take instead". media.comments.attachments holds at most ten.
export const commentAttachmentSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type CommentAttachment = z.infer<typeof commentAttachmentSchema>;

export const MAX_COMMENT_ATTACHMENTS = 10;
export const commentAttachmentsSchema = z
  .array(commentAttachmentSchema)
  .max(MAX_COMMENT_ATTACHMENTS);

// Who may read a comment outside the brand. 'internal' (the column default) never
// leaves the team; 'shared' is shown to share-link recipients; 'external' marks a
// comment an external reviewer wrote through a share link.
export const commentVisibilitySchema = z.enum(['internal', 'shared', 'external']);
export type CommentVisibility = z.infer<typeof commentVisibilitySchema>;

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
    attachments: commentAttachmentsSchema.default([]),
    // Derived from the body by the database; never written by a client. Optional so a
    // consumer building a comment by hand (optimistic rows, fixtures) need not know it.
    hashtags: z.array(z.string().min(1)).optional(),
    visibility: commentVisibilitySchema.optional(),
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
    attachments: commentAttachmentsSchema.optional(),
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

// The review metadata of a comment a member may change after posting: whether
// share recipients see it (the lock toggle) and which assets it references.
// 'external' is never settable — it is written only by the share-link path.
export const patchCommentMetadataRequestSchema = z
  .object({
    brandId: z.string().min(1),
    commentId: z.string().min(1),
    visibility: z.enum(['internal', 'shared']).optional(),
    attachments: commentAttachmentsSchema.optional(),
  })
  .strict()
  .refine((v) => v.visibility !== undefined || v.attachments !== undefined, {
    message: 'visibility or attachments is required',
  });
export type PatchCommentMetadataRequest = z.infer<typeof patchCommentMetadataRequestSchema>;

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

// media.comment_reactions: one row per (comment, person, emoji). Members add and remove
// their own directly under RLS (the same visibility as the comment, restricted collections
// included); brand_id/asset_id are stamped from the comment by the database.
export const MAX_COMMENT_REACTION_LENGTH = 32;
export const commentReactionEmojiSchema = z
  .string()
  .min(1)
  .max(MAX_COMMENT_REACTION_LENGTH)
  .regex(/^\S+$/u, 'An emoji has no whitespace');

export const commentReactionSchema = z
  .object({
    commentId: z.string().uuid(),
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    userId: z.string().uuid(),
    emoji: commentReactionEmojiSchema,
    createdAt: z.string(),
  })
  .strict();
export type CommentReaction = z.infer<typeof commentReactionSchema>;

/** Insert body for media.comment_reactions; user_id defaults to the caller. */
export const addCommentReactionRequestSchema = z
  .object({ commentId: z.string().uuid(), emoji: commentReactionEmojiSchema })
  .strict();
export type AddCommentReactionRequest = z.infer<typeof addCommentReactionRequestSchema>;

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

// How a video asset counts time, for SMPTE display and marker export: the measured
// frame rate and the file's own start timecode (its tmcd track; 0 when it has none).
export const assetTimingSchema = z
  .object({
    assetId: z.string().min(1),
    versionId: z.string().nullable(),
    assetName: z.string(),
    fileName: z.string(),
    frameRate: z
      .object({ num: z.number().int().positive(), den: z.number().int().positive() })
      .strict(),
    startFrame: z.number().int().nonnegative(),
    dropFrame: z.boolean(),
    startTimecode: z.string(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();
export type AssetTiming = z.infer<typeof assetTimingSchema>;
