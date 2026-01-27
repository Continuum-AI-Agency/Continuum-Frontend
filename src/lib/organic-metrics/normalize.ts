import { z } from "zod";

import {
  instagramOrganicMetricsResponseSchema,
  organicDateRangePresetSchema,
  organicRangeSchema,
  metricComparisonSchema,
  instagramOrganicMetricsSchema,
  interactionBreakdownsSchema,
  insightsResponseSchema,
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
  comparison: z.record(z.string(), backendMetricComparisonPctSchema).nullable().optional(),
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
  likes: z.number().optional(),
  comments: z.number().optional(),
  replies: z.number().optional(),
  shares: z.number().optional(),
  saved: z.number().optional(),
  total_interactions: z.number().optional(),
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
  comparison: z.record(z.string(), snakeMetricComparisonSchema).nullable().optional(),
});

const looseInstagramMetricsSchema = z
  .object({
    newFollowers: z.number().optional(),
    new_followers: z.number().optional(),
    reach: z.number().optional(),
    views: z.number().optional(),
    accountsEngaged: z.number().optional(),
    accounts_engaged: z.number().optional(),
    reelsViews: z.number().optional(),
    reels_views: z.number().optional(),
    postViews: z.number().optional(),
    post_views: z.number().optional(),
    storiesViews: z.number().optional(),
    stories_views: z.number().optional(),
    profileVisitsYesterday: z.number().optional(),
    profile_visits_yesterday: z.number().optional(),
    nonFollowerReach: z.number().optional(),
    non_follower_reach: z.number().optional(),
    followerReach: z.number().optional(),
    follower_reach: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    replies: z.number().optional(),
    shares: z.number().optional(),
    saved: z.number().optional(),
    totalInteractions: z.number().optional(),
    total_interactions: z.number().optional(),
  })
  .passthrough();

const looseComparisonValueSchema = z
  .object({
    current: z.number(),
    previous: z.number(),
    percentageChange: z.number().optional(),
    percentage_change: z.number().optional(),
    pctChange: z.number().optional(),
  })
  .passthrough();

const looseInstagramOrganicMetricsResponseSchema = z
  .object({
    platform: z.literal("instagram"),
    accountId: z.string().optional(),
    account_id: z.string().optional(),
    integrationAccountId: z.string().optional(),
    integration_account_id: z.string().optional(),
    externalAccountId: z.string().optional(),
    external_account_id: z.string().optional(),
    brandId: z.string().optional(),
    brand_id: z.string().optional(),
    fetchedAt: z.string().optional(),
    fetched_at: z.string().optional(),
    warnings: z.array(z.unknown()).optional(),
    interactionBreakdowns: z.record(z.string(), z.unknown()).optional(),
    insights: z.array(z.unknown()).optional(),
    range: z.unknown(),
    metrics: z.unknown(),
    comparison: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

function resolveAccountId(payload: {
  accountId?: string;
  account_id?: string;
  integrationAccountId?: string;
  integration_account_id?: string;
  externalAccountId?: string;
  external_account_id?: string;
}) {
  const accountId =
    payload.accountId ??
    payload.account_id ??
    payload.externalAccountId ??
    payload.external_account_id ??
    payload.integrationAccountId ??
    payload.integration_account_id ??
    undefined;

  if (!accountId) {
    throw new Error("Instagram organic metrics response is missing an account id.");
  }

  return accountId;
}

function normalizeRange(range: unknown) {
  const canonical = organicRangeSchema.safeParse(range);
  if (canonical.success) return canonical.data;

  const fromToSchema = z.object({
    preset: organicDateRangePresetSchema,
    from: z.string(),
    to: z.string(),
    adjusted: z
      .object({
        since: z.string(),
        reason: z.string(),
      })
      .optional(),
  });

  const fromTo = fromToSchema.safeParse(range);
  if (fromTo.success) {
    return organicRangeSchema.parse({
      preset: fromTo.data.preset,
      since: fromTo.data.from,
      until: fromTo.data.to,
      adjusted: fromTo.data.adjusted,
    });
  }

  const customSchema = z.object({
    preset: organicDateRangePresetSchema,
    custom: z.object({
      from: z.string(),
      to: z.string(),
    }),
  });

  const custom = customSchema.safeParse(range);
  if (custom.success) {
    return organicRangeSchema.parse({
      preset: custom.data.preset,
      since: custom.data.custom.from,
      until: custom.data.custom.to,
    });
  }

  throw new Error("Instagram organic metrics response is missing the range window.");
}

function normalizeMetrics(metrics: unknown) {
  const parsed = looseInstagramMetricsSchema.parse(metrics);

  return instagramOrganicMetricsSchema.parse({
    newFollowers: parsed.newFollowers ?? parsed.new_followers,
    reach: parsed.reach,
    views: parsed.views,
    accountsEngaged: parsed.accountsEngaged ?? parsed.accounts_engaged,
    reelsViews: parsed.reelsViews ?? parsed.reels_views,
    postViews: parsed.postViews ?? parsed.post_views,
    storiesViews: parsed.storiesViews ?? parsed.stories_views,
    profileVisitsYesterday: parsed.profileVisitsYesterday ?? parsed.profile_visits_yesterday,
    nonFollowerReach: parsed.nonFollowerReach ?? parsed.non_follower_reach,
    followerReach: parsed.followerReach ?? parsed.follower_reach,
    likes: parsed.likes ?? 0,
    comments: parsed.comments ?? 0,
    replies: parsed.replies ?? 0,
    shares: parsed.shares ?? 0,
    saved: parsed.saved ?? 0,
    totalInteractions: parsed.totalInteractions ?? parsed.total_interactions ?? 0,
  });
}

function normalizeComparison(comparison: unknown) {
  if (comparison === null) return null;
  if (comparison === undefined) return undefined;

  const parsed = z.record(z.string(), looseComparisonValueSchema).parse(comparison);

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      metricComparisonSchema.parse({
        current: value.current,
        previous: value.previous,
        percentageChange: value.percentageChange ?? value.percentage_change ?? value.pctChange,
      }),
    ])
  );
}

function normalizeInteractionBreakdowns(breakdowns: unknown) {
  if (breakdowns === null || breakdowns === undefined) return undefined;
  return interactionBreakdownsSchema.parse(breakdowns);
}

function normalizeInsights(insights: unknown) {
  if (insights === null || insights === undefined) return undefined;
  if (!Array.isArray(insights)) return undefined;
  return insights.map(insight => insightsResponseSchema.parse(insight));
}

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

  const snakeParsed = snakeInstagramOrganicMetricsResponseSchema.safeParse(payload);
  if (snakeParsed.success) {
    const comparison = snakeParsed.data.comparison
      ? Object.fromEntries(
          Object.entries(snakeParsed.data.comparison).map(([key, value]) => [
            key,
            metricComparisonSchema.parse({
              current: value.current,
              previous: value.previous,
              percentageChange: value.percentage_change,
            }),
          ])
        )
      : snakeParsed.data.comparison ?? undefined;

    return instagramOrganicMetricsResponseSchema.parse({
      platform: snakeParsed.data.platform,
      accountId: snakeParsed.data.account_id,
      range: snakeParsed.data.range,
      metrics: {
        newFollowers: snakeParsed.data.metrics.new_followers,
        reach: snakeParsed.data.metrics.reach,
        views: snakeParsed.data.metrics.views,
        accountsEngaged: snakeParsed.data.metrics.accounts_engaged,
        reelsViews: snakeParsed.data.metrics.reels_views,
        postViews: snakeParsed.data.metrics.post_views,
        storiesViews: snakeParsed.data.metrics.stories_views,
        profileVisitsYesterday: snakeParsed.data.metrics.profile_visits_yesterday,
        nonFollowerReach: snakeParsed.data.metrics.non_follower_reach,
        followerReach: snakeParsed.data.metrics.follower_reach,
        likes: snakeParsed.data.metrics.likes,
        comments: snakeParsed.data.metrics.comments,
        replies: snakeParsed.data.metrics.replies,
        shares: snakeParsed.data.metrics.shares,
        saved: snakeParsed.data.metrics.saved,
        totalInteractions: snakeParsed.data.metrics.total_interactions,
      },
      comparison,
    });
  }

  const looseParsed = looseInstagramOrganicMetricsResponseSchema.safeParse(payload);
  if (looseParsed.success) {
    const accountId = resolveAccountId(looseParsed.data);
    const range = normalizeRange(looseParsed.data.range);
    const metrics = normalizeMetrics(looseParsed.data.metrics);
    const comparison = normalizeComparison(looseParsed.data.comparison);
    const interactionBreakdowns = normalizeInteractionBreakdowns(looseParsed.data.interactionBreakdowns);
    const insights = normalizeInsights(looseParsed.data.insights);

    return instagramOrganicMetricsResponseSchema.parse({
      platform: "instagram",
      accountId,
      brandId: looseParsed.data.brandId ?? looseParsed.data.brand_id,
      integrationAccountId: looseParsed.data.integrationAccountId ?? looseParsed.data.integration_account_id,
      externalAccountId: looseParsed.data.externalAccountId ?? looseParsed.data.external_account_id,
      fetchedAt: looseParsed.data.fetchedAt ?? looseParsed.data.fetched_at,
      range,
      warnings: looseParsed.data.warnings,
      metrics,
      interactionBreakdowns,
      comparison,
      insights,
    });
  }

  throw snakeParsed.error;
}
