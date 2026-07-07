// Save a competitor's organic Instagram post into the brand's media Library as a
// durable, tagged asset — and make it RE-FETCHABLE. The saved asset re-hosts the
// cover image (IG CDN URLs expire) and carries a rich origin_ref key so the full,
// LIVE post (fresh media + engagement) can be re-pulled via business_discovery when
// it's grabbed as a "competitor post" (inspiration / organic-agent grounding).

import { z } from 'zod';
import { instagramPostKindSchema, instagramPostSchema } from '../media/instagram';

// The canonical tag + source marker for "this Library asset is a competitor post".
// Retrieval filters on source='inspiration' + this tag (media_search supports both).
// source/origin_ref are durable (analyze_media never touches them); the tag is
// seeded at save and preserved by analyze_media's tag union.
export const COMPETITOR_POST_TAG = 'competitor-post';

// Stored in media.assets.origin_ref — the durable re-fetch key. `kind` discriminates
// the origin_ref union alongside canvas/inspiration refs.
export const competitorPostOriginRefSchema = z.object({
  kind: z.literal('competitor_organic'),
  competitorId: z.string().nullable().optional(),
  competitorName: z.string(),
  instagramUsername: z.string(),
  postId: z.string(),
  shortcode: z.string(),
  permalink: z.string(),
  postKind: instagramPostKindSchema,
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
  assetId: z.string().nullable(),
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
