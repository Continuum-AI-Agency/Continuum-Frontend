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
});

export type InstagramOrganicMetrics = z.infer<typeof instagramOrganicMetricsSchema>;

export const instagramOrganicMetricsResponseSchema = z.object({
  platform: z.literal("instagram"),
  accountId: z.string(),
  range: organicRangeSchema,
  metrics: instagramOrganicMetricsSchema,
  comparison: z.record(metricComparisonSchema).nullable().optional(),
});

export type InstagramOrganicMetricsResponse = z.infer<typeof instagramOrganicMetricsResponseSchema>;
