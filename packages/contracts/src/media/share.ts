// Tokened, view-only share links for external stakeholders (no account
// needed). Backed by media.share_links (deny-all RLS — only the server
// resolves tokens); the public route validates token + expiry + revocation
// server-side and mints short-lived signed URLs per request.

import { z } from 'zod';
import { mediaAssetSchema } from './asset';
import { commentAnnotationSchema } from './comments';

export const shareLinkScopeSchema = z.enum(['asset', 'collection', 'selection']);
export type ShareLinkScope = z.infer<typeof shareLinkScopeSchema>;

export const shareVersionModeSchema = z.enum(['live', 'pinned', 'all']);
export type ShareVersionMode = z.infer<typeof shareVersionModeSchema>;

export const sharePolicySchema = z
  .object({
    versionMode: shareVersionModeSchema,
    pinnedVersionId: z.string().min(1).nullable(),
    allowComments: z.boolean(),
    allowApproval: z.boolean(),
    allowDownload: z.boolean(),
    showMetadata: z.boolean(),
    showCustomFields: z.boolean(),
    requireIdentity: z.boolean(),
    hasPasscode: z.boolean(),
  })
  .strict();
export type SharePolicy = z.infer<typeof sharePolicySchema>;

export const shareLinkSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    token: z.string().min(1),
    scope: shareLinkScopeSchema,
    assetId: z.string().nullable().optional(),
    collectionId: z.string().nullable().optional(),
    assetIds: z.array(z.string().min(1)).default([]),
    permissions: z.literal('view'),
    policy: sharePolicySchema,
    createdBy: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    revokedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    // Transient: absolute public URL for the token, built at read time.
    url: z.string().nullable().optional(),
  })
  .strict();
export type ShareLink = z.infer<typeof shareLinkSchema>;

const createShareLinkFields = {
  brandId: z.string().min(1),
  scope: shareLinkScopeSchema,
  assetId: z.string().min(1).optional(),
  collectionId: z.string().min(1).optional(),
  assetIds: z.array(z.string().min(1)).min(1).max(250).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  versionMode: shareVersionModeSchema.default('live'),
  pinnedVersionId: z.string().min(1).nullable().optional(),
  allowComments: z.boolean().default(true),
  allowApproval: z.boolean().default(false),
  allowDownload: z.boolean().default(true),
  showMetadata: z.boolean().default(true),
  showCustomFields: z.boolean().default(false),
  requireIdentity: z.boolean().default(false),
  passcode: z.string().min(4).max(128).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
} as const;

function validateShareTarget(
  value: {
    scope: ShareLinkScope;
    assetId?: string;
    collectionId?: string;
    assetIds?: string[];
    versionMode: ShareVersionMode;
    pinnedVersionId?: string | null;
  },
  context: z.RefinementCtx,
) {
    if (value.scope === 'asset' && !value.assetId) {
      context.addIssue({ code: 'custom', message: 'assetId is required for asset scope' });
    }
    if (value.scope === 'collection' && !value.collectionId) {
      context.addIssue({ code: 'custom', message: 'collectionId is required for collection scope' });
    }
    if (value.scope === 'selection' && !value.assetIds?.length) {
      context.addIssue({ code: 'custom', message: 'assetIds are required for selection scope' });
    }
    if (value.versionMode === 'pinned' && value.scope === 'asset' && !value.pinnedVersionId) {
      context.addIssue({ code: 'custom', message: 'pinnedVersionId is required for pinned asset links' });
    }
}

export const createShareLinkRequestSchema = z
  .object(createShareLinkFields)
  .strict()
  .superRefine(validateShareTarget);
export type CreateShareLinkRequest = z.infer<typeof createShareLinkRequestSchema>;

export const createShareLinkOperationSchema = z
  .object({ action: z.literal('create_share_link'), ...createShareLinkFields })
  .strict()
  .superRefine(validateShareTarget);

export const listShareLinksOperationSchema = z
  .object({
    action: z.literal('list_share_links'),
    brandId: z.string().min(1),
    assetId: z.string().min(1),
  })
  .strict();

export const revokeShareLinkRequestSchema = z
  .object({
    brandId: z.string().min(1),
    shareLinkId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export type RevokeShareLinkRequest = z.infer<typeof revokeShareLinkRequestSchema>;
export const revokeShareLinkOperationSchema = z
  .object({
    action: z.literal('revoke_share_link'),
    brandId: z.string().min(1),
    shareLinkId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();

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
    versionId: z.string().nullable().optional(),
    parentCommentId: z.string().nullable().optional(),
    body: z.string(),
    annotation: commentAnnotationSchema.nullable().optional(),
    authorName: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .strict();
export type PublicShareComment = z.infer<typeof publicShareCommentSchema>;

export const publicShareAssetSchema = z
  .object({
    asset: mediaAssetSchema,
    versionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    isHead: z.boolean(),
  })
  .strict();
export type PublicShareAsset = z.infer<typeof publicShareAssetSchema>;

// What the anonymous share page renders. Assets carry fresh signed URLs;
// nothing else about the brand is exposed. Comments are open threads only —
// resolved feedback is internal churn.
export const publicSharePayloadSchema = z
  .object({
    scope: shareLinkScopeSchema,
    brandName: z.string().nullable().optional(),
    collectionName: z.string().nullable().optional(),
    assets: z.array(publicShareAssetSchema),
    comments: z.array(publicShareCommentSchema),
    policy: sharePolicySchema,
    reviewer: z
      .object({
        displayName: z.string(),
        email: z.string().email(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type PublicSharePayload = z.infer<typeof publicSharePayloadSchema>;

export const externalReviewerSessionRequestSchema = z
  .object({
    token: z.string().min(16).max(128),
    passcode: z.string().min(4).max(128).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320).optional(),
  })
  .strict();
export type ExternalReviewerSessionRequest = z.infer<
  typeof externalReviewerSessionRequestSchema
>;

export const createExternalReviewerSessionOperationSchema =
  externalReviewerSessionRequestSchema.extend({
    action: z.literal('create_external_reviewer_session'),
  });

export const externalReviewerSessionResponseSchema = z
  .object({
    sessionToken: z.string().min(32),
    expiresAt: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();
export type ExternalReviewerSessionResponse = z.infer<
  typeof externalReviewerSessionResponseSchema
>;

export const createExternalShareCommentRequestSchema = z
  .object({
    token: z.string().min(16).max(128),
    sessionToken: z.string().min(32).max(256),
    assetId: z.string().min(1),
    versionId: z.string().min(1),
    body: z.string().trim().min(1).max(5000),
    annotation: commentAnnotationSchema.optional(),
    parentCommentId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export type CreateExternalShareCommentRequest = z.infer<
  typeof createExternalShareCommentRequestSchema
>;

export const createExternalShareCommentOperationSchema =
  createExternalShareCommentRequestSchema.extend({
    action: z.literal('create_external_share_comment'),
  });

export const createExternalShareCommentResponseSchema = publicShareCommentSchema;

export const decideExternalShareReviewRequestSchema = z
  .object({
    token: z.string().min(16).max(128),
    sessionToken: z.string().min(32).max(256),
    assetId: z.string().min(1),
    versionId: z.string().min(1),
    decision: z.enum(['approved', 'needs_changes']),
    note: z.string().trim().min(1).max(2000).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .strict();
export type DecideExternalShareReviewRequest = z.infer<
  typeof decideExternalShareReviewRequestSchema
>;

export const decideExternalShareReviewOperationSchema =
  decideExternalShareReviewRequestSchema.extend({
    action: z.literal('decide_external_share_review'),
  });

export const externalShareReviewDecisionSchema = z
  .object({
    assetId: z.string().min(1),
    versionId: z.string().min(1),
    decision: z.enum(['approved', 'needs_changes']),
    decidedAt: z.string(),
  })
  .strict();
export type ExternalShareReviewDecision = z.infer<typeof externalShareReviewDecisionSchema>;
