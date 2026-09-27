// Creative Operations dispatcher actions added by the Library foundation wave.
//
// These live here rather than in creative-operations.ts because they reuse the
// share and review schemas, and asset.ts (which both of those import) already
// imports creative-operations.ts — putting them there would close a cycle.

import { z } from 'zod';
import { reviewCustomStateSchema, reviewStateLabelSchema, reviewStateLabelsSchema } from './review';
import { shareLinkBrandingSchema, shareLinkLayoutSchema, shareLinkWatermarkSchema } from './share';

const uuid = () => z.string().uuid();

const foundationCommandBase = {
  brandId: uuid(),
  actor: uuid(),
  idempotencyKey: z.string().min(1).max(200),
} as const;

// Stacking files source assets under a target as its newest versions.
export const stackAssetsOperationSchema = z
  .object({
    action: z.literal('stack_assets'),
    ...foundationCommandBase,
    targetAssetId: uuid(),
    sourceAssetIds: z.array(uuid()).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.sourceAssetIds).size !== value.sourceAssetIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceAssetIds'],
        message: 'sourceAssetIds must be distinct',
      });
    }
    if (value.sourceAssetIds.includes(value.targetAssetId)) {
      context.addIssue({
        code: 'custom',
        path: ['sourceAssetIds'],
        message: 'An asset cannot be stacked into itself',
      });
    }
  });
export type StackAssetsOperation = z.infer<typeof stackAssetsOperationSchema>;

export const stackAssetsResultSchema = z
  .object({
    targetAssetId: uuid(),
    stackedAssetIds: z.array(uuid()),
    versionIds: z.array(uuid()),
    headVersionId: uuid(),
  })
  .strict();
export type StackAssetsResult = z.infer<typeof stackAssetsResultSchema>;

// Undoes a soft delete. An asset that was stacked into another is refused.
export const restoreAssetsOperationSchema = z
  .object({
    action: z.literal('restore_assets'),
    ...foundationCommandBase,
    assetIds: z.array(uuid()).min(1).max(250),
  })
  .strict();
export type RestoreAssetsOperation = z.infer<typeof restoreAssetsOperationSchema>;

export const restoreAssetsResultSchema = z
  .object({
    restoredAssetIds: z.array(uuid()),
    refusedAssetIds: z.array(uuid()),
  })
  .strict();
export type RestoreAssetsResult = z.infer<typeof restoreAssetsResultSchema>;

export const updateShareLinkOperationSchema = z
  .object({
    action: z.literal('update_share_link'),
    ...foundationCommandBase,
    shareLinkId: uuid(),
    layout: shareLinkLayoutSchema.optional(),
    branding: shareLinkBrandingSchema.optional(),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: uuid().nullable().optional(),
    allowComments: z.boolean().optional(),
    allowApproval: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    showMetadata: z.boolean().optional(),
    showCustomFields: z.boolean().optional(),
    requireIdentity: z.boolean().optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    assetOrder: z.array(uuid()).max(500).optional(),
  })
  .strict();
export type UpdateShareLinkOperation = z.infer<typeof updateShareLinkOperationSchema>;

// The updated media.share_links row exactly as the DB returns it (snake_case).
export const updateShareLinkResultSchema = z.object({ id: uuid() }).catchall(z.unknown());
export type UpdateShareLinkResult = z.infer<typeof updateShareLinkResultSchema>;

// Fans one review request per asset in the collection out to the reviewers.
export const requestCollectionReviewOperationSchema = z
  .object({
    action: z.literal('request_collection_review'),
    ...foundationCommandBase,
    collectionId: uuid(),
    reviewerUserIds: z.array(uuid()).min(1).max(50),
    note: z.string().max(2000).optional(),
    dueAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type RequestCollectionReviewOperation = z.infer<
  typeof requestCollectionReviewOperationSchema
>;

export const requestCollectionReviewResultSchema = z
  .object({
    collectionId: uuid(),
    requestIds: z.array(uuid()),
    assetIds: z.array(uuid()),
    skippedAssetIds: z.array(uuid()),
  })
  .strict();
export type RequestCollectionReviewResult = z.infer<typeof requestCollectionReviewResultSchema>;

export const setReviewStateLabelsOperationSchema = z
  .object({
    action: z.literal('set_review_state_labels'),
    ...foundationCommandBase,
    labels: reviewStateLabelsSchema,
  })
  .strict();
export type SetReviewStateLabelsOperation = z.infer<typeof setReviewStateLabelsOperationSchema>;

export const setReviewStateLabelsResultSchema = z
  .object({
    labels: z.array(reviewStateLabelSchema),
    customStates: z.array(reviewCustomStateSchema).default([]),
  })
  .strict();
export type SetReviewStateLabelsResult = z.infer<typeof setReviewStateLabelsResultSchema>;

// A Template Forge render output, registered once per slot: a re-render of the
// same slot becomes a new version of the same asset. Called by the render
// service, which may have no acting user.
export const registerForgeOutputOperationSchema = z
  .object({
    action: z.literal('register_forge_output'),
    ...foundationCommandBase,
    actor: uuid().nullable().optional(),
    slot: z.string().min(1).max(300),
    templateAssetId: uuid().nullable().optional(),
    templateVersionId: uuid().nullable().optional(),
    renderSetId: uuid().nullable().optional(),
    renderJobId: uuid(),
    renderRequestId: uuid().nullable().optional(),
    templateKey: z.string().min(1).nullable().optional(),
    bucket: z.string().min(1).max(100),
    storagePath: z.string().min(1).max(1024),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().regex(/^(image|video|audio)\//),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    checksum: z.string().min(1).nullable().optional(),
    lineage: z.record(z.string(), z.unknown()).default({}),
    // Backfill only: an output registered before the bridge existed is converted in place
    // (or stacked into the slot's asset as its next version) instead of duplicated.
    adoptAssetId: uuid().nullable().optional(),
  })
  .strict();
export type RegisterForgeOutputOperation = z.infer<typeof registerForgeOutputOperationSchema>;

export const registerForgeOutputResultSchema = z
  .object({
    assetId: uuid(),
    versionId: uuid(),
    created: z.boolean(),
    collectionId: uuid().nullable(),
  })
  .strict();
export type RegisterForgeOutputResult = z.infer<typeof registerForgeOutputResultSchema>;

export const libraryFoundationActionSchema = z.enum([
  'stack_assets',
  'restore_assets',
  'update_share_link',
  'request_collection_review',
  'set_review_state_labels',
  'register_forge_output',
]);
export type LibraryFoundationAction = z.infer<typeof libraryFoundationActionSchema>;

export const libraryFoundationOperationSchema = z.discriminatedUnion('action', [
  stackAssetsOperationSchema,
  restoreAssetsOperationSchema,
  updateShareLinkOperationSchema,
  requestCollectionReviewOperationSchema,
  setReviewStateLabelsOperationSchema,
  registerForgeOutputOperationSchema,
]);
export type LibraryFoundationOperation = z.infer<typeof libraryFoundationOperationSchema>;
