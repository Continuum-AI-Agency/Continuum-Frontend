import { z } from 'zod';

/**
 * Trends+ brand listening — what the Backend stores and the Frontend renders.
 * `GET /api/listening`, `PUT /api/listening/keywords` (both gated on the `listening` product).
 */

export const LISTENING_PLATFORMS = [
  'web',
  'news',
  'reddit',
  'hackernews',
  'youtube',
  'instagram',
  'bluesky',
  'x',
] as const;
export const listeningPlatformSchema = z.enum(LISTENING_PLATFORMS);
export type ListeningPlatform = z.infer<typeof listeningPlatformSchema>;

export const LISTENING_TAGS = [
  'brand_mention',
  'competitor_mention',
  'buy_intent',
  'question',
  'complaint',
  'feedback',
  'praise',
] as const;
export const listeningTagSchema = z.enum(LISTENING_TAGS);
export type ListeningTag = z.infer<typeof listeningTagSchema>;

export const listeningSentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type ListeningSentiment = z.infer<typeof listeningSentimentSchema>;

/** Bounds every brand's fetch cost: each keyword is one query per source per day. */
export const LISTENING_MAX_KEYWORDS = 10;

export const listeningKeywordSchema = z
  .object({
    keyword: z.string().trim().toLowerCase().min(2).max(80),
    kind: z.enum(['brand', 'competitor', 'custom']),
  })
  .strict();
export type ListeningKeyword = z.infer<typeof listeningKeywordSchema>;

export const listeningKeywordsUpdateSchema = z
  .object({
    brand_id: z.string().uuid(),
    keywords: z
      .array(listeningKeywordSchema)
      .max(LISTENING_MAX_KEYWORDS)
      .refine(
        (keywords) => new Set(keywords.map((k) => k.keyword)).size === keywords.length,
        'keywords must be unique',
      ),
  })
  .strict();
export type ListeningKeywordsUpdate = z.infer<typeof listeningKeywordsUpdateSchema>;

export const listeningMentionSchema = z
  .object({
    id: z.string().uuid(),
    platform: listeningPlatformSchema,
    url: z.string(),
    author: z.string().nullable(),
    title: z.string().nullable(),
    body: z.string().nullable(),
    publishedAt: z.string().nullable(),
    keyword: z.string().nullable(),
    sentiment: listeningSentimentSchema.nullable(),
    tags: z.array(listeningTagSchema),
  })
  .strict();
export type ListeningMention = z.infer<typeof listeningMentionSchema>;

export const listeningFeedResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    keywords: z.array(listeningKeywordSchema),
    mentions: z.array(listeningMentionSchema),
    lastFetchedAt: z.string().nullable(),
  })
  .strict();
export type ListeningFeedResponse = z.infer<typeof listeningFeedResponseSchema>;
