// Canonical organic post-analytics metric types shared by the Frontend
// (OrganicMetricsDashboard, post-analytics store) and the analytics edge
// functions that produce the payload. Promoted here from the Frontend schema
// per the monorepo "contracts are mandatory for cross-boundary types" rule.
//
// hookRate is derived from the native Meta organic Reels metric reels_skip_rate
// (hookRate = 100 - reels_skip_rate); reelsSkipRate is surfaced raw alongside it
// so the UI can show the underlying signal. Both are absent for non-reels and
// when Meta omits the (in-development) skip-rate metric.
//
// retentionRate is our first-party summary of the IG Reels "Retention" curve,
// which the Graph API does not expose directly: avg watch time / video duration,
// scaled to a 0-100 percent. It shares hookRate's 0-100 percent convention
// (unlike the engagementRate/saveRate ratio fields, which are 0-1) so the curve
// summary and the hook/skip baselines read on the same scale. avgRetentionRate
// and avgSkipRate are the account-level means across the window's reels — the
// "typical" baselines the IG insights screen pairs with a single reel.

import { z } from "zod";

// Comparison for a single metric: `current` and `previous` window values plus
// the percent delta between them. The window the pair describes depends on which
// map it lives in — see metricComparisonMapSchema.
export const metricComparisonSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentageChange: z.number(),
});
export type MetricComparison = z.infer<typeof metricComparisonSchema>;

// A bag of per-metric comparisons keyed by metric name. The analytics edge emits
// two of these alongside the headline metrics:
//   - `comparison`      — period-over-period: this window vs the equal-length
//                         prior window. `current` equals the headline metric, so
//                         consumers never see a window total next to a 1-day delta.
//   - `comparisonDaily` — day-over-day: the most recent day vs the day before.
// Keep these distinct; conflating them is what made a 7-day headline read as
// contradictory next to a single-day comparison.
export const metricComparisonMapSchema = z.record(z.string(), metricComparisonSchema);
export type MetricComparisonMap = z.infer<typeof metricComparisonMapSchema>;

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
  // Per-post reels retention (avg watch time / duration), 0-100 percent.
  retentionRate: z.number().optional(),
  // Account-level "typical" baselines: mean retention and mean skip rate across
  // the window's reels, 0-100 percent.
  avgRetentionRate: z.number().optional(),
  avgSkipRate: z.number().optional(),
});
export type OrganicMetrics = z.infer<typeof organicMetricsSchema>;

// Canonical retention computation: average watch time divided by video duration,
// expressed as a 0-100 percent and clamped to that range. Returns undefined when
// either input is missing or non-positive (non-video media, or Meta omitting the
// watch-time metric). This is the single source of truth for the math; the Deno
// analytics edge mirrors it (it cannot import this package). hookRate stays as
// 100 - skip rate; this summarizes the retention curve instead.
export function computeRetentionRate(input: {
  avgWatchTimeMs: number | null | undefined;
  durationSeconds: number | null | undefined;
}): number | undefined {
  const { avgWatchTimeMs, durationSeconds } = input;
  if (avgWatchTimeMs == null || durationSeconds == null) return undefined;
  if (!Number.isFinite(avgWatchTimeMs) || !Number.isFinite(durationSeconds)) return undefined;
  if (avgWatchTimeMs <= 0 || durationSeconds <= 0) return undefined;
  const avgWatchSeconds = avgWatchTimeMs / 1000;
  const percent = (avgWatchSeconds / durationSeconds) * 100;
  return Math.max(0, Math.min(100, percent));
}

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
