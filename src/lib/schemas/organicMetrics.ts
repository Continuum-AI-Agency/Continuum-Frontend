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

export const interactionBreakdownsSchema = z.record(z.record(z.number()));

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

export const instagramOrganicMetricsResponseSchema = z.object({
  platform: z.literal("instagram"),
  accountId: z.string(),
  brandId: z.string().optional(),
  integrationAccountId: z.string().optional(),
  externalAccountId: z.string().optional(),
  fetchedAt: z.string().optional(),
  range: organicRangeSchema,
  warnings: z.array(z.string()).optional(),
  metrics: instagramOrganicMetricsSchema,
  interactionBreakdowns: interactionBreakdownsSchema.optional(),
  comparison: z.record(metricComparisonSchema).nullable().optional(),
  insights: z.array(insightsResponseSchema).optional(),
});

export type InstagramOrganicMetricsResponse = z.infer<typeof instagramOrganicMetricsResponseSchema>;
