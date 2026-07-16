import { z } from 'zod';
import { mediaAssetSchema, mediaReviewStatusSchema, mediaSourceSchema } from './asset';

/** Stable URL/API values for ordering the creative library. */
export const librarySortSchema = z.enum([
  'created_desc',
  'updated_desc',
  'name_asc',
  'name_desc',
  'size_desc',
  'duration_desc',
  'most_used',
  'best_performing',
  'manual',
]);

export type LibrarySort = z.infer<typeof librarySortSchema>;

export const DEFAULT_LIBRARY_SORT: LibrarySort = 'created_desc';

export const libraryMediaTypeSchema = z.enum(['all', 'image', 'video', 'carousel', 'project_file']);
export type LibraryMediaType = z.infer<typeof libraryMediaTypeSchema>;

export const libraryPlacementSchema = z.enum(['reel', 'story', 'feed', 'ad', 'other']);
export type LibraryPlacement = z.infer<typeof libraryPlacementSchema>;

export const libraryPerformanceWindowSchema = z.enum(['d7', 'd14', 'd30']);
export type LibraryPerformanceWindow = z.infer<typeof libraryPerformanceWindowSchema>;

export const libraryLayoutSchema = z.enum(['grid', 'board']);
export type LibraryLayout = z.infer<typeof libraryLayoutSchema>;

export const libraryBrowseQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    mediaType: libraryMediaTypeSchema.default('all'),
    createdWith: z.array(mediaSourceSchema).default([]),
    placements: z.array(libraryPlacementSchema).default([]),
    tags: z.array(z.string().min(1)).default([]),
    reviewStatuses: z.array(mediaReviewStatusSchema).default([]),
    ownerIds: z.array(z.string().uuid()).default([]),
    campaignIds: z.array(z.string().min(1)).default([]),
    usageRights: z.array(z.enum(['owned', 'licensed', 'restricted', 'expired'])).default([]),
    collectionId: z.string().uuid().nullable().optional(),
    used: z.boolean().nullable().optional(),
    shared: z.boolean().nullable().optional(),
    leadingOnly: z.boolean().default(false),
    search: z.string().max(500).default(''),
    sort: librarySortSchema.default(DEFAULT_LIBRARY_SORT),
    performanceWindow: libraryPerformanceWindowSchema.default('d30'),
    layout: libraryLayoutSchema.default('grid'),
    boardGroupBy: z.string().min(1).max(100).default('review_status'),
    cursor: z.string().min(1).nullable().optional(),
    limit: z.number().int().min(1).max(96).default(48),
  })
  .strict();
export type LibraryBrowseQuery = z.infer<typeof libraryBrowseQuerySchema>;

export const libraryFacetCountSchema = z
  .object({ value: z.string().min(1), count: z.number().int().nonnegative() })
  .strict();

export const libraryBrowseFacetsSchema = z
  .object({
    mediaTypes: z.array(libraryFacetCountSchema),
    createdWith: z.array(libraryFacetCountSchema),
    placements: z.array(libraryFacetCountSchema),
    tags: z.array(libraryFacetCountSchema),
    reviewStatuses: z.array(libraryFacetCountSchema),
  })
  .strict();
export type LibraryBrowseFacets = z.infer<typeof libraryBrowseFacetsSchema>;

export const libraryBrowsePageSchema = z
  .object({
    items: z.array(mediaAssetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type LibraryBrowsePage = z.infer<typeof libraryBrowsePageSchema>;
