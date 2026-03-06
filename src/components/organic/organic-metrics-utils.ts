import type {
  MetricComparison,
  OrganicPost,
  OrganicPostBreakdownPoint,
} from "@/lib/schemas/organicMetrics";

export type DrilldownWindow = "7d" | "30d";
export type PostMetricKey = "reach" | "views" | "engagement" | "comments";

export const POST_GALLERY_WINDOW_DAYS = 30;
export const POST_GALLERY_MAX_DAYS = 90;

export function toYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function postWindowRange(windowOffset: number, now = new Date()) {
  const utcToday = utcDateOnly(now);
  const capSince = new Date(utcToday);
  capSince.setUTCDate(capSince.getUTCDate() - POST_GALLERY_MAX_DAYS);

  const until = new Date(utcToday);
  until.setUTCDate(until.getUTCDate() - windowOffset * POST_GALLERY_WINDOW_DAYS - 1);
  if (until.getTime() < capSince.getTime()) {
    return null;
  }

  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (POST_GALLERY_WINDOW_DAYS - 1));
  if (since.getTime() < capSince.getTime()) {
    since.setTime(capSince.getTime());
  }

  return {
    from: toYmd(since),
    to: toYmd(until),
  };
}

export function normalizeDailyBreakdown(points: OrganicPostBreakdownPoint[] | undefined) {
  return (points ?? [])
    .map((point) => ({
      date: point.date ?? (point.timestamp ? point.timestamp.slice(0, 10) : ""),
      reach: point.reach ?? 0,
      views: point.views ?? 0,
      engagement: point.engagement ?? 0,
      comments: point.comments ?? 0,
    }))
    .filter((point) => point.date.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricValueFromBreakdownPoint(point: {
  reach?: number;
  views?: number;
  engagement?: number;
  comments?: number;
}, metricKey: PostMetricKey) {
  if (metricKey === "reach") return point.reach ?? 0;
  if (metricKey === "views") return point.views ?? 0;
  if (metricKey === "engagement") return point.engagement ?? 0;
  return point.comments ?? 0;
}

function recentPostBreakdown(post: OrganicPost | null, window: DrilldownWindow) {
  if (!post) return [];
  const today = toYmd(new Date());
  const sourcePoints =
    window === "30d"
      ? post.breakdown30d ?? post.breakdown7d
      : post.breakdown30d ?? post.breakdown7d;

  return normalizeDailyBreakdown(sourcePoints)
    .filter((point) => point.date <= today)
    .slice(-(window === "30d" ? 30 : 7));
}

export function buildPostMetricSeries(params: {
  post: OrganicPost | null;
  metricKey: PostMetricKey;
  window: DrilldownWindow;
}) {
  const { post, metricKey, window } = params;
  const breakdown = recentPostBreakdown(post, window);

  return breakdown.map((point) => ({
    date: point.date,
    value: metricValueFromBreakdownPoint(point, metricKey),
  }));
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

export function post24hComparisons(post: OrganicPost | null): Partial<Record<PostMetricKey, MetricComparison>> {
  const daily = recentPostBreakdown(post, "7d");
  if (daily.length < 2) return {};

  const currentDay = daily[daily.length - 1];
  const previousDay = daily[daily.length - 2];
  if (!currentDay || !previousDay) return {};

  const keys: PostMetricKey[] = ["reach", "views", "engagement", "comments"];
  const entries = keys.map((key) => {
    const current = metricValueFromBreakdownPoint(currentDay, key);
    const previous = metricValueFromBreakdownPoint(previousDay, key);
    return [
      key,
      {
        current,
        previous,
        percentageChange: percentageChange(current, previous),
      } satisfies MetricComparison,
    ] as const;
  });

  return Object.fromEntries(entries);
}

export function summarizePost7dMetrics(post: OrganicPost | null): Partial<Record<PostMetricKey, number>> {
  const recent = recentPostBreakdown(post, "7d");
  if (recent.length === 0) return {};

  return recent.reduce<Partial<Record<PostMetricKey, number>>>(
    (totals, point) => ({
      reach: (totals.reach ?? 0) + (point.reach ?? 0),
      views: (totals.views ?? 0) + (point.views ?? 0),
      engagement: (totals.engagement ?? 0) + (point.engagement ?? 0),
      comments: (totals.comments ?? 0) + (point.comments ?? 0),
    }),
    {}
  );
}
