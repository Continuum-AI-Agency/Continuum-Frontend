import {
  metricComparisonSchema,
  organicMetricsSchema,
  organicPostBreakdownPointSchema,
} from '@continuum/contracts';
import { z } from 'zod';

export type {
  MetricComparison,
  OrganicMetrics,
  OrganicPostBreakdownPoint,
} from '@continuum/contracts';
// Canonical cross-boundary metric shapes live in @continuum/contracts; re-exported
// here so existing `@/lib/schemas/organicMetrics` import sites keep working.
export { metricComparisonSchema, organicMetricsSchema, organicPostBreakdownPointSchema };

// Meta demographic timeframes and other long-form aliases occasionally leak into
// organic analytics responses (and older cache rows). Coerce them onto the
// dashboard's canonical presets before the enum check.
const ORGANIC_DATE_RANGE_PRESET_ALIASES: Record<string, string> = {
  last_7_days: 'last_7d',
  last_14_days: 'last_14d',
  last_30_days: 'last_30d',
};

const organicDateRangePresetEnum = z.enum([
  'today',
  'yesterday',
  'previous_day',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_month',
  'custom',
]);

export const organicDateRangePresetSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return ORGANIC_DATE_RANGE_PRESET_ALIASES[value] ?? value;
}, organicDateRangePresetEnum);

export type OrganicDateRangePreset = z.infer<typeof organicDateRangePresetEnum>;

export const organicRangeSchema = z.object({
  preset: organicDateRangePresetSchema,
  since: z.string(),
  until: z.string(),
  adjusted: z
    .object({
      since: z.string(),
      reason: z.string(),
    })
    .optional(),
});

export type OrganicRange = z.infer<typeof organicRangeSchema>;

export const interactionBreakdownsSchema = z.record(z.string(), z.record(z.string(), z.number()));

export const insightsRequestSchema = z.object({
  metrics: z.array(z.string()),
  metric_type: z.enum(['total_value', 'time_series']).optional(),
  period: z.enum(['day', 'lifetime']).optional(),
  breakdown: z.union([z.string(), z.array(z.string())]).optional(),
  timeframe: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

export const insightsResponseSchema = z.object({
  request: insightsRequestSchema,
  data: z.unknown(),
});

export const instagramOrganicMetricsSchema = z.object({
  newFollowers: z.number(),
  reach: z.number(),
  views: z.number(),
  accountsEngaged: z.number(),
  reelsViews: z.number(),
  postViews: z.number(),
  storiesViews: z.number(),
  profileVisits24h: z.number().optional(),
  profileVisitsYesterday: z.number(),
  nonFollowerReach: z.number(),
  followerReach: z.number(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  replies: z.number().optional(),
  shares: z.number().optional(),
  saved: z.number().optional(),
  totalInteractions: z.number().optional(),
  avgRetentionRate: z.number().optional(),
  avgSkipRate: z.number().optional(),
});

export type InstagramOrganicMetrics = z.infer<typeof instagramOrganicMetricsSchema>;

export const organicPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'youtube',
  'x',
  'tiktok',
  'linkedin',
]);
export type OrganicPlatform = z.infer<typeof organicPlatformSchema>;

export const organicAnalyticsScopeSchema = z.enum([
  'account',
  'posts',
  'all',
  'kpis',
  'demographics',
]);
export type OrganicAnalyticsScope = z.infer<typeof organicAnalyticsScopeSchema>;

export const organicTrendPointSchema = z.object({
  date: z.string(),
  reach: z.number().optional(),
  views: z.number().optional(),
  accountsEngaged: z.number().optional(),
  newFollowers: z.number().optional(),
  profileVisits24h: z.number().optional(),
  postViews: z.number().optional(),
  reelsViews: z.number().optional(),
  storiesViews: z.number().optional(),
  followerReach: z.number().optional(),
  nonFollowerReach: z.number().optional(),
  comments: z.number().optional(),
  // Synthesized/secondary per-day series (added incrementally per platform):
  // IG reel-retention bucketed by publish day, YouTube daily likes + hookRate,
  // TikTok snapshot-delta counts. All optional and sparse — the dashboard only
  // makes a metric clickable once its series accrues enough points.
  avgRetentionRate: z.number().optional(),
  retentionRate: z.number().optional(),
  avgSkipRate: z.number().optional(),
  likes: z.number().optional(),
  hookRate: z.number().optional(),
  shares: z.number().optional(),
  subscribers: z.number().optional(),
  following: z.number().optional(),
  videoCount: z.number().optional(),
  boosted: z.boolean().optional(),
  boostedAt: z.string().optional(),
});

export type OrganicTrendPoint = z.infer<typeof organicTrendPointSchema>;

export const boostedEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  label: z.string().optional(),
  postId: z.string().optional(),
  boostedAt: z.string().optional(),
});

export type BoostedEvent = z.infer<typeof boostedEventSchema>;

export const audienceBreakdownSchema = z.object({
  followers: z.number(),
  nonFollowers: z.number(),
});

export type AudienceBreakdown = z.infer<typeof audienceBreakdownSchema>;

export const audienceDemographicEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  countryCode: z.string().optional(),
});

export type AudienceDemographicEntry = z.infer<typeof audienceDemographicEntrySchema>;

export const audienceDemographicsSchema = z.object({
  gender: z.array(audienceDemographicEntrySchema).default([]),
  age: z.array(audienceDemographicEntrySchema).default([]),
  country: z.array(audienceDemographicEntrySchema).default([]),
  city: z.array(audienceDemographicEntrySchema).default([]),
  timeframe: z.string().optional(),
});

export type AudienceDemographics = z.infer<typeof audienceDemographicsSchema>;

export const contentTypePerformanceSchema = z.object({
  contentType: z.string(),
  posts: z.number().optional(),
  reach: z.number().optional(),
  views: z.number().optional(),
  engagement: z.number().optional(),
  comments: z.number().optional(),
});

export type ContentTypePerformance = z.infer<typeof contentTypePerformanceSchema>;

const organicCommentReplySchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  text: z.string().optional(),
  timestamp: z.string().optional(),
  likeCount: z.number().optional(),
});

export const organicCommentSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  text: z.string().optional(),
  timestamp: z.string().optional(),
  likeCount: z.number().optional(),
  replies: z.array(organicCommentReplySchema).optional(),
});

export type OrganicComment = z.infer<typeof organicCommentSchema>;

export const organicPostMediaSchema = z.object({
  id: z.string().optional(),
  mediaType: z.string().optional(),
  mediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
});

export type OrganicPostMedia = z.infer<typeof organicPostMediaSchema>;

export const organicPostSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  title: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  mediaType: z.string().optional(),
  mediaProductType: z.string().optional(),
  mediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  isBoosted: z.boolean().optional(),
  boostedAt: z.string().optional(),
  metrics: organicMetricsSchema.partial().optional(),
  comments: z.array(organicCommentSchema).optional(),
  carouselMedia: z.array(organicPostMediaSchema).optional(),
  breakdown24h: z.array(organicPostBreakdownPointSchema).optional(),
  breakdown7d: z.array(organicPostBreakdownPointSchema).optional(),
  breakdown30d: z.array(organicPostBreakdownPointSchema).optional(),
  // Period-over-period: current 7d vs prior 7d, per metric. Reach is never a
  // key here — it's a unique-viewer count and can't be validly summed across
  // days, so it stays lifetime-only with no comparison badge.
  comparison: z.record(z.string(), metricComparisonSchema).nullable().optional(),
});

export type OrganicPost = z.infer<typeof organicPostSchema>;

export const linkedInOrganicPostSchema = organicPostSchema.extend({
  content: z.string().optional(),
  author: z.string().optional(),
  headline: z.string().optional(),
  reactions: z.number().optional(),
  reposts: z.number().optional(),
  postUrl: z.string().optional(),
  repostUrl: z.string().optional(),
});

export type LinkedInOrganicPost = z.infer<typeof linkedInOrganicPostSchema>;

// The connected account's own public identity, as the platform reports it.
// URLs stay plain strings here, matching permalink/mediaUrl above: a display
// field must never fail the whole response's parse over a malformed value.
export const organicAccountProfileSchema = z.object({
  displayName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
});

export type OrganicAccountProfile = z.infer<typeof organicAccountProfileSchema>;

const organicMetricsResponseBaseSchema = z.object({
  scope: organicAnalyticsScopeSchema.optional(),
  accountId: z.string(),
  brandId: z.string().optional(),
  integrationAccountId: z.string().optional(),
  externalAccountId: z.string().optional(),
  fetchedAt: z.string().optional(),
  range: organicRangeSchema,
  warnings: z.array(z.string()).optional(),
  accountProfile: organicAccountProfileSchema.optional(),
  metrics: organicMetricsSchema,
  interactionBreakdowns: interactionBreakdownsSchema.optional(),
  // Period-over-period: this window vs the equal-length prior window (`current`
  // equals the headline metric value).
  comparison: z.record(z.string(), metricComparisonSchema).nullable().optional(),
  // Day-over-day: most recent day vs the day before. Instagram only; null or
  // absent for platforms with no daily breakdown. Same shape as `comparison`.
  comparisonDaily: z.record(z.string(), metricComparisonSchema).nullable().optional(),
  insights: z.array(insightsResponseSchema).optional(),
  trends: z.array(organicTrendPointSchema).optional(),
  boostedEvents: z.array(boostedEventSchema).optional(),
  audienceBreakdown: audienceBreakdownSchema.optional(),
  audienceDemographics: audienceDemographicsSchema.optional(),
  contentTypePerformance: z.array(contentTypePerformanceSchema).optional(),
  recentComments: z.array(organicCommentSchema).optional(),
});

export const instagramOrganicMetricsResponseSchema = organicMetricsResponseBaseSchema.extend({
  platform: z.enum(['instagram', 'facebook', 'youtube', 'x', 'tiktok']),
  posts: z.array(organicPostSchema).optional(),
});

export const linkedInOrganicMetricsResponseSchema = organicMetricsResponseBaseSchema.extend({
  platform: z.literal('linkedin'),
  posts: z.array(linkedInOrganicPostSchema).optional(),
});

export const organicMetricsResponseSchema = z.discriminatedUnion('platform', [
  instagramOrganicMetricsResponseSchema,
  linkedInOrganicMetricsResponseSchema,
]);

export type OrganicMetricsResponse = z.infer<typeof organicMetricsResponseSchema>;
export type InstagramOrganicMetricsResponse = z.infer<typeof instagramOrganicMetricsResponseSchema>;
export type LinkedInOrganicMetricsResponse = z.infer<typeof linkedInOrganicMetricsResponseSchema>;
