// Tokened, view-only share links for external stakeholders (no account
// needed). Backed by media.share_links (deny-all RLS — only the server
// resolves tokens); the public route validates token + expiry + revocation
// server-side and mints short-lived signed URLs per request.

import { z } from 'zod';
import { mediaAssetSchema } from './asset';
import { commentAnnotationSchema } from './comments';

export const shareLinkScopeSchema = z.enum(['asset', 'collection']);
export type ShareLinkScope = z.infer<typeof shareLinkScopeSchema>;

export const shareLinkSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    token: z.string().min(1),
    scope: shareLinkScopeSchema,
    assetId: z.string().nullable().optional(),
    collectionId: z.string().nullable().optional(),
    permissions: z.literal('view'),
    createdBy: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    revokedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    // Transient: absolute public URL for the token, built at read time.
    url: z.string().nullable().optional(),
  })
  .strict();
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const createShareLinkRequestSchema = z
  .object({
    brandId: z.string().min(1),
    scope: shareLinkScopeSchema,
    assetId: z.string().min(1).optional(),
    collectionId: z.string().min(1).optional(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .refine((v) => (v.scope === 'asset' ? Boolean(v.assetId) : Boolean(v.collectionId)), {
    message: 'assetId is required for asset scope; collectionId for collection scope',
  });
export type CreateShareLinkRequest = z.infer<typeof createShareLinkRequestSchema>;

export const revokeShareLinkRequestSchema = z
  .object({
    brandId: z.string().min(1),
    shareLinkId: z.string().min(1),
  })
  .strict();
export type RevokeShareLinkRequest = z.infer<typeof revokeShareLinkRequestSchema>;

export const listShareLinksResponseSchema = z
  .object({
    links: z.array(shareLinkSchema),
  })
  .strict();
export type ListShareLinksResponse = z.infer<typeof listShareLinksResponseSchema>;

// A comment as an anonymous viewer may see it. Deliberately narrower than
// MediaComment: no createdBy, no resolvedBy, and never an email address — the
// share page is unauthenticated, so identity is a display name or nothing.
export const publicShareCommentSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    parentCommentId: z.string().nullable().optional(),
    body: z.string(),
    annotation: commentAnnotationSchema.nullable().optional(),
    authorName: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .strict();
export type PublicShareComment = z.infer<typeof publicShareCommentSchema>;

// What the anonymous share page renders. Assets carry fresh signed URLs;
// nothing else about the brand is exposed. Comments are open threads only —
// resolved feedback is internal churn.
export const publicSharePayloadSchema = z
  .object({
    scope: shareLinkScopeSchema,
    brandName: z.string().nullable().optional(),
    collectionName: z.string().nullable().optional(),
    assets: z.array(mediaAssetSchema),
    comments: z.array(publicShareCommentSchema),
  })
  .strict();
export type PublicSharePayload = z.infer<typeof publicSharePayloadSchema>;
