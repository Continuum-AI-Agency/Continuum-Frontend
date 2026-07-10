// The canonical "post activity" join: each daily trend point annotated with the
// posts published that calendar day (any organic platform). One source of truth
// consumed by the Frontend reporting charts (to demarcate when posts happened on
// the metric graph) and by the MCP analytics tool (so agents can read
// posts-joined-to-trends instead of trends alone).
//
// Wire fields stay loose (strings, nullable/optional; no strict enums or url()).
// Meta can emit unexpected values and the Backend builds these from unknown cached
// DB JSON, so parsing must never throw on a surprising string; consumers narrow on
// read. Publish day is the UTC calendar day (timestamp.slice(0,10)), mirroring the
// existing boost ReferenceLine idiom and the trend axis date keys.

import { z } from "zod";

import { organicMetricsSchema, type OrganicMetrics } from "./metrics";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Post metadata needed to render/describe a published-post marker. A lean subset
// of the full OrganicPost — enough for a chart hover card and an agent summary.
export const organicPostSummarySchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  permalink: z.string().nullable().optional(),
  timestamp: z.string().optional(),
  mediaType: z.string().nullable().optional(),
  mediaProductType: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  isBoosted: z.boolean().optional(),
  boostedAt: z.string().optional(),
});
export type OrganicPostSummary = z.infer<typeof organicPostSummarySchema>;

// One calendar day: the day's trend metrics plus the posts published that day.
export const annotatedDailyTrendSchema = z.object({
  date: z.string(),
  metrics: organicMetricsSchema,
  publishedPosts: z.array(organicPostSummarySchema),
  postCount: z.number().int().nonnegative(),
  boostedAt: z.string().optional(),
});
export type AnnotatedDailyTrend = z.infer<typeof annotatedDailyTrendSchema>;

// Loose shapes the join reads from — the Frontend passes its own OrganicTrendPoint
// / OrganicPost (structurally compatible), the Backend passes raw cached JSON.
type TrendInput = Record<string, unknown>;
type PostInput = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toMetrics(trend: TrendInput): OrganicMetrics {
  const parsed = organicMetricsSchema.safeParse(trend);
  return parsed.success ? parsed.data : {};
}

function toPostSummary(post: PostInput): OrganicPostSummary {
  return {
    id: asString(post.id) ?? "",
    caption: asString(post.caption),
    permalink: asString(post.permalink) ?? null,
    timestamp: asString(post.timestamp),
    mediaType: asString(post.mediaType) ?? null,
    mediaProductType: asString(post.mediaProductType) ?? null,
    mediaUrl: asString(post.mediaUrl) ?? null,
    thumbnailUrl: asString(post.thumbnailUrl) ?? null,
    isBoosted: typeof post.isBoosted === "boolean" ? post.isBoosted : undefined,
    boostedAt: asString(post.boostedAt),
  };
}

// Join daily trends with the posts published each day. Seeds a day per trend point,
// attaches posts by their UTC publish day (adding days that fall outside the trend
// window), sorts each day's posts ascending by timestamp, and returns the days
// ascending by date. Days with no posts keep an empty publishedPosts array so the
// result is still the full annotated series; chart callers filter to postCount > 0.
export function annotatePostActivityByDate(
  trends: ReadonlyArray<TrendInput> | null | undefined,
  posts: ReadonlyArray<PostInput> | null | undefined,
): AnnotatedDailyTrend[] {
  const byDate = new Map<string, AnnotatedDailyTrend>();

  for (const trend of trends ?? []) {
    const date = (asString(trend.date) ?? "").slice(0, 10);
    if (!ISO_DATE.test(date)) continue;
    byDate.set(date, {
      date,
      metrics: toMetrics(trend),
      publishedPosts: [],
      postCount: 0,
      boostedAt: asString(trend.boostedAt),
    });
  }

  for (const post of posts ?? []) {
    const date = (asString(post.timestamp) ?? "").slice(0, 10);
    if (!ISO_DATE.test(date)) continue;
    let day = byDate.get(date);
    if (!day) {
      day = { date, metrics: {}, publishedPosts: [], postCount: 0 };
      byDate.set(date, day);
    }
    day.publishedPosts.push(toPostSummary(post));
  }

  const days = [...byDate.values()];
  for (const day of days) {
    day.publishedPosts.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
    day.postCount = day.publishedPosts.length;
    if (!day.boostedAt) {
      const boosted = day.publishedPosts.find((post) => post.boostedAt);
      if (boosted?.boostedAt) day.boostedAt = boosted.boostedAt;
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}
