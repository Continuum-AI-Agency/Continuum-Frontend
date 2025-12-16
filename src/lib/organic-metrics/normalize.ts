import { z } from "zod";

import {
  instagramOrganicMetricsResponseSchema,
  organicDateRangePresetSchema,
  organicRangeSchema,
  metricComparisonSchema,
  type InstagramOrganicMetricsResponse,
} from "@/lib/schemas/organicMetrics";

const backendMetricComparisonPctSchema = z.object({
  current: z.number(),
  previous: z.number(),
  pctChange: z.number(),
});

const backendPctChangeInstagramOrganicMetricsResponseSchema = z.object({
  platform: z.literal("instagram"),
  accountId: z.string(),
  range: organicRangeSchema,
  metrics: z.object({
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
  }),
  comparison: z.record(backendMetricComparisonPctSchema).nullable().optional(),
});

const snakeMetricComparisonSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentage_change: z.number(),
});

const snakeInstagramOrganicMetricsSchema = z.object({
  new_followers: z.number(),
  reach: z.number(),
  views: z.number(),
  accounts_engaged: z.number(),
  reels_views: z.number(),
  post_views: z.number(),
  stories_views: z.number(),
  profile_visits_yesterday: z.number(),
  non_follower_reach: z.number(),
  follower_reach: z.number(),
});

const snakeInstagramOrganicMetricsResponseSchema = z.object({
  platform: z.literal("instagram"),
  account_id: z.string(),
  range: z.object({
    preset: organicDateRangePresetSchema,
    since: z.string(),
    until: z.string(),
    adjusted: z
      .object({
        since: z.string(),
        reason: z.string(),
      })
      .optional(),
  }),
  metrics: snakeInstagramOrganicMetricsSchema,
  comparison: z.record(snakeMetricComparisonSchema).nullable().optional(),
});

export function normalizeInstagramOrganicMetricsResponse(payload: unknown): InstagramOrganicMetricsResponse {
  const alreadyCanonical = instagramOrganicMetricsResponseSchema.safeParse(payload);
  if (alreadyCanonical.success) return alreadyCanonical.data;

  const backendPct = backendPctChangeInstagramOrganicMetricsResponseSchema.safeParse(payload);
  if (backendPct.success) {
    const comparison = backendPct.data.comparison
      ? Object.fromEntries(
          Object.entries(backendPct.data.comparison).map(([key, value]) => [
            key,
            metricComparisonSchema.parse({
              current: value.current,
              previous: value.previous,
              percentageChange: value.pctChange,
            }),
          ])
        )
      : backendPct.data.comparison ?? undefined;

    return instagramOrganicMetricsResponseSchema.parse({
      ...backendPct.data,
      comparison,
    });
  }

  const snakeParsed = snakeInstagramOrganicMetricsResponseSchema.parse(payload);
  const comparison = snakeParsed.comparison
    ? Object.fromEntries(
        Object.entries(snakeParsed.comparison).map(([key, value]) => [
          key,
          metricComparisonSchema.parse({
            current: value.current,
            previous: value.previous,
            percentageChange: value.percentage_change,
          }),
        ])
      )
    : snakeParsed.comparison ?? undefined;

  return instagramOrganicMetricsResponseSchema.parse({
    platform: snakeParsed.platform,
    accountId: snakeParsed.account_id,
    range: snakeParsed.range,
    metrics: {
      newFollowers: snakeParsed.metrics.new_followers,
      reach: snakeParsed.metrics.reach,
      views: snakeParsed.metrics.views,
      accountsEngaged: snakeParsed.metrics.accounts_engaged,
      reelsViews: snakeParsed.metrics.reels_views,
      postViews: snakeParsed.metrics.post_views,
      storiesViews: snakeParsed.metrics.stories_views,
      profileVisitsYesterday: snakeParsed.metrics.profile_visits_yesterday,
      nonFollowerReach: snakeParsed.metrics.non_follower_reach,
      followerReach: snakeParsed.metrics.follower_reach,
    },
    comparison,
  });
}
