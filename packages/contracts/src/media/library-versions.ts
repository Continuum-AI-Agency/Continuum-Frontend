import { z } from 'zod';

// Version-stack edits a Library user makes after stacking: pull one version back out
// into an asset of its own, or put the stack in a different order (the last one is the
// head). Both are brand-scoped, idempotent commands the edge function forwards to SQL.

const uuid = () => z.string().uuid();

export const unstackAssetVersionRequestSchema = z
  .object({
    brandId: uuid(),
    assetId: uuid(),
    versionId: uuid(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export type UnstackAssetVersionRequest = z.infer<typeof unstackAssetVersionRequestSchema>;

export const unstackAssetVersionResultSchema = z
  .object({
    sourceAssetId: uuid(),
    newAssetId: uuid(),
    newVersionId: uuid(),
    headVersionId: uuid(),
  })
  .strict();
export type UnstackAssetVersionResult = z.infer<typeof unstackAssetVersionResultSchema>;

export const reorderAssetVersionsRequestSchema = z
  .object({
    brandId: uuid(),
    assetId: uuid(),
    /** Every version of the asset, oldest first; the last becomes the head. */
    versionIds: z.array(uuid()).min(2).max(200),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict()
  .refine((value) => new Set(value.versionIds).size === value.versionIds.length, {
    message: 'versionIds must be distinct',
    path: ['versionIds'],
  });
export type ReorderAssetVersionsRequest = z.infer<typeof reorderAssetVersionsRequestSchema>;

export const reorderAssetVersionsResultSchema = z
  .object({
    assetId: uuid(),
    headVersionId: uuid(),
    headChanged: z.boolean(),
  })
  .strict();
export type ReorderAssetVersionsResult = z.infer<typeof reorderAssetVersionsResultSchema>;
