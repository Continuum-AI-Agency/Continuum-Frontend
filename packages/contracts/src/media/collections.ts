import { z } from 'zod';
import { mediaCollectionSchema } from './asset';
import { mediaReviewStatusSchema } from './asset';
import { customFieldValueSchema } from './custom-fields';
import { libraryBrowseQuerySchema } from './library-browse';

const collectionCommandBase = {
  brandId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200).optional(),
} as const;

export const createLibraryCollectionOperationSchema = z
  .object({
    action: z.literal('create_library_collection'),
    ...collectionCommandBase,
    name: z.string().trim().min(1).max(120),
    kind: z.enum(['manual', 'smart']).default('manual'),
    smartQuery: libraryBrowseQuerySchema.omit({ cursor: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'smart' && !value.smartQuery) {
      context.addIssue({ code: 'custom', message: 'smartQuery is required for smart collections' });
    }
    if (value.smartQuery && value.smartQuery.brandId !== value.brandId) {
      context.addIssue({ code: 'custom', message: 'smartQuery brandId must match brandId' });
    }
  });

export const updateLibraryCollectionOperationSchema = z
  .object({
    action: z.literal('update_library_collection'),
    ...collectionCommandBase,
    collectionId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    smartQuery: libraryBrowseQuerySchema.omit({ cursor: true }).nullable().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.smartQuery !== undefined, {
    message: 'name or smartQuery is required',
  });

export const deleteLibraryCollectionOperationSchema = z
  .object({
    action: z.literal('delete_library_collection'),
    ...collectionCommandBase,
    collectionId: z.string().uuid(),
  })
  .strict();

export const mutateCollectionMembershipOperationSchema = z
  .object({
    action: z.literal('mutate_collection_membership'),
    ...collectionCommandBase,
    collectionId: z.string().uuid(),
    assetIds: z.array(z.string().uuid()).min(1).max(250),
    mode: z.enum(['add', 'remove']),
  })
  .strict();

export const bulkUpdateAssetTagsOperationSchema = z
  .object({
    action: z.literal('bulk_update_asset_tags'),
    ...collectionCommandBase,
    assetIds: z.array(z.string().uuid()).min(1).max(250),
    addTags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    removeTags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  })
  .strict()
  .refine((value) => value.addTags.length > 0 || value.removeTags.length > 0, {
    message: 'addTags or removeTags is required',
  });

export const bulkTransitionAssetReviewOperationSchema = z
  .object({
    action: z.literal('bulk_transition_asset_review'),
    ...collectionCommandBase,
    assetIds: z.array(z.string().uuid()).min(1).max(250),
    toStatus: mediaReviewStatusSchema,
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const bulkSetAssetFieldValueOperationSchema = z
  .object({
    action: z.literal('bulk_set_asset_field_value'),
    ...collectionCommandBase,
    assetIds: z.array(z.string().uuid()).min(1).max(250),
    fieldId: z.string().uuid(),
    value: customFieldValueSchema,
  })
  .strict();

const managedTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((tag) => !tag.startsWith('__'), 'System tags cannot be managed');

export const renameLibraryTagOperationSchema = z
  .object({
    action: z.literal('rename_library_tag'),
    ...collectionCommandBase,
    fromTag: managedTagSchema,
    toTag: managedTagSchema,
  })
  .strict()
  .refine((value) => value.fromTag.toLocaleLowerCase() !== value.toTag.toLocaleLowerCase(), {
    message: 'The new tag must be different',
  });

export const mergeLibraryTagsOperationSchema = z
  .object({
    action: z.literal('merge_library_tags'),
    ...collectionCommandBase,
    sourceTags: z.array(managedTagSchema).min(1).max(50),
    targetTag: managedTagSchema,
  })
  .strict()
  .refine(
    (value) =>
      !value.sourceTags.some(
        (sourceTag) => sourceTag.toLocaleLowerCase() === value.targetTag.toLocaleLowerCase(),
      ),
    { message: 'The target tag cannot also be a source tag' },
  );

export const libraryCollectionCommandResponseSchema = z
  .object({ collection: mediaCollectionSchema })
  .strict();

export const libraryBulkCommandResponseSchema = z
  .object({ updatedAssetIds: z.array(z.string().min(1)) })
  .strict();

export const libraryCollectionDeleteResponseSchema = z
  .object({ collectionId: z.string().min(1) })
  .strict();

export const libraryTagMutationResponseSchema = z
  .object({
    canonicalTag: z.string().min(1),
    mergedTags: z.array(z.string().min(1)).min(1),
    updatedAssetCount: z.number().int().nonnegative(),
  })
  .strict();
