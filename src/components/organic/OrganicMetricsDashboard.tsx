'use client';

import { DownloadIcon, ReloadIcon } from '@radix-ui/react-icons';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  IconButton,
  Select,
  Separator,
  Text,
} from '@radix-ui/themes';
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
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { OrganicMetricsWidgetSkeleton } from '@/components/organic/MetricsSkeleton';
import { PostCommentsPanel } from '@/components/organic/primitives/PostCommentsPanel';
import { Skeleton } from '@/components/ui/skeleton';

const OrganicAudienceLocationMapCard = dynamic(
  () =>
    import('@/components/organic/OrganicAudienceLocationMapCard').then(
      (mod) => mod.OrganicAudienceLocationMapCard,
    ),
  { ssr: false },
);

import type { IntegrationErrorCode } from '@continuum/contracts';
import { Flag } from 'lucide-react';
import { Reel, ReelContent, type ReelItem, ReelVideo } from '@/components/kibo-ui/reel';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import { PostQuickLook } from '@/components/organic/cards/PostQuickLook';
import { OrganicAwarenessReportView } from '@/components/organic/OrganicAwarenessReportView';
import { CreativeStrategyCard } from '@/components/organic/CreativeStrategyCard';
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
  POST_GALLERY_WINDOW_DAYS,
  type PostMetricKey,
  type PostSortKey,
  postPeriodComparisons,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { IntegrationErrorBanner } from '@/components/ui/IntegrationErrorBanner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganicInsights } from '@/hooks/useOrganicInsights';
import { isAllZeroPost, useOrganicPostDetail } from '@/hooks/useOrganicPostDetail';
import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import type { OrganicComputedInsight } from '@/lib/organic/organic-insights.types';
import { consumePrefetched } from '@/lib/prefetch/organic-metrics-cache';
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
};

type MetricsPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
type MetricsViewMode = 'account' | 'posts';

type Props = {
  brandId: string;
  accountsByPlatform: AccountsByPlatform;
  initialPlatform?: MetricsPlatform;
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

type KpiMetric = { key: keyof OrganicMetrics; label: string; format?: 'count' | 'percent' };

const META_KPI_CONFIG: KpiMetric[] = [
  { key: 'accountsEngaged', label: 'Engaged' },
  { key: 'reach', label: 'Reach' },
  { key: 'reelsViews', label: 'Reels' },
  { key: 'newFollowers', label: 'New Followers' },
  { key: 'profileVisits24h', label: 'Profile 24h' },
  { key: 'views', label: 'Total Views' },
  { key: 'postViews', label: 'Post Views' },
  { key: 'nonFollowerReach', label: 'Non-Follow Reach' },
  { key: 'followerReach', label: 'Follower Reach' },
  { key: 'comments', label: 'Comments' },
  { key: 'avgRetentionRate', label: 'Avg Retention', format: 'percent' },
  { key: 'avgSkipRate', label: 'Typical Skip', format: 'percent' },
];

const TIKTOK_KPI_CONFIG: KpiMetric[] = [
  { key: 'subscribers', label: 'Followers' },
  { key: 'following', label: 'Following' },
  { key: 'likes', label: 'Likes' },
  { key: 'videoCount', label: 'Videos' },
  { key: 'views', label: 'Views' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
];

const YOUTUBE_KPI_CONFIG: KpiMetric[] = [
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'views', label: 'Views' },
  { key: 'videoCount', label: 'Videos' },
  { key: 'newFollowers', label: 'New Subs' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'hookRate', label: 'Avg View %' },
];

function getKpiConfig(platform: MetricsPlatform): KpiMetric[] {
  if (platform === 'tiktok') return TIKTOK_KPI_CONFIG;
  if (platform === 'youtube') return YOUTUBE_KPI_CONFIG;
  return META_KPI_CONFIG;
}

const audienceChartConfig = {
  followers: { label: 'Followers', color: '#0284c7' },
  nonFollowers: { label: 'Non-followers', color: '#f59e0b' },
} satisfies ChartConfig;

const genderChartConfig = {
  value: { label: 'Followers', color: '#0284c7' },
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
  if (normalized === 'female') return '#10b981';
  if (normalized === 'male') return '#0284c7';
  if (normalized === 'unknown') return '#94a3b8';
  return '#64748b';
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
  platform = 'instagram',
}: {
  post: OrganicPost;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
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
      <Box
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={post.title ?? post.caption ?? 'Post media'}
                className="h-full w-full object-contain outline outline-1 outline-black/10 dark:outline-white/10"
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
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </a>
              ) : null}
            </div>
          )
        ) : (
          <Box className="h-full w-full flex items-center justify-center">
            <Text size="1" color="gray">
              Media preview unavailable
            </Text>
          </Box>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1">
          {platform === 'youtube' ? (
            <Badge color={isYouTubeShort(post) ? 'pink' : 'violet'} variant="solid">
              {isYouTubeShort(post) ? 'Short' : 'Video'}
            </Badge>
          ) : (
            <Badge color={video ? 'violet' : carousel ? 'orange' : 'gray'} variant="solid">
              {video ? 'Reel/Video' : carousel ? 'Carousel' : 'Post'}
            </Badge>
          )}
          {carousel ? (
            <Badge color="gray" variant="soft">
              {(post.carouselMedia?.length ?? 0) || 1} slides
            </Badge>
          ) : null}
        </div>
        {post.isBoosted ? (
          <Badge className="absolute right-2 top-2" color="orange" variant="solid">
            Boosted
          </Badge>
        ) : null}
        {loading ? (
          <Badge className="absolute bottom-2 right-2" color="blue" variant="soft">
            Loading details...
          </Badge>
        ) : null}
      </Box>
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
  platform = 'instagram',
}: {
  post: OrganicPost;
  selectedMetric: PostMetricKey;
  onMetricSelect: (metric: PostMetricKey) => void;
  series: Array<{ date: string; value: number }>;
  accountSeries?: Array<{ date: string; value: number }>;
  loading: boolean;
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
      <Card variant="surface" className="h-full border border-subtle bg-surface">
        <SectionHeader
          title="Post Snapshot"
          meta={
            <Text size="1" color="gray">
              {formatDateTime(post.timestamp)}
            </Text>
          }
          action={
            <Flex align="center" gap="1">
              {post.isBoosted ? (
                <Badge color="orange" variant="soft">
                  Boosted
                </Badge>
              ) : null}
              {loading ? (
                <Badge color="blue" variant="soft">
                  Refreshing
                </Badge>
              ) : null}
            </Flex>
          }
        />
        <Box p="3" className="h-full">
          <Box className="mb-3 overflow-hidden rounded-lg bg-black/90">
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={post.title ?? post.caption ?? 'Selected post'}
                  className="max-h-[320px] min-h-[180px] w-full object-contain"
                />
              )
            ) : (
              <Box className="flex min-h-[180px] items-center justify-center">
                <Text size="1" color="gray">
                  Preview unavailable for this post
                </Text>
              </Box>
            )}
          </Box>

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

          <Box className="mb-3">
            <Flex align="center" justify="between" mb="2" wrap="wrap" gap="2">
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
              <Text size="1" color="gray" className="px-1">
                Last 7 days
              </Text>
            </Flex>
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
                  <Text size="1" color="gray" className="mt-1 block">
                    Building per-post history — {trendDays}/7 days tracked.
                  </Text>
                ) : null}
              </>
            ) : accountSeries && accountSeries.length > 0 ? (
              <div className="space-y-1">
                <Text size="1" color="gray" className="block">
                  Per-post trend builds over time ({trendDays}/7 days). Showing the account trend
                  meanwhile.
                </Text>
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
              <Text size="1" color="gray">
                Per-post trend builds over time. Check back tomorrow once a second day is tracked.
              </Text>
            )}
          </Box>

          <PostCommentsPanel comments={post.comments} />

          <Text size="1" className="line-clamp-8">
            {post.caption?.trim().length ? post.caption : 'Caption unavailable for this post.'}
          </Text>
        </Box>
      </Card>
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
}) {
  const pctChange = comparison?.percentageChange;
  const direction = trendDirection(pctChange);
  const interactive = Boolean(onClick);
  const hasInsights = insights && insights.length > 0;

  const cardContent = (
    <Card
      variant="surface"
      className={cn(
        'border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 motion-reduce:transition-none',
        compact ? 'min-h-[48px]' : 'min-h-[96px]',
        active ? 'border-blue-500/70 bg-blue-500/10 shadow-blue-500/10' : '',
        interactive ? 'hover:-translate-y-0.5 hover:shadow-md' : '',
        hasInsights ? 'ring-1 ring-violet-400/30' : '',
      )}
    >
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
        <Flex align="start" justify="between" gap="2" className="w-full">
          <Flex align="center" gap="1">
            <Text size="1" color="gray" className="leading-none">
              {label}
            </Text>
            {hasInsights ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500"
                title="Insights available"
              />
            ) : null}
          </Flex>
          {!compact && (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
                direction === 'up'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : '',
                direction === 'down' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : '',
                direction === 'flat' ? 'bg-slate-500/15 text-slate-700 dark:text-slate-300' : '',
              )}
            >
              {direction}
            </span>
          )}
        </Flex>
        <Text
          size={compact ? '3' : '5'}
          weight="bold"
          className="leading-tight tabular-nums tracking-tight"
        >
          {format === 'percent'
            ? typeof value === 'number'
              ? `${value.toFixed(1)}%`
              : '—'
            : formatNumber(value)}
        </Text>
        {compact ? (
          <Text
            size="1"
            className={cn(
              'leading-none font-medium',
              pctChange === undefined
                ? 'text-muted-foreground'
                : pctChange >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {formatPercentChange(pctChange)}
          </Text>
        ) : (
          <Flex align="center" justify="between" gap="2">
            <Text
              size="1"
              className={cn(
                'leading-none font-medium',
                pctChange === undefined
                  ? 'text-muted-foreground'
                  : pctChange >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {formatPercentChange(pctChange)}
            </Text>
            <Text size="1" color="gray" className="leading-none">
              vs previous period
            </Text>
          </Flex>
        )}
      </button>
    </Card>
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
        <Text size="2" weight="medium" className="mb-2 block">
          {label} Insights
        </Text>
        <Flex direction="column" gap="2">
          {insights.map((insight, i) => (
            <Flex key={i} align="start" gap="2">
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
                <Text size="1" className="leading-snug">
                  {insight.text}
                </Text>
                {insight.recommendation ? (
                  <Text size="1" color="gray" className="mt-0.5 block leading-snug">
                    {insight.recommendation}
                  </Text>
                ) : null}
              </div>
            </Flex>
          ))}
        </Flex>
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
    <Card variant="surface" className="mb-3 border border-subtle bg-surface">
      <Box p="3">
        <Flex gap="6" wrap="wrap">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <Text size="1" color="gray" className="block">
                {stat.label}
              </Text>
              <Text size="3" weight="bold" className="tabular-nums">
                {stat.value}
              </Text>
            </div>
          ))}
        </Flex>
      </Box>
    </Card>
  );
}

// Account-level Shorts-vs-Videos performance split (data.contentTypePerformance,
// from the Analytics creatorContentType dimension).
function YoutubeContentTypeSplitCard({ performance }: { performance: ContentTypePerformance[] }) {
  if (performance.length === 0) return null;
  const maxViews = Math.max(1, ...performance.map((row) => row.views ?? 0));
  return (
    <Card variant="surface" className="border border-subtle bg-surface">
      <Box p="3">
        <Text size="2" weight="medium" className="mb-2 block">
          Shorts vs Videos
        </Text>
        <Flex direction="column" gap="3">
          {performance.map((row) => (
            <div key={row.contentType}>
              <Flex align="center" justify="between" mb="1">
                <Text size="2">{row.contentType}</Text>
                <Text size="1" color="gray" className="tabular-nums">
                  {formatNumber(row.views ?? 0)} views · {formatNumber(row.engagement ?? 0)} eng
                </Text>
              </Flex>
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
        </Flex>
      </Box>
    </Card>
  );
}

type AudienceCardProps = {
  audienceBreakdown: AudienceBreakdown;
  audienceRadialData: Array<{ audience: string; followers: number; nonFollowers: number }>;
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
  audienceRadialData,
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
    <Card variant="surface" className={cn('border border-subtle bg-surface', hidden && '!hidden')}>
      <SectionHeader title="Audience" />
      <Box p="3">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col items-center gap-3">
            <Text size="1" color="gray" className="self-start uppercase tracking-wide">
              Followers Breakdown
            </Text>
            {audienceTotal === 0 ? (
              <Flex align="center" justify="center" className="h-64 w-full max-w-xs">
                <Text size="1" color="gray">
                  Followers breakdown unavailable.
                </Text>
              </Flex>
            ) : (
              <>
                <ChartContainer config={audienceChartConfig} className="h-64 w-full max-w-xs">
                  <RadialBarChart
                    data={audienceRadialData}
                    endAngle={180}
                    innerRadius={58}
                    outerRadius={106}
                  >
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                      <Label
                        content={({ viewBox }) => {
                          if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) {
                            return null;
                          }

                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) - 14}
                                className="fill-foreground text-2xl font-semibold"
                              >
                                {formatNumber(audienceTotal)}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) + 10}
                                className="fill-muted-foreground text-2xs uppercase tracking-wide"
                              >
                                Total Audience
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </PolarRadiusAxis>
                    <RadialBar
                      dataKey="followers"
                      stackId="audience"
                      cornerRadius={6}
                      fill="var(--color-followers)"
                      className="stroke-transparent stroke-2"
                    />
                    <RadialBar
                      dataKey="nonFollowers"
                      stackId="audience"
                      cornerRadius={6}
                      fill="var(--color-nonFollowers)"
                      className="stroke-transparent stroke-2"
                    />
                  </RadialBarChart>
                </ChartContainer>
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
            <Text size="1" color="gray" className="self-start uppercase tracking-wide">
              Gender
            </Text>
            {demographicsLoading ? (
              <Flex direction="column" align="center" gap="2">
                <div className="h-48 w-48 animate-pulse rounded-full bg-muted/70" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted/70" />
              </Flex>
            ) : genderDemographics.length === 0 ? (
              <Text size="1" color="gray">
                Gender breakdown unavailable.
              </Text>
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
                <Flex direction="column" gap="1.5" className="w-full max-w-xs">
                  {genderDemographics.map((entry) => (
                    <Flex key={entry.key} justify="between" align="center">
                      <Flex align="center" gap="2" className="min-w-0">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <Text size="1" color="gray" className="truncate">
                          {entry.label}
                        </Text>
                      </Flex>
                      <Text size="1" weight="medium" className="font-mono">
                        {formatNumber(entry.value)}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              </>
            )}
          </div>

          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <Flex justify="between" align="baseline" mb="2">
              <Text size="1" color="gray" className="uppercase tracking-wide">
                Age
              </Text>
              {peakAgeBand && ageTotal > 0 ? (
                <Text size="1" color="gray">
                  Peak <span className="font-medium text-foreground">{peakAgeBand.label}</span>
                  {' · '}
                  {formatRate((peakAgeBand.value / ageTotal) * 100)}
                </Text>
              ) : null}
            </Flex>
            {demographicsLoading ? (
              <Flex direction="column" gap="3">
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
              </Flex>
            ) : ageDemographics.length === 0 ? (
              <Text size="1" color="gray">
                Age breakdown unavailable.
              </Text>
            ) : (
              <Flex direction="column" gap="3" className="max-h-64 overflow-y-auto pr-1">
                {ageDemographics.map((entry) => (
                  <div key={entry.key}>
                    <Flex align="center" justify="between" mb="1">
                      <Text size="2">{entry.label}</Text>
                      <Text size="1" color="gray" className="font-mono tabular-nums">
                        {formatNumber(entry.value)}
                      </Text>
                    </Flex>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-secondary"
                        style={{ width: `${Math.round((entry.value / ageMaxValue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </Flex>
            )}
          </div>
        </div>
      </Box>
    </Card>
  );
}

function Dashboard({
  data,
  viewMode,
  postDetailsById,
  loadingPostId,
  onRequestPostDetail,
  hasMorePosts,
  loadingMorePosts,
  onLoadMorePosts,
  demographicsLoading = false,
  brandId,
  integrationAccountId,
  platform,
  rangePreset,
  youtubePostType,
}: {
  data: OrganicMetricsResponse;
  viewMode: MetricsViewMode;
  postDetailsById?: Record<string, OrganicPost>;
  loadingPostId?: string | null;
  onRequestPostDetail?: (postId: string) => void;
  hasMorePosts?: boolean;
  loadingMorePosts?: boolean;
  onLoadMorePosts?: () => void;
  demographicsLoading?: boolean;
  brandId: string;
  integrationAccountId: string;
  platform: MetricsPlatform;
  rangePreset: OrganicDateRangePreset;
  youtubePostType: YoutubePostTypeFilter;
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
  // Detail supplies the richer metrics, but the media URLs come from the base
  // gallery post (already loaded) so opening the panel never re-downloads or
  // flashes the media.
  const selectedPost: OrganicPost | null =
    selectedPostDetail && selectedPostBase
      ? {
          ...selectedPostDetail,
          mediaUrl: selectedPostBase.mediaUrl ?? selectedPostDetail.mediaUrl,
          thumbnailUrl: selectedPostBase.thumbnailUrl ?? selectedPostDetail.thumbnailUrl,
          carouselMedia: selectedPostBase.carouselMedia ?? selectedPostDetail.carouselMedia,
        }
      : (selectedPostDetail ?? selectedPostBase);
  const postCardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const postsScrollerRef = React.useRef<HTMLDivElement | null>(null);
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
  // Post-activity markers for the account drilldown chart. Only Instagram carries
  // per-post publish timestamps today; filtered to days present on the chart axis.
  const accountActivityDays =
    showPostFlags && platform === 'instagram'
      ? buildPostActivityDays(
          data.trends,
          data.posts,
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

  // YouTube gallery is filterable by Shorts vs Videos; other platforms show all.
  const visiblePosts = React.useMemo(() => {
    const posts = data.posts ?? [];
    return platform === 'youtube' ? filterPostsByYoutubeType(posts, youtubePostType) : posts;
  }, [data.posts, platform, youtubePostType]);

  const audienceTotal = Math.max(0, audienceBreakdown.followers + audienceBreakdown.nonFollowers);
  const audienceRadialData = [
    {
      audience: 'reach',
      followers: audienceBreakdown.followers,
      nonFollowers: audienceBreakdown.nonFollowers,
    },
  ];
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
    const root = postsScrollerRef.current;
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
    <Flex direction="column" gap="2" className="min-h-0 pb-6">
      {isAccountView && rangePreset === 'today' ? (
        <Text size="1" color="gray" className="mb-1 block">
          Today so far — deltas compare today (partial) against yesterday.
        </Text>
      ) : null}
      {isAccountView ? (
        <motion.div
          key={`kpi-${data.range.since}-${data.range.until}`}
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
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
        <Card variant="surface" className="border border-subtle bg-surface">
          <SectionHeader
            title="Metric Drilldown"
            meta={
              <Text size="1" color="gray">
                {selectedAccountMetricLabel} ({drilldownWindow})
              </Text>
            }
            action={
              <div className="flex items-center gap-2">
                {platform === 'instagram' && (data.posts?.length ?? 0) > 0 ? (
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
          <Box p="3">
            {accountSeries.length === 0 ? (
              <Text size="2" color="gray">
                No metric history is available for this metric in the selected window.
              </Text>
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
          </Box>
        </Card>
      ) : null}

      {isAccountView ? (
        <AudienceCard
          audienceBreakdown={audienceBreakdown}
          audienceRadialData={audienceRadialData}
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
          <Card variant="surface" className="border border-subtle bg-surface">
            <Box p="3">
              {visiblePosts.length === 0 ? (
                <Text size="2" color="gray">
                  {platform === 'youtube' && youtubePostType !== 'all'
                    ? `No ${youtubePostType === 'shorts' ? 'Shorts' : 'videos'} were found for this channel in the selected window.`
                    : 'No posts were found for this account in the selected window.'}
                </Text>
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
                      <Flex align="center" justify="end" mb="2" px="1" gap="2">
                        <Text size="1" color="gray">
                          Sort
                        </Text>
                        <Select.Root
                          value={postSortKey}
                          onValueChange={(v) => setPostSortKey(v as PostSortKey)}
                          size="1"
                        >
                          <Select.Trigger variant="soft" />
                          <Select.Content>
                            <Select.Item value="recent">Recent</Select.Item>
                            <Select.Item value="hookRate">Hook Rate</Select.Item>
                            <Select.Item value="views">Views</Select.Item>
                            <Select.Item value="reach">Reach</Select.Item>
                            <Select.Item value="engagement">Engagement</Select.Item>
                          </Select.Content>
                        </Select.Root>
                      </Flex>
                      <div
                        ref={postsScrollerRef}
                        className="mx-auto max-h-[calc(100dvh-11rem)] w-full overflow-y-auto px-1"
                      >
                        <div
                          className={cn(
                            'mx-auto grid gap-3 sm:gap-4',
                            '[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]',
                          )}
                        >
                          {sortPosts(visiblePosts, postSortKey).map((post) => {
                            // Quick-look uses the store-hydrated detail (richer
                            // metrics + breakdowns) so it fills in after a fetch.
                            // The gallery card itself uses the base post so its
                            // already-loaded media URL stays put — the detail
                            // fetch returns freshly-signed URLs that would
                            // otherwise force a re-download/flash.
                            const detailed = postDetailsById?.[post.id] ?? post;
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
                                        post={post}
                                        selected={selectedPostId === post.id}
                                        loading={loadingPostId === post.id}
                                        onSelect={() => {
                                          setSelectedPostId(post.id);
                                        }}
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
                            <Text size="1" color="gray">
                              Loading previous {POST_GALLERY_WINDOW_DAYS}d...
                            </Text>
                          ) : hasMorePosts ? (
                            <Text size="1" color="gray">
                              Scroll for previous {POST_GALLERY_WINDOW_DAYS}d
                            </Text>
                          ) : (
                            <Text size="1" color="gray">
                              Reached 3-month history cap.
                            </Text>
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
                          platform={platform}
                        />
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}
            </Box>
          </Card>
        </>
      ) : null}
    </Flex>
  );
}

export function OrganicMetricsDashboard({
  brandId,
  accountsByPlatform,
  initialPlatform = 'instagram',
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
  const [reportError, setReportError] = React.useState<string | null>(null);
  const manualRefreshRef = React.useRef(false);
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
          : accountsByPlatform.instagram;

  const selectedAccountId =
    platform === 'facebook'
      ? selectedAccountByPlatform.facebook
      : platform === 'tiktok'
        ? selectedAccountByPlatform.tiktok
        : platform === 'youtube'
          ? selectedAccountByPlatform.youtube
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
    selectedAccountByPlatform.tiktok,
    selectedAccountByPlatform.youtube,
  ]);

  React.useEffect(() => {
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

        fetchOrganicAnalytics({ ...base, scope: 'posts', postsLimit: 25 })
          .then((data) => {
            if (!cancelled) setAccountPosts(data.posts ?? []);
          })
          .catch(() => {
            if (!cancelled) setAccountPosts([]);
          });
      } else if (!cancelled) {
        setAccountPosts([]);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [brandId, fetchPostsWindow, platform, rangePreset, reloadTick, selectedAccountId, viewMode]);

  const dashboardData = React.useMemo(() => {
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
    viewMode === 'posts' ? state.status === 'loading' : kpisState.status === 'loading';
  const viewError =
    viewMode === 'posts'
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
        <Badge color="gray" variant="soft" radius="full" className="hidden sm:inline-flex">
          <PlatformIcon platform={platform} />
        </Badge>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select.Root
            value={platform}
            onValueChange={(value) => startTransition(() => setPlatform(value as MetricsPlatform))}
          >
            <Select.Trigger variant="surface" radius="large" className="h-8 w-[8.75rem] text-xs">
              {
                {
                  instagram: 'Instagram',
                  facebook: 'Facebook',
                  tiktok: 'TikTok',
                  youtube: 'YouTube',
                }[platform]
              }
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="instagram">Instagram</Select.Item>
              <Select.Item value="facebook">Facebook Pages</Select.Item>
              <Select.Item value="tiktok">TikTok</Select.Item>
              <Select.Item value="youtube">YouTube</Select.Item>
            </Select.Content>
          </Select.Root>

          <Select.Root
            value={rangePreset}
            onValueChange={(value) =>
              startTransition(() => setRangePreset(value as OrganicDateRangePreset))
            }
          >
            <Select.Trigger
              variant="surface"
              radius="large"
              className="h-8 w-[7.5rem] text-xs"
              disabled={viewMode === 'posts'}
            >
              {rangeLabel(rangePreset)}
            </Select.Trigger>
            <Select.Content>
              {RANGE_OPTIONS.map((preset) => (
                <Select.Item key={preset} value={preset}>
                  {rangeLabel(preset)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <Select.Root
            value={selectedAccountId ?? ''}
            onValueChange={(value) => {
              setSelectedAccountByPlatform((current) => ({
                ...current,
                [platform]: value,
              }));
              setSelection(brandId, platform, value);
            }}
          >
            <Select.Trigger
              variant="surface"
              radius="large"
              className="h-8 min-w-[13rem] max-w-[22rem] flex-1 text-xs"
            >
              {selectedAccount?.name ?? `Select a ${platform} account`}
            </Select.Trigger>
            <Select.Content position="popper" variant="solid" highContrast>
              <Select.Group>
                <Select.Label>{platform} accounts</Select.Label>
                {platformAccounts.map((account) => (
                  <Select.Item
                    key={account.integrationAccountId}
                    value={account.integrationAccountId}
                  >
                    {account.name}
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Content>
          </Select.Root>

          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as MetricsViewMode)}
            className="w-auto gap-0"
          >
            <TabsList className="inline-flex h-8 w-auto rounded-lg border border-subtle bg-muted/20 p-0.5">
              <TabsTrigger value="account" className="px-3 text-xs">
                Account
              </TabsTrigger>
              <TabsTrigger value="posts" className="px-3 text-xs">
                Posts
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
          <IconButton
            variant="surface"
            radius="large"
            size="2"
            onClick={handleRefresh}
            disabled={!selectedAccountId || isLoadingView || isPending}
            aria-label="Refresh organic analytics"
          >
            <ReloadIcon className={cn(isLoadingView && 'animate-spin')} />
          </IconButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="surface"
                radius="large"
                disabled={!selectedAccountId || isLoadingView || exportingReportFormat !== null}
                aria-label="Open organic report export options"
                className="h-8 px-2 text-xs"
              >
                <DownloadIcon className={cn(exportingReportFormat !== null && 'animate-pulse')} />
                Export
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className={cn(
          'min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 sm:p-3',
          isPending && 'opacity-60 pointer-events-none transition-opacity duration-150',
        )}
      >
        {reportError ? (
          <Callout.Root color="red" variant="surface" mb="3">
            <Callout.Text>{reportError}</Callout.Text>
          </Callout.Root>
        ) : null}
        {platformAccounts.length === 0 ? (
          <Callout.Root color="blue" variant="surface">
            <Callout.Text className="text-pretty">
              No {platform} account is connected for this brand yet. Connect one in Integrations to
              unlock reporting.
            </Callout.Text>
          </Callout.Root>
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
                  hasMorePosts={hasMorePostWindows}
                  loadingMorePosts={loadingMorePostWindows}
                  onLoadMorePosts={loadMorePostWindow}
                  demographicsLoading={demographicsLoading}
                  brandId={brandId}
                  integrationAccountId={selectedAccountId ?? ''}
                  platform={platform}
                  rangePreset={rangePreset}
                  youtubePostType={youtubePostType}
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
                <Text color="gray" size="2" className="text-pretty">
                  Select an account above to load organic reporting and post-level performance.
                </Text>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
