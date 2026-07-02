import type {
  MetricComparison,
  OrganicPost,
  OrganicPostBreakdownPoint,
} from "@/lib/schemas/organicMetrics";

export type DrilldownWindow = "7d" | "30d";
export type PostMetricKey = "reach" | "views" | "engagement" | "comments";
export type HookRateTier = "elite" | "good" | "average" | "poor";
export type PostSortKey = "recent" | "hookRate" | "views" | "reach" | "engagement";

const HOOK_RATE_THRESHOLDS = { elite: 40, good: 25, average: 15 } as const;

// Hook rate is the native organic signal only: hookRate = 100 - reels_skip_rate,
// computed edge-side and delivered on metrics.hookRate. There is no watch-time
// proxy fallback — when Meta omits the (in-development) skip-rate metric the card
// simply does not render.
export function calculateHookRate(post: OrganicPost): number | undefined {
  return post.metrics?.hookRate;
}

// Reels watch time arrives from Meta in milliseconds; render it human-readable.
export function formatWatchTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return "-";
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalSeconds < 3600) {
    const seconds = Math.round(totalSeconds % 60);
    return `${totalMinutes}m ${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function hookRateTier(rate: number): HookRateTier {
  if (rate >= HOOK_RATE_THRESHOLDS.elite) return "elite";
  if (rate >= HOOK_RATE_THRESHOLDS.good) return "good";
  if (rate >= HOOK_RATE_THRESHOLDS.average) return "average";
  return "poor";
}

export function sortPosts(posts: OrganicPost[], key: PostSortKey): OrganicPost[] {
  if (key === "recent") return posts;
  return [...posts].sort((a, b) => {
    switch (key) {
      case "hookRate": {
        const rA = calculateHookRate(a) ?? -1;
        const rB = calculateHookRate(b) ?? -1;
        return rB - rA;
      }
      case "views":
        return (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0);
      case "reach":
        return (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0);
      case "engagement":
        return (b.metrics?.totalInteractions ?? 0) - (a.metrics?.totalInteractions ?? 0);
      default:
        return 0;
    }
  });
}

// YouTube post-type filter for the gallery: Shorts, regular videos, or both.
export type YoutubePostTypeFilter = "all" | "shorts" | "videos";

// The edge fetcher classifies each YouTube video as a Short or a regular video
// (Analytics creatorContentType, duration <=180s fallback) and emits it on
// mediaProductType, mirroring how Instagram uses mediaProductType for REELS/FEED.
export function isYouTubeShort(post: OrganicPost): boolean {
  return (post.mediaProductType ?? "").toUpperCase() === "SHORTS";
}

export function filterPostsByYoutubeType(
  posts: OrganicPost[],
  filter: YoutubePostTypeFilter
): OrganicPost[] {
  if (filter === "all") return posts;
  const wantShort = filter === "shorts";
  return posts.filter((post) => isYouTubeShort(post) === wantShort);
}

export type YoutubeTypeSummary = {
  count: number;
  views: number;
  likes: number;
  comments: number;
  avgHookRate: number | undefined;
};

// Aggregate the per-type analytics shown above the filtered YouTube gallery.
export function summarizeYoutubeTypeMetrics(posts: OrganicPost[]): YoutubeTypeSummary {
  const totals = posts.reduce(
    (acc, post) => {
      acc.count += 1;
      acc.views += post.metrics?.views ?? 0;
      acc.likes += post.metrics?.likes ?? 0;
      acc.comments += post.metrics?.comments ?? 0;
      const hook = post.metrics?.hookRate;
      if (typeof hook === "number") {
        acc.hookSum += hook;
        acc.hookCount += 1;
      }
      return acc;
    },
    { count: 0, views: 0, likes: 0, comments: 0, hookSum: 0, hookCount: 0 }
  );
  return {
    count: totals.count,
    views: totals.views,
    likes: totals.likes,
    comments: totals.comments,
    avgHookRate: totals.hookCount > 0 ? Number((totals.hookSum / totals.hookCount).toFixed(1)) : undefined,
  };
}

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

// Keys that support a period-over-period comparison (current 7d vs prior 7d,
// backend-computed — see periodComparisonFromBreakdown in
// supabase/functions/fetch-organic-analytics/lib/post-snapshots.ts). Reach is
// deliberately excluded: it's a unique-viewer count and can't be validly
// summed across days, so it stays lifetime-only with no comparison badge.
export type PostComparisonKey = Exclude<PostMetricKey, "reach"> | "likes" | "shares" | "saved";

export function normalizeDailyBreakdown(points: OrganicPostBreakdownPoint[] | undefined) {
  return (points ?? [])
    .map((point) => ({
      date: point.date ?? (point.timestamp ? point.timestamp.slice(0, 10) : ""),
      reach: point.reach ?? 0,
      views: point.views ?? 0,
      engagement: point.engagement ?? 0,
      comments: point.comments ?? 0,
      likes: point.likes ?? 0,
      shares: point.shares ?? 0,
      saved: point.saved ?? 0,
    }))
    .filter((point) => point.date.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Raw per-day value for the sparkline series only — not used for comparisons
// (those come straight from the backend-computed post.comparison field).
function metricValueFromBreakdownPoint(point: {
  reach?: number;
  views?: number;
  engagement?: number;
  comments?: number;
}, metricKey: PostMetricKey) {
  switch (metricKey) {
    case "reach":
      return point.reach ?? 0;
    case "views":
      return point.views ?? 0;
    case "engagement":
      return point.engagement ?? 0;
    case "comments":
      return point.comments ?? 0;
    default:
      return 0;
  }
}

// Per-post trends are capped to the 7-day window. Meta serves no media-level
// history, so per-post data is only our forward-accruing daily snapshots (which
// fill in over ~7 days); a deeper window would just render empty/partial data, so
// we don't offer one.
function recentPostBreakdown(post: OrganicPost | null) {
  if (!post) return [];
  const today = toYmd(new Date());
  const sourcePoints = post.breakdown7d ?? post.breakdown30d;

  return normalizeDailyBreakdown(sourcePoints)
    .filter((point) => point.date <= today)
    .slice(-7);
}

export function buildPostMetricSeries(params: {
  post: OrganicPost | null;
  metricKey: PostMetricKey;
}) {
  const { post, metricKey } = params;
  const breakdown = recentPostBreakdown(post);

  return breakdown.map((point) => ({
    date: point.date,
    value: metricValueFromBreakdownPoint(point, metricKey),
  }));
}

// Backend-computed period-over-period comparison (current 7d vs prior 7d) —
// see periodComparisonFromBreakdown in fetch-organic-analytics/lib/post-snapshots.ts.
// Reach is never present here; it stays lifetime-only (see PostComparisonKey).
export function postPeriodComparisons(post: OrganicPost | null): Partial<Record<PostComparisonKey, MetricComparison>> {
  return (post?.comparison as Partial<Record<PostComparisonKey, MetricComparison>> | null | undefined) ?? {};
}
