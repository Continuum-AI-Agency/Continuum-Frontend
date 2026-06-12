// Canonical organic post-analytics metric types shared by the Frontend
// (OrganicMetricsDashboard, post-analytics store) and the analytics edge
// functions that produce the payload. Promoted here from the Frontend schema
// per the monorepo "contracts are mandatory for cross-boundary types" rule.
//
// hookRate is derived from the native Meta organic Reels metric reels_skip_rate
// (hookRate = 100 - reels_skip_rate); reelsSkipRate is surfaced raw alongside it
// so the UI can show the underlying signal. Both are absent for non-reels and
// when Meta omits the (in-development) skip-rate metric.

import { z } from "zod";

// Period-over-period (or day-over-day) comparison for a single metric.
export const metricComparisonSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentageChange: z.number(),
});
export type MetricComparison = z.infer<typeof metricComparisonSchema>;

// All-optional metric bag covering account-level and per-post (media) metrics.
// Partial so any scope/platform payload validates.
export const organicMetricsSchema = z.object({
  newFollowers: z.number().optional(),
  reach: z.number().optional(),
  views: z.number().optional(),
  accountsEngaged: z.number().optional(),
  reelsViews: z.number().optional(),
  postViews: z.number().optional(),
  storiesViews: z.number().optional(),
  profileVisits24h: z.number().optional(),
  profileVisitsYesterday: z.number().optional(),
  nonFollowerReach: z.number().optional(),
  followerReach: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  replies: z.number().optional(),
  shares: z.number().optional(),
  saved: z.number().optional(),
  totalInteractions: z.number().optional(),
  subscribers: z.number().optional(),
  following: z.number().optional(),
  videoCount: z.number().optional(),
  impressions: z.number().optional(),
  videoThreeSecViews: z.number().optional(),
  hookRate: z.number().optional(),
  reelsSkipRate: z.number().optional(),
  // Reels watch time in milliseconds (Meta ig_reels_avg_watch_time / ig_reels_video_view_total_time).
  reelsAvgWatchTime: z.number().optional(),
  reelsVideoViewTotalTime: z.number().optional(),
});
export type OrganicMetrics = z.infer<typeof organicMetricsSchema>;

// Per-post metrics share the account metric bag; aliased so call sites name intent.
export const organicPostMetricsSchema = organicMetricsSchema;
export type OrganicPostMetrics = z.infer<typeof organicPostMetricsSchema>;

// YouTube organic content type. YouTube exposes no first-class "Short" flag, so
// the edge fetcher derives this from the Analytics API creatorContentType
// dimension (SHORTS vs VIDEO_ON_DEMAND), falling back to
// contentDetails.duration <= 180s (the 3-minute Shorts limit). It is emitted on
// each YouTube post's `mediaProductType` field, mirroring how Instagram uses
// mediaProductType (REELS/FEED/...). The Deno edge function emits the literal
// string; this enum is the canonical cross-boundary definition the Frontend
// filter consumes.
export const youtubeContentTypeSchema = z.enum(["SHORTS", "VIDEO"]);
export type YoutubeContentType = z.infer<typeof youtubeContentTypeSchema>;

export function isYoutubeShortType(value: string | null | undefined): boolean {
  return (value ?? "").toUpperCase() === "SHORTS";
}

// One point in a per-post 24h/7d/30d breakdown. Per-post Meta media insights are
// lifetime-only, so these points are day-over-day deltas of locally-recorded
// daily snapshots (likes/shares/saved are cumulative deltas).
export const organicPostBreakdownPointSchema = z.object({
  date: z.string().optional(),
  timestamp: z.string().optional(),
  hour: z.number().int().min(0).max(23).optional(),
  reach: z.number().optional(),
  views: z.number().optional(),
  engagement: z.number().optional(),
  comments: z.number().optional(),
  likes: z.number().optional(),
  shares: z.number().optional(),
  saved: z.number().optional(),
});
export type OrganicPostBreakdownPoint = z.infer<typeof organicPostBreakdownPointSchema>;
