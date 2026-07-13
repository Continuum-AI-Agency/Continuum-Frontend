// Media-library search request/response envelopes. "text" mode runs NL RAG over
// description embeddings (1536); "similar" mode runs visual nearest-neighbor over
// multimodal image embeddings (1408) for a reference asset.

import { z } from 'zod';
import {
  mediaAssetSchema,
  mediaKindSchema,
  mediaReviewStatusSchema,
  mediaSourceSchema,
} from './asset';
import { customFieldFilterSchema } from './custom-fields';

export const mediaSearchModeSchema = z.enum(['text', 'similar']);
export type MediaSearchMode = z.infer<typeof mediaSearchModeSchema>;

export const mediaSearchFiltersSchema = z
  .object({
    tags: z.array(z.string().min(1)).optional(),
    kind: mediaKindSchema.optional(),
    source: mediaSourceSchema.optional(),
    collectionId: z.string().min(1).optional(),
    reviewStatus: mediaReviewStatusSchema.optional(),
    // Custom-field filters must survive a search, not be dropped by it. A filter
    // the search path ignored would hand back the very assets the user filtered
    // out — the one lie a filter UI cannot tell. The route resolves these to an
    // asset-id allowlist and pushes it INTO the ranking RPCs, exactly as the
    // other filters are pushed, rather than trimming an already-truncated top-K.
    fieldFilters: z.array(customFieldFilterSchema).max(20).optional(),
  })
  .strict();
export type MediaSearchFilters = z.infer<typeof mediaSearchFiltersSchema>;

export const mediaSearchRequestSchema = z
  .object({
    brandId: z.string().min(1),
    mode: mediaSearchModeSchema.default('text'),
    query: z.string().min(1).optional(),
    similarToAssetId: z.string().min(1).optional(),
    filters: mediaSearchFiltersSchema.optional(),
    limit: z.number().int().min(1).max(100).default(24),
    threshold: z.number().min(0).max(1).default(0.2),
  })
  .strict()
  .refine((v) => (v.mode === 'text' ? Boolean(v.query) : Boolean(v.similarToAssetId)), {
    message: 'query is required for text mode; similarToAssetId is required for similar mode',
  });
export type MediaSearchRequest = z.infer<typeof mediaSearchRequestSchema>;

export const mediaSearchResultItemSchema = z
  .object({
    asset: mediaAssetSchema,
    similarity: z.number().min(0).max(1),
  })
  .strict();
export type MediaSearchResultItem = z.infer<typeof mediaSearchResultItemSchema>;

export const mediaSearchResponseSchema = z
  .object({
    mode: mediaSearchModeSchema,
    items: z.array(mediaSearchResultItemSchema),
  })
  .strict();
export type MediaSearchResponse = z.infer<typeof mediaSearchResponseSchema>;
