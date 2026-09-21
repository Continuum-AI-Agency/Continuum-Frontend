// The durable "top posts of the brand's top competitors" digest. Each post carries
// its outlierScore — likes + comments over its own account's median — and posts
// are ranked by it (raw engagement for accounts with too few posts to score).
// Written by the backend warm step into brand_profiles.reporting_cache (scope_type
// 'competitor_top_posts') and read by BOTH the Continuum Pulse / onboarding email
// (edge) and the organic agent's calendar-generation grounding (backend). One source
// of truth across Backend (write) ↔ edge email + Backend agent (read).

import { z } from 'zod';
import { instagramPostKindSchema } from '../media/instagram';

// Cache scope + the "top 3 posts for your top 3 competitors" shaping, shared by the
// warm producer and every reader so the numbers never drift per-surface.
export const COMPETITOR_TOP_POSTS_CACHE_SCOPE = 'competitor_top_posts';
export const COMPETITOR_TOP_POSTS_MAX_COMPETITORS = 3;
export const COMPETITOR_TOP_POSTS_PER_COMPETITOR = 3;

export const competitorTopPostSchema = z.object({
  permalink: z.string(),
  // Remote IG CDN thumbnail (short-lived) — rendered shortly after warm. Null when
  // business_discovery returned a cover-less node.
  coverUrl: z.string().nullable(),
  kind: instagramPostKindSchema.nullable(),
  caption: z.string().nullable(),
  timestamp: z.string().nullable(),
  likeCount: z.number().nullable(),
  commentsCount: z.number().nullable(),
  // likeCount + commentsCount (null when both are unknown).
  engagement: z.number().nullable(),
  viewCount: z.number().nullable().optional(),
  // Rank key: engagement ÷ the account's median engagement (null below 12 posts).
  outlierScore: z.number().nullable().optional(),
});
export type CompetitorTopPost = z.infer<typeof competitorTopPostSchema>;

export const competitorTopPostsEntrySchema = z.object({
  competitorId: z.string(),
  name: z.string(),
  instagramUsername: z.string().nullable(),
  followersCount: z.number().nullable(),
  posts: z.array(competitorTopPostSchema),
});
export type CompetitorTopPostsEntry = z.infer<typeof competitorTopPostsEntrySchema>;

export const competitorTopPostsDigestSchema = z.object({
  generatedAt: z.string(),
  competitors: z.array(competitorTopPostsEntrySchema),
});
export type CompetitorTopPostsDigest = z.infer<typeof competitorTopPostsDigestSchema>;
