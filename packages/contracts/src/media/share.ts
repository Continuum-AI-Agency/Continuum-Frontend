// Tokened, view-only share links for external stakeholders (no account
// needed). Backed by media.share_links (deny-all RLS — only the server
// resolves tokens); the public route validates token + expiry + revocation
// server-side and mints short-lived signed URLs per request.

import { z } from 'zod';
import { mediaAssetSchema } from './asset';
import { commentAnnotationSchema, commentAttachmentsSchema } from './comments';
import {
  type CustomFieldType,
  customFieldOptionsSchema,
  customFieldTypeSchema,
  customFieldValueSchema,
} from './custom-fields';

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

export const shareLinkLayoutSchema = z.enum(['grid', 'list', 'reel']);
export type ShareLinkLayout = z.infer<typeof shareLinkLayoutSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// How the public share page presents the brand (media.share_links.branding).
export const shareLinkBrandingSchema = z
  .object({
    logoAssetId: z.string().uuid().optional(),
    accent: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    headerTitle: z.string().max(120).optional(),
    description: z.string().max(1000).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    // Drops the "Shared via Continuum" line for a fully white-labelled page.
    hideFooter: z.boolean().optional(),
  })
  .strict();
export type ShareLinkBranding = z.infer<typeof shareLinkBrandingSchema>;

export const shareLinkWatermarkPositionSchema = z.enum([
  'center',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
  'tiled',
]);
export type ShareLinkWatermarkPosition = z.infer<typeof shareLinkWatermarkPositionSchema>;

export const DEFAULT_SHARE_WATERMARK_TEMPLATE = '{name} · {email} · {time}';

// media.share_links.watermark: null means no watermark. burnDownloads stamps
// downloaded files too, not only the on-page preview.
export const shareLinkWatermarkSchema = z
  .object({
    template: z.string().max(200).default(DEFAULT_SHARE_WATERMARK_TEMPLATE),
    position: shareLinkWatermarkPositionSchema,
    opacity: z.number().min(0.05).max(1),
    burnDownloads: z.boolean(),
  })
  .strict();
export type ShareLinkWatermark = z.infer<typeof shareLinkWatermarkSchema>;

export type ShareWatermarkViewer = {
  name: string | null;
  email: string | null;
  ip?: string | null;
  time: Date;
};

// The overlay text for one viewer. The share page draws it live and the
// Backend burns the same string into downloads, so both read this one function.
export function renderShareWatermarkText(template: string, viewer: ShareWatermarkViewer): string {
  const time = viewer.time.toISOString().slice(0, 16).replace('T', ' ');
  return template
    .replaceAll('{name}', viewer.name ?? '')
    .replaceAll('{email}', viewer.email ?? '')
    .replaceAll('{ip}', viewer.ip ?? '')
    .replaceAll('{time}', `${time} UTC`)
    .replace(/(\s*·\s*)+$/, '')
    .replace(/^(\s*·\s*)+/, '')
    .trim();
}

// A guest edits exactly one value per asset; member-picking ('user') and
// multi-value types need a seat's context, so they cannot be featured.
export const SHARE_FEATURED_FIELD_TYPES = [
  'single_select',
  'status',
  'text',
  'number',
  'checkbox',
  'rating',
  'date',
  'url',
] as const satisfies readonly CustomFieldType[];

export function isShareFeaturableFieldType(type: CustomFieldType): boolean {
  return (SHARE_FEATURED_FIELD_TYPES as readonly CustomFieldType[]).includes(type);
}

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
    layout: shareLinkLayoutSchema.default('grid'),
    branding: shareLinkBrandingSchema.default({}),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: z.string().uuid().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    revokedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    // Transient: absolute public URL for the token, built at read time.
    url: z.string().nullable().optional(),
  })
  .strict();
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const shareLinkEventKindSchema = z.enum([
  'open',
  'view',
  'play',
  'download',
  'download_all',
  'comment',
  'decision',
  'field_edit',
]);
export type ShareLinkEventKind = z.infer<typeof shareLinkEventKindSchema>;

// One row of media.share_link_events — what an external reviewer did on a link.
export const shareLinkEventSchema = z
  .object({
    id: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    brandId: z.string().uuid(),
    reviewerSessionId: z.string().uuid().nullable(),
    assetId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    kind: shareLinkEventKindSchema,
    ipHash: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type ShareLinkEvent = z.infer<typeof shareLinkEventSchema>;

// The events a share page reports from the browser; the rest are recorded
// server-side where the action happens.
export const shareBeaconEventKindSchema = z.enum(['open', 'view', 'play']);
export const shareBeaconEventRequestSchema = z
  .object({
    kind: shareBeaconEventKindSchema,
    assetId: z.string().uuid().optional(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type ShareBeaconEventRequest = z.infer<typeof shareBeaconEventRequestSchema>;

// One event as the share owner sees it: attributed to the reviewer by name.
export const shareLinkActivityEventSchema = z
  .object({
    id: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    kind: shareLinkEventKindSchema,
    assetId: z.string().uuid().nullable(),
    assetTitle: z.string().nullable(),
    versionId: z.string().uuid().nullable(),
    reviewerName: z.string().nullable(),
    reviewerEmail: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type ShareLinkActivityEvent = z.infer<typeof shareLinkActivityEventSchema>;

export const shareLinkMemberSchema = z
  .object({
    assetId: z.string().uuid(),
    title: z.string(),
    kind: z.string(),
  })
  .strict();
export type ShareLinkMember = z.infer<typeof shareLinkMemberSchema>;

// GET /api/library/share/manage — one link with what its owner edits and sees.
export const shareLinkDetailResponseSchema = z
  .object({
    link: shareLinkSchema,
    members: z.array(shareLinkMemberSchema),
    events: z.array(shareLinkActivityEventSchema),
  })
  .strict();
export type ShareLinkDetailResponse = z.infer<typeof shareLinkDetailResponseSchema>;

export const shareLinkActivityResponseSchema = z
  .object({ events: z.array(shareLinkActivityEventSchema) })
  .strict();
export type ShareLinkActivityResponse = z.infer<typeof shareLinkActivityResponseSchema>;

// PATCH /api/library/share/manage — the owner's edit; the route adds the actor.
export const updateShareLinkRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(200).optional(),
    layout: shareLinkLayoutSchema.optional(),
    branding: shareLinkBrandingSchema.optional(),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: z.string().uuid().nullable().optional(),
    assetOrder: z.array(z.string().uuid()).max(500).optional(),
  })
  .strict();
export type UpdateShareLinkRequest = z.infer<typeof updateShareLinkRequestSchema>;

// Share page → Backend share delivery. The reviewer's session token proves who
// the watermark names; the signed storage URLs prove the page was allowed to
// hand those files out.
export const shareDeliveryFileSchema = z
  .object({
    url: z.string().url(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
  })
  .strict();
export type ShareDeliveryFile = z.infer<typeof shareDeliveryFileSchema>;

export const shareDeliveryRequestSchema = z
  .object({
    token: z.string().min(16).max(128),
    sessionToken: z.string().min(32).max(256).optional(),
    viewerIp: z.string().max(64).optional(),
    files: z.array(shareDeliveryFileSchema).min(1).max(1000),
    zipName: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ShareDeliveryRequest = z.infer<typeof shareDeliveryRequestSchema>;

export const shareFeaturedFieldSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: customFieldTypeSchema,
    options: customFieldOptionsSchema,
  })
  .strict();
export type ShareFeaturedField = z.infer<typeof shareFeaturedFieldSchema>;

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
    context.addIssue({
      code: 'custom',
      message: 'pinnedVersionId is required for pinned asset links',
    });
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
// What a guest needs to preview a comment's attachment in place. Signed for the
// share page like the shared assets themselves; only attachments of comments the
// brand chose to share ever get here.
export const publicShareAttachmentPreviewSchema = z
  .object({
    assetId: z.string().min(1),
    kind: z.enum(['image', 'video', 'audio', 'file']),
    name: z.string(),
    mimeType: z.string().nullable(),
    url: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
  })
  .strict();
export type PublicShareAttachmentPreview = z.infer<typeof publicShareAttachmentPreviewSchema>;

export const publicShareCommentSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    versionId: z.string().nullable().optional(),
    parentCommentId: z.string().nullable().optional(),
    body: z.string(),
    annotation: commentAnnotationSchema.nullable().optional(),
    attachments: commentAttachmentsSchema.optional(),
    attachmentPreviews: z.array(publicShareAttachmentPreviewSchema).max(10).optional(),
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
    layout: shareLinkLayoutSchema.optional(),
    branding: shareLinkBrandingSchema.optional(),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: z.string().uuid().nullable().optional(),
    // Resolved presentation: brand kit defaults under the link's overrides.
    logoUrl: z.string().nullable().optional(),
    featuredField: shareFeaturedFieldSchema.nullable().optional(),
    featuredValues: z.record(z.string(), customFieldValueSchema).optional(),
    viewerIp: z.string().nullable().optional(),
    // Collection shares page instead of truncating; total counts every member.
    pagination: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        total: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
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
export type ExternalReviewerSessionRequest = z.infer<typeof externalReviewerSessionRequestSchema>;

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
export type ExternalReviewerSessionResponse = z.infer<typeof externalReviewerSessionResponseSchema>;

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
