// The Inspiration Library read + act surface (Sequence Social parity). One post in
// the Inspiration grid — a tracked competitor's persisted post or a Library-saved
// one — carries its format, the describer's analysis, its brand-relevance reason
// and a deterministic "Why it worked". The act routes (analyse, develop into a
// draft, save as template, paste-a-URL save) all address a post by its IG id; the
// Backend resolves it from competitor_ad_spy.organic_posts or the saved Library
// asset, so the client never hands the server media URLs to fetch.

import { z } from 'zod';
import { instagramPostSchema } from '../media/instagram';
import { skillSchema } from '../skills/skill';
import {
  type CompetitorPostAnalysis,
  competitorPostAnalysisSchema,
  competitorPostVideoDescriptionSchema,
} from './analysis';
import { saveCompetitorPostToLibraryResponseSchema } from './saveToLibrary';

// The describer's video formats (analysis.ts) plus the post-level ones that need no
// video: a single photo, a carousel, and a reel nobody has analysed yet.
export const competitorPostFormatSchema = z.enum([
  ...competitorPostVideoDescriptionSchema.shape.format.options,
  'photo',
  'photo_carousel',
  'reel',
]);
export type CompetitorPostFormat = z.infer<typeof competitorPostFormatSchema>;

export const COMPETITOR_POST_FORMAT_LABELS: Record<CompetitorPostFormat, string> = {
  talking_head: 'Talking head',
  ugc_pov: 'UGC / POV',
  edited_montage: 'Montage',
  tutorial: 'Tutorial',
  skit: 'Skit',
  product_demo: 'Product demo',
  trend_remix: 'Trend remix',
  split_screen: 'Split screen',
  prop: 'Prop',
  other: 'Other video',
  photo: 'Photo',
  photo_carousel: 'Carousel',
  reel: 'Reel',
};

/** A post's format: the describer's call for an analysed video, else its IG kind. */
export function competitorPostFormat(
  kind: 'post' | 'reel' | 'carousel',
  analysis: Pick<CompetitorPostAnalysis, 'video'> | null | undefined,
): CompetitorPostFormat {
  if (analysis?.video) return analysis.video.format;
  if (kind === 'carousel') return 'photo_carousel';
  return kind === 'reel' ? 'reel' : 'photo';
}

// 'For your brand': cosine of the post's text against the brand's strategic
// embedding, with the brand category/audience terms the post's text contains.
export const competitorPostRelevanceSchema = z.object({
  score: z.number(),
  matchedTerms: z.array(z.string()),
});
export type CompetitorPostRelevance = z.infer<typeof competitorPostRelevanceSchema>;

// Deterministic, from two persisted facts: the post's outlier score (Wave 1's
// outlier.ts, stored on organic_posts) and the describer's analysis. `hook` and
// `whyItWorked` keep the organic agent's analyzeCompetitorCreatives perPost shape.
export const competitorPostReasonSchema = z.object({
  cites: z.enum(['outlier', 'hook', 'beat', 'idea']),
  text: z.string(),
});
export type CompetitorPostReason = z.infer<typeof competitorPostReasonSchema>;

export const competitorPostWhyItWorkedSchema = z.object({
  outlierMultiple: z.number().nullable(),
  baselineEngagement: z.number().nullable(),
  formatRead: z.string(),
  hook: z.string().nullable(),
  whyItWorked: z.string(),
  reasons: z.array(competitorPostReasonSchema),
});
export type CompetitorPostWhyItWorked = z.infer<typeof competitorPostWhyItWorkedSchema>;

export const competitorInspirationPostSchema = z
  .object({
    // Null for a saved post of an untracked account (pasted URL).
    competitorId: z.string().uuid().nullable(),
    competitorName: z.string(),
    instagramUsername: z.string(),
    post: instagramPostSchema,
    format: competitorPostFormatSchema,
    // Null until the describer has run on this post (nightly or POST /inspiration/analyse).
    analysis: competitorPostAnalysisSchema.nullable(),
    // Null unless the request sorted by relevance.
    relevance: competitorPostRelevanceSchema.nullable(),
    // Null until analysed.
    whyItWorked: competitorPostWhyItWorkedSchema.nullable(),
  })
  .strict();
export type CompetitorInspirationPost = z.infer<typeof competitorInspirationPostSchema>;

export const inspirationSortSchema = z.enum(['recent', 'outlier', 'relevance']);
export type InspirationSort = z.infer<typeof inspirationSortSchema>;

// GET /api/competitor-ad-spy/instagram/posts?brandId&competitorId?&limit?&sort?
export const inspirationPostsResponseSchema = z.object({
  items: z.array(competitorInspirationPostSchema),
});
export type InspirationPostsResponse = z.infer<typeof inspirationPostsResponseSchema>;

// A Library-saved post. `post` carries the metrics as captured at save time and
// signed URLs to the re-hosted media (IG CDN URLs expire).
export const savedInspirationPostSchema = competitorInspirationPostSchema
  .extend({
    assetId: z.string().uuid(),
    savedAt: z.string(),
    capturedAt: z.string().nullable(),
  })
  .strict();
export type SavedInspirationPost = z.infer<typeof savedInspirationPostSchema>;

// GET /api/competitor-ad-spy/inspiration/saved?brandId
export const savedInspirationPostsResponseSchema = z.object({
  items: z.array(savedInspirationPostSchema),
});
export type SavedInspirationPostsResponse = z.infer<typeof savedInspirationPostsResponseSchema>;

// Every act route addresses one post by its IG id within the brand.
export const inspirationPostRefRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    postId: z.string().min(1).max(64),
  })
  .strict();
export type InspirationPostRefRequest = z.infer<typeof inspirationPostRefRequestSchema>;

// POST /api/competitor-ad-spy/inspiration/analyse — runs the describer + Idea pass
// now and persists it where the nightly run does.
export const analyseInspirationPostResponseSchema = z.object({
  post: competitorInspirationPostSchema,
});
export type AnalyseInspirationPostResponse = z.infer<typeof analyseInspirationPostResponseSchema>;

// POST /api/competitor-ad-spy/inspiration/develop — saves the post to the Library
// when needed, then generates ONE organic draft seeded by it (synchronous, ~10-40s).
// `skillIds` applies saved brand skills (e.g. a template from save-as-template); the
// draft records them in slot_data.generation.appliedSkillIds.
export const developInspirationPostRequestSchema = inspirationPostRefRequestSchema
  .extend({
    note: z.string().trim().max(500).nullable().default(null),
    skillIds: z.array(z.string().uuid()).max(5).default([]),
  })
  .strict();
export type DevelopInspirationPostRequest = z.input<typeof developInspirationPostRequestSchema>;

export const developInspirationPostResponseSchema = z.object({
  assetId: z.string().uuid(),
  draftId: z.string().uuid(),
});
export type DevelopInspirationPostResponse = z.infer<typeof developInspirationPostResponseSchema>;

// POST /api/competitor-ad-spy/inspiration/save-as-template — 409 not_analysed when
// the post has no analysis yet. The skill carries a `source-post:<postId>` tag.
export const saveInspirationTemplateResponseSchema = z.object({
  skill: skillSchema,
});
export type SaveInspirationTemplateResponse = z.infer<typeof saveInspirationTemplateResponseSchema>;

export const INSPIRATION_SOURCE_POST_TAG_PREFIX = 'source-post:';

// POST /api/competitor-ad-spy/inspiration/save-url — any public IG post URL.
export const saveInspirationUrlRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    url: z.string().trim().url().max(500),
  })
  .strict();
export type SaveInspirationUrlRequest = z.infer<typeof saveInspirationUrlRequestSchema>;

export const saveInspirationUrlResponseSchema = saveCompetitorPostToLibraryResponseSchema.extend({
  post: savedInspirationPostSchema,
});
export type SaveInspirationUrlResponse = z.infer<typeof saveInspirationUrlResponseSchema>;
