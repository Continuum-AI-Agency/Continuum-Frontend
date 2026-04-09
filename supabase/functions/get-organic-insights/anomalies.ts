import type { OrganicInsightCategory, OrganicDataBundle } from "./compute.ts";

export type OrganicAnomaly = {
  dimension: string;
  category: OrganicInsightCategory;
  metric: string;
  signal: string;
  z_score?: number;
  delta_pct?: number;
};

type TrendPoint = NonNullable<OrganicDataBundle["trends"]>[number];

const ORGANIC_TREND_METRICS: Array<{
  key: keyof TrendPoint;
  label: string;
  category: OrganicInsightCategory;
}> = [
  { key: "reach", label: "Reach", category: "growth" },
  { key: "views", label: "Views", category: "content" },
  { key: "accountsEngaged", label: "Accounts Engaged", category: "engagement" },
  { key: "newFollowers", label: "New Followers", category: "growth" },
  { key: "comments", label: "Comments", category: "engagement" },
  { key: "nonFollowerReach", label: "Non-Follower Reach", category: "audience" },
];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function detectOrganicTimeSeriesAnomalies(
  trends: TrendPoint[]
): OrganicAnomaly[] {
  if (trends.length < 4) return [];

  const anomalies: OrganicAnomaly[] = [];

  for (const { key, label, category } of ORGANIC_TREND_METRICS) {
    const values = trends
      .map((d) => d[key] as number | undefined)
      .filter((v): v is number => v !== undefined && v !== null);

    if (values.length < 4) continue;

    const avg = mean(values);
    const sd = stddev(values, avg);
    if (sd === 0) continue;

    for (const day of trends) {
      const raw = day[key];
      if (raw === undefined || raw === null) continue;
      const value = raw as number;
      const z = (value - avg) / sd;
      if (Math.abs(z) < 1.5) continue;

      const direction = z > 0 ? "spiked" : "dropped";
      anomalies.push({
        dimension: `daily:${day.date}`,
        category,
        metric: key as string,
        signal: `${day.date}: ${label} ${direction} ${Math.abs(z).toFixed(1)}σ (${value.toFixed(0)} vs ${avg.toFixed(0)} avg)`,
        z_score: Math.round(z * 10) / 10,
      });
    }
  }

  return anomalies;
}

type ContentTypeEntry = NonNullable<OrganicDataBundle["contentTypePerformance"]>[number];

export function detectContentTypeAnomalies(
  contentTypePerformance: ContentTypeEntry[]
): OrganicAnomaly[] {
  if (contentTypePerformance.length < 2) return [];

  const anomalies: OrganicAnomaly[] = [];

  const typesWithPosts = contentTypePerformance.filter((t) => (t.posts ?? 0) > 0);
  if (typesWithPosts.length < 2) return [];

  const metrics: Array<{
    label: string;
    key: "reachPerPost" | "engagementPerPost";
    getValue: (t: ContentTypeEntry) => number;
  }> = [
    {
      label: "reach-per-post",
      key: "reachPerPost",
      getValue: (t) => (t.reach ?? 0) / (t.posts ?? 1),
    },
    {
      label: "engagement-per-post",
      key: "engagementPerPost",
      getValue: (t) => (t.engagement ?? 0) / (t.posts ?? 1),
    },
  ];

  for (const { label, getValue } of metrics) {
    const values = typesWithPosts.map(getValue);
    const avg = mean(values);
    const sd = stddev(values, avg);
    if (sd === 0) continue;

    for (let i = 0; i < typesWithPosts.length; i++) {
      const value = values[i];
      const z = (value - avg) / sd;
      if (z < 1.5) continue;

      const type = typesWithPosts[i];
      anomalies.push({
        dimension: `content_type:${type.contentType}`,
        category: "content",
        metric: label,
        signal: `${type.contentType} has notably high ${label}: ${value.toFixed(1)} vs ${avg.toFixed(1)} avg across content types`,
        z_score: Math.round(((value - avg) / sd) * 10) / 10,
      });
    }
  }

  return anomalies;
}

export function detectAllOrganicAnomalies(data: OrganicDataBundle): OrganicAnomaly[] {
  const all = [
    ...detectOrganicTimeSeriesAnomalies(data.trends ?? []),
    ...detectContentTypeAnomalies(data.contentTypePerformance ?? []),
  ];

  const seen = new Set<string>();
  return all.filter((a) => {
    const key = `${a.dimension}:${a.metric}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
