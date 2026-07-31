import type {
  MetricComparison,
  OrganicPost,
  OrganicPostBreakdownPoint,
} from '@/lib/schemas/organicMetrics';
import { NO_DATA, percentChangeFrom } from './organic-format';

export type DrilldownWindow = '7d' | '30d';

export const DRILLDOWN_WINDOW_DAYS: Record<DrilldownWindow, number> = { '7d': 7, '30d': 30 };
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
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return NO_DATA;
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

export type TrendLineShape = { curve: 'linear' | 'monotone'; showDots: boolean };

// How a line should be drawn for the number of real points behind it. Spline
// smoothing across two points draws a rise-and-fall that no measurement
// supports, so below the graphable threshold the line stays straight and every
// recorded point is marked — the reader can then count what was actually
// measured instead of reading a shape out of an interpolation.
export function trendLineShape(
  numericPointCount: number,
  minPoints: number = MIN_GRAPHABLE_TREND_POINTS,
): TrendLineShape {
  const sparse = numericPointCount < minPoints;
  return { curve: sparse ? 'linear' : 'monotone', showDots: sparse };
}

// Every calendar day in [since, until], inclusive. Empty for an inverted or
// unparseable window rather than looping.
export function enumerateDates(since: string, until: string): string[] {
  const start = parseYmd(since);
  const end = parseYmd(until);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toYmd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// The `days`-long window ending on `until`. Anchored to the reporting range's
// last day rather than to today, because the platforms report with a lag and an
// axis that ends "today" ends on a day that has no data.
export function windowEndingOn(until: string, days: number): { since: string; until: string } {
  const end = parseYmd(until);
  if (!end || days <= 0) return { since: until, until };
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { since: toYmd(start), until: toYmd(end) };
}

export type DateAlignedPoint = { date: string; value: number | undefined; boosted: boolean };

// A series whose axis comes from the window's calendar dates rather than from
// however many points the metric happens to carry. Positional slicing gave each
// metric its own axis — one ending on the 25th, another on the 26th, both under
// one shared range label — and hid a missing day by sliding the window instead of
// showing the gap.
export function buildDateAlignedSeries(params: {
  trends: ReadonlyArray<Record<string, unknown>> | undefined;
  trendKey: string | undefined;
  since: string;
  until: string;
}): DateAlignedPoint[] {
  const { trends, trendKey, since, until } = params;
  if (!trendKey) return [];

  const byDate = new Map<string, Record<string, unknown>>();
  for (const trend of trends ?? []) {
    const date = trend.date;
    if (typeof date === 'string' && date.length > 0) byDate.set(date, trend);
  }

  return enumerateDates(since, until).map((date) => {
    const trend = byDate.get(date);
    const value = trend?.[trendKey];
    return {
      date,
      value: typeof value === 'number' ? value : undefined,
      boosted: Boolean(trend?.boosted),
    };
  });
}

// The last day that actually reported a value. Drives the explicit "data current
// through <date>" note: the platforms' reporting lag is otherwise invisible, and
// looks like the range filter being wrong.
export function latestNumericDate(
  points: ReadonlyArray<{ date: string; value: number | undefined }>,
): string | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point && typeof point.value === 'number') return point.date;
  }
  return undefined;
}

// Day-over-day change from the two most recent numeric trend points — and only
// when those points are genuinely consecutive calendar days. Filtering gaps out
// of a series makes "the last two entries" and "yesterday versus today" two
// different questions; answering the second with the first is what put a DOWN
// badge on a metric that had simply not reported for a week.
export function dayOverDayComparisonFromTrends(
  trends: ReadonlyArray<Record<string, unknown>> | undefined,
  trendKey: string | undefined,
): MetricComparison | undefined {
  if (!trendKey) return undefined;

  const numeric = (trends ?? [])
    .map((trend) => ({ date: trend.date, value: trend[trendKey] }))
    .filter(
      (point): point is { date: string; value: number } =>
        typeof point.date === 'string' && typeof point.value === 'number',
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const current = numeric[numeric.length - 1];
  const previous = numeric[numeric.length - 2];
  if (!current || !previous) return undefined;
  if (!areConsecutiveDays(previous.date, current.date)) return undefined;

  const percentageChange = percentChangeFrom(current.value, previous.value);
  if (percentageChange === undefined) return undefined;

  return { current: current.value, previous: previous.value, percentageChange };
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

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(value: string): Date | null {
  if (!YMD_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function areConsecutiveDays(earlier: string, later: string): boolean {
  const start = parseYmd(earlier);
  const end = parseYmd(later);
  if (!start || !end) return false;
  return end.getTime() - start.getTime() === 24 * 60 * 60 * 1000;
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

// A day the platform did not report is left absent, not coerced to 0. Coercing
// it plots a drop to zero that never happened and renders as the string "0"
// wherever the value reaches a label.
export function normalizeDailyBreakdown(points: OrganicPostBreakdownPoint[] | undefined) {
  return (points ?? [])
    .map((point) => ({
      date: point.date ?? (point.timestamp ? point.timestamp.slice(0, 10) : ''),
      reach: point.reach,
      views: point.views,
      engagement: point.engagement,
      comments: point.comments,
      likes: point.likes,
      shares: point.shares,
      saved: point.saved,
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
): number | undefined {
  switch (metricKey) {
    case 'reach':
      return point.reach;
    case 'views':
      return point.views;
    case 'engagement':
      return point.engagement;
    case 'comments':
      return point.comments;
    default:
      return undefined;
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

export type PostSeriesPoint = { date: string; value: number | undefined };

export function buildPostMetricSeries(params: {
  post: OrganicPost | null;
  metricKey: PostMetricKey;
}): PostSeriesPoint[] {
  const { post, metricKey } = params;
  const breakdown = recentPostBreakdown(post);

  return breakdown.map((point) => ({
    date: point.date,
    value: metricValueFromBreakdownPoint(point, metricKey),
  }));
}

export function countNumericSeriesPoints(
  points: ReadonlyArray<{ value: number | undefined }>,
): number {
  return points.reduce((count, point) => (typeof point.value === 'number' ? count + 1 : count), 0);
}

export type SectionLoadStatus = 'idle' | 'loading' | 'error' | 'success';
export type ReportViewState = 'loading' | 'error' | 'ready' | 'chooseAccount';

// Which branch an organic report surface should render. 'idle' on its own is
// ambiguous — it covers both "no account chosen yet" and "an account is chosen and
// the load has not started" — and reading it as the first is what made the empty
// state ask the reader to select an account the picker already showed as selected.
// The account, not the status, decides that question.
export function resolveReportViewState(input: {
  status: SectionLoadStatus;
  hasAccount: boolean;
  hasData: boolean;
}): ReportViewState {
  if (!input.hasAccount) return 'chooseAccount';
  if (input.status === 'error') return 'error';
  if (input.status === 'success' && input.hasData) return 'ready';
  return 'loading';
}

export const POST_HISTORY_TRACKED_DAYS = 7;
export const POST_COMPARISON_UNLOCK_DAYS = 14;

// One wording for the per-post history accrual. It previously shipped in three
// different phrasings across the quick look and the snapshot panel, which read as
// three separate limitations rather than one.
export function postHistoryProgressCopy(trackedDays: number): string {
  return `Tracking this post's daily numbers as they come in — ${trackedDays} of ${POST_HISTORY_TRACKED_DAYS} days so far.`;
}

export const POST_HISTORY_ACCOUNT_STANDIN_COPY =
  "Not enough daily numbers for this post yet, so this shows the whole account's trend instead.";

export const POST_HISTORY_EMPTY_COPY =
  'Daily tracking for this post starts today. Check back tomorrow for its first trend.';

export const POST_COMPARISON_UNLOCK_COPY = `Change vs the week before appears after ${POST_COMPARISON_UNLOCK_DAYS} days of tracking.`;

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
