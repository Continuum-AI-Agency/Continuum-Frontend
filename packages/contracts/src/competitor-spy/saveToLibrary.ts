// Save a competitor's organic Instagram post into the brand's media Library as a
// durable, tagged asset — and make it RE-FETCHABLE. The saved asset re-hosts the
// cover image (IG CDN URLs expire) and carries a rich origin_ref key so the full,
// LIVE post (fresh media + engagement) can be re-pulled via business_discovery when
// it's grabbed as a "competitor post" (inspiration / organic-agent grounding).

import { z } from 'zod';
import {
  instagramMediaKindSchema,
  instagramPostKindSchema,
  instagramPostSchema,
} from '../media/instagram';

// The canonical tag + source marker for "this Library asset is a competitor post".
// Retrieval filters on source='inspiration' + this tag (media_search supports both).
// source/origin_ref are durable (analyze_media never touches them); the tag is
// seeded at save and preserved by analyze_media's tag union.
export const COMPETITOR_POST_TAG = 'competitor-post';

// Seeded on the NON-cover slides of a saved carousel. A carousel saves one
// media.assets row per slide (all sharing origin_ref.postId); this tag lets the
// human Library grid hide the non-cover slides and render just the cover as one
// grouped carousel tile. The agent's media_search does NOT filter it out, so
// every slide stays individually searchable.
export const CAROUSEL_SLIDE_TAG = 'carousel-slide';

// A single slide of a saved carousel, recorded compactly on the COVER row's
// origin_ref so the Library can page through all slides without a sibling query.
export const competitorPostSlideRefSchema = z.object({
  slideIndex: z.number().int().nonnegative(),
  kind: instagramMediaKindSchema,
  bucket: z.string(),
  storagePath: z.string(),
});
export type CompetitorPostSlideRef = z.infer<typeof competitorPostSlideRefSchema>;

// Stored in media.assets.origin_ref — the durable re-fetch key. `kind` discriminates
// the origin_ref union alongside canvas/inspiration refs. Carousels save one row
// per slide: every row carries slideIndex/slideCount; the cover (slideIndex 0)
// additionally carries `slides` (the full ordered slide index for display paging).
export const competitorPostOriginRefSchema = z.object({
  kind: z.literal('competitor_organic'),
  competitorId: z.string().nullable().optional(),
  competitorName: z.string(),
  instagramUsername: z.string(),
  postId: z.string(),
  shortcode: z.string(),
  permalink: z.string(),
  postKind: instagramPostKindSchema,
  slideIndex: z.number().int().nonnegative().optional(),
  slideCount: z.number().int().positive().optional(),
  slideKind: instagramMediaKindSchema.optional(),
  slides: z.array(competitorPostSlideRefSchema).optional(),
});
export type CompetitorPostOriginRef = z.infer<typeof competitorPostOriginRefSchema>;

export const saveCompetitorPostToLibraryRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    competitorId: z.string().uuid().nullable().optional(),
    competitorName: z.string().min(1).max(200),
    instagramUsername: z.string().min(1).max(64),
    post: instagramPostSchema,
  })
  .strict();
export type SaveCompetitorPostToLibraryRequest = z.infer<
  typeof saveCompetitorPostToLibraryRequestSchema
>;

export const saveCompetitorPostToLibraryResponseSchema = z.object({
  // The cover slide's asset id (slideIndex 0), kept as the primary id for
  // back-compat. `assetIds` lists every persisted slide; `slideCount` is how many
  // slides the post had (1 for single posts/reels, N for carousels).
  assetId: z.string().nullable(),
  assetIds: z.array(z.string()).default([]),
  slideCount: z.number().int().nonnegative().default(1),
  alreadyExisted: z.boolean(),
});
export type SaveCompetitorPostToLibraryResponse = z.infer<
  typeof saveCompetitorPostToLibraryResponseSchema
>;

// The set of competitor-post ids already saved to a brand's Library. Lets the UI
// show a persistent "Saved" affordance on re-render/remount instead of resetting
// to an un-saved state (dedup key mirrors the save path: origin_ref->>postId).
export const savedCompetitorPostIdsResponseSchema = z.object({
  postIds: z.array(z.string()),
});
export type SavedCompetitorPostIdsResponse = z.infer<typeof savedCompetitorPostIdsResponseSchema>;

// Re-fetch the live post for a saved competitor-post asset (by asset id → its
// origin_ref → business_discovery). `post` is null when the account no longer
// exposes it (business_discovery only returns recent media).
export const refetchCompetitorPostRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
  })
  .strict();
export type RefetchCompetitorPostRequest = z.infer<typeof refetchCompetitorPostRequestSchema>;

export const refetchCompetitorPostResponseSchema = z.object({
  post: instagramPostSchema.nullable(),
  originRef: competitorPostOriginRefSchema,
});
export type RefetchCompetitorPostResponse = z.infer<typeof refetchCompetitorPostResponseSchema>;
