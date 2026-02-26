import { addDays, toYmd } from "./date.ts";

export function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function safePct(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

export function sumMetricValues(values: Array<{ value?: unknown }> | undefined) {
  if (!values) return 0;
  return values.reduce((sum, item) => sum + asNumber(item.value), 0);
}

export function metricTotal(metric: Record<string, unknown> | undefined) {
  if (!metric) return 0;

  const totalValue = metric.total_value as Record<string, unknown> | undefined;
  if (totalValue) {
    if (typeof totalValue.value === "number" || typeof totalValue.value === "string") {
      return asNumber(totalValue.value);
    }
  }

  const values = metric.values as Array<{ value?: unknown }> | undefined;
  return sumMetricValues(values);
}

export function extractMetricByName(payload: Record<string, unknown> | null | undefined, name: string) {
  if (!payload) return undefined;
  const data = payload.data as Array<Record<string, unknown>> | undefined;
  return data?.find((entry) => entry.name === name);
}

export function normalizePermalink(value: string | undefined | null) {
  if (!value) return null;
  return value.trim().replace(/\/$/, "");
}

export async function metaFetchJson(url: string, params: Record<string, string>) {
  const requestUrl = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    requestUrl.searchParams.set(key, value);
  });

  const response = await fetch(requestUrl.toString());
  const payload = await response.json().catch(() => ({ error: { message: "Invalid JSON response" } }));
  if (!response.ok) {
    const message = (payload as Record<string, unknown>)?.error &&
      typeof (payload as { error?: { message?: string } }).error?.message === "string"
      ? (payload as { error?: { message?: string } }).error?.message
      : `Meta API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

export function parseInsightsSeries(
  payload: Record<string, unknown> | null | undefined,
  metricName: string
): Array<{ date: string; value: number }> {
  const metric = extractMetricByName(payload, metricName);
  if (!metric) return [];

  const values = (metric.values as Array<Record<string, unknown>> | undefined) ?? [];
  return values
    .map((item) => {
      const endTime = typeof item.end_time === "string" ? item.end_time.slice(0, 10) : "";
      return {
        date: endTime,
        value: coerceMetricPointValue(item.value),
      };
    })
    .filter((entry) => entry.date.length > 0);
}

export function parseBreakdownDailySeries(
  payload: Record<string, unknown> | null | undefined,
  metricName: string
): Array<{ date: string; dimension: string; value: number }> {
  const metric = extractMetricByName(payload, metricName);
  if (!metric) return [];

  const values = (metric.values as Array<Record<string, unknown>> | undefined) ?? [];
  return values.flatMap((item) => {
    const date = typeof item.end_time === "string" ? item.end_time.slice(0, 10) : "";
    if (!date) return [];

    const rawValue = item.value;
    if (typeof rawValue !== "object" || rawValue === null) return [];

    const breakdowns =
      (rawValue as Record<string, unknown>).breakdowns as Array<Record<string, unknown>> | undefined;
    if (!breakdowns || breakdowns.length === 0) return [];

    return breakdowns.flatMap((breakdown) => {
      const results = (breakdown.results as Array<Record<string, unknown>> | undefined) ?? [];
      return results.map((result) => {
        const dimensionValues =
          (result.dimension_values as Array<string> | undefined) ?? [];
        const dimension = dimensionValues[0] ?? "UNKNOWN";
        return {
          date,
          dimension,
          value: asNumber(result.value),
        };
      });
    });
  });
}

type MetricValuePoint = {
  date: string;
  value: number;
};

function coerceMetricPointValue(raw: unknown) {
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    if ("value" in record) {
      return asNumber(record.value);
    }

    const breakdowns = record.breakdowns as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(breakdowns)) {
      return breakdowns.reduce((sum, breakdown) => {
        const results = (breakdown.results as Array<Record<string, unknown>> | undefined) ?? [];
        return sum + results.reduce((resultSum, result) => resultSum + asNumber(result.value), 0);
      }, 0);
    }
  }

  return asNumber(raw);
}

function parseMetricValues(metric: Record<string, unknown> | undefined): MetricValuePoint[] {
  if (!metric) return [];
  const values = (metric.values as Array<Record<string, unknown>> | undefined) ?? [];
  return values
    .map((item) => ({
      date: typeof item.end_time === "string" ? item.end_time.slice(0, 10) : "",
      value: coerceMetricPointValue(item.value),
    }))
    .filter((point) => point.date.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function lastTwoMetricValuesUntil(
  metric: Record<string, unknown> | undefined,
  untilDate: string
): { current: number; previous: number } | null {
  const points = parseMetricValues(metric).filter((point) => point.date <= untilDate);
  if (points.length === 0) return null;
  const current = points[points.length - 1]?.value ?? 0;
  const previous = points[Math.max(0, points.length - 2)]?.value ?? current;
  return { current, previous };
}

export function dayBefore(dateYmd: string) {
  return toYmd(addDays(new Date(`${dateYmd}T00:00:00.000Z`), -1));
}

export function trendComparison(
  trends: Array<Record<string, string | number | boolean | undefined>>,
  metric: string
) {
  if (trends.length === 0) return null;
  const latest = trends[trends.length - 1];
  const previous = trends[Math.max(0, trends.length - 2)];
  return {
    current: asNumber(latest?.[metric]),
    previous: asNumber(previous?.[metric]),
  };
}

export function assignComparison(
  comparison: Record<string, { current: number; previous: number; percentageChange: number }>,
  key: string,
  pair: { current: number; previous: number } | null
) {
  if (!pair) return;
  comparison[key] = {
    current: pair.current,
    previous: pair.previous,
    percentageChange: safePct(pair.current, pair.previous),
  };
}

export function buildContentTypePerformanceFromPosts(posts: Array<Record<string, unknown>>) {
  const typeMap = new Map<string, { contentType: string; posts: number; reach: number; views: number; engagement: number; comments: number }>();

  posts.forEach((post) => {
    const contentType =
      (typeof post.mediaProductType === "string" && post.mediaProductType) ||
      (typeof post.mediaType === "string" && post.mediaType) ||
      "UNKNOWN";
    const metrics = (post.metrics as Record<string, unknown> | undefined) ?? {};

    const current = typeMap.get(contentType) ?? {
      contentType,
      posts: 0,
      reach: 0,
      views: 0,
      engagement: 0,
      comments: 0,
    };

    current.posts += 1;
    current.reach += asNumber(metrics.reach);
    current.views += asNumber(metrics.views);
    current.engagement += asNumber(metrics.totalInteractions);
    current.comments += asNumber(metrics.comments);

    typeMap.set(contentType, current);
  });

  return Array.from(typeMap.values()).sort((a, b) => b.views - a.views);
}
