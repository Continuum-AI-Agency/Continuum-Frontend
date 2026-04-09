import { z } from "zod";

export const organicDateRangePresetSchema = z.enum([
  "yesterday",
  "previous_day",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_month",
  "custom",
]);

export type OrganicDateRangePreset = z.infer<typeof organicDateRangePresetSchema>;

export const metricComparisonSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentageChange: z.number(),
});

export type MetricComparison = z.infer<typeof metricComparisonSchema>;

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
  metric_type: z.enum(["total_value", "time_series"]).optional(),
  period: z.enum(["day", "lifetime"]).optional(),
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
});

export type InstagramOrganicMetrics = z.infer<typeof instagramOrganicMetricsSchema>;

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
  impressions: z.number().optional(),
});

export type OrganicMetrics = z.infer<typeof organicMetricsSchema>;

export const organicPlatformSchema = z.enum(["instagram", "facebook", "youtube", "x", "tiktok", "linkedin"]);
export type OrganicPlatform = z.infer<typeof organicPlatformSchema>;

export const organicAnalyticsScopeSchema = z.enum(["account", "posts", "all", "kpis", "demographics"]);
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

export const organicPostBreakdownPointSchema = z.object({
  date: z.string().optional(),
  timestamp: z.string().optional(),
  hour: z.number().int().min(0).max(23).optional(),
  reach: z.number().optional(),
  views: z.number().optional(),
  engagement: z.number().optional(),
  comments: z.number().optional(),
});

export type OrganicPostBreakdownPoint = z.infer<typeof organicPostBreakdownPointSchema>;

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

const organicMetricsResponseBaseSchema = z.object({
  scope: organicAnalyticsScopeSchema.optional(),
  accountId: z.string(),
  brandId: z.string().optional(),
  integrationAccountId: z.string().optional(),
  externalAccountId: z.string().optional(),
  fetchedAt: z.string().optional(),
  range: organicRangeSchema,
  warnings: z.array(z.string()).optional(),
  metrics: organicMetricsSchema,
  interactionBreakdowns: interactionBreakdownsSchema.optional(),
  comparison: z.record(z.string(), metricComparisonSchema).nullable().optional(),
  insights: z.array(insightsResponseSchema).optional(),
  trends: z.array(organicTrendPointSchema).optional(),
  boostedEvents: z.array(boostedEventSchema).optional(),
  audienceBreakdown: audienceBreakdownSchema.optional(),
  audienceDemographics: audienceDemographicsSchema.optional(),
  contentTypePerformance: z.array(contentTypePerformanceSchema).optional(),
  recentComments: z.array(organicCommentSchema).optional(),
});

export const instagramOrganicMetricsResponseSchema = organicMetricsResponseBaseSchema.extend({
  platform: z.enum(["instagram", "facebook", "youtube", "x", "tiktok"]),
  posts: z.array(organicPostSchema).optional(),
});

export const linkedInOrganicMetricsResponseSchema = organicMetricsResponseBaseSchema.extend({
  platform: z.literal("linkedin"),
  posts: z.array(linkedInOrganicPostSchema).optional(),
});

export const organicMetricsResponseSchema = z.discriminatedUnion("platform", [
  instagramOrganicMetricsResponseSchema,
  linkedInOrganicMetricsResponseSchema,
]);

export type OrganicMetricsResponse = z.infer<typeof organicMetricsResponseSchema>;
export type InstagramOrganicMetricsResponse = z.infer<typeof instagramOrganicMetricsResponseSchema>;
export type LinkedInOrganicMetricsResponse = z.infer<typeof linkedInOrganicMetricsResponseSchema>;
