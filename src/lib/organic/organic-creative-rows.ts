import type {
  OrganicAwarenessReportPayload,
  OrganicCreativeMetric,
  OrganicCreativeRow,
} from '@continuum/contracts';
import { calculateHookRate, sortPosts } from '@/components/organic/organic-metrics-utils';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';

const AWARENESS_TOP_POSTS_CATEGORY = 'top_posts';

// The Engine B awareness report ranks top posts by hook rate in a `top_posts`
// block keyed by post id. We read just the hook rate per post to enrich the
// creative leaderboard; absence is fine — the client-derived hook rate fills in.
export function extractAwarenessHookRates(
  awareness: OrganicAwarenessReportPayload | null,
): Map<string, number> {
  const byId = new Map<string, number>();
  const block = awareness?.blocks?.find((entry) => entry.category === AWARENESS_TOP_POSTS_CATEGORY);
  const data = block?.data;
  if (!Array.isArray(data)) return byId;
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = record.id;
    const hookRate = record.hookRate;
    if (typeof id === 'string' && typeof hookRate === 'number') {
      byId.set(id, hookRate);
    }
  }
  return byId;
}

// thumbnailUrl is always a static poster image; mediaUrl is the raw asset,
// which for video/Reels posts is an .mp4 file an <img> can't render. Prefer
// the thumbnail so video posts don't fall back to the letter-avatar tile.
function resolveThumbnail(post: OrganicPost): string | undefined {
  return (
    post.thumbnailUrl ??
    post.mediaUrl ??
    post.carouselMedia?.[0]?.thumbnailUrl ??
    post.carouselMedia?.[0]?.mediaUrl ??
    undefined
  );
}

function meanHookRate(posts: OrganicPost[]): number | undefined {
  const rates = posts
    .map(calculateHookRate)
    .filter((rate): rate is number => typeof rate === 'number' && rate > 0);
  if (rates.length === 0) return undefined;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

function buildInsightLine(
  hookRate: number | undefined,
  vsAveragePct: number | undefined,
): string | undefined {
  if (typeof hookRate !== 'number') return undefined;
  const base = `${Math.round(hookRate)}% hook rate`;
  if (typeof vsAveragePct === 'number' && Math.abs(vsAveragePct) >= 10) {
    const sign = vsAveragePct >= 0 ? '+' : '';
    return `${base} · ${sign}${Math.round(vsAveragePct)}% vs your average`;
  }
  return base;
}

function resolveMetricValue(post: OrganicPost, metric: OrganicCreativeMetric): number | undefined {
  const value = post.metrics?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Pure join of ranked organic posts with their Engine B hook-rate insight (or a
// client-derived hook-rate-vs-average fallback). Kept hook-free so it is unit
// testable without React or the browser.
export function buildOrganicCreativeRows(params: {
  posts: OrganicPost[];
  metric: OrganicCreativeMetric;
  awarenessHookRateById?: Map<string, number>;
  limit?: number;
}): OrganicCreativeRow[] {
  const { posts, metric, awarenessHookRateById, limit = 5 } = params;
  const accountAvgHookRate = meanHookRate(posts);
  const ranked = sortPosts(posts, metric)
    .filter((post) => resolveMetricValue(post, metric) !== undefined)
    .slice(0, limit);

  return ranked.map((post) => {
    const metricValue = resolveMetricValue(post, metric) ?? 0;
    const hookRate = awarenessHookRateById?.get(post.id) ?? calculateHookRate(post);
    const vsAveragePct =
      typeof hookRate === 'number' &&
      typeof accountAvgHookRate === 'number' &&
      accountAvgHookRate > 0
        ? (hookRate / accountAvgHookRate - 1) * 100
        : undefined;

    return {
      id: post.id,
      name: post.caption?.trim() || post.title?.trim() || 'Untitled post',
      permalink: post.permalink ?? undefined,
      mediaType: post.mediaProductType ?? post.mediaType ?? undefined,
      thumbnailUrl: resolveThumbnail(post),
      metricLabel: metric,
      metricValue,
      impressions: post.metrics?.impressions,
      views: post.metrics?.views,
      comments: post.metrics?.comments,
      hookRate: typeof hookRate === 'number' ? hookRate : undefined,
      vsAveragePct,
      insightLine: buildInsightLine(hookRate, vsAveragePct),
    };
  });
}
