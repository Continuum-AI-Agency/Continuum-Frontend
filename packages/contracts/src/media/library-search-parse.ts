// Natural-language Library search → structured filters. The Frontend holds no
// model key, so the Backend turns "videos from last week tagged summer" into
// { kind: 'video', tags: ['summer'], createdAfter, createdBefore } and hands the
// residual free text back for ranking.

import { z } from 'zod';
import { mediaKindSchema, mediaReviewStatusSchema, mediaSourceSchema } from './asset';
import { visualQueryEmbeddingSchema } from './search';

export const librarySearchParseRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    query: z.string().trim().min(1).max(500),
    // The caller's "now", so "last week" means the user's last week even when a
    // test or a bench pins the clock.
    now: z.string().datetime().optional(),
  })
  .strict();
export type LibrarySearchParseRequest = z.infer<typeof librarySearchParseRequestSchema>;

export const librarySearchParsedFiltersSchema = z
  .object({
    kind: mediaKindSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    source: mediaSourceSchema.optional(),
    reviewStatus: mediaReviewStatusSchema.optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
  })
  .strict();
export type LibrarySearchParsedFilters = z.infer<typeof librarySearchParsedFiltersSchema>;

export const librarySearchParseResponseSchema = z
  .object({
    // Residual free text for ranking; '' when the whole query was filters.
    query: z.string(),
    filters: librarySearchParsedFiltersSchema,
    // false = the model was unavailable and `query` is the original text.
    interpreted: z.boolean(),
    // The original query embedded into the image space, for visual search over
    // untagged footage. null when Vertex was unavailable; absent from an older Backend.
    visualEmbedding: visualQueryEmbeddingSchema.nullable().optional(),
  })
  .strict();
export type LibrarySearchParseResponse = z.infer<typeof librarySearchParseResponseSchema>;
