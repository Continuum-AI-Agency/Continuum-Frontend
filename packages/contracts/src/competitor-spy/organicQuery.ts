// Single source of truth for the competitor "organic content" read product. The
// organic agent and the Continuum MCP both answer "what are my tracked competitors
// posting organically, and how is it performing" through this core, reading the
// tracked-competitor Instagram posts with as many engagement metrics as the source
// exposes (plus a derived engagement total). Pure, dependency-injected — mirrors
// `adsQuery.ts` and `media/metadataSearch.ts`.

import { z } from "zod";
import type { CompetitorOrganicPost } from "./index";
import { recommendedCompetitorSchema } from "./recommended";

export const COMPETITOR_ORGANIC_QUERY_DEFAULT_LIMIT = 12;
export const COMPETITOR_ORGANIC_QUERY_MAX_LIMIT = 50;

export const competitorOrganicQueryInputSchema = z
  .object({
    brandId: z.string().uuid(),
    competitorId: z.string().uuid().optional(),
    competitorRef: z.string().trim().min(1).max(120).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(COMPETITOR_ORGANIC_QUERY_MAX_LIMIT)
      .default(COMPETITOR_ORGANIC_QUERY_DEFAULT_LIMIT),
  })
  .strict();
export type CompetitorOrganicQueryInput = z.infer<typeof competitorOrganicQueryInputSchema>;
// Pre-default input type (limit optional) — what the backend binding accepts.
export type CompetitorOrganicQueryArgs = z.input<typeof competitorOrganicQueryInputSchema>;

// Tool-facing input schema: brandId comes from each surface's auth context.
export const competitorOrganicToolInputSchema = competitorOrganicQueryInputSchema.omit({
  brandId: true,
});
export type CompetitorOrganicToolInput = z.infer<typeof competitorOrganicToolInputSchema>;

// One organic post, flattened with every metric the source carries plus a derived
// engagement total (likes + comments) so callers do not each re-compute it.
export const competitorOrganicPostSummarySchema = z.object({
  competitorId: z.string(),
  competitor: z.string(),
  instagramUsername: z.string(),
  postId: z.string(),
  shortcode: z.string(),
  permalink: z.string(),
  kind: z.enum(["post", "reel", "carousel"]),
  caption: z.string().nullable(),
  timestamp: z.string().nullable(),
  likeCount: z.number().nullable(),
  commentsCount: z.number().nullable(),
  mediaCount: z.number(),
  engagement: z.number().nullable(),
});
export type CompetitorOrganicPostSummary = z.infer<typeof competitorOrganicPostSummarySchema>;

export const competitorOrganicQueryResultSchema = z.object({
  count: z.number().int().nonnegative(),
  posts: z.array(competitorOrganicPostSummarySchema),
  // Same "zero TRACKED competitors" vs "zero synced posts" signal as
  // adsQuery.ts's competitorAdsQueryResultSchema — see that file for the full
  // rationale.
  trackedCompetitorCount: z.number().int().nonnegative(),
  // Onboarding-discovered competitor candidates, surfaced only when
  // trackedCompetitorCount is 0. Set by the MCP tool layer, never by this core.
  recommendedCompetitors: z.array(recommendedCompetitorSchema).optional(),
});
export type CompetitorOrganicQueryResult = z.infer<typeof competitorOrganicQueryResultSchema>;

export interface CompetitorOrganicListQuery {
  brandId: string;
  competitorId?: string;
  limit?: number;
}

export interface CompetitorOrganicQueryDeps {
  // Reads the tracked competitors' organic Instagram posts. Injected by the runtime.
  listTrackedInstagramPosts: (query: CompetitorOrganicListQuery) => Promise<CompetitorOrganicPost[]>;
  // Same prefer-pre-tagged resolver contract as the ads core.
  resolveCompetitorId?: (
    brandId: string,
    ref: { competitorId?: string; competitorRef?: string },
  ) => Promise<string | null>;
  // Same "zero TRACKED competitors" counter dependency as the ads core.
  countTrackedCompetitors: (brandId: string) => Promise<number>;
}

function deriveEngagement(likeCount: number | null, commentsCount: number | null): number | null {
  if (likeCount === null && commentsCount === null) return null;
  return (likeCount ?? 0) + (commentsCount ?? 0);
}

function toPostSummary(row: CompetitorOrganicPost): CompetitorOrganicPostSummary {
  const post = row.post;
  const likeCount = post.likeCount ?? null;
  const commentsCount = post.commentsCount ?? null;
  return {
    competitorId: row.competitorId,
    competitor: row.competitorName,
    instagramUsername: row.instagramUsername,
    postId: post.id,
    shortcode: post.shortcode,
    permalink: post.permalink,
    kind: post.kind,
    caption: post.caption ? post.caption.slice(0, 200) : null,
    timestamp: post.timestamp ?? null,
    likeCount,
    commentsCount,
    mediaCount: post.mediaCount,
    engagement: deriveEngagement(likeCount, commentsCount),
  };
}

export async function runCompetitorOrganicQuery(
  deps: CompetitorOrganicQueryDeps,
  input: CompetitorOrganicQueryInput,
): Promise<CompetitorOrganicQueryResult> {
  const competitorId = deps.resolveCompetitorId
    ? await deps.resolveCompetitorId(input.brandId, {
        competitorId: input.competitorId,
        competitorRef: input.competitorRef,
      })
    : (input.competitorId ?? null);

  const [rows, trackedCompetitorCount] = await Promise.all([
    deps.listTrackedInstagramPosts({
      brandId: input.brandId,
      competitorId: competitorId ?? undefined,
      limit: input.limit,
    }),
    deps.countTrackedCompetitors(input.brandId),
  ]);

  const posts = rows.map(toPostSummary);
  return { count: posts.length, posts, trackedCompetitorCount };
}
