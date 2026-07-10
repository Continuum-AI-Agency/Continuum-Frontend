import type {
  MetricComparison,
  OrganicPost,
  OrganicPostBreakdownPoint,
} from '@/lib/schemas/organicMetrics';

export type DrilldownWindow = '7d' | '30d';
export type PostMetricKey = 'reach' | 'views' | 'engagement' | 'comments';
export type PostSortKey = 'recent' | 'hookRate' | 'views' | 'reach' | 'engagement';

// Hook rate is the native organic signal only: hookRate = 100 - reels_skip_rate,
// computed edge-side and delivered on metrics.hookRate. There is no watch-time
// proxy fallback — when Meta omits the (in-development) skip-rate metric the card
// simply does not render.
export function calculateHookRate(post: OrganicPost): number | undefined {
  return post.metrics?.hookRate;
}

// Reels watch time arrives from Meta in milliseconds; render it human-readable.
export function formatWatchTime(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return '-';
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

export function sortPosts(posts: OrganicPost[], key: PostSortKey): OrganicPost[] {
  if (key === 'recent') return posts;
  return [...posts].sort((a, b) => {
    switch (key) {
      case 'hookRate': {
        const rA = calculateHookRate(a) ?? -1;
        const rB = calculateHookRate(b) ?? -1;
        return rB - rA;
      }
      case 'views':
        return (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0);
      case 'reach':
        return (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0);
      case 'engagement':
        return (b.metrics?.totalInteractions ?? 0) - (a.metrics?.totalInteractions ?? 0);
      default:
        return 0;
    }
  });
}

// YouTube post-type filter for the gallery: Shorts, regular videos, or both.
export type YoutubePostTypeFilter = 'all' | 'shorts' | 'videos';

// The edge fetcher classifies each YouTube video as a Short or a regular video
// (Analytics creatorContentType, duration <=180s fallback) and emits it on
// mediaProductType, mirroring how Instagram uses mediaProductType for REELS/FEED.
export function isYouTubeShort(post: OrganicPost): boolean {
  return (post.mediaProductType ?? '').toUpperCase() === 'SHORTS';
}

export function filterPostsByYoutubeType(
  posts: OrganicPost[],
  filter: YoutubePostTypeFilter,
): OrganicPost[] {
  if (filter === 'all') return posts;
  const wantShort = filter === 'shorts';
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
      if (typeof hook === 'number') {
        acc.hookSum += hook;
        acc.hookCount += 1;
      }
      return acc;
    },
    { count: 0, views: 0, likes: 0, comments: 0, hookSum: 0, hookCount: 0 },
  );
  return {
    count: totals.count,
    views: totals.views,
    likes: totals.likes,
    comments: totals.comments,
    avgHookRate:
      totals.hookCount > 0 ? Number((totals.hookSum / totals.hookCount).toFixed(1)) : undefined,
  };
}

// A metric's daily line chart is only meaningful once the backend has emitted
// enough real per-day points. Some series are synthesized/sparse — IG reel
// retention bucketed by publish day, YouTube hookRate, TikTok snapshot deltas —
// and accrue over several days. Below this threshold a KPI card stays a static
// headline tile (no drilldown); once its series crosses it the card becomes
// clickable automatically.
export const MIN_GRAPHABLE_TREND_POINTS = 3;

export function countNumericTrendPoints(
  trends: ReadonlyArray<Record<string, unknown>> | undefined,
  trendKey: string | undefined,
): number {
  if (!trendKey) return 0;
  return (trends ?? []).reduce(
    (count, trend) => (typeof trend[trendKey] === 'number' ? count + 1 : count),
    0,
  );
}

export function isTrendKeyGraphable(
  trends: ReadonlyArray<Record<string, unknown>> | undefined,
  trendKey: string | undefined,
  minPoints: number = MIN_GRAPHABLE_TREND_POINTS,
): boolean {
  return countNumericTrendPoints(trends, trendKey) >= minPoints;
}

// The post feed loads shallowest-first and deepens as the reader scrolls: the
// last week, then the rest of the month, then the two months behind it. Each
// boundary is a cumulative depth in days back from today; consecutive boundaries
// bound one non-overlapping fetch window. The final boundary is the history cap,
// after which the feed ends.
export const POST_GALLERY_WINDOW_BOUNDARIES = [7, 30, 60, 90] as const;
export const POST_GALLERY_MAX_DAYS =
  POST_GALLERY_WINDOW_BOUNDARIES[POST_GALLERY_WINDOW_BOUNDARIES.length - 1];

export function toYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function utcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

// How many days of history the window at `windowOffset` covers, or null when the
// offset is past the history cap. Drives the feed's "scroll for previous Nd" copy.
export function postWindowDays(windowOffset: number): number | null {
  if (windowOffset < 0 || windowOffset >= POST_GALLERY_WINDOW_BOUNDARIES.length) return null;
  const depth = POST_GALLERY_WINDOW_BOUNDARIES[windowOffset];
  const previousDepth = windowOffset === 0 ? 0 : POST_GALLERY_WINDOW_BOUNDARIES[windowOffset - 1];
  return depth - previousDepth;
}

export function postWindowRange(windowOffset: number, now = new Date()) {
  const days = postWindowDays(windowOffset);
  if (days === null) return null;

  const utcToday = utcDateOnly(now);
  const previousDepth = windowOffset === 0 ? 0 : POST_GALLERY_WINDOW_BOUNDARIES[windowOffset - 1];

  // Window `i` covers days [previousDepth, depth) back from today, so it ends on
  // the day the shallower window started counting from. Consecutive windows tile
  // the history without overlapping or skipping a day.
  const until = new Date(utcToday);
  until.setUTCDate(until.getUTCDate() - previousDepth);

  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (days - 1));

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
export type PostComparisonKey = Exclude<PostMetricKey, 'reach'> | 'likes' | 'shares' | 'saved';

export function normalizeDailyBreakdown(points: OrganicPostBreakdownPoint[] | undefined) {
  return (points ?? [])
    .map((point) => ({
      date: point.date ?? (point.timestamp ? point.timestamp.slice(0, 10) : ''),
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
function metricValueFromBreakdownPoint(
  point: {
    reach?: number;
    views?: number;
    engagement?: number;
    comments?: number;
  },
  metricKey: PostMetricKey,
) {
  switch (metricKey) {
    case 'reach':
      return point.reach ?? 0;
    case 'views':
      return point.views ?? 0;
    case 'engagement':
      return point.engagement ?? 0;
    case 'comments':
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
export function postPeriodComparisons(
  post: OrganicPost | null,
): Partial<Record<PostComparisonKey, MetricComparison>> {
  return (
    (post?.comparison as Partial<Record<PostComparisonKey, MetricComparison>> | null | undefined) ??
    {}
  );
}
