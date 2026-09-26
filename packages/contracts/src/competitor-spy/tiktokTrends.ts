// TikTok trends for a brand's markets (GET /api/competitor-ad-spy/tiktok/trends), from
// TikTok's official Discovery API only. Top videos carry NO metrics — TikTok's Discovery
// video list and oEmbed return none — so the UI must not imply any.

import { z } from 'zod';

export const tiktokTrendVideoSchema = z
  .object({
    shareUrl: z.string(),
    caption: z.string().nullable(),
    authorName: z.string().nullable(),
    authorHandle: z.string().nullable(),
    // A signed URL that expires; fine to show while the trend row is live, never to persist.
    thumbnailUrl: z.string().nullable(),
    // The author is one of the brand's tracked competitors.
    isCompetitor: z.boolean(),
  })
  .strict();
export type TiktokTrendVideo = z.infer<typeof tiktokTrendVideoSchema>;

export const tiktokTrendingHashtagSchema = z
  .object({
    label: z.string(),
    // Summed across the brand's markets for the 7-day window.
    posts: z.number(),
    views: z.number(),
    growthRate: z.number().nullable(),
    byCountry: z.array(
      z
        .object({
          country: z.string(),
          rank: z.number(),
          // A signed integer as text, or "NEW".
          rankChange: z.string(),
          views: z.number(),
        })
        .strict(),
    ),
    videos: z.array(tiktokTrendVideoSchema),
  })
  .strict();
export type TiktokTrendingHashtag = z.infer<typeof tiktokTrendingHashtagSchema>;

export const tiktokSearchKeywordSchema = z
  .object({
    label: z.string(),
    // In TikTok's 20 trending search keywords (global; no country filter exists).
    trending: z.boolean(),
    // Brand/competitor names this keyword was recommended for.
    queries: z.array(z.string()),
  })
  .strict();
export type TiktokSearchKeyword = z.infer<typeof tiktokSearchKeywordSchema>;

export const tiktokTrendsResponseSchema = z
  .object({
    hashtags: z.array(tiktokTrendingHashtagSchema),
    keywords: z.array(tiktokSearchKeywordSchema),
    // A source that returned nothing and why ('not_configured', 'tiktok_40001', …).
    unavailable: z.array(
      z.object({ source: z.enum(['hashtags', 'keywords']), reason: z.string() }).strict(),
    ),
    refreshedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
  })
  .strict();
export type TiktokTrendsResponse = z.infer<typeof tiktokTrendsResponseSchema>;
