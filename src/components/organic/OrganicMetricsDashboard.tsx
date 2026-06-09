"use client";

import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  IconButton,
  Select,
  Separator,
  Text,
} from "@radix-ui/themes";
import { DownloadIcon, ReloadIcon } from "@radix-ui/react-icons";
import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bar,
  BarChart,
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
} from "recharts";

import { OrganicMetricsWidgetSkeleton } from "@/components/organic/MetricsSkeleton";
import { PostCommentsPanel } from "@/components/organic/primitives/PostCommentsPanel";
import dynamic from "next/dynamic";

const OrganicAudienceLocationMapCard = dynamic(
  () => import("@/components/organic/OrganicAudienceLocationMapCard").then((mod) => mod.OrganicAudienceLocationMapCard),
  { ssr: false }
);
import { useOrganicInsights } from "@/hooks/useOrganicInsights";
import type { OrganicComputedInsight } from "@/lib/organic/organic-insights.types";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformIcon } from "@/components/onboarding/PlatformIcons";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Reel,
  ReelContent,
  ReelVideo,
  type ReelItem,
} from "@/components/kibo-ui/reel";
import {
  fetchOrganicAnalytics,
} from "@/lib/api/organicAnalytics.client";
import { IntegrationErrorBanner } from "@/components/ui/IntegrationErrorBanner";
import type { IntegrationErrorCode } from "@continuum/contracts";
import { consumePrefetched } from "@/lib/prefetch/organic-metrics-cache";
import type {
  MetricComparison,
  OrganicDateRangePreset,
  OrganicMetrics,
  OrganicMetricsResponse,
  OrganicPost,
} from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";
import {
  buildPostMetricSeries,
  calculateHookRate,
  formatWatchTime,
  hookRateTier,
  post24hComparisons,
  postWindowRange,
  POST_GALLERY_WINDOW_DAYS,
  sortPosts,
  summarizePost7dMetrics,
  type DrilldownWindow,
  type HookRateTier,
  type PostMetricKey,
  type PostSortKey,
} from "@/components/organic/organic-metrics-utils";
import {
  buildOrganicReportCsv,
  buildOrganicReportHtml,
} from "@/components/organic/organic-report-utils";
import { useShallow } from "zustand/react/shallow";
import {
  selectAccountPostDetails,
  usePostAnalyticsStore,
} from "@/lib/organic/post-analytics-store";

export type OrganicAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type AccountsByPlatform = {
  instagram: OrganicAccountOption[];
  facebook: OrganicAccountOption[];
  tiktok: OrganicAccountOption[];
};

type MetricsPlatform = "instagram" | "facebook" | "tiktok";
type MetricsViewMode = "account" | "posts";

type Props = {
  brandId: string;
  accountsByPlatform: AccountsByPlatform;
  initialPlatform?: MetricsPlatform;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: "success"; data: OrganicMetricsResponse };

type SectionState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: "success"; data: T };

type DemographicsSlice = {
  audienceDemographics: OrganicMetricsResponse["audienceDemographics"];
};

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";

const RANGE_OPTIONS: OrganicDateRangePreset[] = [
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_month",
];

type KpiMetric = { key: keyof OrganicMetrics; label: string };

const META_KPI_CONFIG: KpiMetric[] = [
  { key: "accountsEngaged", label: "Engaged" },
  { key: "reach", label: "Reach" },
  { key: "reelsViews", label: "Reels" },
  { key: "newFollowers", label: "New Followers" },
  { key: "profileVisits24h", label: "Profile 24h" },
  { key: "views", label: "Total Views" },
  { key: "postViews", label: "Post Views" },
  { key: "nonFollowerReach", label: "Non-Follow Reach" },
  { key: "followerReach", label: "Follower Reach" },
  { key: "comments", label: "Comments" },
];

const TIKTOK_KPI_CONFIG: KpiMetric[] = [
  { key: "subscribers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "likes", label: "Likes" },
  { key: "videoCount", label: "Videos" },
  { key: "views", label: "Views" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
];

function getKpiConfig(platform: MetricsPlatform): KpiMetric[] {
  return platform === "tiktok" ? TIKTOK_KPI_CONFIG : META_KPI_CONFIG;
}

const audienceChartConfig = {
  followers: { label: "Followers", color: "#0284c7" },
  nonFollowers: { label: "Non-followers", color: "#f59e0b" },
} satisfies ChartConfig;

const demographicChartConfig = {
  value: { label: "Followers", color: "#0284c7" },
} satisfies ChartConfig;

const drilldownChartConfig = {
  value: { label: "Value", color: "#0284c7" },
} satisfies ChartConfig;

const ACCOUNT_TREND_MAP: Partial<Record<
  keyof OrganicMetrics,
  | "reach"
  | "views"
  | "accountsEngaged"
  | "comments"
  | "newFollowers"
  | "profileVisits24h"
  | "reelsViews"
  | "postViews"
  | "storiesViews"
  | "followerReach"
  | "nonFollowerReach"
>> = {
  accountsEngaged: "accountsEngaged",
  reach: "reach",
  views: "views",
  reelsViews: "reelsViews",
  postViews: "postViews",
  storiesViews: "storiesViews",
  followerReach: "followerReach",
  nonFollowerReach: "nonFollowerReach",
  comments: "comments",
  newFollowers: "newFollowers",
  profileVisits24h: "profileVisits24h",
  profileVisitsYesterday: "profileVisits24h",
};

// Maps insight metric tags → KPI keys they're relevant to
const INSIGHT_KPI_MAP: Record<string, Array<keyof OrganicMetrics>> = {
  newFollowers: ["newFollowers"],
  nonFollowerReach: ["nonFollowerReach"],
  reach: ["reach"],
  views: ["views", "postViews", "reelsViews"],
  totalInteractions: ["accountsEngaged"],
  accountsEngaged: ["accountsEngaged"],
  saved: ["accountsEngaged"],
  comments: ["comments"],
  country: ["followerReach"],
  age: ["followerReach"],
  profileVisits24h: ["profileVisits24h"],
};

const POST_METRIC_LABELS: Record<PostMetricKey, string> = {
  reach: "Reach",
  views: "Views",
  engagement: "Engagement",
  comments: "Comments",
};

function formatNumber(value: number | undefined) {
  if (value === undefined) return "-";
  return new Intl.NumberFormat().format(value);
}

function formatPercentChange(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "24h --";
  const formatted = `${Math.abs(value).toFixed(1)}%`;
  return `${value >= 0 ? "+" : "-"}${formatted} 24h`;
}

function trendDirection(value: number | undefined) {
  if (value === undefined || Number.isNaN(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function rangeLabel(preset: OrganicDateRangePreset) {
  return preset.replace(/_/g, " ");
}

const POST_INSIGHT_METRIC_KEYS = [
  "reach",
  "views",
  "likes",
  "comments",
  "shares",
  "saved",
  "totalInteractions",
] as const;

function isAllZeroPost(post: OrganicPost): boolean {
  const metrics = post.metrics;
  if (!metrics) return true;
  return POST_INSIGHT_METRIC_KEYS.every((key) => {
    const value = metrics[key];
    return typeof value !== "number" || value === 0;
  });
}

function mergePosts(existing: OrganicPost[], incoming: OrganicPost[]) {
  const map = new Map(existing.map((post) => [post.id, post]));
  incoming.forEach((post) => {
    map.set(post.id, { ...(map.get(post.id) ?? {}), ...post });
  });
  return Array.from(map.values()).sort((a, b) => {
    const dateA = a.timestamp ? Date.parse(a.timestamp) : 0;
    const dateB = b.timestamp ? Date.parse(b.timestamp) : 0;
    return dateB - dateA;
  });
}

function formatShortDate(date: string | undefined) {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadTextFile(params: {
  content: string;
  fileName: string;
  mimeType: string;
}) {
  const blob = new Blob([params.content], { type: params.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = params.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function demographicColor(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === "female") return "#10b981";
  if (normalized === "male") return "#0284c7";
  if (normalized === "unknown") return "#94a3b8";
  return "#64748b";
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
  metricKey: keyof OrganicMetrics
): MetricComparison | undefined {
  const trendKey = ACCOUNT_TREND_MAP[metricKey];
  if (!trendKey) return undefined;

  const trends = (data.trends ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const numericPoints = trends
    .map((trend) => trend[trendKey])
    .filter((value): value is number => typeof value === "number");
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
  metricKey: keyof OrganicMetrics
): MetricComparison | null | undefined {
  if (metricKey === "profileVisits24h") {
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
  const days = window === "30d" ? 30 : 7;
  const trends = (data.trends ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const trendKey = ACCOUNT_TREND_MAP[metricKey];

  if (trendKey) {
    const points = trends
      .map((trend) => ({
        date: trend.date,
        value: trend[trendKey],
        boosted: Boolean(trend.boosted),
      }))
      .filter((trend): trend is { date: string; value: number; boosted: boolean } => typeof trend.value === "number");

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
  const mediaType = (post.mediaType ?? "").toUpperCase();
  const productType = (post.mediaProductType ?? "").toUpperCase();
  return mediaType.includes("VIDEO") || productType.includes("REEL");
}

function isCarouselPost(post: OrganicPost) {
  const mediaType = (post.mediaType ?? "").toUpperCase();
  return mediaType.includes("CAROUSEL") || (post.carouselMedia?.length ?? 0) > 1;
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
  platform = "instagram",
}: {
  post: OrganicPost;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
  platform?: MetricsPlatform;
}) {
  const preview = getPostPreviewUrl(post);
  const isTikTok = platform === "tiktok";
  const video = !isTikTok && isVideoPost(post);
  const carousel = isCarouselPost(post);
  const recent7dMetrics = summarizePost7dMetrics(post);
  const previewViews = recent7dMetrics.views ?? post.metrics?.views ?? post.metrics?.reach;
  const mediaHeightClass = selected
    ? video
      ? "h-[280px] sm:h-[320px]"
      : carousel
        ? "h-[250px] sm:h-[290px]"
        : "h-[260px] sm:h-[300px]"
    : video
      ? "h-[220px] sm:h-[260px]"
      : carousel
        ? "h-[190px] sm:h-[220px]"
        : "h-[210px] sm:h-[240px]";
  const reelData: ReelItem[] = preview
    ? [
        {
          id: `${post.id}-reel`,
          type: "video",
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
        "group relative block w-full overflow-hidden rounded-xl border border-subtle bg-surface text-left transition-[transform,box-shadow,opacity,border-color] duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1",
        selected
          ? "ring-2 ring-blue-500/60 border-blue-400/60 shadow-lg shadow-blue-500/15"
          : "hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <Box className={cn("relative flex w-full items-center justify-center overflow-hidden bg-black/90 ring-1 ring-black/10 dark:ring-white/10", mediaHeightClass)}>
        {preview ? (
          video && !isTikTok ? (
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
                alt={post.title ?? post.caption ?? "Post media"}
                className="h-full w-full object-contain outline outline-1 outline-black/10 dark:outline-white/10"
              />
              {isTikTok && post.permalink ? (
                <a
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 hover:opacity-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5 text-black">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </a>
              ) : null}
            </div>
          )
        ) : (
          <Box className="h-full w-full flex items-center justify-center">
            <Text size="1" color="gray">Media preview unavailable</Text>
          </Box>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="absolute inset-x-0 bottom-0 p-3">
            <Text size="1" className="line-clamp-5 text-white">
              {post.caption?.trim().length ? post.caption : "Caption unavailable"}
            </Text>
            <Flex align="center" justify="between" mt="2">
              <Text size="1" className="text-white/85">{formatDateTime(post.timestamp)}</Text>
              <Flex align="center" gap="2">
                {post.metrics?.reelsAvgWatchTime !== undefined ? (
                  <Text size="1" className="text-white/85">
                    Avg watch {formatWatchTime(post.metrics.reelsAvgWatchTime)}
                  </Text>
                ) : null}
                <Text size="1" className="text-white/85">
                  {formatNumber(previewViews)} 7d views
                </Text>
              </Flex>
            </Flex>
          </div>
        </div>

        <div className="absolute left-2 top-2 flex items-center gap-1">
          <Badge color={video ? "violet" : carousel ? "orange" : "gray"} variant="solid">
            {video ? "Reel/Video" : carousel ? "Carousel" : "Post"}
          </Badge>
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
        {(() => {
          const hookRate = video ? calculateHookRate(post) : undefined;
          if (hookRate === undefined) return null;
          const tier = hookRateTier(hookRate);
          const color = tier === "elite" ? "green" : tier === "good" ? "blue" : tier === "average" ? "yellow" : "red";
          return (
            <Badge className="absolute bottom-2 left-2" color={color} variant="solid">
              {hookRate.toFixed(1)}% hook
            </Badge>
          );
        })()}
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

    const blockquote = document.createElement("blockquote");
    blockquote.className = "tiktok-embed";
    blockquote.setAttribute("cite", permalink);
    blockquote.setAttribute("data-video-id", videoId);
    blockquote.style.maxWidth = "100%";

    const section = document.createElement("section");
    blockquote.appendChild(section);
    container.appendChild(blockquote);

    const existingScript = document.querySelector('script[src="https://www.tiktok.com/embed.js"]');
    if (existingScript) existingScript.remove();

    const script = document.createElement("script");
    script.src = "https://www.tiktok.com/embed.js";
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

function PostSnapshotPanel({
  post,
  selectedMetric,
  onMetricSelect,
  drilldownWindow,
  onWindowChange,
  series,
  loading,
  platform = "instagram",
}: {
  post: OrganicPost;
  selectedMetric: PostMetricKey;
  onMetricSelect: (metric: PostMetricKey) => void;
  drilldownWindow: DrilldownWindow;
  onWindowChange: (window: DrilldownWindow) => void;
  series: Array<{ date: string; value: number }>;
  loading: boolean;
  platform?: MetricsPlatform;
}) {
  const preview = getPostPreviewUrl(post);
  const isTikTok = platform === "tiktok";
  const video = !isTikTok && isVideoPost(post);
  const metricComparisons = post24hComparisons(post);
  const recent7dMetrics = summarizePost7dMetrics(post);

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
        <Box p="3" className="h-full">
          <Flex align="start" justify="between" mb="2" gap="2">
            <Box>
              <Heading size="3">Post Snapshot</Heading>
              <Text size="1" color="gray">{formatDateTime(post.timestamp)}</Text>
            </Box>
            <Flex align="center" gap="1">
              {post.isBoosted ? <Badge color="orange" variant="soft">Boosted</Badge> : null}
              {loading ? <Badge color="blue" variant="soft">Refreshing</Badge> : null}
            </Flex>
          </Flex>

          <Box className="mb-3 overflow-hidden rounded-lg border border-subtle bg-black/90">
            {isTikTok && post.permalink ? (
              <TikTokEmbed videoId={post.id} permalink={post.permalink} />
            ) : preview ? (
              video ? (
                <Reel
                  className="max-h-[320px] min-h-[180px] w-full"
                  data={[
                    {
                      id: `${post.id}-snapshot`,
                      type: "video",
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
                  alt={post.title ?? post.caption ?? "Selected post"}
                  className="max-h-[320px] min-h-[180px] w-full object-contain"
                />
              )
            ) : (
              <Box className="flex min-h-[180px] items-center justify-center">
                <Text size="1" color="gray">Preview unavailable for this post</Text>
              </Box>
            )}
          </Box>

          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <MetricCard
              label="Reach (7d)"
              value={recent7dMetrics.reach ?? post.metrics?.reach}
              comparison={metricComparisons.reach}
              compact
            />
            <MetricCard
              label="Views (7d)"
              value={recent7dMetrics.views ?? post.metrics?.views}
              comparison={metricComparisons.views}
              compact
            />
            <MetricCard
              label="Engagement (7d)"
              value={recent7dMetrics.engagement ?? post.metrics?.totalInteractions}
              comparison={metricComparisons.engagement}
              compact
            />
            <MetricCard
              label="Comments (7d)"
              value={recent7dMetrics.comments ?? post.metrics?.comments}
              comparison={metricComparisons.comments}
              compact
            />
            {post.metrics?.reelsAvgWatchTime !== undefined ||
            post.metrics?.reelsVideoViewTotalTime !== undefined ? (
              <>
                <WatchTimeCard label="Avg Watch Time" ms={post.metrics?.reelsAvgWatchTime} />
                <WatchTimeCard label="Total Watch Time" ms={post.metrics?.reelsVideoViewTotalTime} />
              </>
            ) : null}
            {(() => {
              const hookRate = calculateHookRate(post);
              if (hookRate === undefined) return null;
              return <HookRateCard hookRate={hookRate} tier={hookRateTier(hookRate)} />;
            })()}
          </div>

          <Box className="mb-3">
            <Flex align="center" justify="between" mb="2" wrap="wrap" gap="2">
              <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                {(Object.keys(POST_METRIC_LABELS) as PostMetricKey[]).map((metricKey) => (
                  <button
                    key={metricKey}
                    type="button"
                    className={cn(
                      "h-8 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                      selectedMetric === metricKey
                        ? "bg-accent/20 text-foreground"
                        : "text-muted-foreground"
                    )}
                    onClick={() => onMetricSelect(metricKey)}
                    aria-label={`Show ${POST_METRIC_LABELS[metricKey]} trend`}
                    aria-pressed={selectedMetric === metricKey}
                  >
                    {POST_METRIC_LABELS[metricKey]}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                    drilldownWindow === "7d" ? "bg-accent/20 text-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => onWindowChange("7d")}
                  aria-label="Show seven day window"
                  aria-pressed={drilldownWindow === "7d"}
                >
                  7d
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                    drilldownWindow === "30d" ? "bg-accent/20 text-foreground" : "text-muted-foreground"
                  )}
                  onClick={() => onWindowChange("30d")}
                  aria-label="Show thirty day window"
                  aria-pressed={drilldownWindow === "30d"}
                >
                  30d
                </button>
              </div>
            </Flex>
            {series.length === 0 ? (
              <Text size="1" color="gray">No metric trend data is available for this post yet.</Text>
            ) : (
              <ChartContainer config={drilldownChartConfig} className="h-24 w-full">
                <LineChart data={series}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
                  {post.boostedAt ? (
                    <ReferenceLine
                      x={post.boostedAt.slice(0, 10)}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: "Boost", position: "top", fill: "#ef4444", fontSize: 10 }}
                    />
                  ) : null}
                </LineChart>
              </ChartContainer>
            )}
          </Box>

          <PostCommentsPanel comments={post.comments} />

          <Text size="1" className="line-clamp-8">
            {post.caption?.trim().length ? post.caption : "Caption unavailable for this post."}
          </Text>
        </Box>
      </Card>
    </motion.aside>
  );
}

const HOOK_RATE_TIER_CONFIG: Record<HookRateTier, { label: string; className: string }> = {
  elite:   { label: "Elite",   className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  good:    { label: "Good",    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  average: { label: "Average", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  poor:    { label: "Poor",    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
};

function HookRateCard({ hookRate, tier }: { hookRate: number; tier: HookRateTier }) {
  const { label, className } = HOOK_RATE_TIER_CONFIG[tier];
  return (
    <Card
      variant="surface"
      className="col-span-2 border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm"
    >
      <Box px="2" py="1">
        <Flex align="center" justify="between" mb="1">
          <Text size="1" color="gray" className="leading-none">Hook Rate</Text>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
            {label}
          </span>
        </Flex>
        <Text size="4" weight="bold" className="leading-tight tabular-nums tracking-tight">
          {hookRate.toFixed(1)}%
        </Text>
        <Text size="1" color="gray" className="mt-0.5 leading-none">
          avg watch time vs 3s
        </Text>
      </Box>
    </Card>
  );
}

function WatchTimeCard({ label, ms }: { label: string; ms: number | undefined }) {
  return (
    <Card
      variant="surface"
      className="border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm min-h-[48px]"
    >
      <Box px="2" py="1">
        <Text size="1" color="gray" className="leading-none">{label}</Text>
        <Text size="3" weight="bold" className="leading-tight tabular-nums tracking-tight">
          {formatWatchTime(ms)}
        </Text>
      </Box>
    </Card>
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
}: {
  label: string;
  value: number | undefined;
  comparison?: MetricComparison | null;
  compact?: boolean;
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  insights?: OrganicComputedInsight[];
}) {
  const pctChange = comparison?.percentageChange;
  const direction = trendDirection(pctChange);
  const interactive = Boolean(onClick);
  const hasInsights = insights && insights.length > 0;

  const cardContent = (
      <Card
        variant="surface"
        className={cn(
        "border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 motion-reduce:transition-none",
        compact ? "min-h-[48px]" : "min-h-[60px]",
        active ? "border-blue-500/70 bg-blue-500/10 shadow-blue-500/10" : "",
        interactive ? "hover:-translate-y-0.5 hover:shadow-md" : "",
        hasInsights ? "ring-1 ring-violet-400/30" : ""
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label={ariaLabel ?? label}
        aria-pressed={interactive ? active : undefined}
        className={cn(
          "h-full w-full rounded-[inherit] px-2.5 py-1.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1",
          interactive ? "cursor-pointer" : "cursor-default"
        )}
      >
        <Flex align="start" justify="between" gap="2" className="w-full">
          <Flex align="center" gap="1">
            <Text size="1" color="gray" className="leading-none">{label}</Text>
            {hasInsights ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" title="Insights available" />
            ) : null}
          </Flex>
          {!compact && (
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                direction === "up" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "",
                direction === "down" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "",
                direction === "flat" ? "bg-slate-500/15 text-slate-700 dark:text-slate-300" : ""
              )}
            >
              {direction}
            </span>
          )}
        </Flex>
        <Text size={compact ? "3" : "4"} weight="bold" className="leading-tight tabular-nums tracking-tight">{formatNumber(value)}</Text>
        {compact ? (
          <Text
            size="1"
            className={cn(
              "leading-none font-medium",
              pctChange === undefined
                ? "text-muted-foreground"
                : pctChange >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
            )}
          >
            {formatPercentChange(pctChange)}
          </Text>
        ) : (
          <Flex align="center" justify="between" gap="2">
            <Text
              size="1"
              className={cn(
                "leading-none font-medium",
                pctChange === undefined
                  ? "text-muted-foreground"
                  : pctChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
              )}
            >
              {formatPercentChange(pctChange)}
            </Text>
            <Text size="1" color="gray" className="leading-none">vs previous day</Text>
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
        <Text size="2" weight="medium" className="mb-2 block">{label} Insights</Text>
        <Flex direction="column" gap="2">
          {insights.map((insight, i) => (
            <Flex key={i} align="start" gap="2">
              <div className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                insight.severity === "positive" ? "bg-emerald-500" :
                insight.severity === "negative" ? "bg-red-500" : "bg-blue-500"
              )} />
              <div className="min-w-0">
                <Text size="1" className="leading-snug">{insight.text}</Text>
                {insight.recommendation ? (
                  <Text size="1" color="gray" className="mt-0.5 block leading-snug">{insight.recommendation}</Text>
                ) : null}
              </div>
            </Flex>
          ))}
        </Flex>
      </PopoverContent>
    </Popover>
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
}) {
  const [selectedPostId, setSelectedPostId] = React.useState<string | null>(null);
  const [selectedAccountMetric, setSelectedAccountMetric] = React.useState<keyof OrganicMetrics>("reach");
  const [selectedPostMetric, setSelectedPostMetric] = React.useState<PostMetricKey>("views");
  const [drilldownWindow, setDrilldownWindow] = React.useState<DrilldownWindow>("7d");
  const [postSortKey, setPostSortKey] = React.useState<PostSortKey>("recent");

  // Fetch organic insights for KPI tooltips
  const { insights: organicInsights } = useOrganicInsights({
    brandId,
    integrationAccountId,
    platform,
    rangePreset,
    enabled: viewMode === "account",
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
  const selectedPost =
    (selectedPostId ? postDetailsById?.[selectedPostId] : undefined) ??
    selectedPostBase ??
    null;
  const postCardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const postsScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const postsLoadSentinelRef = React.useRef<HTMLDivElement | null>(null);
  const accountSeries = buildAccountMetricSeries({
    data,
    metricKey: selectedAccountMetric,
    window: drilldownWindow,
  });
  const postSeries = buildPostMetricSeries({
    post: selectedPost,
    metricKey: selectedPostMetric,
    window: drilldownWindow,
  });
  const selectedAccountMetricLabel =
    getKpiConfig(platform).find((metric) => metric.key === selectedAccountMetric)?.label ?? String(selectedAccountMetric);
  const isAccountView = viewMode === "account";
  const isPostsView = viewMode === "posts";

  const audienceTotal = Math.max(0, audienceBreakdown.followers + audienceBreakdown.nonFollowers);
  const audienceRadialData = [
    {
      audience: "reach",
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
    if (viewMode !== "posts") return;
    if (!selectedPostId) return;
    onRequestPostDetail?.(selectedPostId);
  }, [onRequestPostDetail, selectedPostId, viewMode]);

  React.useEffect(() => {
    if (viewMode !== "posts") return;
    if (!selectedPostId) return;
    const card = postCardRefs.current[selectedPostId];
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
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
        rootMargin: "220px 0px 220px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMorePosts, isPostsView, loadingMorePosts, onLoadMorePosts]);

  return (
    <Flex
      direction="column"
      gap="2"
      className="min-h-0 pb-6"
    >
      {isAccountView ? (
        <motion.div
          key={`kpi-${data.range.since}-${data.range.until}`}
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {getKpiConfig(platform).map((metric) => (
            <motion.div
              key={String(metric.key)}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] } } }}
            >
              <MetricCard
                label={metric.label}
                value={metric.key === "profileVisits24h" ? profileVisits24h : metrics[metric.key]}
                comparison={metricComparisonFor(data, metric.key)}
                active={selectedAccountMetric === metric.key}
                ariaLabel={`Account metric ${metric.label}`}
                onClick={() => {
                  setSelectedAccountMetric(metric.key);
                }}
                insights={insightsByKpi.get(metric.key)}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {isAccountView ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.75fr)]">
          <Card variant="surface" className="border border-subtle bg-surface xl:row-span-2">
            <Box p="3">
              <Flex align="center" justify="between" mb="2" wrap="wrap" gap="2">
                <Box>
                  <Heading size="3">Metric Drilldown</Heading>
                  <Text size="2" color="gray">{selectedAccountMetricLabel} ({drilldownWindow})</Text>
                </Box>
                <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "h-8 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                      drilldownWindow === "7d" ? "bg-accent/20 text-foreground" : "text-muted-foreground"
                    )}
                    onClick={() => setDrilldownWindow("7d")}
                    aria-label="Show seven day window"
                    aria-pressed={drilldownWindow === "7d"}
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "h-8 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
                      drilldownWindow === "30d" ? "bg-accent/20 text-foreground" : "text-muted-foreground"
                    )}
                    onClick={() => setDrilldownWindow("30d")}
                    aria-label="Show thirty day window"
                    aria-pressed={drilldownWindow === "30d"}
                  >
                    30d
                  </button>
                </div>
              </Flex>

              {accountSeries.length === 0 ? (
                <Text size="2" color="gray">No metric history is available for this metric in the selected window.</Text>
              ) : (
                <ChartContainer config={drilldownChartConfig} className="h-[min(42vh,24rem)] min-h-64 w-full">
                  <LineChart data={accountSeries}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(value) => formatShortDate(value)} minTickGap={20} />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
                    {(data.boostedEvents ?? []).map((event) => (
                      <ReferenceLine
                        key={event.id}
                        x={event.date}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: "Boost", position: "top", fill: "#ef4444", fontSize: 10 }}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </Box>
          </Card>

          <Card variant="surface" className={cn("border border-subtle bg-surface", platform === "tiktok" && "!hidden")}>
            <Box p="3">
              <Heading size="3" mb="2">Followers Breakdown</Heading>
              <ChartContainer config={audienceChartConfig} className="h-52 w-full">
                <RadialBarChart
                  data={audienceRadialData}
                  endAngle={180}
                  innerRadius={48}
                  outerRadius={90}
                >
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                          return null;
                        }

                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) - 12}
                              className="fill-foreground text-xl font-semibold"
                            >
                              {formatNumber(audienceTotal)}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 8}
                              className="fill-muted-foreground text-xs"
                            >
                              Audience
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
              <Separator my="2" size="4" />
              <Flex justify="between">
                <Text size="2" color="gray">Followers</Text>
                <Text size="2" weight="medium">{formatNumber(audienceBreakdown.followers)}</Text>
              </Flex>
              <Flex justify="between">
                <Text size="2" color="gray">Non-followers</Text>
                <Text size="2" weight="medium">{formatNumber(audienceBreakdown.nonFollowers)}</Text>
              </Flex>
            </Box>
          </Card>

          <Card variant="surface" className={cn("border border-subtle bg-surface", platform === "tiktok" && "!hidden")}>
            <Box p="3">
              <Heading size="3" mb="2">Audience Demographics</Heading>

              <Text size="1" color="gray" mb="1">Gender</Text>
              {demographicsLoading ? (
                <div className="h-28 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ) : genderDemographics.length === 0 ? (
                <Text size="1" color="gray">Gender breakdown unavailable.</Text>
              ) : (
                <>
                  <ChartContainer config={demographicChartConfig} className="h-28 w-full">
                    <PieChart>
                      <Pie
                        data={genderDemographics}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={26}
                        outerRadius={46}
                        strokeWidth={2}
                      >
                        {genderDemographics.map((entry) => (
                          <Cell key={entry.key} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="grid grid-cols-2 gap-1">
                    {genderDemographics.map((entry) => (
                      <Flex key={entry.key} justify="between" align="center">
                        <Text size="1" color="gray">{entry.label}</Text>
                        <Text size="1" weight="medium">{formatNumber(entry.value)}</Text>
                      </Flex>
                    ))}
                  </div>
                </>
              )}

              <Separator my="2" size="4" />
              <Text size="1" color="gray" mb="1">Age</Text>
              {demographicsLoading ? (
                <div className="h-28 w-full animate-pulse rounded-lg bg-muted/70" />
              ) : ageDemographics.length === 0 ? (
                <Text size="1" color="gray">Age breakdown unavailable.</Text>
              ) : (
                <ChartContainer config={demographicChartConfig} className="h-28 w-full">
                  <BarChart data={ageDemographics} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--color-value)" />
                  </BarChart>
                </ChartContainer>
              )}
            </Box>
          </Card>
        </div>
      ) : null}

      {isAccountView && platform !== "tiktok" ? (
        <OrganicAudienceLocationMapCard
          countryEntries={countryDemographics}
          cityEntries={cityDemographics}
          timeframe={demographicTimeframe}
        />
      ) : null}

      {isPostsView ? (
        <>
          <Card variant="surface" className="border border-subtle bg-surface">
            <Box p="3">
              {(data.posts ?? []).length === 0 ? (
                <Text size="2" color="gray">No posts were found for this account in the selected window.</Text>
              ) : (
                <div className="mx-auto w-full">
                  <motion.div
                    layout
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                    className={cn(
                      "grid grid-cols-1 gap-4 lg:items-start",
                      selectedPost ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "lg:grid-cols-1"
                    )}
                  >
                    <motion.div layout className="min-w-0">
                      <Flex align="center" justify="end" mb="2" px="1" gap="2">
                        <Text size="1" color="gray">Sort</Text>
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
                      <div ref={postsScrollerRef} className="mx-auto max-h-[calc(100dvh-11rem)] w-full overflow-y-auto px-1">
                        <div
                          className={cn(
                            "mx-auto grid gap-3 sm:gap-4",
                            "[grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]"
                          )}
                        >
                          {sortPosts(data.posts ?? [], postSortKey).map((post) => (
                            <motion.div
                              layout
                              key={post.id}
                              ref={(node) => {
                                postCardRefs.current[post.id] = node;
                              }}
                              className="min-w-0"
                            >
                              <PostGalleryCard
                                post={post}
                                selected={selectedPostId === post.id}
                                loading={loadingPostId === post.id}
                                onSelect={() => {
                                  setSelectedPostId(post.id);
                                }}
                                platform={platform}
                              />
                            </motion.div>
                          ))}
                        </div>
                        <div ref={postsLoadSentinelRef} className="h-2 w-full" aria-hidden />
                        <div className="flex items-center justify-center py-4">
                          {loadingMorePosts ? (
                            <Text size="1" color="gray">Loading previous {POST_GALLERY_WINDOW_DAYS}d...</Text>
                          ) : hasMorePosts ? (
                            <Text size="1" color="gray">Scroll for previous {POST_GALLERY_WINDOW_DAYS}d</Text>
                          ) : (
                            <Text size="1" color="gray">Reached 3-month history cap.</Text>
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
                          drilldownWindow={drilldownWindow}
                          onWindowChange={setDrilldownWindow}
                          series={postSeries}
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

export function OrganicMetricsDashboard({ brandId, accountsByPlatform, initialPlatform = "instagram" }: Props) {
  const [isPending, startTransition] = React.useTransition();
  const [platform, setPlatform] = React.useState<MetricsPlatform>(initialPlatform);
  const [viewMode, setViewMode] = React.useState<MetricsViewMode>("account");
  const [rangePreset, setRangePreset] = React.useState<OrganicDateRangePreset>(DEFAULT_RANGE_PRESET);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [exportingReportFormat, setExportingReportFormat] = React.useState<"csv" | "html" | null>(null);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const manualRefreshRef = React.useRef(false);
  const setPostDetailInStore = usePostAnalyticsStore((store) => store.setPostDetail);
  const [loadingPostId, setLoadingPostId] = React.useState<string | null>(null);
  const loadedPostDetailIdsRef = React.useRef<Set<string>>(new Set());
  const loadingPostDetailIdsRef = React.useRef<Set<string>>(new Set());
  const [postGalleryPosts, setPostGalleryPosts] = React.useState<OrganicPost[]>([]);
  const [postWindowOffset, setPostWindowOffset] = React.useState(0);
  const [hasMorePostWindows, setHasMorePostWindows] = React.useState(false);
  const [loadingMorePostWindows, setLoadingMorePostWindows] = React.useState(false);
  const [selectedAccountByPlatform, setSelectedAccountByPlatform] = React.useState<{
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
  }>({
    instagram: accountsByPlatform.instagram[0]?.integrationAccountId ?? null,
    facebook: accountsByPlatform.facebook[0]?.integrationAccountId ?? null,
    tiktok: accountsByPlatform.tiktok[0]?.integrationAccountId ?? null,
  });
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [kpisState, setKpisState] = React.useState<SectionState<OrganicMetricsResponse>>({ status: "idle" });
  const [demographicsState, setDemographicsState] = React.useState<SectionState<DemographicsSlice>>({ status: "idle" });

  const platformAccounts = platform === "facebook"
    ? accountsByPlatform.facebook
    : platform === "tiktok"
      ? accountsByPlatform.tiktok
      : accountsByPlatform.instagram;

  const selectedAccountId = platform === "facebook"
    ? selectedAccountByPlatform.facebook
    : platform === "tiktok"
      ? selectedAccountByPlatform.tiktok
      : selectedAccountByPlatform.instagram;

  const selectedAccount =
    platformAccounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  // Per-post insight details cached in Zustand (sessionStorage-backed), scoped to
  // the selected account and re-keyed by post id so clicking between posts and
  // remounting the dashboard is instant. Server Upstash/Postgres cache still backs
  // cross-session fetches.
  const postDetailsById = usePostAnalyticsStore(
    useShallow((store) => selectAccountPostDetails(store.postDetailsById, selectedAccountId)),
  );

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
          preset: "custom",
          custom: { from: window.from, to: window.to },
        },
        scope: "posts",
        forceRefresh,
      });
    },
    [brandId, platform]
  );

  React.useEffect(() => {
    // The Zustand store deliberately persists post details across account/view
    // switches so re-selecting a post is instant; only the in-flight gating refs
    // and gallery scaffolding reset here.
    loadedPostDetailIdsRef.current.clear();
    loadingPostDetailIdsRef.current.clear();
    setLoadingPostId(null);
    setPostGalleryPosts([]);
    setPostWindowOffset(0);
    setHasMorePostWindows(false);
    setLoadingMorePostWindows(false);
  }, [platform, selectedAccountId, viewMode]);

  const requestPostDetail = React.useCallback(
    async (postId: string) => {
      if (viewMode !== "posts" || !selectedAccountId || postId.length === 0) return;
      if (loadingPostDetailIdsRef.current.has(postId)) return;

      // Store-first: instant if this post was already fetched this session.
      const cached = usePostAnalyticsStore
        .getState()
        .getPostDetail({ integrationAccountId: selectedAccountId, postId });
      if (cached) {
        loadedPostDetailIdsRef.current.add(postId);
        setPostGalleryPosts((current) => mergePosts(current, [cached]));
        return;
      }
      if (loadedPostDetailIdsRef.current.has(postId)) return;

      const fetchDetail = async (forceRefresh: boolean) => {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId: selectedAccountId,
          platform,
          range: { preset: "last_30d" },
          scope: "posts",
          selectedPostId: postId,
          forceRefresh,
        });
        return (data.posts ?? []).find((post) => post.id === postId) ?? null;
      };

      loadingPostDetailIdsRef.current.add(postId);
      setLoadingPostId(postId);
      try {
        let detailedPost = await fetchDetail(false);
        // Self-heal a stale cached zero: force one live refetch (the edge fn no
        // longer caches zeros, so this returns real numbers when available).
        if (detailedPost && isAllZeroPost(detailedPost)) {
          const refreshed = await fetchDetail(true);
          if (refreshed) detailedPost = refreshed;
        }
        if (detailedPost) {
          loadedPostDetailIdsRef.current.add(postId);
          setPostDetailInStore({ integrationAccountId: selectedAccountId, post: detailedPost });
          setPostGalleryPosts((current) => mergePosts(current, [detailedPost]));
        }
      } catch (error) {
        console.error("[OrganicMetricsDashboard] Failed to load post details", error);
      } finally {
        loadingPostDetailIdsRef.current.delete(postId);
        setLoadingPostId((current) => (current === postId ? null : current));
      }
    },
    [
      brandId,
      platform,
      selectedAccountId,
      viewMode,
      setPostDetailInStore,
    ]
  );

  const loadMorePostWindow = React.useCallback(async () => {
    if (!selectedAccountId || viewMode !== "posts" || loadingMorePostWindows || !hasMorePostWindows) {
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
      console.error("[OrganicMetricsDashboard] Failed to load previous post window", error);
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
    if (viewMode === "posts") {
      loadedPostDetailIdsRef.current.clear();
      loadingPostDetailIdsRef.current.clear();
      usePostAnalyticsStore.getState().clearPostDetails();
      setLoadingPostId(null);
    }
    manualRefreshRef.current = true;
    setReloadTick((tick) => tick + 1);
  }, [viewMode]);

  const handleExportReport = React.useCallback(async (format: "csv" | "html") => {
    if (!selectedAccountId) return;

    setReportError(null);
    setExportingReportFormat(format);
    try {
      const [accountData, postsData] = await Promise.all([
        fetchOrganicAnalytics({
          brandId,
          integrationAccountId: selectedAccountId,
          platform,
          range: { preset: "last_30d" },
          scope: "account",
          forceRefresh: false,
        }),
        fetchOrganicAnalytics({
          brandId,
          integrationAccountId: selectedAccountId,
          platform,
          range: { preset: "last_30d" },
          scope: "posts",
          forceRefresh: false,
        }),
      ]);

      const postIds = Array.from(
        new Set((postsData.posts ?? []).map((post) => post.id).filter((postId) => postId.length > 0))
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
                range: { preset: "last_30d" },
                scope: "posts",
                selectedPostId: postId,
                forceRefresh: false,
              });
              return (detailData.posts ?? []).find((post) => post.id === postId) ?? null;
            } catch (error) {
              console.error(`[OrganicMetricsDashboard] Failed to load report detail for post ${postId}`, error);
              return null;
            }
          })
        );

        detailedPosts.push(
          ...batchResults.filter((post): post is OrganicPost => post !== null)
        );
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
      if (format === "html") {
        const html = buildOrganicReportHtml(reportPayload);
        downloadTextFile({
          content: html,
          fileName: `continuum-${platform}-organic-report-${dateTag}.html`,
          mimeType: "text/html;charset=utf-8;",
        });
      } else {
        const csv = buildOrganicReportCsv(reportPayload);
        downloadTextFile({
          content: csv,
          fileName: `continuum-${platform}-organic-report-${dateTag}.csv`,
          mimeType: "text/csv;charset=utf-8;",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to export organic report.";
      setReportError(message);
    } finally {
      setExportingReportFormat(null);
    }
  }, [brandId, platform, selectedAccount?.name, selectedAccountId]);

  React.useEffect(() => {
    const firstPlatformAccountId = platformAccounts[0]?.integrationAccountId ?? null;
    if (platform === "facebook") {
      if (
        !selectedAccountByPlatform.facebook ||
        !platformAccounts.some((item) => item.integrationAccountId === selectedAccountByPlatform.facebook)
      ) {
        setSelectedAccountByPlatform((current) => ({ ...current, facebook: firstPlatformAccountId }));
      }
      return;
    }

    if (platform === "tiktok") {
      if (
        !selectedAccountByPlatform.tiktok ||
        !platformAccounts.some((item) => item.integrationAccountId === selectedAccountByPlatform.tiktok)
      ) {
        setSelectedAccountByPlatform((current) => ({ ...current, tiktok: firstPlatformAccountId }));
      }
      return;
    }

    if (
      !selectedAccountByPlatform.instagram ||
      !platformAccounts.some((item) => item.integrationAccountId === selectedAccountByPlatform.instagram)
    ) {
      setSelectedAccountByPlatform((current) => ({ ...current, instagram: firstPlatformAccountId }));
    }
  }, [platform, platformAccounts, selectedAccountByPlatform.facebook, selectedAccountByPlatform.instagram, selectedAccountByPlatform.tiktok]);

  React.useEffect(() => {
    if (!selectedAccountId) {
      setState({ status: "idle" });
      setKpisState({ status: "idle" });
      setDemographicsState({ status: "idle" });
      return;
    }
    const accountId = selectedAccountId;

    let cancelled = false;

    if (viewMode === "posts") {
      async function runPosts() {
        setState({ status: "loading" });
        try {
          const forceRefresh = manualRefreshRef.current;
          manualRefreshRef.current = false;
          const postsData = await fetchPostsWindow({ accountId, windowOffset: 0, forceRefresh });
          if (!postsData) {
            setState({ status: "error", message: "Unable to load post windows for the selected range." });
            return;
          }
          if (cancelled) return;
          setPostGalleryPosts(postsData.posts ?? []);
          setPostWindowOffset(0);
          setHasMorePostWindows(postWindowRange(1) !== null);
          setLoadingMorePostWindows(false);
          setState({ status: "success", data: postsData });
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
          const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
          const retryAfter = (error as { retryAfter?: number }).retryAfter;
          setState({ status: "error", message, errorCode, retryAfter });
        }
      }
      void runPosts();
    } else {
      const forceRefresh = manualRefreshRef.current;
      manualRefreshRef.current = false;

      setKpisState({ status: "loading" });
      setDemographicsState(platform === "instagram" ? { status: "loading" } : { status: "idle" });

      const base = {
        brandId,
        integrationAccountId: accountId,
        platform,
        range: { preset: rangePreset },
        forceRefresh,
      } as const;

      const kpiPromise = (!forceRefresh && consumePrefetched(brandId, accountId, platform, rangePreset, "kpis"))
        || fetchOrganicAnalytics({ ...base, scope: "kpis" });

      kpiPromise
        .then((data) => { if (!cancelled) setKpisState({ status: "success", data }); })
        .catch((error) => {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
            const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
            const retryAfter = (error as { retryAfter?: number }).retryAfter;
            setKpisState({ status: "error", message, errorCode, retryAfter });
          }
        });

      if (platform === "instagram") {
        const demoPromise = (!forceRefresh && consumePrefetched(brandId, accountId, platform, rangePreset, "demographics"))
          || fetchOrganicAnalytics({ ...base, scope: "demographics" });

        demoPromise
          .then((data) => {
            if (!cancelled) {
              setDemographicsState({ status: "success", data: { audienceDemographics: data.audienceDemographics } });
            }
          })
          .catch((error) => {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : "Unable to load demographics.";
              const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
              const retryAfter = (error as { retryAfter?: number }).retryAfter;
              setDemographicsState({ status: "error", message, errorCode, retryAfter });
            }
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [brandId, fetchPostsWindow, platform, rangePreset, reloadTick, selectedAccountId, viewMode]);

  const dashboardData = React.useMemo(() => {
    if (viewMode === "posts") {
      return state.status === "success" ? { ...state.data, posts: postGalleryPosts } : null;
    }
    if (kpisState.status !== "success") return null;
    return {
      ...kpisState.data,
      audienceDemographics: demographicsState.status === "success"
        ? demographicsState.data.audienceDemographics
        : undefined,
    } as OrganicMetricsResponse;
  }, [viewMode, state, kpisState, demographicsState, postGalleryPosts]);

  const isLoadingView = viewMode === "posts" ? state.status === "loading" : kpisState.status === "loading";
  const viewError = viewMode === "posts"
    ? (state.status === "error" ? { message: state.message, errorCode: state.errorCode, retryAfter: state.retryAfter } : null)
    : (kpisState.status === "error" ? { message: kpisState.message, errorCode: kpisState.errorCode, retryAfter: kpisState.retryAfter } : null);
  const demographicsLoading = demographicsState.status === "loading";

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
            <Select.Root value={platform} onValueChange={(value) => startTransition(() => setPlatform(value as MetricsPlatform))}>
              <Select.Trigger variant="surface" radius="large" className="h-8 w-[8.75rem] text-xs">
                {{ instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" }[platform]}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="instagram">Instagram</Select.Item>
                <Select.Item value="facebook">Facebook Pages</Select.Item>
                <Select.Item value="tiktok">TikTok</Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root
              value={rangePreset}
              onValueChange={(value) => startTransition(() => setRangePreset(value as OrganicDateRangePreset))}
            >
              <Select.Trigger
                variant="surface"
                radius="large"
                className="h-8 w-[7.5rem] text-xs"
                disabled={viewMode === "posts"}
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
              value={selectedAccountId ?? ""}
              onValueChange={(value) => {
                setSelectedAccountByPlatform((current) => ({
                  ...current,
                  [platform]: value,
                }));
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
                    <Select.Item key={account.integrationAccountId} value={account.integrationAccountId}>
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
                <TabsTrigger value="account" className="px-3 text-xs">Account</TabsTrigger>
                <TabsTrigger value="posts" className="px-3 text-xs">Posts</TabsTrigger>
              </TabsList>
            </Tabs>
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
            <ReloadIcon className={cn(isLoadingView && "animate-spin")} />
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
                <DownloadIcon className={cn(exportingReportFormat !== null && "animate-pulse")} />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  void handleExportReport("csv");
                }}
                disabled={exportingReportFormat !== null}
              >
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void handleExportReport("html");
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
            "min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 sm:p-3",
            isPending && "opacity-60 pointer-events-none transition-opacity duration-150"
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
                No {platform} account is connected for this brand yet. Connect one in Integrations to unlock reporting.
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
                    integrationAccountId={selectedAccountId ?? ""}
                    platform={platform}
                    rangePreset={rangePreset}
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
