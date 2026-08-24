import { z } from 'zod';
import { CAROUSEL_SLIDE_TAG } from '../competitor-spy/saveToLibrary';
import { mediaAssetSchema, mediaReviewStatusSchema, mediaSourceSchema } from './asset';
import { ELEMENT_REFERENCE_TAG } from './element';

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

// System tags whose assets are real Library rows but do NOT belong in a default browse:
// they are components of something else the grid already shows, or machinery the user
// never asked to see.
//
//   carousel-slide    — the non-cover slides of a saved carousel; the cover already
//                       occupies one browse slot for the whole set.
//   element-reference — the generated reference image behind an Element; a brand with
//                       twenty Elements would otherwise find its Library full of
//                       near-identical studio shots.
//
// One list rather than a literal per call site: this was previously restated at four
// sites (backend libraryManage + metadataSearch, frontend filters + carousel), which is
// four chances for them to disagree about what "default browse" means. Search and the
// agent-facing tools still reach these assets — hidden is not deleted.
export const HIDDEN_LIBRARY_TAGS: readonly string[] = [CAROUSEL_SLIDE_TAG, ELEMENT_REFERENCE_TAG];

/** PostgREST array literal for a `not('tags','ov',…)` overlap exclusion. */
export const HIDDEN_LIBRARY_TAGS_FILTER = `{${HIDDEN_LIBRARY_TAGS.join(',')}}`;
