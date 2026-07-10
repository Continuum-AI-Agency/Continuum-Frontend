// Shared organic metric catalog for cross-platform Compare UI and KPI strips.
// IDs match keys on OrganicMetrics. Availability is explicit per platform so
// the UI never pretends Reach (Meta) and Impressions (LinkedIn) are the same
// series — comparison overlays only when each selected account exposes the ID.

import { z } from "zod";

import type { OrganicMetrics } from "./metrics";

export const organicMetricPlatformSchema = z.enum([
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
]);
export type OrganicMetricPlatform = z.infer<typeof organicMetricPlatformSchema>;

export const organicMetricFormatSchema = z.enum(["count", "percent"]);
export type OrganicMetricFormat = z.infer<typeof organicMetricFormatSchema>;

// Semantic buckets for documentation / future grouping UI only. Never sum
// across group members as if they were one metric.
export const organicComparableGroupSchema = z.enum([
  "attention",
  "engagement",
  "audience_growth",
  "interactions",
  "retention",
  "inventory",
]);
export type OrganicComparableGroup = z.infer<typeof organicComparableGroupSchema>;

export type OrganicMetricId = keyof OrganicMetrics;

export type OrganicMetricCatalogEntry = {
  id: OrganicMetricId;
  label: string;
  format: OrganicMetricFormat;
  platforms: readonly OrganicMetricPlatform[];
  // Flow totals that may be summed across selected accounts. Rates and stock
  // levels (followers, video count) are never summable.
  summable: boolean;
  comparableGroup: OrganicComparableGroup;
  // Shown in the default Compare metric chip row.
  defaultSelected?: boolean;
};

const META: readonly OrganicMetricPlatform[] = ["instagram", "facebook"];
const ALL: readonly OrganicMetricPlatform[] = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
];

export const ORGANIC_METRIC_CATALOG: readonly OrganicMetricCatalogEntry[] = [
  {
    id: "reach",
    label: "Reach",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
    defaultSelected: true,
  },
  {
    id: "impressions",
    label: "Impressions",
    format: "count",
    platforms: ["linkedin"],
    summable: true,
    comparableGroup: "attention",
    defaultSelected: true,
  },
  {
    id: "views",
    label: "Views",
    format: "count",
    platforms: ["instagram", "facebook", "tiktok", "youtube"],
    summable: true,
    comparableGroup: "attention",
    defaultSelected: true,
  },
  {
    id: "accountsEngaged",
    label: "Accounts engaged",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "engagement",
    defaultSelected: true,
  },
  {
    id: "totalInteractions",
    label: "Engagements",
    format: "count",
    platforms: ["linkedin"],
    summable: true,
    comparableGroup: "engagement",
    defaultSelected: true,
  },
  {
    id: "newFollowers",
    label: "New followers",
    format: "count",
    platforms: ["instagram", "facebook", "youtube", "linkedin"],
    summable: true,
    comparableGroup: "audience_growth",
    defaultSelected: true,
  },
  {
    id: "subscribers",
    label: "Followers",
    format: "count",
    platforms: ["tiktok", "youtube", "linkedin"],
    summable: false,
    comparableGroup: "audience_growth",
  },
  {
    id: "following",
    label: "Following",
    format: "count",
    platforms: ["tiktok"],
    summable: false,
    comparableGroup: "inventory",
  },
  {
    id: "videoCount",
    label: "Videos",
    format: "count",
    platforms: ["tiktok", "youtube"],
    summable: false,
    comparableGroup: "inventory",
  },
  {
    id: "reelsViews",
    label: "Reels views",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
  },
  {
    id: "postViews",
    label: "Post views",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
  },
  {
    id: "storiesViews",
    label: "Stories views",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
  },
  {
    id: "profileVisits24h",
    label: "Profile 24h",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "engagement",
  },
  {
    id: "followerReach",
    label: "Follower reach",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
  },
  {
    id: "nonFollowerReach",
    label: "Non-follower reach",
    format: "count",
    platforms: META,
    summable: true,
    comparableGroup: "attention",
  },
  {
    id: "likes",
    label: "Likes",
    format: "count",
    platforms: ["tiktok", "youtube", "linkedin"],
    summable: true,
    comparableGroup: "interactions",
  },
  {
    id: "comments",
    label: "Comments",
    format: "count",
    platforms: ALL,
    summable: true,
    comparableGroup: "interactions",
  },
  {
    id: "shares",
    label: "Shares",
    format: "count",
    platforms: ["tiktok", "linkedin"],
    summable: true,
    comparableGroup: "interactions",
  },
  {
    id: "hookRate",
    label: "Avg view %",
    format: "percent",
    platforms: ["youtube"],
    summable: false,
    comparableGroup: "retention",
  },
  {
    id: "avgRetentionRate",
    label: "Avg retention",
    format: "percent",
    platforms: META,
    summable: false,
    comparableGroup: "retention",
  },
  {
    id: "avgSkipRate",
    label: "Typical skip",
    format: "percent",
    platforms: META,
    summable: false,
    comparableGroup: "retention",
  },
] as const;

const catalogById = new Map(
  ORGANIC_METRIC_CATALOG.map((entry) => [entry.id, entry] as const),
);

export function getOrganicMetric(id: OrganicMetricId): OrganicMetricCatalogEntry | undefined {
  return catalogById.get(id);
}

export function isMetricAvailableOnPlatform(
  id: OrganicMetricId,
  platform: OrganicMetricPlatform,
): boolean {
  const entry = catalogById.get(id);
  return entry ? entry.platforms.includes(platform) : false;
}

export function metricsForPlatform(
  platform: OrganicMetricPlatform,
): OrganicMetricCatalogEntry[] {
  return ORGANIC_METRIC_CATALOG.filter((entry) => entry.platforms.includes(platform));
}

export function defaultSelectedMetricIds(): OrganicMetricId[] {
  return ORGANIC_METRIC_CATALOG.filter((entry) => entry.defaultSelected).map((entry) => entry.id);
}

// KPI strip configs previously inlined in OrganicMetricsDashboard — single source.
export function kpiConfigForPlatform(
  platform: OrganicMetricPlatform,
): Array<{ key: OrganicMetricId; label: string; format?: OrganicMetricFormat }> {
  return metricsForPlatform(platform).map((entry) => ({
    key: entry.id,
    label: entry.label,
    format: entry.format === "percent" ? "percent" : undefined,
  }));
}
