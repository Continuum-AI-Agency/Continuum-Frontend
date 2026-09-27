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

// media.assets.embedding_image width (Vertex multimodalembedding@001). Text and
// images embed into this one space, which is what makes visual text search work.
export const IMAGE_EMBEDDING_DIM = 1408;
export const visualQueryEmbeddingSchema = z.array(z.number()).length(IMAGE_EMBEDDING_DIM);

export const mediaSearchModeSchema = z.enum(['text', 'similar']);
export type MediaSearchMode = z.infer<typeof mediaSearchModeSchema>;

export const mediaSearchFiltersSchema = z
  .object({
    tags: z.array(z.string().min(1)).optional(),
    kind: mediaKindSchema.optional(),
    source: mediaSourceSchema.optional(),
    collectionId: z.string().min(1).optional(),
    reviewStatus: mediaReviewStatusSchema.optional(),
    fieldFilters: z.array(customFieldFilterSchema).max(20).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
  })
  .strict();
export type MediaSearchFilters = z.infer<typeof mediaSearchFiltersSchema>;

// A text search may be filters alone ("videos from last week" parses to no
// residual words); the route then lists the filtered assets newest-first.
export function hasActiveSearchFilters(filters: MediaSearchFilters | undefined): boolean {
  if (!filters) return false;
  return Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}

export const mediaSearchRequestSchema = z
  .object({
    brandId: z.string().min(1),
    mode: mediaSearchModeSchema.default('text'),
    query: z.string().min(1).optional(),
    similarToAssetId: z.string().min(1).optional(),
    // The query embedded into the IMAGE space (minted by the Backend parse
    // route); matches footage no one tagged or described.
    visualEmbedding: visualQueryEmbeddingSchema.optional(),
    filters: mediaSearchFiltersSchema.optional(),
    limit: z.number().int().min(1).max(100).default(24),
    threshold: z.number().min(0).max(1).default(0.2),
  })
  .strict()
  .refine(
    (v) =>
      v.mode === 'text'
        ? Boolean(v.query) || hasActiveSearchFilters(v.filters)
        : Boolean(v.similarToAssetId),
    {
      message:
        'query or a filter is required for text mode; similarToAssetId is required for similar mode',
    },
  );
export type MediaSearchRequest = z.infer<typeof mediaSearchRequestSchema>;

export const mediaSearchMatchReasonSchema = z.enum([
  'semantic',
  'visual',
  'title',
  'tags',
  'description',
  'transcript',
  'comment',
  'filters',
]);
export type MediaSearchMatchReason = z.infer<typeof mediaSearchMatchReasonSchema>;

export const mediaSearchResultItemSchema = z
  .object({
    asset: mediaAssetSchema,
    similarity: z.number().min(0).max(1),
    matchedOn: z.array(mediaSearchMatchReasonSchema).optional(),
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
