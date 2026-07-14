'use client';

import { DownloadIcon, PaperPlaneIcon, ReloadIcon } from '@radix-ui/react-icons';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import React from 'react';
import {
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Gauge } from '@/components/charts/gauge';
import { Pill } from '@/components/kibo-ui/pill';
import { DisabledControl } from '@/components/organic/DisabledControl';
import { describeExportBlock, describeRefreshBlock } from '@/components/organic/disabledReasons';
import { OrganicMetricsWidgetSkeleton } from '@/components/organic/MetricsSkeleton';
import { mergePostWithFreshMedia } from '@/components/organic/organicPostMediaRecovery';
import { PostMediaPreviewImage } from '@/components/organic/PostMediaPreviewImage';
import { PostCommentsPanel } from '@/components/organic/primitives/PostCommentsPanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const OrganicAudienceLocationMapCard = dynamic(
  () =>
    import('@/components/organic/OrganicAudienceLocationMapCard').then(
      (mod) => mod.OrganicAudienceLocationMapCard,
    ),
  { ssr: false },
);

import type { IntegrationErrorCode, OrganicMetricId } from '@continuum/contracts';
import { kpiConfigForPlatform } from '@continuum/contracts';
import { Flag } from 'lucide-react';
import { BrandTrendsHeaderModule } from '@/components/brand-insights/BrandTrendsHeaderModule';
import { SendContinuumReportDialog } from '@/components/dashboard/SendContinuumReportDialog';
import { Reel, ReelContent, type ReelItem, ReelVideo } from '@/components/kibo-ui/reel';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import { PinToAgentButton } from '@/components/organic/agent/PinToAgentButton';
import { CreativeStrategyCard } from '@/components/organic/CreativeStrategyCard';
import { PostQuickLook } from '@/components/organic/cards/PostQuickLook';
import { OrganicCompareView } from '@/components/organic/compare/OrganicCompareView';
import { OrganicAwarenessReportView } from '@/components/organic/OrganicAwarenessReportView';
import {
  formatDateTime,
  formatNumber,
  formatPercentChange,
  formatRate,
  formatShortDate,
  trendDirection,
} from '@/components/organic/organic-format';
import {
  buildPostMetricSeries,
  calculateHookRate,
  type DrilldownWindow,
  filterPostsByYoutubeType,
  formatWatchTime,
  isTrendKeyGraphable,
  isYouTubeShort,
  POST_GALLERY_MAX_DAYS,
  type PostMetricKey,
  type PostSortKey,
  postPeriodComparisons,
  postWindowDays,
  postWindowRange,
  sortPosts,
  summarizeYoutubeTypeMetrics,
  type YoutubePostTypeFilter,
} from '@/components/organic/organic-metrics-utils';
import {
  buildOrganicReportCsv,
  buildOrganicReportHtml,
} from '@/components/organic/organic-report-utils';
import {
  buildPostActivityDays,
  renderPostActivityReferenceLines,
} from '@/components/organic/PostActivityMarkers';
import {
  MetricsScopeSelector,
  type AccountsByPlatform as ScopeAccountsByPlatform,
} from '@/components/organic/selection/MetricsScopeSelector';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { IntegrationErrorBanner } from '@/components/ui/IntegrationErrorBanner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { isAllZeroPost, useOrganicPostDetail } from '@/hooks/useOrganicPostDetail';
import { kpiMetricToMentionSuggestion } from '@/lib/agent/kpi-mentions';
import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import type { OrganicComputedInsight } from '@/lib/organic/organic-insights.types';
import { consumePrefetched } from '@/lib/prefetch/organic-metrics-cache';
import type { OrganicMetricsBrandInsights } from '@/lib/schemas/brandInsights';
import type {
  AudienceBreakdown,
  AudienceDemographicEntry,
  ContentTypePerformance,
  MetricComparison,
  OrganicDateRangePreset,
  OrganicMetrics,
  OrganicMetricsResponse,
  OrganicPost,
} from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';

export type OrganicAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type AccountsByPlatform = {
  instagram: OrganicAccountOption[];
  facebook: OrganicAccountOption[];
  tiktok: OrganicAccountOption[];
  youtube: OrganicAccountOption[];
  linkedin: OrganicAccountOption[];
};

type MetricsPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin';
type MetricsViewMode = 'account' | 'posts' | 'compare';

const PLATFORM_LABELS: Record<MetricsPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

type Props = {
  brandId: string;
  accountsByPlatform: AccountsByPlatform;
  initialPlatform?: MetricsPlatform;
  /** Brand-insight trend signals (market trends / events / questions). */
  brandInsights?: OrganicMetricsBrandInsights | null;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: 'success'; data: OrganicMetricsResponse };

type SectionState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: 'success'; data: T };

type DemographicsSlice = {
  audienceDemographics: OrganicMetricsResponse['audienceDemographics'];
};

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = 'last_7d';

const RANGE_OPTIONS: OrganicDateRangePreset[] = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_month',
];

const RANGE_LABEL_OVERRIDES: Partial<Record<OrganicDateRangePreset, string>> = {
  today: 'Today (24h)',
};

type KpiMetric = { key: OrganicMetricId; label: string; format?: 'count' | 'percent' };

function getKpiConfig(platform: MetricsPlatform): KpiMetric[] {
  return kpiConfigForPlatform(platform);
}
const genderChartConfig = {
  value: { label: 'Followers', color: 'var(--primary)' },
} satisfies ChartConfig;

const drilldownChartConfig = {
  value: { label: 'Value', color: '#0284c7' },
} satisfies ChartConfig;

const ACCOUNT_TREND_MAP: Partial<
  Record<
    keyof OrganicMetrics,
    | 'reach'
    | 'views'
    | 'accountsEngaged'
    | 'comments'
    | 'newFollowers'
    | 'profileVisits24h'
    | 'reelsViews'
    | 'postViews'
    | 'storiesViews'
    | 'followerReach'
    | 'nonFollowerReach'
    | 'avgRetentionRate'
    | 'avgSkipRate'
    | 'likes'
    | 'hookRate'
    | 'shares'
    | 'subscribers'
    | 'following'
    | 'videoCount'
  >
> = {
  accountsEngaged: 'accountsEngaged',
  reach: 'reach',
  views: 'views',
  reelsViews: 'reelsViews',
  postViews: 'postViews',
  storiesViews: 'storiesViews',
  followerReach: 'followerReach',
  nonFollowerReach: 'nonFollowerReach',
  comments: 'comments',
  newFollowers: 'newFollowers',
  profileVisits24h: 'profileVisits24h',
  profileVisitsYesterday: 'profileVisits24h',
  avgRetentionRate: 'avgRetentionRate',
  avgSkipRate: 'avgSkipRate',
  likes: 'likes',
  hookRate: 'hookRate',
  shares: 'shares',
  subscribers: 'subscribers',
  following: 'following',
  videoCount: 'videoCount',
};

// Maps insight metric tags → KPI keys they're relevant to
const INSIGHT_KPI_MAP: Record<string, Array<keyof OrganicMetrics>> = {
  newFollowers: ['newFollowers'],
  nonFollowerReach: ['nonFollowerReach'],
  reach: ['reach'],
  views: ['views', 'postViews', 'reelsViews'],
  totalInteractions: ['accountsEngaged'],
  accountsEngaged: ['accountsEngaged'],
  saved: ['accountsEngaged'],
  comments: ['comments'],
  country: ['followerReach'],
  age: ['followerReach'],
  profileVisits24h: ['profileVisits24h'],
};

const POST_METRIC_LABELS: Record<PostMetricKey, string> = {
  reach: 'Reach',
  views: 'Views',
  engagement: 'Engagement',
  comments: 'Comments',
};

function rangeLabel(preset: OrganicDateRangePreset) {
  return RANGE_LABEL_OVERRIDES[preset] ?? preset.replace(/_/g, ' ');
}

function mergePosts(existing: OrganicPost[], incoming: OrganicPost[]) {
  const map = new Map(existing.map((post) => [post.id, post]));
  incoming.forEach((post) => {
    const prev = map.get(post.id);
    const merged = { ...(prev ?? {}), ...post };
    if (prev) {
      // Reuse the media URLs already loaded/displayed in the gallery. The
      // per-post detail fetch returns freshly-signed URLs for identical media;
      // swapping them in would force the browser to re-download and flash.
      // Metrics still hydrate from the incoming detail; only media stays put.
      merged.mediaUrl = prev.mediaUrl ?? post.mediaUrl;
      merged.thumbnailUrl = prev.thumbnailUrl ?? post.thumbnailUrl;
      merged.carouselMedia = prev.carouselMedia ?? post.carouselMedia;
    }
    map.set(post.id, merged);
  });
  return Array.from(map.values()).sort((a, b) => {
    const dateA = a.timestamp ? Date.parse(a.timestamp) : 0;
    const dateB = b.timestamp ? Date.parse(b.timestamp) : 0;
    return dateB - dateA;
  });
}

function downloadTextFile(params: { content: string; fileName: string; mimeType: string }) {
  const blob = new Blob([params.content], { type: params.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = params.fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function demographicColor(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'female') return 'var(--primary)';
  if (normalized === 'male') return 'var(--secondary)';
  if (normalized === 'unknown') return 'var(--muted-foreground)';
  return 'var(--accent)';
}

function resolveProfileVisits(metrics: OrganicMetrics) {
  return metrics.profileVisits24h ?? metrics.profileVisitsYesterday;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function fallbackComparisonFromTrends(
  data: OrganicMetricsResponse,
  metricKey: keyof OrganicMetrics,
): MetricComparison | undefined {
  const trendKey = ACCOUNT_TREND_MAP[metricKey];
  if (!trendKey) return undefined;

  const trends = (data.trends ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const numericPoints = trends
    .map((trend) => trend[trendKey])
    .filter((value): value is number => typeof value === 'number');
  if (numericPoints.length < 2) return undefined;

  const current = numericPoints[numericPoints.length - 1];
  const previous = numericPoints[numericPoints.length - 2];
  if (current === undefined || previous === undefined) return undefined;

  return {
    current,
    previous,
    percentageChange: percentageChange(current, previous),
  };
}

function metricComparisonFor(
  data: OrganicMetricsResponse,
  metricKey: keyof OrganicMetrics,
): MetricComparison | null | undefined {
  if (metricKey === 'profileVisits24h') {
    return data.comparison?.profileVisits24h ?? data.comparison?.profileVisitsYesterday;
  }
  return data.comparison?.[metricKey] ?? fallbackComparisonFromTrends(data, metricKey);
}

function buildAccountMetricSeries(params: {
  data: OrganicMetricsResponse;
  metricKey: keyof OrganicMetrics;
  window: DrilldownWindow;
}) {
  const { data, metricKey, window } = params;
  const days = window === '30d' ? 30 : 7;
  const trends = (data.trends ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const trendKey = ACCOUNT_TREND_MAP[metricKey];

  if (trendKey) {
    const points = trends
      .map((trend) => ({
        date: trend.date,
        value: trend[trendKey],
        boosted: Boolean(trend.boosted),
      }))
      .filter(
        (trend): trend is { date: string; value: number; boosted: boolean } =>
          typeof trend.value === 'number',
      );

    if (points.length === 0) return [];

    return points
      .map((trend) => ({
        date: trend.date,
        value: trend.value,
        boosted: trend.boosted,
      }))
      .slice(Math.max(0, points.length - days));
  }

  return [];
}

function isVideoPost(post: OrganicPost) {
  const mediaType = (post.mediaType ?? '').toUpperCase();
  const productType = (post.mediaProductType ?? '').toUpperCase();
  return mediaType.includes('VIDEO') || productType.includes('REEL');
}

function isCarouselPost(post: OrganicPost) {
  const mediaType = (post.mediaType ?? '').toUpperCase();
  return mediaType.includes('CAROUSEL') || (post.carouselMedia?.length ?? 0) > 1;
}

function getPostPreviewUrl(post: OrganicPost) {
  return (
    post.mediaUrl ??
    post.thumbnailUrl ??
    post.carouselMedia?.[0]?.mediaUrl ??
    post.carouselMedia?.[0]?.thumbnailUrl ??
    null
  );
}

function PostGalleryCard({
  post,
  selected,
  loading,
  onSelect,
  onRecoverMedia,
  platform = 'instagram',
}: {
  post: OrganicPost;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
  onRecoverMedia?: (postId: string) => void;
  platform?: MetricsPlatform;
}) {
  const preview = getPostPreviewUrl(post);
  // TikTok and YouTube only expose a thumbnail (no playable file), so they render
  // as a still + permalink rather than an inline <video>.
  const isThumbnailOnlyVideo = platform === 'tiktok' || platform === 'youtube';
  const video = !isThumbnailOnlyVideo && isVideoPost(post);
  const carousel = isCarouselPost(post);
  const mediaHeightClass = selected
    ? video
      ? 'h-[280px] sm:h-[320px]'
      : carousel
        ? 'h-[250px] sm:h-[290px]'
        : 'h-[260px] sm:h-[300px]'
    : video
      ? 'h-[220px] sm:h-[260px]'
      : carousel
        ? 'h-[190px] sm:h-[220px]'
        : 'h-[210px] sm:h-[240px]';
  const reelData: ReelItem[] = preview
    ? [
        {
          id: `${post.id}-reel`,
          type: 'video',
          src: preview,
          duration: 8,
          title: post.title,
          description: post.caption,
        },
      ]
    : [];

  return (
    <motion.button
      layout
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
      type="button"
      onClick={onSelect}
      aria-label={`Open analytics for ${post.title ?? post.mediaType ?? post.id}`}
      className={cn(
        'group relative block w-full overflow-hidden rounded-xl border border-subtle bg-surface text-left transition-[transform,box-shadow,opacity,border-color] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1',
        selected
          ? 'ring-2 ring-blue-500/60 border-blue-400/60 shadow-lg shadow-blue-500/15'
          : 'hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden bg-black/90 ring-1 ring-black/10 dark:ring-white/10',
          mediaHeightClass,
        )}
      >
        {preview ? (
          video && !isThumbnailOnlyVideo ? (
            <Reel className="h-full w-full" data={reelData} defaultMuted>
              <ReelContent>
                {(item) => (
                  <ReelVideo
                    src={item.src}
                    className="h-full w-full object-contain"
                    playsInline
                    muted
                    loop
                  />
                )}
              </ReelContent>
            </Reel>
          ) : (
            <div className="relative h-full w-full">
              <PostMediaPreviewImage
                postId={post.id}
                src={preview}
                alt={post.title ?? post.caption ?? 'Post media'}
                className="h-full w-full object-contain outline outline-1 outline-black/10 dark:outline-white/10"
                onRecover={onRecoverMedia}
              />
              {isThumbnailOnlyVideo && post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 hover:opacity-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="ml-0.5 h-5 w-5 text-black"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </a>
              ) : null}
            </div>
          )
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Media preview unavailable</span>
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1">
          {platform === 'youtube' ? (
            <Pill variant={isYouTubeShort(post) ? 'warning' : 'violet'}>
              {isYouTubeShort(post) ? 'Short' : 'Video'}
            </Pill>
          ) : (
            <Pill variant={video ? 'violet' : carousel ? 'warning' : 'muted'}>
              {video ? 'Reel/Video' : carousel ? 'Carousel' : 'Post'}
            </Pill>
          )}
          {carousel ? (
            <Pill variant="muted">{(post.carouselMedia?.length ?? 0) || 1} slides</Pill>
          ) : null}
        </div>
        {post.isBoosted ? (
          <Pill className="absolute right-2 top-2" variant="warning">
            Boosted
          </Pill>
        ) : null}
        {loading ? (
          <Pill className="absolute bottom-2 right-2" variant="teal">
            Loading details...
          </Pill>
        ) : null}
      </div>
    </motion.button>
  );
}

function TikTokEmbed({ videoId, permalink }: { videoId: string; permalink: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    const blockquote = document.createElement('blockquote');
    blockquote.className = 'tiktok-embed';
    blockquote.setAttribute('cite', permalink);
    blockquote.setAttribute('data-video-id', videoId);
    blockquote.style.maxWidth = '100%';

    const section = document.createElement('section');
    blockquote.appendChild(section);
    container.appendChild(blockquote);

    const existingScript = document.querySelector('script[src="https://www.tiktok.com/embed.js"]');
    if (existingScript) existingScript.remove();

    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    container.appendChild(script);

    return () => {
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [videoId, permalink]);

  return (
    <div
      ref={containerRef}
      className="flex min-h-[clamp(240px,60dvh,600px)] max-h-[clamp(360px,75dvh,800px)] w-full items-center justify-center overflow-hidden [&_iframe]:!max-h-[clamp(360px,75dvh,800px)]"
    />
  );
}

// Folds the post-snapshot stat cards (reach/views/engagement/comments plus any
// watch-time and hook-rate metrics) into the quiet one-line MetricStrip. Reach
// is lifetime-to-date only (no period comparison exists for it — see
// PostComparisonKey). The other metrics show the backend-computed
// period-over-period total (current 7d vs prior 7d) once 14 days of history
// are tracked; until then they read "Building…" rather than substituting the
// lifetime total under a "(7d)" label.
function buildPostSnapshotStripItems(
  post: OrganicPost,
  metricComparisons: Partial<Record<string, MetricComparison>>,
): MetricStripItem[] {
  const windowed = (key: 'views' | 'engagement' | 'comments') =>
    metricComparisons[key] ? formatNumber(metricComparisons[key]?.current) : 'Building…';

  const items: MetricStripItem[] = [
    {
      label: 'Reach (Lifetime)',
      value: formatNumber(post.metrics?.reach),
    },
    {
      label: 'Views (7d)',
      value: windowed('views'),
      deltaPct: metricComparisons.views?.percentageChange,
    },
    {
      label: 'Engagement (7d)',
      value: windowed('engagement'),
      deltaPct: metricComparisons.engagement?.percentageChange,
    },
    {
      label: 'Comments (7d)',
      value: windowed('comments'),
      deltaPct: metricComparisons.comments?.percentageChange,
    },
  ];

  if (
    post.metrics?.reelsAvgWatchTime !== undefined ||
    post.metrics?.reelsVideoViewTotalTime !== undefined
  ) {
    items.push(
      { label: 'Avg Watch Time', value: formatWatchTime(post.metrics?.reelsAvgWatchTime) },
      { label: 'Total Watch Time', value: formatWatchTime(post.metrics?.reelsVideoViewTotalTime) },
    );
  }

  const hookRate = calculateHookRate(post);
  if (hookRate !== undefined) {
    items.push({
      label: 'Hook Rate',
      value: `${hookRate.toFixed(1)}%`,
      valueColor: hookRateTextColor(hookRate),
    });
  }

  if (typeof post.metrics?.retentionRate === 'number') {
    items.push({ label: 'Retention', value: `${post.metrics.retentionRate.toFixed(1)}%` });
  }

  return items;
}

function PostSnapshotPanel({
  post,
  selectedMetric,
  onMetricSelect,
  series,
  accountSeries,
  loading,
  onRecoverMedia,
  platform = 'instagram',
}: {
  post: OrganicPost;
  selectedMetric: PostMetricKey;
  onMetricSelect: (metric: PostMetricKey) => void;
  series: Array<{ date: string; value: number }>;
  accountSeries?: Array<{ date: string; value: number }>;
  loading: boolean;
  onRecoverMedia?: (postId: string) => void;
  platform?: MetricsPlatform;
}) {
  const preview = getPostPreviewUrl(post);
  // TikTok and YouTube only expose a thumbnail (no playable file), so they render
  // as a still + permalink rather than an inline <video>.
  const isThumbnailOnlyVideo = platform === 'tiktok' || platform === 'youtube';
  const video = !isThumbnailOnlyVideo && isVideoPost(post);
  const metricComparisons = postPeriodComparisons(post);
  // Per-post history accrues one daily snapshot per day tracked (Meta serves no
  // media-level history). Surface how far along the 7-day sparkline walk is —
  // the period-over-period comparison badges above need a longer 14-day walk,
  // tracked separately via metricComparisons being empty until then.
  const trendDays = post.breakdown7d?.length ?? 0;
  // Show skeletons only while the detail fetch is in flight AND the base post has
  // no metrics yet, so an already-populated post is never hidden behind a loader.
  const metricsPending = loading && isAllZeroPost(post);

  return (
    <motion.aside
      key={post.id}
      initial={{ opacity: 0, x: 36 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 36 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      className="min-h-0"
    >
      <div className="h-full rounded-lg border border-subtle bg-surface">
        <SectionHeader
          title="Post Snapshot"
          meta={
            <span className="text-xs text-muted-foreground">{formatDateTime(post.timestamp)}</span>
          }
          action={
            <div className="flex items-center gap-1">
              {post.isBoosted ? <Pill variant="warning">Boosted</Pill> : null}
              {loading ? <Pill variant="teal">Refreshing</Pill> : null}
            </div>
          }
        />
        <div className="p-3 h-full">
          <div className="mb-3 overflow-hidden rounded-lg bg-black/90">
            {isThumbnailOnlyVideo && post.permalink ? (
              <TikTokEmbed videoId={post.id} permalink={post.permalink} />
            ) : preview ? (
              video ? (
                <Reel
                  className="max-h-[320px] min-h-[180px] w-full"
                  data={[
                    {
                      id: `${post.id}-snapshot`,
                      type: 'video',
                      src: preview,
                      duration: 8,
                      title: post.title,
                      description: post.caption,
                    },
                  ]}
                  defaultMuted
                >
                  <ReelContent>
                    {(item) => (
                      <ReelVideo
                        src={item.src}
                        className="h-full w-full object-contain"
                        playsInline
                        muted
                        loop
                      />
                    )}
                  </ReelContent>
                </Reel>
              ) : (
                <PostMediaPreviewImage
                  postId={post.id}
                  src={preview}
                  alt={post.title ?? post.caption ?? 'Selected post'}
                  className="max-h-[320px] min-h-[180px] w-full object-contain"
                  onRecover={onRecoverMedia}
                  fallbackLabel="Preview unavailable for this post"
                />
              )
            ) : (
              <div className="flex min-h-[180px] items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  Preview unavailable for this post
                </span>
              </div>
            )}
          </div>

          <div className="mb-3">
            {metricsPending ? (
              <div className="grid grid-cols-2 gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[48px] rounded-lg" />
                ))}
              </div>
            ) : (
              <MetricStrip items={buildPostSnapshotStripItems(post, metricComparisons)} />
            )}
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                {(Object.keys(POST_METRIC_LABELS) as PostMetricKey[]).map((metricKey) => (
                  <button
                    key={metricKey}
                    type="button"
                    className={cn(
                      'h-8 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                      selectedMetric === metricKey
                        ? 'bg-accent/20 text-foreground'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => onMetricSelect(metricKey)}
                    aria-label={`Show ${POST_METRIC_LABELS[metricKey]} trend`}
                    aria-pressed={selectedMetric === metricKey}
                  >
                    {POST_METRIC_LABELS[metricKey]}
                  </button>
                ))}
              </div>
              <span className="px-1 text-xs text-muted-foreground">Last 7 days</span>
            </div>
            {metricsPending ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : series.length > 0 ? (
              <>
                <ChartContainer config={drilldownChartConfig} className="h-24 w-full">
                  <LineChart data={series}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-value)"
                      strokeWidth={2}
                      dot={false}
                    />
                    {post.boostedAt ? (
                      <ReferenceLine
                        x={post.boostedAt.slice(0, 10)}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: 'Boost', position: 'top', fill: '#ef4444', fontSize: 10 }}
                      />
                    ) : null}
                  </LineChart>
                </ChartContainer>
                {trendDays < 7 ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Building per-post history — {trendDays}/7 days tracked.
                  </span>
                ) : null}
              </>
            ) : accountSeries && accountSeries.length > 0 ? (
              <div className="space-y-1">
                <span className="block text-xs text-muted-foreground">
                  Per-post trend builds over time ({trendDays}/7 days). Showing the account trend
                  meanwhile.
                </span>
                <ChartContainer config={drilldownChartConfig} className="h-24 w-full">
                  <LineChart data={accountSeries}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-value)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Per-post trend builds over time. Check back tomorrow once a second day is tracked.
              </span>
            )}
          </div>

          <PostCommentsPanel comments={post.comments} />

          <span className="block text-xs line-clamp-8">
            {post.caption?.trim().length ? post.caption : 'Caption unavailable for this post.'}
          </span>
        </div>
      </div>
    </motion.aside>
  );
}

function MetricCard({
  label,
  value,
  comparison,
  compact = false,
  active = false,
  onClick,
  ariaLabel,
  insights,
  format = 'count',
  metricKey,
  platform,
  rangePreset,
}: {
  label: string;
  value: number | undefined;
  comparison?: MetricComparison | null;
  compact?: boolean;
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  insights?: OrganicComputedInsight[];
  format?: 'count' | 'percent';
  metricKey?: string;
  platform?: string;
  rangePreset?: string;
}) {
  const pctChange = comparison?.percentageChange;
  const direction = trendDirection(pctChange);
  const interactive = Boolean(onClick);
  const hasInsights = insights && insights.length > 0;
  const pinSuggestion =
    metricKey && !compact
      ? kpiMetricToMentionSuggestion({
          key: metricKey,
          label,
          value: typeof value === 'number' ? value : null,
          previous: comparison?.previous ?? null,
          percentageChange: pctChange ?? null,
          unit: format === 'percent' ? 'percent' : 'count',
          platform: platform ?? null,
          rangePreset: rangePreset ?? null,
        })
      : null;

  const cardContent = (
    <div
      className={cn(
        'group relative rounded-lg border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 motion-reduce:transition-none',
        compact ? 'min-h-[48px]' : 'min-h-[96px]',
        active ? 'border-blue-500/70 bg-blue-500/10 shadow-blue-500/10' : '',
        interactive ? 'hover:-translate-y-0.5 hover:shadow-sm' : '',
        hasInsights ? 'ring-1 ring-primary/30' : '',
      )}
    >
      {pinSuggestion ? (
        <div className="absolute right-1 top-1 z-10">
          <PinToAgentButton suggestions={pinSuggestion} iconOnly label={`Add ${label} to agent`} />
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label={ariaLabel ?? label}
        aria-pressed={interactive ? active : undefined}
        className={cn(
          'h-full w-full rounded-[inherit] text-left',
          compact ? 'px-2.5 py-1.5' : 'flex flex-col justify-between p-3',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1',
          interactive ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex items-center gap-1 pr-6">
            <span className="text-xs text-muted-foreground leading-none">{label}</span>
            {hasInsights ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                title="Insights available"
              />
            ) : null}
          </div>
          {!compact && (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
                direction === 'up' ? 'bg-success/15 text-success' : '',
                direction === 'down' ? 'bg-destructive/15 text-destructive' : '',
                direction === 'flat' ? 'bg-muted text-muted-foreground' : '',
              )}
            >
              {direction}
            </span>
          )}
        </div>
        <span
          className={cn(
            'block font-semibold leading-tight tabular-nums tracking-tight',
            compact ? 'text-base' : 'text-xl',
          )}
        >
          {format === 'percent'
            ? typeof value === 'number'
              ? `${value.toFixed(1)}%`
              : '—'
            : formatNumber(value)}
        </span>
        {compact ? (
          <span
            className={cn(
              'block text-xs leading-none font-medium',
              pctChange === undefined
                ? 'text-muted-foreground'
                : pctChange >= 0
                  ? 'text-success'
                  : 'text-destructive',
            )}
          >
            {formatPercentChange(pctChange)}
          </span>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-xs leading-none font-medium',
                pctChange === undefined
                  ? 'text-muted-foreground'
                  : pctChange >= 0
                    ? 'text-success'
                    : 'text-destructive',
              )}
            >
              {formatPercentChange(pctChange)}
            </span>
            <span className="text-xs text-muted-foreground leading-none">vs previous period</span>
          </div>
        )}
      </button>
    </div>
  );

  if (!hasInsights) return cardContent;

  return (
    <Popover>
      <PopoverTrigger asChild>{cardContent}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] max-h-[min(70svh,26rem)] overflow-y-auto p-3"
      >
        <span className="mb-2 block text-sm font-medium">{label} Insights</span>
        <div className="flex flex-col gap-2">
          {insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2">
              <div
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  insight.severity === 'positive'
                    ? 'bg-emerald-500'
                    : insight.severity === 'negative'
                      ? 'bg-red-500'
                      : 'bg-blue-500',
                )}
              />
              <div className="min-w-0">
                <span className="block text-xs leading-snug">{insight.text}</span>
                {insight.recommendation ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground leading-snug">
                    {insight.recommendation}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Per-type analytics shown above the filtered YouTube gallery so the headline
// reflects the selected Shorts/Videos slice rather than the channel-wide KPIs.
function YoutubeTypeSummaryStrip({
  posts,
  filter,
}: {
  posts: OrganicPost[];
  filter: YoutubePostTypeFilter;
}) {
  const summary = summarizeYoutubeTypeMetrics(posts);
  const countLabel = filter === 'shorts' ? 'Shorts' : filter === 'videos' ? 'Videos' : 'Posts';
  const stats: Array<{ label: string; value: string }> = [
    { label: countLabel, value: `${summary.count}` },
    { label: 'Views', value: formatNumber(summary.views) },
    { label: 'Likes', value: formatNumber(summary.likes) },
    { label: 'Comments', value: formatNumber(summary.comments) },
    {
      label: 'Avg view %',
      value: summary.avgHookRate !== undefined ? `${summary.avgHookRate.toFixed(1)}%` : '-',
    },
  ];
  return (
    <div className="mb-3 rounded-lg border border-subtle bg-surface">
      <div className="p-3">
        <div className="flex gap-6 flex-wrap">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <span className="block text-xs text-muted-foreground">{stat.label}</span>
              <span className="block text-base font-semibold tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Account-level Shorts-vs-Videos performance split (data.contentTypePerformance,
// from the Analytics creatorContentType dimension).
function YoutubeContentTypeSplitCard({ performance }: { performance: ContentTypePerformance[] }) {
  if (performance.length === 0) return null;
  const maxViews = Math.max(1, ...performance.map((row) => row.views ?? 0));
  return (
    <div className="rounded-lg border border-subtle bg-surface">
      <div className="p-3">
        <span className="mb-2 block text-sm font-medium">Shorts vs Videos</span>
        <div className="flex flex-col gap-3">
          {performance.map((row) => (
            <div key={row.contentType}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">{row.contentType}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(row.views ?? 0)} views · {formatNumber(row.engagement ?? 0)} eng
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn(
                    'h-full rounded-full',
                    row.contentType === 'Shorts' ? 'bg-pink-500' : 'bg-violet-500',
                  )}
                  style={{ width: `${Math.round(((row.views ?? 0) / maxViews) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type AudienceCardProps = {
  audienceBreakdown: AudienceBreakdown;
  audienceTotal: number;
  genderDemographics: Array<AudienceDemographicEntry & { fill: string }>;
  ageDemographics: AudienceDemographicEntry[];
  demographicsLoading: boolean;
  hidden: boolean;
};

// Three even columns (Followers Breakdown, Gender, Age) inside one "Audience"
// card. Gender reuses the radial's own center-label donut grammar instead of
// a cramped standalone pie; Age reuses the ranked bar-list pattern from
// YoutubeContentTypeSplitCard above instead of a squeezed recharts BarChart.
function AudienceCard({
  audienceBreakdown,
  audienceTotal,
  genderDemographics,
  ageDemographics,
  demographicsLoading,
  hidden,
}: AudienceCardProps) {
  const followersPct = audienceTotal > 0 ? (audienceBreakdown.followers / audienceTotal) * 100 : 0;
  const nonFollowersPct =
    audienceTotal > 0 ? (audienceBreakdown.nonFollowers / audienceTotal) * 100 : 0;

  const genderTotal = genderDemographics.reduce((sum, entry) => sum + entry.value, 0);
  const genderLeadEntry =
    genderDemographics.length > 0
      ? [...genderDemographics].sort((a, b) => b.value - a.value)[0]
      : null;
  const genderLeadPct =
    genderLeadEntry && genderTotal > 0 ? (genderLeadEntry.value / genderTotal) * 100 : null;

  const ageTotal = ageDemographics.reduce((sum, entry) => sum + entry.value, 0);
  const peakAgeBand = ageDemographics.reduce<AudienceDemographicEntry | null>(
    (max, entry) => (!max || entry.value > max.value ? entry : max),
    null,
  );
  const ageMaxValue = Math.max(1, peakAgeBand?.value ?? 0);

  return (
    <div className={cn('rounded-lg border border-subtle bg-surface', hidden && '!hidden')}>
      <SectionHeader title="Audience" />
      <div className="p-3">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col items-center gap-3">
            <span className="self-start text-xs text-muted-foreground uppercase tracking-wide">
              Followers Breakdown
            </span>
            {audienceTotal === 0 ? (
              <div className="flex items-center justify-center h-64 w-full max-w-xs">
                <span className="text-xs text-muted-foreground">
                  Followers breakdown unavailable.
                </span>
              </div>
            ) : (
              <>
                <Gauge
                  orientation="arc"
                  value={followersPct}
                  centerValue={audienceTotal}
                  defaultLabel="Total Audience"
                  activeFill="var(--primary)"
                  inactiveFill="var(--muted)"
                  className="h-64 w-full max-w-xs"
                />
                <MetricStrip
                  items={[
                    {
                      label: 'Followers',
                      value: `${formatNumber(audienceBreakdown.followers)} · ${formatRate(followersPct)}`,
                    },
                    {
                      label: 'Non-followers',
                      value: `${formatNumber(audienceBreakdown.nonFollowers)} · ${formatRate(nonFollowersPct)}`,
                    },
                  ]}
                />
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <span className="self-start text-xs text-muted-foreground uppercase tracking-wide">
              Gender
            </span>
            {demographicsLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-48 w-48 animate-pulse rounded-full bg-muted/70" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted/70" />
              </div>
            ) : genderDemographics.length === 0 ? (
              <span className="text-xs text-muted-foreground">Gender breakdown unavailable.</span>
            ) : (
              <>
                <ChartContainer config={genderChartConfig} className="h-48 w-48">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={genderDemographics}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={44}
                      outerRadius={74}
                      strokeWidth={2}
                    >
                      {genderDemographics.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                      <Label
                        content={({ viewBox }) => {
                          if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) {
                            return null;
                          }

                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) - 8}
                                className="fill-foreground text-lg font-semibold"
                              >
                                {genderLeadPct !== null ? formatRate(genderLeadPct) : '—'}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) + 12}
                                className="fill-muted-foreground text-2xs uppercase tracking-wide"
                              >
                                {genderLeadEntry?.label ?? 'Gender'}
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-col gap-1.5 w-full max-w-xs">
                  {genderDemographics.map((entry) => (
                    <div key={entry.key} className="flex justify-between items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="truncate text-xs text-muted-foreground">
                          {entry.label}
                        </span>
                      </div>
                      <span className="text-xs font-medium font-mono">
                        {formatNumber(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Age</span>
              {peakAgeBand && ageTotal > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Peak <span className="font-medium text-foreground">{peakAgeBand.label}</span>
                  {' · '}
                  {formatRate((peakAgeBand.value / ageTotal) * 100)}
                </span>
              ) : null}
            </div>
            {demographicsLoading ? (
              <div className="flex flex-col gap-3">
                {[70, 45, 85, 30, 55, 25].map((width, index) => (
                  <div key={index} className="space-y-1">
                    <div className="h-3 w-10 animate-pulse rounded bg-muted/70" />
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full animate-pulse rounded-full bg-muted/70"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : ageDemographics.length === 0 ? (
              <span className="text-xs text-muted-foreground">Age breakdown unavailable.</span>
            ) : (
              <div className="flex flex-col gap-3 pr-1">
                {ageDemographics.map((entry) => (
                  <div key={entry.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{entry.label}</span>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {formatNumber(entry.value)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          entry.key === peakAgeBand?.key ? 'bg-primary' : 'bg-primary/70',
                        )}
                        style={{ width: `${Math.round((entry.value / ageMaxValue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  data,
  viewMode,
  postDetailsById,
  loadingPostId,
  onRequestPostDetail,
  onRecoverPostMedia,
  hasMorePosts,
  loadingMorePosts,
  onLoadMorePosts,
  nextPostWindowDays,
  demographicsLoading = false,
  brandId,
  integrationAccountId,
  platform,
  rangePreset,
  youtubePostType,
  scrollRootRef,
}: {
  data: OrganicMetricsResponse;
  viewMode: MetricsViewMode;
  postDetailsById?: Record<string, OrganicPost>;
  loadingPostId?: string | null;
  onRequestPostDetail?: (postId: string) => void;
  onRecoverPostMedia?: (postId: string) => void;
  hasMorePosts?: boolean;
  loadingMorePosts?: boolean;
  onLoadMorePosts?: () => void;
  nextPostWindowDays?: number | null;
  demographicsLoading?: boolean;
  brandId: string;
  integrationAccountId: string;
  platform: MetricsPlatform;
  rangePreset: OrganicDateRangePreset;
  youtubePostType: YoutubePostTypeFilter;
  // The tab's one scroll container. Cards below never open a scroller of their
  // own, so infinite-scroll observation has to key off this shared root.
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [selectedPostId, setSelectedPostId] = React.useState<string | null>(null);
  const [selectedAccountMetric, setSelectedAccountMetric] =
    React.useState<keyof OrganicMetrics>('reach');
  const [selectedPostMetric, setSelectedPostMetric] = React.useState<PostMetricKey>('views');
  const [drilldownWindow, setDrilldownWindow] = React.useState<DrilldownWindow>('7d');
  const [postSortKey, setPostSortKey] = React.useState<PostSortKey>('recent');
  const [showPostFlags, setShowPostFlags] = React.useState(true);

  // Fetch organic insights (KPI tooltips) + the assembled AI-Awareness report.
  const {
    insights: organicInsights,
    awareness: awarenessReport,
    isLoading: isAwarenessLoading,
    refresh: refreshAwareness,
  } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset,
    enabled: viewMode === 'account',
  });

  // Build per-KPI insight lookup
  const insightsByKpi = React.useMemo(() => {
    const map = new Map<keyof OrganicMetrics, OrganicComputedInsight[]>();
    for (const insight of organicInsights) {
      const kpiKeys = insight.metric ? INSIGHT_KPI_MAP[insight.metric] : undefined;
      if (!kpiKeys) continue;
      for (const kpi of kpiKeys) {
        const arr = map.get(kpi) ?? [];
        arr.push(insight);
        map.set(kpi, arr);
      }
    }
    return map;
  }, [organicInsights]);

  const metrics = data.metrics;
  const profileVisits24h = resolveProfileVisits(metrics);
  const audienceBreakdown = data.audienceBreakdown ?? {
    followers: metrics.followerReach ?? 0,
    nonFollowers: metrics.nonFollowerReach ?? 0,
  };

  React.useEffect(() => {
    if (!data.posts || data.posts.length === 0) {
      setSelectedPostId(null);
      return;
    }
    if (selectedPostId && !data.posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(null);
    }
  }, [data.posts, selectedPostId]);

  const selectedPostBase = (data.posts ?? []).find((post) => post.id === selectedPostId) ?? null;
  const selectedPostDetail =
    (selectedPostId ? postDetailsById?.[selectedPostId] : undefined) ?? null;
  const selectedPost: OrganicPost | null =
    selectedPostDetail && selectedPostBase
      ? mergePostWithFreshMedia(selectedPostBase, selectedPostDetail)
      : (selectedPostDetail ?? selectedPostBase);
  const postCardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const postsLoadSentinelRef = React.useRef<HTMLDivElement | null>(null);
  // A KPI is drillable only once its per-day series carries enough real points.
  // Series the backend can't (yet) supply — retention before reels accrue, TikTok
  // deltas before snapshots accumulate, metrics with no daily API source — leave
  // the card as a static headline tile instead of offering an empty chart.
  const graphableAccountMetrics = React.useMemo(() => {
    const set = new Set<keyof OrganicMetrics>();
    for (const metric of getKpiConfig(platform)) {
      if (isTrendKeyGraphable(data.trends, ACCOUNT_TREND_MAP[metric.key])) {
        set.add(metric.key);
      }
    }
    return set;
  }, [data.trends, platform]);

  // Keep the drilldown pointed at a metric that actually graphs: if the active
  // selection isn't in this platform's KPI set or isn't graphable yet, fall back
  // to the first graphable KPI (leaves the empty-state text only when none are).
  React.useEffect(() => {
    const config = getKpiConfig(platform);
    const stillValid =
      config.some((metric) => metric.key === selectedAccountMetric) &&
      graphableAccountMetrics.has(selectedAccountMetric);
    if (stillValid) return;
    const firstGraphable = config.find((metric) => graphableAccountMetrics.has(metric.key));
    if (firstGraphable) setSelectedAccountMetric(firstGraphable.key);
  }, [platform, graphableAccountMetrics, selectedAccountMetric]);

  const accountSeries = buildAccountMetricSeries({
    data,
    metricKey: selectedAccountMetric,
    window: drilldownWindow,
  });
  // YouTube gallery is filterable by Shorts vs Videos; other platforms show all.
  // Activity markers use the same filtered set so the chart and gallery agree.
  const visiblePosts = React.useMemo(() => {
    const posts = data.posts ?? [];
    return platform === 'youtube' ? filterPostsByYoutubeType(posts, youtubePostType) : posts;
  }, [data.posts, platform, youtubePostType]);
  // Post-activity markers for the account drilldown chart — every platform that
  // returns posts with publish timestamps. Filtered to days present on the chart axis.
  const accountActivityDays = showPostFlags
    ? buildPostActivityDays(
        data.trends,
        visiblePosts,
        new Set(accountSeries.map((point) => point.date)),
      )
    : [];
  const postSeries = buildPostMetricSeries({
    post: selectedPost,
    metricKey: selectedPostMetric,
  });
  const selectedAccountMetricLabel =
    getKpiConfig(platform).find((metric) => metric.key === selectedAccountMetric)?.label ??
    String(selectedAccountMetric);
  const isAccountView = viewMode === 'account';
  const isPostsView = viewMode === 'posts';

  const audienceTotal = Math.max(0, audienceBreakdown.followers + audienceBreakdown.nonFollowers);
  const genderDemographics = (data.audienceDemographics?.gender ?? []).map((entry) => ({
    ...entry,
    fill: demographicColor(entry.label),
  }));
  const ageDemographics = data.audienceDemographics?.age ?? [];
  const countryDemographics = data.audienceDemographics?.country ?? [];
  const cityDemographics = data.audienceDemographics?.city ?? [];
  const demographicTimeframe = data.audienceDemographics?.timeframe;
  React.useEffect(() => {
    if (viewMode !== 'posts') return;
    if (!selectedPostId) return;
    onRequestPostDetail?.(selectedPostId);
  }, [onRequestPostDetail, selectedPostId, viewMode]);

  React.useEffect(() => {
    if (viewMode !== 'posts') return;
    if (!selectedPostId) return;
    const card = postCardRefs.current[selectedPostId];
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [selectedPostId, viewMode]);

  React.useEffect(() => {
    if (!isPostsView || !hasMorePosts || loadingMorePosts || !onLoadMorePosts) return;
    const root = scrollRootRef.current;
    const target = postsLoadSentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          onLoadMorePosts();
        }
      },
      {
        root,
        rootMargin: '220px 0px 220px 0px',
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMorePosts, isPostsView, loadingMorePosts, onLoadMorePosts]);

  return (
    <div className="flex flex-col gap-2 min-h-0 pb-6">
      {isAccountView && rangePreset === 'today' ? (
        <span className="mb-1 block text-xs text-muted-foreground">
          Today so far — deltas compare today (partial) against yesterday.
        </span>
      ) : null}
      {isAccountView ? (
        <motion.div
          key={`kpi-${data.range.since}-${data.range.until}`}
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7"
        >
          {getKpiConfig(platform).map((metric) => (
            <motion.div
              key={String(metric.key)}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] },
                },
              }}
            >
              <MetricCard
                label={metric.label}
                value={metric.key === 'profileVisits24h' ? profileVisits24h : metrics[metric.key]}
                format={metric.format}
                comparison={metricComparisonFor(data, metric.key)}
                active={selectedAccountMetric === metric.key}
                ariaLabel={`Account metric ${metric.label}`}
                metricKey={String(metric.key)}
                platform={platform}
                rangePreset={rangePreset}
                onClick={
                  graphableAccountMetrics.has(metric.key)
                    ? () => {
                        setSelectedAccountMetric(metric.key);
                      }
                    : undefined
                }
                insights={insightsByKpi.get(metric.key)}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {isAccountView ? (
        <div className="rounded-lg border border-subtle bg-surface">
          <SectionHeader
            title="Metric Drilldown"
            meta={
              <span className="text-xs text-muted-foreground">
                {selectedAccountMetricLabel} ({drilldownWindow})
              </span>
            }
            action={
              <div className="flex items-center gap-2">
                {visiblePosts.length > 0 ? (
                  <label
                    htmlFor="organic-account-post-flags"
                    className="flex cursor-pointer select-none items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Flag size={12} className="text-primary" />
                    <span className="hidden sm:inline">Posts</span>
                    <Switch
                      id="organic-account-post-flags"
                      checked={showPostFlags}
                      onCheckedChange={setShowPostFlags}
                      aria-label="Toggle post activity markers"
                    />
                  </label>
                ) : null}
                <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                  <button
                    type="button"
                    className={cn(
                      'h-7 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                      drilldownWindow === '7d'
                        ? 'bg-accent/20 text-foreground'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => setDrilldownWindow('7d')}
                    aria-label="Show seven day window"
                    aria-pressed={drilldownWindow === '7d'}
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'h-7 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                      drilldownWindow === '30d'
                        ? 'bg-accent/20 text-foreground'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => setDrilldownWindow('30d')}
                    aria-label="Show thirty day window"
                    aria-pressed={drilldownWindow === '30d'}
                  >
                    30d
                  </button>
                </div>
              </div>
            }
          />
          <div className="p-3">
            {accountSeries.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                No metric history is available for this metric in the selected window.
              </span>
            ) : (
              <ChartContainer
                config={drilldownChartConfig}
                className="h-[min(42vh,24rem)] min-h-64 w-full"
              >
                <LineChart data={accountSeries}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => formatShortDate(value)}
                    minTickGap={20}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={false}
                  />
                  {(data.boostedEvents ?? []).map((event) => (
                    <ReferenceLine
                      key={event.id}
                      x={event.date}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: 'Boost', position: 'top', fill: '#ef4444', fontSize: 10 }}
                    />
                  ))}
                  {renderPostActivityReferenceLines(accountActivityDays)}
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </div>
      ) : null}

      {isAccountView ? (
        <AudienceCard
          audienceBreakdown={audienceBreakdown}
          audienceTotal={audienceTotal}
          genderDemographics={genderDemographics}
          ageDemographics={ageDemographics}
          demographicsLoading={demographicsLoading}
          hidden={platform === 'tiktok' || platform === 'youtube'}
        />
      ) : null}

      {isAccountView && platform === 'youtube' && (data.contentTypePerformance?.length ?? 0) > 0 ? (
        <YoutubeContentTypeSplitCard performance={data.contentTypePerformance ?? []} />
      ) : null}

      {isAccountView ? (
        <OrganicAwarenessReportView
          report={awarenessReport}
          isRefreshing={isAwarenessLoading}
          onRefresh={refreshAwareness}
          brandId={brandId}
          integrationAccountId={integrationAccountId}
          platform={platform}
          posts={data.posts ?? []}
        />
      ) : null}

      {isAccountView ? <CreativeStrategyCard brandId={brandId} /> : null}

      {isAccountView && platform !== 'tiktok' ? (
        <OrganicAudienceLocationMapCard
          countryEntries={countryDemographics}
          cityEntries={cityDemographics}
          timeframe={demographicTimeframe}
        />
      ) : null}

      {isPostsView ? (
        <>
          {platform === 'youtube' ? (
            <YoutubeTypeSummaryStrip posts={visiblePosts} filter={youtubePostType} />
          ) : null}
          <div className="rounded-lg border border-subtle bg-surface">
            <div className="p-3">
              {visiblePosts.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {platform === 'youtube' && youtubePostType !== 'all'
                    ? `No ${youtubePostType === 'shorts' ? 'Shorts' : 'videos'} were found for this channel in the selected window.`
                    : 'No posts were found for this account in the selected window.'}
                </span>
              ) : (
                <div className="mx-auto w-full">
                  <motion.div
                    layout
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                    className={cn(
                      'grid grid-cols-1 gap-4 lg:items-start',
                      selectedPost ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : 'lg:grid-cols-1',
                    )}
                  >
                    <motion.div layout className="min-w-0">
                      <div className="flex items-center justify-end mb-2 px-1 gap-2">
                        <span className="text-xs text-muted-foreground">Sort</span>
                        <Select
                          value={postSortKey}
                          onValueChange={(v) => setPostSortKey(v as PostSortKey)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recent">Recent</SelectItem>
                            <SelectItem value="hookRate">Hook Rate</SelectItem>
                            <SelectItem value="views">Views</SelectItem>
                            <SelectItem value="reach">Reach</SelectItem>
                            <SelectItem value="engagement">Engagement</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mx-auto w-full px-1">
                        <div
                          className={cn(
                            'mx-auto grid gap-3 sm:gap-4',
                            '[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]',
                          )}
                        >
                          {sortPosts(visiblePosts, postSortKey).map((post) => {
                            // Quick-look uses the store-hydrated detail (richer
                            // metrics + breakdowns) so it fills in after a fetch.
                            // Detail media fields are also preferred because they
                            // carry newly signed URLs after stale-media recovery.
                            const detailed = postDetailsById?.[post.id] ?? post;
                            const displayPost =
                              detailed === post ? post : mergePostWithFreshMedia(post, detailed);
                            return (
                              <motion.div
                                layout
                                key={post.id}
                                ref={(node) => {
                                  postCardRefs.current[post.id] = node;
                                }}
                                className="min-w-0"
                              >
                                <HoverCard
                                  openDelay={150}
                                  closeDelay={120}
                                  onOpenChange={(open) => {
                                    // Hovering pre-fetches the post's full detail
                                    // (fetch-on-view); the request is de-duped upstream.
                                    if (open) onRequestPostDetail?.(post.id);
                                  }}
                                >
                                  <HoverCardTrigger asChild>
                                    <div className="w-full">
                                      <PostGalleryCard
                                        post={displayPost}
                                        selected={selectedPostId === post.id}
                                        loading={loadingPostId === post.id}
                                        onSelect={() => {
                                          setSelectedPostId(post.id);
                                        }}
                                        onRecoverMedia={onRecoverPostMedia}
                                        platform={platform}
                                      />
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent
                                    side="right"
                                    align="start"
                                    className="w-[340px] p-3"
                                  >
                                    <PostQuickLook
                                      post={detailed}
                                      accountSeries={accountSeries}
                                      loading={loadingPostId === post.id}
                                    />
                                  </HoverCardContent>
                                </HoverCard>
                              </motion.div>
                            );
                          })}
                        </div>
                        <div ref={postsLoadSentinelRef} className="h-2 w-full" aria-hidden />
                        <div className="flex items-center justify-center py-4">
                          {loadingMorePosts ? (
                            <span className="text-xs text-muted-foreground">
                              Loading previous {nextPostWindowDays ?? 0}d...
                            </span>
                          ) : hasMorePosts ? (
                            <span className="text-xs text-muted-foreground">
                              Scroll for previous {nextPostWindowDays ?? 0}d
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              End of feed — {POST_GALLERY_MAX_DAYS} days of history.
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>

                    <AnimatePresence initial={false}>
                      {selectedPost ? (
                        <PostSnapshotPanel
                          post={selectedPost}
                          selectedMetric={selectedPostMetric}
                          onMetricSelect={setSelectedPostMetric}
                          series={postSeries}
                          accountSeries={accountSeries}
                          loading={loadingPostId === selectedPost.id}
                          onRecoverMedia={onRecoverPostMedia}
                          platform={platform}
                        />
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function OrganicMetricsDashboard({
  brandId,
  accountsByPlatform,
  initialPlatform = 'instagram',
  brandInsights = null,
}: Props) {
  const [isPending, startTransition] = React.useTransition();
  const [platform, setPlatform] = React.useState<MetricsPlatform>(initialPlatform);
  const [viewMode, setViewMode] = React.useState<MetricsViewMode>('account');
  const [youtubePostType, setYoutubePostType] = React.useState<YoutubePostTypeFilter>('all');
  const [rangePreset, setRangePreset] =
    React.useState<OrganicDateRangePreset>(DEFAULT_RANGE_PRESET);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [exportingReportFormat, setExportingReportFormat] = React.useState<'csv' | 'html' | null>(
    null,
  );
  const [reportEmailOpen, setReportEmailOpen] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const manualRefreshRef = React.useRef(false);
  // The metrics tab scrolls on exactly one axis, in exactly one element: this
  // body. Cards inside it grow to their content instead of nesting scrollers, so
  // a wheel anywhere over the tab moves the same surface.
  const metricsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const setSelection = useAccountSelectionStore((s) => s.setSelection);
  const [postGalleryPosts, setPostGalleryPosts] = React.useState<OrganicPost[]>([]);
  // Posts fetched in parallel for the account view so the drilldown chart can
  // demarcate when posts were published; the account scope itself omits posts.
  const [accountPosts, setAccountPosts] = React.useState<OrganicPost[]>([]);
  const [postWindowOffset, setPostWindowOffset] = React.useState(0);
  const [hasMorePostWindows, setHasMorePostWindows] = React.useState(false);
  const [loadingMorePostWindows, setLoadingMorePostWindows] = React.useState(false);
  const [selectedAccountByPlatform, setSelectedAccountByPlatform] = React.useState<{
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
    youtube: string | null;
    linkedin: string | null;
  }>(() => {
    const store = useAccountSelectionStore.getState();
    const resolve = (platform: string, accounts: OrganicAccountOption[]) => {
      const stored = store.getSelection(brandId, platform);
      const isValid = stored !== null && accounts.some((a) => a.integrationAccountId === stored);
      return isValid ? stored : (accounts[0]?.integrationAccountId ?? null);
    };
    return {
      instagram: resolve('instagram', accountsByPlatform.instagram),
      facebook: resolve('facebook', accountsByPlatform.facebook),
      tiktok: resolve('tiktok', accountsByPlatform.tiktok),
      youtube: resolve('youtube', accountsByPlatform.youtube),
      linkedin: resolve('linkedin', accountsByPlatform.linkedin),
    };
  });
  const [state, setState] = React.useState<LoadState>({ status: 'idle' });
  const [kpisState, setKpisState] = React.useState<SectionState<OrganicMetricsResponse>>({
    status: 'idle',
  });
  const [demographicsState, setDemographicsState] = React.useState<SectionState<DemographicsSlice>>(
    { status: 'idle' },
  );

  const platformAccounts =
    platform === 'facebook'
      ? accountsByPlatform.facebook
      : platform === 'tiktok'
        ? accountsByPlatform.tiktok
        : platform === 'youtube'
          ? accountsByPlatform.youtube
          : platform === 'linkedin'
            ? accountsByPlatform.linkedin
            : accountsByPlatform.instagram;

  // MetricsScopeSelector/OrganicCompareView tag each account with its platform
  // (needed to flatten across platforms in Compare mode); the dashboard's own
  // accountsByPlatform keeps platform implicit in which array an account is in.
  const scopeAccountsByPlatform: ScopeAccountsByPlatform = React.useMemo(
    () => ({
      instagram: accountsByPlatform.instagram.map((a) => ({ ...a, platform: 'instagram' })),
      facebook: accountsByPlatform.facebook.map((a) => ({ ...a, platform: 'facebook' })),
      tiktok: accountsByPlatform.tiktok.map((a) => ({ ...a, platform: 'tiktok' })),
      youtube: accountsByPlatform.youtube.map((a) => ({ ...a, platform: 'youtube' })),
      linkedin: accountsByPlatform.linkedin.map((a) => ({ ...a, platform: 'linkedin' })),
    }),
    [accountsByPlatform],
  );

  const selectedAccountId =
    platform === 'facebook'
      ? selectedAccountByPlatform.facebook
      : platform === 'tiktok'
        ? selectedAccountByPlatform.tiktok
        : platform === 'youtube'
          ? selectedAccountByPlatform.youtube
          : platform === 'linkedin'
            ? selectedAccountByPlatform.linkedin
            : selectedAccountByPlatform.instagram;

  const selectedAccount =
    platformAccounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  // Per-post insight details cached in Zustand (sessionStorage-backed), scoped to
  // the selected account and re-keyed by post id so clicking between posts and
  // remounting the dashboard is instant. Server Upstash/Postgres cache still backs
  // cross-session fetches. Shared with any other surface (e.g. the dashboard's
  // Top Creatives table) that requests the same account+post pair.
  const {
    requestPostDetail: requestPostDetailBase,
    recoverPostMedia,
    loadingPostId,
    postDetailsById,
    resetPostDetails,
  } = useOrganicPostDetail({ brandId, platform, integrationAccountId: selectedAccountId });

  React.useEffect(() => {
    setReportError(null);
  }, [platform, selectedAccountId]);

  const fetchPostsWindow = React.useCallback(
    async (params: { accountId: string; windowOffset: number; forceRefresh: boolean }) => {
      const { accountId, windowOffset, forceRefresh } = params;
      const window = postWindowRange(windowOffset);
      if (!window) return null;
      return fetchOrganicAnalytics({
        brandId,
        integrationAccountId: accountId,
        platform,
        range: {
          preset: 'custom',
          custom: { from: window.from, to: window.to },
        },
        scope: 'posts',
        forceRefresh,
      });
    },
    [brandId, platform],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: platform/selectedAccountId/viewMode are intentional trigger deps (reset gallery scaffolding on switch), not data deps the effect body reads
  React.useEffect(() => {
    // The Zustand store deliberately persists post details across account/view
    // switches so re-selecting a post is instant; useOrganicPostDetail resets
    // its own in-flight gating refs on the same platform/account change, so
    // only the gallery scaffolding resets here.
    setPostGalleryPosts([]);
    setPostWindowOffset(0);
    setHasMorePostWindows(false);
    setLoadingMorePostWindows(false);
  }, [platform, selectedAccountId, viewMode]);

  // Thin gallery-specific wrapper: gates on posts view mode, then merges the
  // resolved post into postGalleryPosts (mergePosts keeps the previously
  // displayed media URL so the gallery card doesn't flash/re-download).
  const requestPostDetail = React.useCallback(
    async (postId: string) => {
      if (viewMode !== 'posts' || !selectedAccountId || postId.length === 0) return;
      const detailedPost = await requestPostDetailBase(postId);
      if (detailedPost) {
        setPostGalleryPosts((current) => mergePosts(current, [detailedPost]));
      }
    },
    [viewMode, selectedAccountId, requestPostDetailBase],
  );

  const loadMorePostWindow = React.useCallback(async () => {
    if (
      !selectedAccountId ||
      viewMode !== 'posts' ||
      loadingMorePostWindows ||
      !hasMorePostWindows
    ) {
      return;
    }
    const nextOffset = postWindowOffset + 1;

    setLoadingMorePostWindows(true);
    try {
      const data = await fetchPostsWindow({
        accountId: selectedAccountId,
        windowOffset: nextOffset,
        forceRefresh: false,
      });
      if (!data) {
        setHasMorePostWindows(false);
        return;
      }
      const nextPosts = data.posts ?? [];
      setPostGalleryPosts((current) => mergePosts(current, nextPosts));
      setPostWindowOffset(nextOffset);
      setHasMorePostWindows(postWindowRange(nextOffset + 1) !== null);
    } catch (error) {
      console.error('[OrganicMetricsDashboard] Failed to load previous post window', error);
    } finally {
      setLoadingMorePostWindows(false);
    }
  }, [
    fetchPostsWindow,
    hasMorePostWindows,
    loadingMorePostWindows,
    postWindowOffset,
    selectedAccountId,
    viewMode,
  ]);

  const handleRefresh = React.useCallback(() => {
    if (viewMode === 'posts') {
      resetPostDetails();
    }
    manualRefreshRef.current = true;
    setReloadTick((tick) => tick + 1);
  }, [viewMode, resetPostDetails]);

  const handleExportReport = React.useCallback(
    async (format: 'csv' | 'html') => {
      if (!selectedAccountId) return;

      setReportError(null);
      setExportingReportFormat(format);
      try {
        const [accountData, postsData] = await Promise.all([
          fetchOrganicAnalytics({
            brandId,
            integrationAccountId: selectedAccountId,
            platform,
            range: { preset: 'last_30d' },
            scope: 'account',
            forceRefresh: false,
          }),
          fetchOrganicAnalytics({
            brandId,
            integrationAccountId: selectedAccountId,
            platform,
            range: { preset: 'last_30d' },
            scope: 'posts',
            forceRefresh: false,
          }),
        ]);

        const postIds = Array.from(
          new Set(
            (postsData.posts ?? []).map((post) => post.id).filter((postId) => postId.length > 0),
          ),
        );
        const detailedPosts: OrganicPost[] = [];
        const concurrency = 4;

        for (let index = 0; index < postIds.length; index += concurrency) {
          const batch = postIds.slice(index, index + concurrency);
          const batchResults = await Promise.all(
            batch.map(async (postId) => {
              try {
                const detailData = await fetchOrganicAnalytics({
                  brandId,
                  integrationAccountId: selectedAccountId,
                  platform,
                  range: { preset: 'last_30d' },
                  scope: 'posts',
                  selectedPostId: postId,
                  forceRefresh: false,
                });
                return (detailData.posts ?? []).find((post) => post.id === postId) ?? null;
              } catch (error) {
                console.error(
                  `[OrganicMetricsDashboard] Failed to load report detail for post ${postId}`,
                  error,
                );
                return null;
              }
            }),
          );

          detailedPosts.push(...batchResults.filter((post): post is OrganicPost => post !== null));
        }

        const reportPosts = mergePosts(postsData.posts ?? [], detailedPosts);
        const reportPayload = {
          platform,
          accountName: selectedAccount?.name ?? accountData.accountId,
          generatedAt: new Date().toISOString(),
          accountRangeSince: accountData.range.since,
          accountRangeUntil: accountData.range.until,
          accountMetrics: accountData.metrics,
          posts: reportPosts,
          trends: accountData.trends,
        };

        const dateTag = new Date().toISOString().slice(0, 10);
        if (format === 'html') {
          const html = buildOrganicReportHtml(reportPayload);
          downloadTextFile({
            content: html,
            fileName: `continuum-${platform}-organic-report-${dateTag}.html`,
            mimeType: 'text/html;charset=utf-8;',
          });
        } else {
          const csv = buildOrganicReportCsv(reportPayload);
          downloadTextFile({
            content: csv,
            fileName: `continuum-${platform}-organic-report-${dateTag}.csv`,
            mimeType: 'text/csv;charset=utf-8;',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to export organic report.';
        setReportError(message);
      } finally {
        setExportingReportFormat(null);
      }
    },
    [brandId, platform, selectedAccount?.name, selectedAccountId],
  );

  React.useEffect(() => {
    const firstPlatformAccountId = platformAccounts[0]?.integrationAccountId ?? null;
    if (platform === 'facebook') {
      if (
        !selectedAccountByPlatform.facebook ||
        !platformAccounts.some(
          (item) => item.integrationAccountId === selectedAccountByPlatform.facebook,
        )
      ) {
        setSelectedAccountByPlatform((current) => ({
          ...current,
          facebook: firstPlatformAccountId,
        }));
      }
      return;
    }

    if (platform === 'tiktok') {
      if (
        !selectedAccountByPlatform.tiktok ||
        !platformAccounts.some(
          (item) => item.integrationAccountId === selectedAccountByPlatform.tiktok,
        )
      ) {
        setSelectedAccountByPlatform((current) => ({ ...current, tiktok: firstPlatformAccountId }));
      }
      return;
    }

    if (platform === 'youtube') {
      if (
        !selectedAccountByPlatform.youtube ||
        !platformAccounts.some(
          (item) => item.integrationAccountId === selectedAccountByPlatform.youtube,
        )
      ) {
        setSelectedAccountByPlatform((current) => ({
          ...current,
          youtube: firstPlatformAccountId,
        }));
      }
      return;
    }

    if (platform === 'linkedin') {
      if (
        !selectedAccountByPlatform.linkedin ||
        !platformAccounts.some(
          (item) => item.integrationAccountId === selectedAccountByPlatform.linkedin,
        )
      ) {
        setSelectedAccountByPlatform((current) => ({
          ...current,
          linkedin: firstPlatformAccountId,
        }));
      }
      return;
    }

    if (
      !selectedAccountByPlatform.instagram ||
      !platformAccounts.some(
        (item) => item.integrationAccountId === selectedAccountByPlatform.instagram,
      )
    ) {
      setSelectedAccountByPlatform((current) => ({
        ...current,
        instagram: firstPlatformAccountId,
      }));
    }
  }, [
    platform,
    platformAccounts,
    selectedAccountByPlatform.facebook,
    selectedAccountByPlatform.instagram,
    selectedAccountByPlatform.linkedin,
    selectedAccountByPlatform.tiktok,
    selectedAccountByPlatform.youtube,
  ]);

  React.useEffect(() => {
    // Compare mode fans out via OrganicCompareView / loadBrandOrganicSnapshot —
    // same ingestion path, separate UI state. Skip single-account load.
    if (viewMode === 'compare') {
      setState({ status: 'idle' });
      setKpisState({ status: 'idle' });
      setDemographicsState({ status: 'idle' });
      return;
    }

    if (!selectedAccountId) {
      setState({ status: 'idle' });
      setKpisState({ status: 'idle' });
      setDemographicsState({ status: 'idle' });
      setAccountPosts([]);
      return;
    }
    const accountId = selectedAccountId;

    let cancelled = false;

    if (viewMode === 'posts') {
      async function runPosts() {
        setState({ status: 'loading' });
        try {
          const forceRefresh = manualRefreshRef.current;
          manualRefreshRef.current = false;
          const postsData = await fetchPostsWindow({ accountId, windowOffset: 0, forceRefresh });
          if (!postsData) {
            setState({
              status: 'error',
              message: 'Unable to load post windows for the selected range.',
            });
            return;
          }
          if (cancelled) return;
          setPostGalleryPosts(postsData.posts ?? []);
          setPostWindowOffset(0);
          setHasMorePostWindows(postWindowRange(1) !== null);
          setLoadingMorePostWindows(false);
          setState({ status: 'success', data: postsData });
        } catch (error) {
          if (cancelled) return;
          const message =
            error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
          const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
          const retryAfter = (error as { retryAfter?: number }).retryAfter;
          setState({ status: 'error', message, errorCode, retryAfter });
        }
      }
      void runPosts();
    } else {
      const forceRefresh = manualRefreshRef.current;
      manualRefreshRef.current = false;

      setKpisState({ status: 'loading' });
      setDemographicsState(platform === 'instagram' ? { status: 'loading' } : { status: 'idle' });

      const base = {
        brandId,
        integrationAccountId: accountId,
        platform,
        range: { preset: rangePreset },
        forceRefresh,
      } as const;

      const kpiPromise =
        (!forceRefresh && consumePrefetched(brandId, accountId, platform, rangePreset, 'kpis')) ||
        fetchOrganicAnalytics({ ...base, scope: 'kpis' });

      kpiPromise
        .then((data) => {
          if (!cancelled) setKpisState({ status: 'success', data });
        })
        .catch((error) => {
          if (!cancelled) {
            const message =
              error instanceof Error
                ? error.message
                : `Unable to load ${platform} organic metrics.`;
            const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
            const retryAfter = (error as { retryAfter?: number }).retryAfter;
            setKpisState({ status: 'error', message, errorCode, retryAfter });
          }
        });

      if (platform === 'instagram') {
        const demoPromise =
          (!forceRefresh &&
            consumePrefetched(brandId, accountId, platform, rangePreset, 'demographics')) ||
          fetchOrganicAnalytics({ ...base, scope: 'demographics' });

        demoPromise
          .then((data) => {
            if (!cancelled) {
              setDemographicsState({
                status: 'success',
                data: { audienceDemographics: data.audienceDemographics },
              });
            }
          })
          .catch((error) => {
            if (!cancelled) {
              const message =
                error instanceof Error ? error.message : 'Unable to load demographics.';
              const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
              const retryAfter = (error as { retryAfter?: number }).retryAfter;
              setDemographicsState({ status: 'error', message, errorCode, retryAfter });
            }
          });
      }

      // Bulk posts feed AI-Awareness top-post hover (caption + thumbnail) and
      // the account chart's post-activity markers. Fail-open — a posts miss
      // must never blank the KPI strip; hover still hydrates per-post detail.
      fetchOrganicAnalytics({ ...base, scope: 'posts', postsLimit: 25 })
        .then((data) => {
          if (!cancelled) setAccountPosts(data.posts ?? []);
        })
        .catch(() => {
          if (!cancelled) setAccountPosts([]);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [brandId, fetchPostsWindow, platform, rangePreset, reloadTick, selectedAccountId, viewMode]);

  const dashboardData = React.useMemo(() => {
    if (viewMode === 'compare') return null;
    if (viewMode === 'posts') {
      return state.status === 'success' ? { ...state.data, posts: postGalleryPosts } : null;
    }
    if (kpisState.status !== 'success') return null;
    return {
      ...kpisState.data,
      posts: accountPosts,
      audienceDemographics:
        demographicsState.status === 'success'
          ? demographicsState.data.audienceDemographics
          : undefined,
    } as OrganicMetricsResponse;
  }, [viewMode, state, kpisState, demographicsState, postGalleryPosts, accountPosts]);

  const isLoadingView =
    viewMode === 'compare'
      ? false
      : viewMode === 'posts'
        ? state.status === 'loading'
        : kpisState.status === 'loading';
  const viewError =
    viewMode === 'compare'
      ? null
      : viewMode === 'posts'
        ? state.status === 'error'
          ? { message: state.message, errorCode: state.errorCode, retryAfter: state.retryAfter }
          : null
        : kpisState.status === 'error'
          ? {
              message: kpisState.message,
              errorCode: kpisState.errorCode,
              retryAfter: kpisState.retryAfter,
            }
          : null;
  const demographicsLoading = demographicsState.status === 'loading';

  return (
    <section
      data-tour-id="organic-metrics-dashboard"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-subtle bg-surface"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-2 border-b px-2 py-1.5 sm:px-3">
        <Pill variant="muted" className="hidden sm:inline-flex">
          <PlatformIcon platform={platform} />
        </Pill>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select
            value={rangePreset}
            onValueChange={(value) =>
              startTransition(() => setRangePreset(value as OrganicDateRangePreset))
            }
          >
            <SelectTrigger className="h-8 w-[7.5rem] text-xs" disabled={viewMode === 'posts'}>
              {rangeLabel(rangePreset)}
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {rangeLabel(preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <span className="hidden text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
              Metrics view
            </span>
            <Tabs
              value={viewMode}
              onValueChange={(value) => {
                const next = value as MetricsViewMode;
                setViewMode(next);
                // Leaving Compare: ensure Account/Posts has a selected account so
                // the familiar single-account load path runs immediately.
                if (next !== 'compare' && !selectedAccountId) {
                  const first = platformAccounts[0]?.integrationAccountId ?? null;
                  if (first) {
                    setSelectedAccountByPlatform((current) => ({
                      ...current,
                      [platform]: first,
                    }));
                    setSelection(brandId, platform, first);
                  }
                }
              }}
              className="w-auto gap-0"
            >
              <TabsList
                className="inline-flex h-8 w-auto rounded-lg border border-subtle bg-muted/20 p-0.5"
                aria-label="Organic metrics view"
              >
                <TabsTrigger
                  value="account"
                  className="px-3 text-xs"
                  data-tour-id="metrics-view-account"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="posts"
                  className="px-3 text-xs"
                  data-tour-id="metrics-view-posts"
                >
                  Post performance
                </TabsTrigger>
                <TabsTrigger
                  value="compare"
                  className="px-3 text-xs"
                  data-tour-id="metrics-view-compare"
                >
                  Compare accounts
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {platform === 'youtube' && viewMode === 'posts' ? (
            <Tabs
              value={youtubePostType}
              onValueChange={(value) => setYoutubePostType(value as YoutubePostTypeFilter)}
              className="w-auto gap-0"
            >
              <TabsList className="inline-flex h-8 w-auto rounded-lg border border-subtle bg-muted/20 p-0.5">
                <TabsTrigger value="all" className="px-3 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="shorts" className="px-3 text-xs">
                  Shorts
                </TabsTrigger>
                <TabsTrigger value="videos" className="px-3 text-xs">
                  Videos
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <BrandTrendsHeaderModule brandId={brandId} brandInsights={brandInsights} />

          <Separator orientation="vertical" className="h-5" />

          <DisabledControl
            side="bottom"
            hint={
              viewMode === 'compare'
                ? null
                : describeRefreshBlock({
                    hasAccount: Boolean(selectedAccountId),
                    isLoading: isLoadingView || isPending,
                    platformLabel: PLATFORM_LABELS[platform],
                  })
            }
          >
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={
                viewMode === 'compare'
                  ? isPending
                  : !selectedAccountId || isLoadingView || isPending
              }
              aria-label="Refresh organic analytics"
            >
              <ReloadIcon className={cn(isLoadingView && 'animate-spin')} />
            </Button>
          </DisabledControl>

          {viewMode !== 'compare' ? (
            <DisabledControl
              side="bottom"
              hint={describeExportBlock({
                hasAccount: Boolean(selectedAccountId),
                isLoading: isLoadingView,
                isExporting: exportingReportFormat !== null,
                platformLabel: PLATFORM_LABELS[platform],
              })}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={!selectedAccountId || isLoadingView || exportingReportFormat !== null}
                    aria-label="Open organic report export or email options"
                    className="h-8 px-2 text-xs"
                  >
                    <DownloadIcon
                      className={cn(exportingReportFormat !== null && 'animate-pulse')}
                    />
                    {exportingReportFormat !== null ? 'Exporting…' : 'Export or Email'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleExportReport('csv');
                    }}
                    disabled={exportingReportFormat !== null}
                  >
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void handleExportReport('html');
                    }}
                    disabled={exportingReportFormat !== null}
                  >
                    Export HTML
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setReportEmailOpen(true);
                    }}
                    disabled={exportingReportFormat !== null}
                  >
                    <PaperPlaneIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Email Continuum Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <SendContinuumReportDialog
                brandId={brandId}
                open={reportEmailOpen}
                onOpenChange={setReportEmailOpen}
              />
            </DisabledControl>
          ) : null}
        </div>
      </div>

      <div
        ref={metricsScrollRef}
        data-tour-id="organic-metrics-scroll-body"
        className={cn(
          'min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 sm:p-3',
          isPending && 'opacity-60 pointer-events-none transition-opacity duration-150',
        )}
      >
        {reportError ? (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{reportError}</AlertDescription>
          </Alert>
        ) : null}
        {viewMode !== 'compare' ? (
          <div className="mb-3">
            <MetricsScopeSelector
              mode="single"
              accountsByPlatform={scopeAccountsByPlatform}
              platform={platform}
              onPlatformChange={(next) => {
                startTransition(() => {
                  setPlatform(next);
                  const first = accountsByPlatform[next]?.[0]?.integrationAccountId ?? null;
                  if (first) {
                    setSelectedAccountByPlatform((current) => ({
                      ...current,
                      [next]: first,
                    }));
                    setSelection(brandId, next, first);
                  }
                });
              }}
              accountId={selectedAccountId}
              onAccountChange={(value) => {
                setSelectedAccountByPlatform((current) => ({
                  ...current,
                  [platform]: value,
                }));
                setSelection(brandId, platform, value);
              }}
            />
          </div>
        ) : null}
        {viewMode === 'compare' ? (
          <OrganicCompareView
            brandId={brandId}
            accountsByPlatform={scopeAccountsByPlatform}
            rangePreset={rangePreset}
            reloadTick={reloadTick}
            forceRefreshOnTick
          />
        ) : platformAccounts.length === 0 ? (
          <Alert className="border-secondary/30 bg-secondary/10">
            <AlertDescription className="text-secondary text-pretty">
              No {platform} account is connected for this brand yet. Connect one in Integrations to
              unlock reporting.
            </AlertDescription>
          </Alert>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {isLoadingView ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <OrganicMetricsWidgetSkeleton />
              </motion.div>
            ) : viewError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <IntegrationErrorBanner
                  errorCode={viewError.errorCode}
                  message={viewError.message}
                  platform={platform}
                  retryAfter={viewError.retryAfter}
                />
              </motion.div>
            ) : dashboardData ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <Dashboard
                  data={dashboardData}
                  viewMode={viewMode}
                  postDetailsById={postDetailsById}
                  loadingPostId={loadingPostId}
                  onRequestPostDetail={requestPostDetail}
                  onRecoverPostMedia={recoverPostMedia}
                  hasMorePosts={hasMorePostWindows}
                  loadingMorePosts={loadingMorePostWindows}
                  onLoadMorePosts={loadMorePostWindow}
                  nextPostWindowDays={postWindowDays(postWindowOffset + 1)}
                  demographicsLoading={demographicsLoading}
                  brandId={brandId}
                  integrationAccountId={selectedAccountId ?? ''}
                  platform={platform}
                  rangePreset={rangePreset}
                  youtubePostType={youtubePostType}
                  scrollRootRef={metricsScrollRef}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <span className="text-sm text-muted-foreground text-pretty">
                  Select an account above to load organic reporting and post-level performance.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
