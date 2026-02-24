"use client";

import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Separator,
  Text,
} from "@radix-ui/themes";
import { ReloadIcon } from "@radix-ui/react-icons";
import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { OrganicMetricsWidgetSkeleton } from "@/components/organic/MetricsSkeleton";
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
  type OrganicAnalyticsRequest,
} from "@/lib/api/organicAnalytics.client";
import type {
  MetricComparison,
  OrganicDateRangePreset,
  OrganicMetrics,
  OrganicMetricsResponse,
  OrganicPost,
  OrganicPostBreakdownPoint,
} from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";

export type OrganicAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type AccountsByPlatform = {
  instagram: OrganicAccountOption[];
  facebook: OrganicAccountOption[];
};

type Props = {
  brandId: string;
  accountsByPlatform: AccountsByPlatform;
  initialPlatform?: "instagram" | "facebook";
};

type MetricsPlatform = "instagram" | "facebook";
type MetricsViewMode = "account" | "posts";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: OrganicMetricsResponse };

type DrilldownWindow = "7d" | "30d";
type PostMetricKey = "reach" | "views" | "engagement" | "comments";

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";
const POST_GALLERY_WINDOW_DAYS = 7;
const POST_GALLERY_MAX_DAYS = 90;

const RANGE_OPTIONS: OrganicDateRangePreset[] = [
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_month",
];

const KPI_CONFIG: Array<{ key: keyof OrganicMetrics; label: string }> = [
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

const audienceChartConfig = {
  followers: { label: "Followers", color: "#0284c7" },
  nonFollowers: { label: "Non-followers", color: "#f59e0b" },
} satisfies ChartConfig;

const drilldownChartConfig = {
  value: { label: "Value", color: "#0284c7" },
} satisfies ChartConfig;

const ACCOUNT_TREND_MAP: Partial<Record<
  keyof OrganicMetrics,
  "reach" | "views" | "accountsEngaged" | "comments" | "newFollowers" | "profileVisits24h"
>> = {
  accountsEngaged: "accountsEngaged",
  reach: "reach",
  views: "views",
  comments: "comments",
  newFollowers: "newFollowers",
  profileVisits24h: "profileVisits24h",
  profileVisitsYesterday: "profileVisits24h",
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
  return preset.replaceAll("_", " ");
}

function toYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function postWindowRange(weekOffset: number) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const capSince = new Date(utcToday);
  capSince.setUTCDate(capSince.getUTCDate() - POST_GALLERY_MAX_DAYS);

  const until = new Date(utcToday);
  until.setUTCDate(until.getUTCDate() - weekOffset * POST_GALLERY_WINDOW_DAYS);
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
  if (trends.length === 0) return undefined;

  const currentValue = trends[trends.length - 1]?.[trendKey];
  const previousValue = trends[Math.max(0, trends.length - 2)]?.[trendKey];
  const current = typeof currentValue === "number" ? currentValue : 0;
  const previous = typeof previousValue === "number" ? previousValue : current;

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

function normalizeDailyBreakdown(points: OrganicPostBreakdownPoint[] | undefined) {
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
    return trends
      .map((trend) => ({
        date: trend.date,
        value: typeof trend[trendKey] === "number" ? trend[trendKey] : 0,
        boosted: Boolean(trend.boosted),
      }))
      .slice(Math.max(0, trends.length - days));
  }

  return [];
}

function buildPostMetricSeries(params: {
  post: OrganicPost | null;
  metricKey: PostMetricKey;
  window: DrilldownWindow;
}) {
  const { post, metricKey, window } = params;
  if (!post) return [];

  const sourcePoints =
    window === "30d"
      ? post.breakdown30d ?? post.breakdown7d
      : post.breakdown7d;

  const today = toYmd(new Date());
  const breakdown = normalizeDailyBreakdown(sourcePoints);
  return breakdown
    .filter((point) => point.date <= today)
    .map((point) => ({
      date: point.date,
      value:
        metricKey === "reach"
          ? point.reach
          : metricKey === "views"
            ? point.views
            : metricKey === "engagement"
              ? point.engagement
              : point.comments,
    }))
    .slice(-(window === "30d" ? 30 : 7));
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

function post24hComparisons(post: OrganicPost | null): Partial<Record<PostMetricKey, MetricComparison>> {
  if (!post) return {};
  const today = toYmd(new Date());
  const daily = normalizeDailyBreakdown(post.breakdown7d).filter((point) => point.date <= today);
  if (daily.length < 2) return {};

  const sorted = daily.slice().sort((a, b) => a.date.localeCompare(b.date));
  const currentDay = sorted[sorted.length - 1];
  const previousDay = sorted[sorted.length - 2];
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
}: {
  post: OrganicPost;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  const preview = getPostPreviewUrl(post);
  const video = isVideoPost(post);
  const carousel = isCarouselPost(post);
  const mediaHeightClass = selected
    ? video
      ? "h-[420px] sm:h-[500px]"
      : carousel
        ? "h-[360px] sm:h-[440px]"
        : "h-[390px] sm:h-[460px]"
    : video
      ? "h-[320px] sm:h-[390px]"
      : carousel
        ? "h-[260px] sm:h-[320px]"
        : "h-[300px] sm:h-[360px]";
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
        "group relative block w-full overflow-hidden rounded-xl border border-subtle bg-surface text-left transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1",
        selected
          ? "ring-2 ring-blue-500/60 border-blue-400/60 shadow-lg shadow-blue-500/15"
          : "hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <Box className={cn("relative w-full overflow-hidden bg-muted/10", mediaHeightClass)}>
        {preview ? (
          video ? (
            <Reel className="h-full w-full" data={reelData} defaultMuted>
              <ReelContent>
                {(item) => (
                  <ReelVideo
                    src={item.src}
                    className="h-full w-full object-cover"
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
              alt={post.title ?? post.caption ?? "Post media"}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <Box className="h-full w-full flex items-center justify-center">
            <Text size="1" color="gray">No media</Text>
          </Box>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="absolute inset-x-0 bottom-0 p-3">
            <Text size="1" className="line-clamp-5 text-white">
              {post.caption?.trim().length ? post.caption : "No caption"}
            </Text>
            <Flex align="center" justify="between" mt="2">
              <Text size="1" className="text-white/85">{formatDateTime(post.timestamp)}</Text>
              <Text size="1" className="text-white/85">
                {formatNumber(post.metrics?.views ?? post.metrics?.reach)} views
              </Text>
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
      </Box>
    </motion.button>
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
}: {
  post: OrganicPost;
  selectedMetric: PostMetricKey;
  onMetricSelect: (metric: PostMetricKey) => void;
  drilldownWindow: DrilldownWindow;
  onWindowChange: (window: DrilldownWindow) => void;
  series: Array<{ date: string; value: number }>;
  loading: boolean;
}) {
  const preview = getPostPreviewUrl(post);
  const video = isVideoPost(post);
  const metricComparisons = post24hComparisons(post);

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

          <Box className="mb-3 overflow-hidden rounded-lg border border-subtle bg-muted/10">
            {preview ? (
              video ? (
                <Reel
                  className="h-[260px] w-full"
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
                        className="h-full w-full object-cover"
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
                  className="h-[260px] w-full object-cover"
                />
              )
            ) : (
              <Box className="flex h-[260px] items-center justify-center">
                <Text size="1" color="gray">No preview available</Text>
              </Box>
            )}
          </Box>

          <div className="mb-3 grid grid-cols-2 gap-1.5">
            <MetricCard label="Reach" value={post.metrics?.reach} comparison={metricComparisons.reach} compact />
            <MetricCard label="Views" value={post.metrics?.views} comparison={metricComparisons.views} compact />
            <MetricCard label="Engagement" value={post.metrics?.totalInteractions} comparison={metricComparisons.engagement} compact />
            <MetricCard label="Comments" value={post.metrics?.comments} comparison={metricComparisons.comments} compact />
          </div>

          <Box className="mb-3">
            <Flex align="center" justify="between" mb="2" wrap="wrap" gap="2">
              <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
                {(Object.keys(POST_METRIC_LABELS) as PostMetricKey[]).map((metricKey) => (
                  <button
                    key={metricKey}
                    type="button"
                    className={cn(
                      "min-h-10 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
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
                    "min-h-10 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
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
                    "min-h-10 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
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
              <Text size="1" color="gray">No trend data for this post yet.</Text>
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

          <Text size="2" className="line-clamp-8">
            {post.caption?.trim().length ? post.caption : "No caption available for this post."}
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
}: {
  label: string;
  value: number | undefined;
  comparison?: MetricComparison | null;
  compact?: boolean;
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const pctChange = comparison?.percentageChange;
  const direction = trendDirection(pctChange);
  const interactive = Boolean(onClick);

  return (
    <Card
      variant="surface"
      className={cn(
        "border border-subtle bg-surface/95 backdrop-blur-sm shadow-sm transition-all duration-200 motion-reduce:transition-none",
        compact ? "min-h-[62px]" : "min-h-[88px]",
        active ? "border-blue-500/70 bg-blue-500/10 shadow-blue-500/10" : "",
        interactive ? "hover:-translate-y-0.5 hover:shadow-md" : ""
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-label={ariaLabel ?? label}
        aria-pressed={interactive ? active : undefined}
        className={cn(
          "h-full w-full rounded-[inherit] px-2.5 py-2 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1",
          interactive ? "cursor-pointer" : "cursor-default"
        )}
      >
        <Flex align="start" justify="between" gap="2" className="w-full">
          <Text size="1" color="gray" className="leading-none">{label}</Text>
          {!compact && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                direction === "up" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "",
                direction === "down" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "",
                direction === "flat" ? "bg-slate-500/15 text-slate-700 dark:text-slate-300" : ""
              )}
            >
              {direction}
            </span>
          )}
        </Flex>
        <Text size="4" weight="bold" className="leading-tight font-mono tracking-tight">{formatNumber(value)}</Text>
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
}

function Dashboard({
  data,
  accountName,
  viewMode,
  postDetailsById,
  loadingPostId,
  onRequestPostDetail,
  hasMorePosts,
  loadingMorePosts,
  onLoadMorePosts,
}: {
  data: OrganicMetricsResponse;
  accountName?: string | null;
  viewMode: MetricsViewMode;
  postDetailsById?: Record<string, OrganicPost>;
  loadingPostId?: string | null;
  onRequestPostDetail?: (postId: string) => void;
  hasMorePosts?: boolean;
  loadingMorePosts?: boolean;
  onLoadMorePosts?: () => void;
}) {
  const [selectedPostId, setSelectedPostId] = React.useState<string | null>(null);
  const [selectedAccountMetric, setSelectedAccountMetric] = React.useState<keyof OrganicMetrics>("reach");
  const [selectedPostMetric, setSelectedPostMetric] = React.useState<PostMetricKey>("views");
  const [drilldownWindow, setDrilldownWindow] = React.useState<DrilldownWindow>("7d");

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
    KPI_CONFIG.find((metric) => metric.key === selectedAccountMetric)?.label ?? String(selectedAccountMetric);
  const isAccountView = viewMode === "account";
  const isPostsView = viewMode === "posts";

  const audienceRadialData = [
    { name: "followers", value: audienceBreakdown.followers, fill: "var(--color-followers)" },
    { name: "nonFollowers", value: audienceBreakdown.nonFollowers, fill: "var(--color-nonFollowers)" },
  ];
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

  const handlePostsScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (viewMode !== "posts" || !hasMorePosts || loadingMorePosts) return;
      const target = event.currentTarget;
      const reachedBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 180;
      if (reachedBottom) {
        onLoadMorePosts?.();
      }
    },
    [hasMorePosts, loadingMorePosts, onLoadMorePosts, viewMode]
  );

  return (
    <Flex
      direction="column"
      gap="3"
      className="min-h-0 rounded-xl border border-blue-200/40 bg-[linear-gradient(160deg,rgba(30,64,175,0.05)_0%,rgba(59,130,246,0.04)_45%,rgba(245,158,11,0.04)_100%)] p-2"
    >
      <Flex align="center" justify="between" wrap="wrap" gap="2">
        <Box>
          <Heading size="2" className="tracking-tight">
            {isAccountView ? "Account Snapshot" : "Posts"}
          </Heading>
          {isAccountView ? (
            <Text size="1" color="gray">At-a-glance metrics with last 24h delta</Text>
          ) : null}
        </Box>
        <Text size="1" color="gray" className="font-mono">
          {data.range.since} - {data.range.until}
        </Text>
      </Flex>

      {isAccountView ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-1.5">
          {KPI_CONFIG.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.key === "profileVisits24h" ? profileVisits24h : metrics[metric.key]}
              comparison={metricComparisonFor(data, metric.key)}
              active={selectedAccountMetric === metric.key}
              ariaLabel={`Account metric ${metric.label}`}
              onClick={() => {
                setSelectedAccountMetric(metric.key);
              }}
            />
          ))}
        </div>
      ) : null}

      {isAccountView ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Card variant="surface" className="border border-subtle bg-surface xl:col-span-2">
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
                      "min-h-11 rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
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
                      "min-h-11 rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
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
                <Text size="2" color="gray">No trend data available for this metric and window.</Text>
              ) : (
                <ChartContainer config={drilldownChartConfig} className="h-56 w-full">
                  <AreaChart data={accountSeries}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(value) => formatShortDate(value)} minTickGap={20} />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-value)"
                      fill="var(--color-value)"
                      fillOpacity={0.22}
                      strokeWidth={2}
                    />
                    {(data.boostedEvents ?? []).map((event) => (
                      <ReferenceLine
                        key={event.id}
                        x={event.date}
                        stroke="#ef4444"
                        strokeDasharray="4 4"
                        label={{ value: "Boost", position: "top", fill: "#ef4444", fontSize: 10 }}
                      />
                    ))}
                  </AreaChart>
                </ChartContainer>
              )}
            </Box>
          </Card>

          <Card variant="surface" className="border border-subtle bg-surface">
            <Box p="3">
              <Heading size="3" mb="2">Followers Breakdown</Heading>
              <ChartContainer config={audienceChartConfig} className="h-52 w-full">
                <RadialBarChart
                  data={audienceRadialData}
                  innerRadius={34}
                  outerRadius={88}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, Math.max(audienceBreakdown.followers, audienceBreakdown.nonFollowers, 1)]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={6} background />
                  <ChartTooltip content={<ChartTooltipContent />} />
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
        </div>
      ) : null}

      {isPostsView ? (
        <>
          <Card variant="surface" className="border border-subtle bg-surface">
            <Box p="3">
              <Flex align="center" justify="between" mb="2" gap="2">
                <Text size="1" color="gray">
                  Select a post to load post-level metrics
                </Text>
                <Badge color="blue" variant="soft">@{accountName ?? data.accountId}</Badge>
              </Flex>

              {(data.posts ?? []).length === 0 ? (
                <Text size="2" color="gray">No posts were returned for this account.</Text>
              ) : (
                <div className="mx-auto w-full max-w-[1780px]">
                  <motion.div
                    layout
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                    className={cn(
                      "grid grid-cols-1 gap-3 lg:items-start",
                      selectedPost ? "lg:grid-cols-[minmax(0,1fr)_420px]" : "lg:grid-cols-1"
                    )}
                  >
                    <motion.div layout className="min-w-0">
                      <div className="mx-auto max-h-[74vh] w-full overflow-y-auto px-1" onScroll={handlePostsScroll}>
                        <div className="columns-1 sm:columns-2 lg:columns-3 2xl:columns-4 [column-gap:0.75rem]">
                          {(data.posts ?? []).map((post) => (
                            <motion.div
                              layout
                              key={post.id}
                              ref={(node) => {
                                postCardRefs.current[post.id] = node;
                              }}
                              className="mb-3 break-inside-avoid"
                            >
                              <PostGalleryCard
                                post={post}
                                selected={selectedPostId === post.id}
                                loading={loadingPostId === post.id}
                                onSelect={() => {
                                  setSelectedPostId(post.id);
                                }}
                              />
                            </motion.div>
                          ))}
                        </div>
                        <div className="flex items-center justify-center py-3">
                          {loadingMorePosts ? (
                            <Text size="1" color="gray">Loading previous 7d...</Text>
                          ) : hasMorePosts ? (
                            <Text size="1" color="gray">Scroll for previous 7d</Text>
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
  const [platform, setPlatform] = React.useState<MetricsPlatform>(initialPlatform);
  const [viewMode, setViewMode] = React.useState<MetricsViewMode>("account");
  const [rangePreset, setRangePreset] = React.useState<OrganicDateRangePreset>(DEFAULT_RANGE_PRESET);
  const [reloadTick, setReloadTick] = React.useState(0);
  const manualRefreshRef = React.useRef(false);
  const [postDetailsById, setPostDetailsById] = React.useState<Record<string, OrganicPost>>({});
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
  }>({
    instagram: accountsByPlatform.instagram[0]?.integrationAccountId ?? null,
    facebook: accountsByPlatform.facebook[0]?.integrationAccountId ?? null,
  });
  const [state, setState] = React.useState<LoadState>({ status: "idle" });

  const platformAccounts = platform === "facebook"
    ? accountsByPlatform.facebook
    : accountsByPlatform.instagram;

  const selectedAccountId = platform === "facebook"
    ? selectedAccountByPlatform.facebook
    : selectedAccountByPlatform.instagram;

  const selectedAccount =
    platformAccounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  const fetchPostsWindow = React.useCallback(
    async (params: { accountId: string; weekOffset: number; forceRefresh: boolean }) => {
      const { accountId, weekOffset, forceRefresh } = params;
      const window = postWindowRange(weekOffset);
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
    loadedPostDetailIdsRef.current.clear();
    loadingPostDetailIdsRef.current.clear();
    setPostDetailsById({});
    setLoadingPostId(null);
    setPostGalleryPosts([]);
    setPostWindowOffset(0);
    setHasMorePostWindows(false);
    setLoadingMorePostWindows(false);
  }, [platform, selectedAccountId, viewMode]);

  const requestPostDetail = React.useCallback(
    async (postId: string) => {
      if (viewMode !== "posts" || !selectedAccountId || postId.length === 0) return;
      if (loadedPostDetailIdsRef.current.has(postId)) return;
      if (loadingPostDetailIdsRef.current.has(postId)) return;

      loadingPostDetailIdsRef.current.add(postId);
      setLoadingPostId(postId);
      try {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId: selectedAccountId,
          platform,
          range: { preset: "last_30d" },
          scope: "posts",
          selectedPostId: postId,
          forceRefresh: false,
        });

        const detailedPost = (data.posts ?? []).find((post) => post.id === postId);
        if (detailedPost) {
          loadedPostDetailIdsRef.current.add(postId);
          setPostDetailsById((current) => ({
            ...current,
            [postId]: detailedPost,
          }));
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
        weekOffset: nextOffset,
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
      setPostDetailsById({});
      setLoadingPostId(null);
    }
    manualRefreshRef.current = true;
    setReloadTick((tick) => tick + 1);
  }, [viewMode]);

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

    if (
      !selectedAccountByPlatform.instagram ||
      !platformAccounts.some((item) => item.integrationAccountId === selectedAccountByPlatform.instagram)
    ) {
      setSelectedAccountByPlatform((current) => ({ ...current, instagram: firstPlatformAccountId }));
    }
  }, [platform, platformAccounts, selectedAccountByPlatform.facebook, selectedAccountByPlatform.instagram]);

  React.useEffect(() => {
    if (!selectedAccountId) {
      setState({ status: "idle" });
      return;
    }
    const accountId = selectedAccountId;

    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const forceRefresh = manualRefreshRef.current;
        manualRefreshRef.current = false;
        let data: OrganicMetricsResponse;
        if (viewMode === "posts") {
          const postsData = await fetchPostsWindow({
            accountId,
            weekOffset: 0,
            forceRefresh,
          });
          if (!postsData) {
            setState({ status: "error", message: "Unable to load post windows for the selected range." });
            return;
          }
          data = postsData;
        } else {
          data = await fetchOrganicAnalytics({
            brandId,
            integrationAccountId: accountId,
            platform,
            range: { preset: rangePreset },
            scope: "account",
            forceRefresh,
          });
        }

        if (cancelled) return;
        if (viewMode === "posts") {
          const initialPosts = data.posts ?? [];
          setPostGalleryPosts(initialPosts);
          setPostWindowOffset(0);
          setHasMorePostWindows(postWindowRange(1) !== null);
          setLoadingMorePostWindows(false);
        }
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
        setState({ status: "error", message });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [brandId, fetchPostsWindow, platform, rangePreset, reloadTick, selectedAccountId, viewMode]);

  const dashboardData =
    state.status === "success"
      ? viewMode === "posts"
        ? { ...state.data, posts: postGalleryPosts }
        : state.data
      : null;

  return (
    <Card variant="surface" className="border border-subtle bg-surface h-full flex flex-col">
      <Box p="4" className="flex-1 min-h-0 flex flex-col">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="2" wrap="wrap">
            <Badge color="gray" variant="soft" radius="full">
              <PlatformIcon platform={platform} />
            </Badge>
            <Box>
              <Text weight="medium" style={{ textTransform: "capitalize" }}>
                {platform} organic reporting
              </Text>
              <Text color="gray" size="2">
                {viewMode === "posts" ? "Rolling 7d windows (up to 3 months)" : rangeLabel(rangePreset)}
              </Text>
            </Box>
          </Flex>

          <Flex align="center" gap="2" wrap="wrap">
            <Select.Root value={platform} onValueChange={(value) => setPlatform(value as MetricsPlatform)}>
              <Select.Trigger variant="surface" radius="large" style={{ width: "130px" }}>
                {platform === "facebook" ? "Facebook" : "Instagram"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="instagram">Instagram</Select.Item>
                <Select.Item value="facebook">Facebook Pages</Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root
              value={rangePreset}
              onValueChange={(value) => setRangePreset(value as OrganicDateRangePreset)}
            >
              <Select.Trigger
                variant="surface"
                radius="large"
                style={{ width: "130px" }}
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
              <Select.Trigger variant="surface" radius="large" style={{ minWidth: "230px" }}>
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
              className="gap-0"
            >
              <TabsList className="h-10 rounded-lg border border-subtle bg-muted/20 p-1">
                <TabsTrigger value="account" className="px-4 text-xs">Account</TabsTrigger>
                <TabsTrigger value="posts" className="px-4 text-xs">Posts</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant="surface"
              radius="large"
              onClick={handleRefresh}
              disabled={!selectedAccountId || state.status === "loading"}
              aria-label="Refresh organic analytics"
            >
              <ReloadIcon className={cn(state.status === "loading" && "animate-spin")} />
              Refresh
            </Button>
          </Flex>
        </Flex>

        <Box pt="3" className="flex-1 min-h-0 overflow-y-auto">
          {platformAccounts.length === 0 ? (
            <Callout.Root color="blue" variant="surface">
              <Callout.Text>
                No {platform} accounts are linked to this brand profile.
              </Callout.Text>
            </Callout.Root>
          ) : state.status === "loading" ? (
            <OrganicMetricsWidgetSkeleton />
          ) : state.status === "error" ? (
            <Callout.Root color="red" variant="surface">
              <Callout.Text>{state.message}</Callout.Text>
            </Callout.Root>
          ) : state.status === "success" && dashboardData ? (
            <Dashboard
              data={dashboardData}
              accountName={selectedAccount?.name}
              viewMode={viewMode}
              postDetailsById={postDetailsById}
              loadingPostId={loadingPostId}
              onRequestPostDetail={requestPostDetail}
              hasMorePosts={hasMorePostWindows}
              loadingMorePosts={loadingMorePostWindows}
              onLoadMorePosts={loadMorePostWindow}
            />
          ) : (
            <Text color="gray" size="2">Select an account to view organic reporting.</Text>
          )}
        </Box>
      </Box>
    </Card>
  );
}
