"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  DotsHorizontalIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import type { UTCTimestamp } from "lightweight-charts";

import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDCOActionLogs } from "@/hooks/useDCOActionLogs";
import { useTimelineBlocks } from "@/hooks/timeline/useTimelineBlocks";
import type { ActionLog } from "@/lib/types/dco";
import {
  buildCampaignIndexAggregate,
  type CampaignIndexRecord,
} from "@/lib/paid-media/campaign-indexes";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AdSet } from "./AdSetTable";
import { mapActionLogsToTimelineMarkers } from "./actionMarkers";
import { CreativeHoverCard } from "./creatives/CreativeHoverCard";
import { CreativeRotationSheet } from "./creatives/CreativeRotationSheet";
import { CREATIVE_SWAP_ACTION_TYPES, type OpenCreativeDetail } from "./creatives/types";
import dynamic from "next/dynamic";
import type {
  ObservabilityChartMarkerSelection,
  ObservabilityChartPoint,
  ObservabilityChartSeries,
} from "./ObservabilityLightweightChart";

const ObservabilityLightweightChart = dynamic(
  () => import("./ObservabilityLightweightChart").then((mod) => mod.ObservabilityLightweightChart),
  { ssr: false }
);
import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "./PerformanceDetails";
import { resolveTimeRangeWindow, toMetricsRange, type PaidMediaTimeRange } from "./timeRange";

type TimelineResolution = "daily" | "hourly";
type MetricKey = "spend" | "roas" | "ctr" | "cpc" | "cpa" | "impressions" | "clicks";
type ViewMode = "campaigns" | "adsets";
type Scope = { type: "campaign"; id: string } | { type: "index"; id: string };
type CampaignSearchFilter = "all" | "active" | "paused";
type RailEntityFilter = "all" | "campaigns" | "indexes";
type HourlySliceOption = "all" | 6 | 12 | 24 | 48;

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  metrics?: {
    spend: number;
    roas: number;
    ctr: number;
    cpc: number;
    cpa: number;
    impressions: number;
    clicks: number;
  };
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
};

type ScopedAdSet = AdSet & {
  campaignId: string;
  campaignName: string;
};

type AdMetrics = {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpa: number;
  impressions: number;
  clicks: number;
};

type MetaAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus?: string;
  adsetId?: string;
  campaignId?: string | null;
  previewShareableLink?: string | null;
  metrics?: AdMetrics | null;
  trends?: PaidMetricsTrendPoint[];
  creative?: {
    id: string;
    name?: string | null;
    title?: string | null;
    body?: string | null;
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
    callToActionType?: string | null;
  } | null;
};

type AdSetAdsLoadState = {
  status: "idle" | "loading" | "success" | "error";
  ads: MetaAd[];
  errorMessage?: string;
};

type AdSetLoadState = {
  status: "idle" | "loading" | "success" | "error";
  adSets: ScopedAdSet[];
  source?: "live" | "timeline";
  errorMessage?: string;
};

type CompareEntity = {
  key: string;
  label: string;
  type: "index" | "campaign";
  trends: PaidMetricsTrendPoint[];
  metrics?: Partial<Record<MetricKey, number>>;
  comparison?: PaidMetricsComparison;
};

type CampaignAdSetWorkspaceProps = {
  brandId: string;
  accountId: string;
  campaigns: Campaign[];
  campaignIndexes: CampaignIndexRecord[];
  selectedCampaignIndexId: string;
  alertsRefreshTick?: number;
  onSelectedCampaignIndexChange?: (indexId: string) => void;
  timeRange: PaidMediaTimeRange;
  resolution: TimelineResolution;
  onResolutionChange: (value: TimelineResolution) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  onSelectedCampaignChange?: (campaignId: string | undefined) => void;
  onEditCampaignIndex?: (indexId: string) => void;
  onDeleteCampaignIndex?: (indexId: string) => void;
  toolbarSlot?: React.ReactNode;
};

const METRICS: MetricKey[] = ["spend", "roas", "ctr", "cpc", "cpa", "impressions", "clicks"];
const COMPARE_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f97316",
  "#7B6BFF",
  "#ef4444",
  "#14b8a6",
  "#84cc16",
  "#f59e0b",
];

const METRIC_CARD_COLORS: Record<MetricKey, string> = {
  spend: "#0ea5e9",
  roas: "#10b981",
  ctr: "#7B6BFF",
  cpc: "#f97316",
  cpa: "#f43f5e",
  impressions: "#14b8a6",
  clicks: "#84cc16",
};

const CHART_HEIGHT_CLASS = "h-[clamp(260px,42svh,460px)]";
const RAIL_HEIGHT_CLASS = "h-full";
const RAIL_SCROLL_HEIGHT_CLASS = "h-full";
const HOURLY_SLICE_OPTIONS: HourlySliceOption[] = [6, 12, 24, 48, "all"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDeltaPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatMetric(metric: MetricKey, value: number): string {
  if (metric === "spend" || metric === "cpc" || metric === "cpa") return formatCurrency(value);
  if (metric === "roas") return value.toFixed(2);
  if (metric === "ctr") return formatPercent(value);
  return formatNumber(value);
}

function labelForMetric(metric: MetricKey): string {
  switch (metric) {
    case "spend":
      return "Spend";
    case "roas":
      return "ROAS";
    case "ctr":
      return "CTR";
    case "cpc":
      return "CPC";
    case "cpa":
      return "CPA";
    case "impressions":
      return "Impressions";
    case "clicks":
      return "Clicks";
    default:
      return metric;
  }
}

function isActiveStatus(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "ACTIVE";
}

function toMetricValue(point: PaidMetricsTrendPoint, metric: MetricKey): number {
  if (metric === "spend") return point.spend ?? 0;
  if (metric === "roas") return point.roas ?? 0;
  if (metric === "impressions") return point.impressions ?? 0;
  if (metric === "clicks") return point.clicks ?? 0;

  if (metric === "ctr") {
    if (typeof point.ctr_pct === "number") return point.ctr_pct;
    const impressions = point.impressions ?? 0;
    const clicks = point.clicks ?? 0;
    return impressions > 0 ? (clicks / impressions) * 100 : 0;
  }

  if (metric === "cpc") {
    if (typeof point.cpc === "number") return point.cpc;
    const clicks = point.clicks ?? 0;
    const spend = point.spend ?? 0;
    return clicks > 0 ? spend / clicks : 0;
  }

  if (metric === "cpa") {
    if (typeof point.cpa === "number") return point.cpa;
    const conversions = point.conversions ?? 0;
    const spend = point.spend ?? 0;
    return conversions > 0 ? spend / conversions : 0;
  }

  return 0;
}

function toUtcTimestamp(isoDate: string): UTCTimestamp | null {
  const ms = Date.parse(isoDate);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function mapTrendPoints(
  trends: PaidMetricsTrendPoint[] | undefined,
  metric: MetricKey
): ObservabilityChartPoint[] {
  if (!trends?.length) return [];

  const deduped = new Map<number, number>();
  trends.forEach((point) => {
    const time = toUtcTimestamp(point.date);
    if (!time) return;
    deduped.set(Number(time), toMetricValue(point, metric));
  });

  return Array.from(deduped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

function latestMetricValue(
  metric: MetricKey,
  metrics?: Partial<Record<MetricKey, number>>,
  trends?: PaidMetricsTrendPoint[]
): number {
  const direct = metrics?.[metric];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  if (!trends?.length) return 0;
  for (let index = trends.length - 1; index >= 0; index -= 1) {
    const value = toMetricValue(trends[index], metric);
    if (Number.isFinite(value)) return value;
  }

  return 0;
}

function metricPercentageChange(metric: MetricKey, comparison?: PaidMetricsComparison): number | undefined {
  const value = comparison?.[metric]?.percentageChange;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function trendPercentageChange(points: ObservabilityChartPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return undefined;
  if (first === 0) return last === 0 ? 0 : undefined;
  return ((last - first) / Math.abs(first)) * 100;
}

function scopedAdSetKey(adSet: ScopedAdSet): string {
  return `${adSet.campaignId}:${adSet.id}`;
}

function averageTrendPoints(pointSets: ObservabilityChartPoint[][]): ObservabilityChartPoint[] {
  if (pointSets.length === 0) return [];
  const byTime = new Map<number, { sum: number; count: number }>();

  pointSets.forEach((points) => {
    points.forEach((point) => {
      const key = Number(point.time);
      const current = byTime.get(key);
      if (current) {
        current.sum += point.value;
        current.count += 1;
        return;
      }
      byTime.set(key, { sum: point.value, count: 1 });
    });
  });

  return Array.from(byTime.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([time, agg]) => ({
      time: time as UTCTimestamp,
      value: agg.count > 0 ? agg.sum / agg.count : 0,
    }));
}

type AggregatedMetricsContext = {
  metrics: Partial<Record<MetricKey, number>>;
  comparison: PaidMetricsComparison;
  trends: PaidMetricsTrendPoint[];
};

type AggregatableEntity = {
  metrics?: Partial<Record<MetricKey, number>>;
  comparison?: PaidMetricsComparison;
  trends?: PaidMetricsTrendPoint[];
};

type MarkerTarget = {
  time: UTCTimestamp;
  scopeType?: string;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  actionType?: string;
  sourceLogId?: string;
};

type PendingMarkerSelection = {
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  time: UTCTimestamp;
  actionType?: string;
  sourceLogId?: string;
};

function markerScopeRank(scopeType: string | undefined): number {
  if (scopeType === "AD") return 3;
  if (scopeType === "ADSET") return 2;
  if (scopeType === "CAMPAIGN") return 1;
  return 0;
}

function resolveMarkerTarget(selection: ObservabilityChartMarkerSelection): MarkerTarget | null {
  const sorted = selection.markers
    .slice()
    .sort((left, right) => {
      const rankDelta = markerScopeRank(right.scopeType) - markerScopeRank(left.scopeType);
      if (rankDelta !== 0) return rankDelta;
      return Number(right.time) - Number(left.time);
    });

  const primary = sorted[0] ?? selection.marker;
  if (!primary) return null;

  const creativeSwapMarker = sorted.find(
    (marker) =>
      typeof marker.actionType === "string" &&
      (CREATIVE_SWAP_ACTION_TYPES as ReadonlyArray<string>).includes(marker.actionType)
  );

  return {
    time: selection.time,
    scopeType: primary.scopeType,
    campaignId: primary.campaignId ?? null,
    adSetId: primary.adSetId ?? null,
    adId: primary.adId ?? null,
    actionType: creativeSwapMarker?.actionType ?? primary.actionType,
    sourceLogId: creativeSwapMarker?.sourceLogId ?? primary.sourceLogId,
  };
}

export function buildAggregatedMetricsContext(
  entities: AggregatableEntity[]
): AggregatedMetricsContext | undefined {
  if (entities.length === 0) return undefined;

  const aggregate = buildCampaignIndexAggregate(
    entities.map((entity, index) => ({
      id: `aggregate-${index}`,
      metrics: entity.metrics,
      comparison: entity.comparison,
      trends: entity.trends,
    }))
  );
  const spendContributors = entities.filter((entity) => typeof entity.metrics?.spend === "number").length;
  const comparison: PaidMetricsComparison = { ...aggregate.comparison };
  if (aggregate.comparison.spend) {
    comparison.spend = {
      ...aggregate.comparison.spend,
      current:
        spendContributors > 0
          ? aggregate.comparison.spend.current / spendContributors
          : aggregate.comparison.spend.current,
      previous:
        spendContributors > 0
          ? aggregate.comparison.spend.previous / spendContributors
          : aggregate.comparison.spend.previous,
    };
  }

  return {
    metrics: {
      ...aggregate.metrics,
      spend: spendContributors > 0 ? aggregate.metrics.spend / spendContributors : aggregate.metrics.spend,
    },
    comparison,
    trends: aggregate.trends.map((point) => ({
      ...point,
      spend: spendContributors > 0 && typeof point.spend === "number" ? point.spend / spendContributors : point.spend,
    })),
  };
}

function getDcoManagedCampaignIds(
  timelineCampaigns: Array<{ id: string; ad_sets?: Array<{ ads?: unknown[] }> }>
): string[] {
  const explicitManagedIds = timelineCampaigns
    .filter((campaign) =>
      campaign.ad_sets?.some((adSet) => Array.isArray(adSet.ads) && adSet.ads.length > 0)
    )
    .map((campaign) => campaign.id);

  if (explicitManagedIds.length > 0) {
    return explicitManagedIds;
  }

  return Array.from(new Set(timelineCampaigns.map((campaign) => campaign.id)));
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  if (items.length === 0) return [];

  const safeLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<U>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(Array.from({ length: safeLimit }, () => worker()));
  return results;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

type CompareSelectionNormalizationResult = {
  nextKeys: string[];
  seeded: boolean;
};

export function normalizeCompareSelection({
  currentKeys,
  availableKeys,
  allKeys,
  selectedCampaignIndexId,
  seeded,
}: {
  currentKeys: string[];
  availableKeys: Set<string>;
  allKeys: string[];
  selectedCampaignIndexId: string;
  seeded: boolean;
}): CompareSelectionNormalizationResult {
  const valid = currentKeys.filter((key) => availableKeys.has(key));

  if (seeded) {
    return { nextKeys: valid, seeded: true };
  }

  if (valid.length > 0) {
    return { nextKeys: valid, seeded: true };
  }

  if (selectedCampaignIndexId !== "all") {
    const selectedIndexKey = `index:${selectedCampaignIndexId}`;
    if (availableKeys.has(selectedIndexKey)) {
      return { nextKeys: [selectedIndexKey], seeded: true };
    }
  }

  const firstIndex = allKeys.find((key) => key.startsWith("index:"));
  if (firstIndex) {
    return { nextKeys: [firstIndex], seeded: true };
  }

  const firstCampaign = allKeys.find((key) => key.startsWith("campaign:"));
  if (firstCampaign) {
    return { nextKeys: [firstCampaign], seeded: true };
  }

  return { nextKeys: [], seeded: true };
}

export function toHourlySliceSeconds(slice: HourlySliceOption): number | null {
  if (slice === "all") return null;
  return slice * 60 * 60;
}

export function CampaignAdSetWorkspace({
  brandId,
  accountId,
  campaigns,
  campaignIndexes,
  selectedCampaignIndexId,
  alertsRefreshTick,
  onSelectedCampaignIndexChange,
  timeRange,
  resolution,
  onResolutionChange,
  activeOnly,
  onActiveOnlyChange,
  onSelectedCampaignChange,
  onEditCampaignIndex,
  onDeleteCampaignIndex,
  toolbarSlot,
}: CampaignAdSetWorkspaceProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("campaigns");
  const [campaignQuery, setCampaignQuery] = React.useState("");
  const [campaignSearchFilter, setCampaignSearchFilter] = React.useState<CampaignSearchFilter>("all");
  const [railEntityFilter, setRailEntityFilter] = React.useState<RailEntityFilter>("all");
  const [decomposeIndexes, setDecomposeIndexes] = React.useState(false);
  const [scope, setScope] = React.useState<Scope | undefined>();
  const [campaignMetric, setCampaignMetric] = React.useState<MetricKey>("spend");
  const [adSetMetric, setAdSetMetric] = React.useState<MetricKey>("spend");
  const [hourlySlice, setHourlySlice] = React.useState<HourlySliceOption>(24);
  const [selectedCompareKeys, setSelectedCompareKeys] = React.useState<string[]>([]);
  const [selectedAdSetKeys, setSelectedAdSetKeys] = React.useState<string[]>([]);
  const [focusedAdSetKey, setFocusedAdSetKey] = React.useState<string | undefined>();
  const [showSelectedAdSetAverage, setShowSelectedAdSetAverage] = React.useState(false);
  const [showSelectedAdSetLines, setShowSelectedAdSetLines] = React.useState(true);
  const [adSetsByCampaign, setAdSetsByCampaign] = React.useState<Record<string, AdSetLoadState>>({});
  const [adsByAdSet, setAdsByAdSet] = React.useState<Record<string, AdSetAdsLoadState>>({});
  const [selectedAdIds, setSelectedAdIds] = React.useState<string[]>([]);
  const [campaignChartFocusTime, setCampaignChartFocusTime] = React.useState<UTCTimestamp | null>(null);
  const [adSetChartFocusTime, setAdSetChartFocusTime] = React.useState<UTCTimestamp | null>(null);
  const [openCreativeDetail, setOpenCreativeDetail] = React.useState<OpenCreativeDetail | null>(null);
  const hasSeededCompareSelectionRef = React.useRef(false);
  const inFlightAdLoadsRef = React.useRef(new Set<string>());
  const pendingMarkerSelectionRef = React.useRef<PendingMarkerSelection | null>(null);
  const timeWindow = React.useMemo(() => resolveTimeRangeWindow(timeRange), [timeRange]);
  const metricsRange = React.useMemo(() => toMetricsRange(timeRange), [timeRange]);

  const startDateIso = React.useMemo(() => `${timeWindow.since}T00:00:00.000Z`, [timeWindow.since]);
  const endDateIso = React.useMemo(() => `${timeWindow.until}T23:59:59.999Z`, [timeWindow.until]);

  const { campaigns: timelineCampaigns } = useTimelineBlocks({
    brandId,
    accountId,
    startDate: startDateIso,
    endDate: endDateIso,
    resolution,
  });

  const dcoManagedCampaignIds = React.useMemo(
    () => getDcoManagedCampaignIds(timelineCampaigns),
    [timelineCampaigns]
  );

  const { logs: actionLogs, setFilters: setActionLogFilters, refresh: refreshActionLogs } = useDCOActionLogs({
    brandId,
    metaAccountId: accountId,
    initialPageSize: 120,
    initialDateRangeDays: timeWindow.dayCount,
  });
  const refreshActionLogsRef = React.useRef(refreshActionLogs);

  React.useEffect(() => {
    refreshActionLogsRef.current = refreshActionLogs;
  }, [refreshActionLogs]);

  React.useEffect(() => {
    if (!alertsRefreshTick) return;
    refreshActionLogsRef.current();
  }, [alertsRefreshTick]);

  React.useEffect(() => {
    setActionLogFilters({
      metaAccountId: accountId,
      campaignId: undefined,
      scopeType: undefined,
      status: undefined,
      actionType: undefined,
    });
  }, [accountId, setActionLogFilters]);

  const timelineFallbackByCampaign = React.useMemo(() => {
    return timelineCampaigns.reduce<Record<string, ScopedAdSet[]>>((acc, campaign) => {
      const fallback = (campaign.ad_sets ?? [])
        .filter((adSet) => Boolean(adSet.id))
        .map((adSet) => ({
          id: adSet.id!,
          name: adSet.name ?? adSet.id!,
          status: "UNKNOWN",
          campaignId: campaign.id,
          campaignName: campaign.name ?? campaign.id,
        }));

      acc[campaign.id] = fallback;
      return acc;
    }, {});
  }, [timelineCampaigns]);

  const eligibleCampaigns = React.useMemo(() => {
    const managedSet = new Set(dcoManagedCampaignIds);

    return [...campaigns]
      .filter((campaign) => {
        if (activeOnly && !isActiveStatus(campaign.status)) return false;
        if (resolution === "hourly" && !managedSet.has(campaign.id)) return false;
        return true;
      })
      .sort((left, right) => {
        const leftActive = isActiveStatus(left.status) ? 0 : 1;
        const rightActive = isActiveStatus(right.status) ? 0 : 1;
        if (leftActive !== rightActive) return leftActive - rightActive;
        return (right.metrics?.spend ?? 0) - (left.metrics?.spend ?? 0);
      });
  }, [activeOnly, campaigns, dcoManagedCampaignIds, resolution]);

  const filteredCampaigns = React.useMemo(() => {
    const normalized = campaignQuery.trim().toLowerCase();
    return eligibleCampaigns.filter((campaign) => {
      const status = (campaign.status ?? "").toUpperCase();
      if (campaignSearchFilter === "active" && status !== "ACTIVE") return false;
      if (campaignSearchFilter === "paused" && status === "ACTIVE") return false;
      if (!normalized) return true;

      const haystack = [
        campaign.name,
        campaign.id,
        campaign.status,
        campaign.objective ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [campaignQuery, campaignSearchFilter, eligibleCampaigns]);

  const campaignById = React.useMemo(
    () => new Map(eligibleCampaigns.map((campaign) => [campaign.id, campaign])),
    [eligibleCampaigns]
  );

  const indexCards = React.useMemo(() => {
    return campaignIndexes
      .map((index) => {
        const members = eligibleCampaigns.filter((campaign) => index.campaignIds.includes(campaign.id));
        const aggregate = buildCampaignIndexAggregate(members);

        return {
          index,
          members,
          aggregate,
          isSelected: selectedCampaignIndexId === index.id,
        };
      })
      .filter((entry) => entry.members.length > 0)
      .sort((left, right) => Number(right.isSelected) - Number(left.isSelected));
  }, [campaignIndexes, eligibleCampaigns, selectedCampaignIndexId]);

  const filteredIndexCards = React.useMemo(() => {
    const normalized = campaignQuery.trim().toLowerCase();
    if (!normalized) return indexCards;
    return indexCards.filter((entry) => {
      const haystack = [entry.index.name, entry.index.id, ...entry.members.map((member) => member.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [campaignQuery, indexCards]);

  const compareEntities = React.useMemo(() => {
    const indexEntities: CompareEntity[] = indexCards.map((entry) => ({
      key: `index:${entry.index.id}`,
      label: entry.index.name,
      type: "index",
      trends: entry.aggregate.trends,
      metrics: entry.aggregate.metrics,
      comparison: entry.aggregate.comparison,
    }));

    const campaignEntities: CompareEntity[] = eligibleCampaigns.map((campaign) => ({
      key: `campaign:${campaign.id}`,
      label: campaign.name,
      type: "campaign",
      trends: campaign.trends ?? [],
      metrics: campaign.metrics,
      comparison: campaign.comparison,
    }));

    return [...indexEntities, ...campaignEntities];
  }, [eligibleCampaigns, indexCards]);

  const compareEntityByKey = React.useMemo(() => {
    return new Map(compareEntities.map((entity) => [entity.key, entity]));
  }, [compareEntities]);

  const allCompareKeys = React.useMemo(() => compareEntities.map((entity) => entity.key), [compareEntities]);

  React.useEffect(() => {
    setSelectedCompareKeys((current) => {
      const normalized = normalizeCompareSelection({
        currentKeys: current,
        availableKeys: new Set(compareEntityByKey.keys()),
        allKeys: allCompareKeys,
        selectedCampaignIndexId,
        seeded: hasSeededCompareSelectionRef.current,
      });
      hasSeededCompareSelectionRef.current = normalized.seeded;
      if (areStringArraysEqual(current, normalized.nextKeys)) {
        return current;
      }
      return normalized.nextKeys;
    });
  }, [allCompareKeys, compareEntityByKey, selectedCampaignIndexId]);

  const selectedCompareSet = React.useMemo(() => new Set(selectedCompareKeys), [selectedCompareKeys]);

  const selectedCompareEntities = React.useMemo(() => {
    return selectedCompareKeys
      .map((key) => compareEntityByKey.get(key))
      .filter((entity): entity is CompareEntity => Boolean(entity));
  }, [compareEntityByKey, selectedCompareKeys]);

  const compareColorByKey = React.useMemo(() => {
    return new Map(
      selectedCompareEntities.map((entity, index) => [
        entity.key,
        COMPARE_COLORS[index % COMPARE_COLORS.length],
      ])
    );
  }, [selectedCompareEntities]);

  const actionLogsByCampaignId = React.useMemo(() => {
    const map = new Map<string, ActionLog[]>();
    actionLogs.forEach((log) => {
      const campaignId =
        log.metaCampaignId ??
        (log.scopeType === "CAMPAIGN" && log.scopeId ? log.scopeId : undefined);
      if (!campaignId) return;
      const existing = map.get(campaignId);
      if (existing) {
        existing.push(log);
        return;
      }
      map.set(campaignId, [log]);
    });
    return map;
  }, [actionLogs]);

  const actionLogsByAdSetId = React.useMemo(() => {
    const map = new Map<string, ActionLog[]>();
    actionLogs.forEach((log) => {
      const adSetId = log.metaAdsetId ?? (log.scopeType === "ADSET" && log.scopeId ? log.scopeId : undefined);
      if (!adSetId) return;
      const existing = map.get(adSetId);
      if (existing) {
        existing.push(log);
        return;
      }
      map.set(adSetId, [log]);
    });
    return map;
  }, [actionLogs]);

  const compareChartSeries = React.useMemo<ObservabilityChartSeries[]>(() => {
    return selectedCompareEntities
      .map((entity, index) => {
        const points = mapTrendPoints(entity.trends, campaignMetric);
        const campaignIds =
          entity.type === "campaign"
            ? [entity.key.replace("campaign:", "")]
            : indexCards.find((entry) => `index:${entry.index.id}` === entity.key)?.members.map((member) => member.id) ?? [];
        const logs = campaignIds.flatMap((campaignId) => actionLogsByCampaignId.get(campaignId) ?? []);
        const markerLogs = Array.from(new Map(logs.map((log) => [log.id, log])).values());

        return {
          id: entity.key,
          label: entity.label,
          color: compareColorByKey.get(entity.key) ?? COMPARE_COLORS[index % COMPARE_COLORS.length],
          points,
          markers: mapActionLogsToTimelineMarkers(markerLogs, points, resolution, { viewLayer: "campaign" }),
          variant: "line" as const,
          emphasized: index === 0,
          dashed: index > 0,
        };
      })
      .filter((entry) => entry.points.length > 0);
  }, [actionLogsByCampaignId, campaignMetric, compareColorByKey, indexCards, resolution, selectedCompareEntities]);

  const selectedCompareSummary = React.useMemo(() => {
    if (selectedCompareEntities.length === 0) return undefined;
    if (selectedCompareEntities.length === 1) {
      const [entity] = selectedCompareEntities;
      return entity.type === "index" ? `Index · ${entity.label}` : entity.label;
    }
    return `${selectedCompareEntities.length} selected entities`;
  }, [selectedCompareEntities]);

  const aggregatedCampaignContext = React.useMemo(
    () => buildAggregatedMetricsContext(selectedCompareEntities),
    [selectedCompareEntities]
  );

  const campaignMetricCards = React.useMemo(() => {
    return METRICS.map((metric) => {
      const spark = mapTrendPoints(aggregatedCampaignContext?.trends, metric);
      return {
        metric,
        label: labelForMetric(metric),
        value: latestMetricValue(metric, aggregatedCampaignContext?.metrics, aggregatedCampaignContext?.trends),
        color: METRIC_CARD_COLORS[metric],
        spark,
        changePct:
          metricPercentageChange(metric, aggregatedCampaignContext?.comparison) ??
          trendPercentageChange(spark),
      };
    });
  }, [
    aggregatedCampaignContext?.comparison,
    aggregatedCampaignContext?.metrics,
    aggregatedCampaignContext?.trends,
  ]);

  const toggleCompareEntity = React.useCallback((key: string) => {
    const isRemoving = selectedCompareKeys.includes(key);
    setSelectedCompareKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
    if (isRemoving && scope && key === `${scope.type}:${scope.id}`) {
      setScope(undefined);
      onSelectedCampaignChange?.(undefined);
    }
  }, [onSelectedCampaignChange, scope, selectedCompareKeys]);

  const showAllEntityOptions = React.useCallback(() => {
    setRailEntityFilter("all");
  }, []);

  const handleResolutionChange = React.useCallback(
    (value: TimelineResolution) => {
      onResolutionChange(value);
      if (value === "hourly") {
        setHourlySlice(24);
      }
    },
    [onResolutionChange]
  );

  const chartVisibleWindowSeconds = React.useMemo(() => {
    if (resolution !== "hourly") return null;
    return toHourlySliceSeconds(hourlySlice);
  }, [hourlySlice, resolution]);

  const loadCampaignAdSets = React.useCallback(
    async (campaign: Campaign) => {
      const existing = adSetsByCampaign[campaign.id];
      if (existing?.status === "loading" || existing?.status === "success") {
        return;
      }

      const fallbackAdSets = timelineFallbackByCampaign[campaign.id] ?? [];
      setAdSetsByCampaign((prev) => ({
        ...prev,
        [campaign.id]: {
          status: "loading",
          adSets: fallbackAdSets,
          source: fallbackAdSets.length > 0 ? "timeline" : undefined,
        },
      }));

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.functions.invoke(
          `fetch-meta-adsets?brandId=${brandId}&adAccountId=${accountId}&campaignId=${campaign.id}`,
          {
            method: "POST",
            body: {
              brandId,
              adAccountId: accountId,
              campaignId: campaign.id,
            },
          }
        );

        if (error) {
          throw new Error(error.message);
        }

        const rawAdSets: AdSet[] = (data?.adsets ?? []).map((adSet: AdSet) => ({
          ...adSet,
          status: adSet.status ?? "UNKNOWN",
        }));

        const baseAdSets = rawAdSets.length > 0 ? rawAdSets : fallbackAdSets;
        const enriched = await mapWithConcurrency(baseAdSets, 5, async (adSet) => {
          try {
            const response = await fetch("/api/paid-metrics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: "meta",
                brandId,
                accountId,
                campaignId: campaign.id,
                adsetId: adSet.id,
                range: metricsRange,
              }),
            });

            if (!response.ok) {
              return {
                ...adSet,
                campaignId: campaign.id,
                campaignName: campaign.name,
              } as ScopedAdSet;
            }

            const payload = (await response.json()) as {
              metrics?: ScopedAdSet["metrics"];
              comparison?: PaidMetricsComparison;
              trends?: PaidMetricsTrendPoint[];
            };

            return {
              ...adSet,
              metrics: payload.metrics ?? adSet.metrics,
              comparison: payload.comparison ?? adSet.comparison,
              trends: payload.trends ?? adSet.trends,
              campaignId: campaign.id,
              campaignName: campaign.name,
            } as ScopedAdSet;
          } catch {
            return {
              ...adSet,
              campaignId: campaign.id,
              campaignName: campaign.name,
            } as ScopedAdSet;
          }
        });

        setAdSetsByCampaign((prev) => ({
          ...prev,
          [campaign.id]: {
            status: "success",
            adSets: enriched,
            source: rawAdSets.length > 0 ? "live" : "timeline",
          },
        }));
      } catch (error) {
        const fallback = timelineFallbackByCampaign[campaign.id] ?? [];
        setAdSetsByCampaign((prev) => ({
          ...prev,
          [campaign.id]: {
            status: fallback.length > 0 ? "success" : "error",
            adSets: fallback,
            source: fallback.length > 0 ? "timeline" : undefined,
            errorMessage:
              fallback.length > 0
                ? undefined
                : error instanceof Error
                  ? error.message
                  : "Failed to load ad sets",
          },
        }));
      }
    },
    [accountId, adSetsByCampaign, brandId, metricsRange, timelineFallbackByCampaign]
  );

  const loadAdsForAdSet = React.useCallback(
    async (adSetId: string, options?: { force?: boolean }) => {
      if (!adSetId) return;
      const force = options?.force === true;
      const existing = adsByAdSet[adSetId];
      if (!force && (existing?.status === "loading" || existing?.status === "success")) {
        return;
      }
      if (inFlightAdLoadsRef.current.has(adSetId)) {
        return;
      }

      inFlightAdLoadsRef.current.add(adSetId);
      setAdsByAdSet((prev) => ({
        ...prev,
        [adSetId]: {
          status: "loading",
          ads: force ? [] : prev[adSetId]?.ads ?? [],
        },
      }));

      try {
        const supabase = createSupabaseBrowserClient();
        const params = new URLSearchParams({
          brandId,
          adAccountId: accountId,
          adSetId,
          includeTrends: "true",
          trendResolution: "daily",
        });

        if (metricsRange.preset !== "custom") {
          params.set("datePreset", metricsRange.preset);
        }
        if (metricsRange.preset === "custom" && metricsRange.since && metricsRange.until) {
          params.set(
            "timeRange",
            JSON.stringify({
              since: metricsRange.since,
              until: metricsRange.until,
            })
          );
        }

        const { data, error } = await supabase.functions.invoke(`fetch-meta-ads?${params.toString()}`, {
          method: "POST",
          body: {
            brandId,
            adAccountId: accountId,
            adSetId,
            includeTrends: true,
            trendResolution: "daily",
            datePreset: metricsRange.preset !== "custom" ? metricsRange.preset : undefined,
            timeRange:
              metricsRange.preset === "custom" && metricsRange.since && metricsRange.until
                ? {
                    since: metricsRange.since,
                    until: metricsRange.until,
                  }
                : undefined,
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        const ads = Array.isArray(data?.ads) ? (data.ads as MetaAd[]) : [];
        setAdsByAdSet((prev) => ({
          ...prev,
          [adSetId]: {
            status: "success",
            ads,
          },
        }));
      } catch (error) {
        setAdsByAdSet((prev) => ({
          ...prev,
          [adSetId]: {
            status: "error",
            ads: prev[adSetId]?.ads ?? [],
            errorMessage: error instanceof Error ? error.message : "Failed to load ads",
          },
        }));
      } finally {
        inFlightAdLoadsRef.current.delete(adSetId);
      }
    },
    [accountId, adsByAdSet, brandId, metricsRange]
  );

  React.useEffect(() => {
    setAdSetsByCampaign({});
    setAdsByAdSet({});
    setSelectedAdSetKeys([]);
    setFocusedAdSetKey(undefined);
    setSelectedAdIds([]);
    setCampaignChartFocusTime(null);
    setAdSetChartFocusTime(null);
    inFlightAdLoadsRef.current.clear();
    pendingMarkerSelectionRef.current = null;
  }, [accountId, brandId, resolution, timeRange]);

  // Syncs scope FROM selectedCampaignIndexId (parent → child).
  // scope is intentionally excluded from deps: including it creates a circular
  // update loop with the effect below when a second index is clicked in the
  // compare rail (scope → onSelectedCampaignIndexChange → selectedCampaignIndexId
  // → scope → …). Functional setScope updates read current state without
  // requiring scope to be a closed-over dep.
  React.useEffect(() => {
    if (
      selectedCampaignIndexId !== "all" &&
      campaignIndexes.some((index) => index.id === selectedCampaignIndexId)
    ) {
      setScope((current) => {
        if (current?.type === "index" && current.id === selectedCampaignIndexId) return current;
        return { type: "index", id: selectedCampaignIndexId };
      });
      return;
    }

    setScope((current) => {
      if (current !== undefined) return current;
      if (eligibleCampaigns.length === 0) return current;
      return { type: "campaign", id: eligibleCampaigns[0].id };
    });
  }, [campaignIndexes, eligibleCampaigns, selectedCampaignIndexId]);

  // Recovers scope when the user removes the active entity from compare while
  // selectedCampaignIndexId is already "all" — a case where the effect above
  // would not re-run (none of its deps changed).
  React.useEffect(() => {
    if (scope !== undefined) return;
    if (selectedCampaignIndexId !== "all") return;
    if (eligibleCampaigns.length === 0) return;
    setScope({ type: "campaign", id: eligibleCampaigns[0].id });
  }, [scope, eligibleCampaigns, selectedCampaignIndexId]);

  React.useEffect(() => {
    if (!onSelectedCampaignIndexChange) return;
    if (scope?.type === "index") {
      onSelectedCampaignIndexChange(scope.id);
      return;
    }
    onSelectedCampaignIndexChange("all");
  }, [onSelectedCampaignIndexChange, scope]);

  const scopedCampaignIds = React.useMemo(() => {
    if (!scope) return [];

    if (scope.type === "campaign") {
      return campaignById.has(scope.id) ? [scope.id] : [];
    }

    const selectedIndex = campaignIndexes.find((index) => index.id === scope.id);
    if (!selectedIndex) return [];

    return selectedIndex.campaignIds.filter((campaignId) => campaignById.has(campaignId));
  }, [campaignById, campaignIndexes, scope]);

  React.useEffect(() => {
    if (viewMode !== "adsets") return;

    scopedCampaignIds.forEach((campaignId) => {
      const campaign = campaignById.get(campaignId);
      if (!campaign) return;
      void loadCampaignAdSets(campaign);
    });
  }, [campaignById, loadCampaignAdSets, scopedCampaignIds, viewMode]);

  const scopedAdSets = React.useMemo(() => {
    const rows = scopedCampaignIds.flatMap((campaignId) => adSetsByCampaign[campaignId]?.adSets ?? []);
    const filtered = activeOnly ? rows.filter((adSet) => isActiveStatus(adSet.status)) : rows;

    return filtered.sort((left, right) => (right.metrics?.spend ?? 0) - (left.metrics?.spend ?? 0));
  }, [activeOnly, adSetsByCampaign, scopedCampaignIds]);

  const filteredScopedAdSets = React.useMemo(() => {
    const normalized = campaignQuery.trim().toLowerCase();
    if (!normalized) return scopedAdSets;
    return scopedAdSets.filter((adSet) => {
      const haystack = [adSet.name, adSet.id, adSet.campaignName, adSet.status].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [campaignQuery, scopedAdSets]);

  React.useEffect(() => {
    if (scopedAdSets.length === 0) {
      setSelectedAdSetKeys([]);
      setFocusedAdSetKey(undefined);
      return;
    }

    const validKeys = new Set(scopedAdSets.map((adSet) => scopedAdSetKey(adSet)));
    const firstKey = scopedAdSetKey(scopedAdSets[0]);

    setSelectedAdSetKeys((current) => {
      const retained = current.filter((key) => validKeys.has(key));
      if (retained.length > 0) {
        return retained;
      }
      return [firstKey];
    });

    setFocusedAdSetKey((current) => {
      if (current && validKeys.has(current)) {
        return current;
      }
      return firstKey;
    });
  }, [scopedAdSets]);

  React.useEffect(() => {
    if (selectedAdSetKeys.length === 0) {
      setFocusedAdSetKey(undefined);
      return;
    }

    if (focusedAdSetKey && selectedAdSetKeys.includes(focusedAdSetKey)) return;
    setFocusedAdSetKey(selectedAdSetKeys[0]);
  }, [focusedAdSetKey, selectedAdSetKeys]);

  const selectedAdSetSet = React.useMemo(() => new Set(selectedAdSetKeys), [selectedAdSetKeys]);

  const selectedScopedAdSets = React.useMemo(() => {
    return scopedAdSets.filter((adSet) => selectedAdSetSet.has(scopedAdSetKey(adSet)));
  }, [scopedAdSets, selectedAdSetSet]);

  const scopedAdSetById = React.useMemo(() => {
    return new Map(scopedAdSets.map((adSet) => [adSet.id, adSet]));
  }, [scopedAdSets]);

  const focusedScopedAdSet = React.useMemo(() => {
    if (!focusedAdSetKey) return undefined;
    return scopedAdSets.find((adSet) => scopedAdSetKey(adSet) === focusedAdSetKey);
  }, [focusedAdSetKey, scopedAdSets]);

  const focusedAdSetId = focusedScopedAdSet?.id;

  React.useEffect(() => {
    if (!focusedAdSetId) return;
    void loadAdsForAdSet(focusedAdSetId);
  }, [focusedAdSetId, loadAdsForAdSet]);

  React.useEffect(() => {
    setSelectedAdIds([]);
  }, [focusedAdSetId]);

  const focusedAdSetAdsState = React.useMemo(() => {
    if (!focusedAdSetId) return undefined;
    return adsByAdSet[focusedAdSetId] ?? { status: "idle", ads: [] as MetaAd[] };
  }, [adsByAdSet, focusedAdSetId]);

  const focusedAdSetAds = React.useMemo(
    () => focusedAdSetAdsState?.ads ?? [],
    [focusedAdSetAdsState?.ads]
  );

  React.useEffect(() => {
    const validAdIds = new Set(focusedAdSetAds.map((ad) => ad.id));
    setSelectedAdIds((current) => {
      const retained = current.filter((adId) => validAdIds.has(adId)).slice(0, 3);
      if (areStringArraysEqual(current, retained)) return current;
      return retained;
    });
  }, [focusedAdSetAds]);

  const selectedAdIdSet = React.useMemo(() => new Set(selectedAdIds), [selectedAdIds]);

  const selectedAds = React.useMemo(() => {
    return focusedAdSetAds.filter((ad) => selectedAdIdSet.has(ad.id));
  }, [focusedAdSetAds, selectedAdIdSet]);

  const adColorById = React.useMemo(() => {
    return new Map(
      selectedAdIds.map((adId, index) => [adId, COMPARE_COLORS[index % COMPARE_COLORS.length]])
    );
  }, [selectedAdIds]);

  const toggleAdSetSelection = React.useCallback(
    (key: string) => {
      setSelectedAdSetKeys((current) => {
        if (current.includes(key)) {
          if (current.length === 1) return current;
          const next = current.filter((item) => item !== key);
          setFocusedAdSetKey((focused) => (focused === key ? next[0] : focused));
          return next;
        }
        setFocusedAdSetKey(key);
        return [...current, key];
      });
    },
    []
  );

  const toggleAdSelection = React.useCallback((adId: string) => {
    setSelectedAdIds((current) => {
      if (current.includes(adId)) {
        return current.filter((id) => id !== adId);
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, adId];
    });
  }, []);

  const adSetMetricCards = React.useMemo(() => {
    const aggregate = buildAggregatedMetricsContext(selectedScopedAdSets);
    return METRICS.map((metric) => {
      const spark = mapTrendPoints(aggregate?.trends, metric);
      return {
        metric,
        label: labelForMetric(metric),
        value: latestMetricValue(metric, aggregate?.metrics, aggregate?.trends),
        color: METRIC_CARD_COLORS[metric],
        spark,
        changePct: metricPercentageChange(metric, aggregate?.comparison) ?? trendPercentageChange(spark),
      };
    });
  }, [selectedScopedAdSets]);

  const adSetColorByKey = React.useMemo(() => {
    return new Map(
      selectedAdSetKeys.map((key, index) => [key, COMPARE_COLORS[index % COMPARE_COLORS.length]])
    );
  }, [selectedAdSetKeys]);

  const isAdViewActive = selectedAdIds.length > 0;

  const selectedAdSetActionLogs = React.useMemo(() => {
    const logs = selectedScopedAdSets.flatMap((adSet) => actionLogsByAdSetId.get(adSet.id) ?? []);
    const uniqueLogs = Array.from(new Map(logs.map((log) => [log.id, log])).values());
    if (!isAdViewActive) {
      return uniqueLogs;
    }

    const selectedSet = new Set(selectedAdIds);
    return uniqueLogs.filter((log) => {
      if (log.scopeType !== "AD") return true;
      const adId = log.metaAdId ?? (log.scopeType === "AD" ? log.scopeId : undefined);
      if (!adId) return false;
      return selectedSet.has(adId);
    });
  }, [actionLogsByAdSetId, isAdViewActive, selectedAdIds, selectedScopedAdSets]);

  const selectedAdSetSeries = React.useMemo<ObservabilityChartSeries[]>(() => {
    const pointEntries = selectedScopedAdSets
      .map((adSet) => {
        const key = scopedAdSetKey(adSet);
        return {
          key,
          adSet,
          points: mapTrendPoints(adSet.trends, adSetMetric),
        };
      })
      .filter((entry) => entry.points.length > 0);

    if (pointEntries.length === 0) return [];

    const series: ObservabilityChartSeries[] = [];
    const markerViewLayer = isAdViewActive ? "ad" : "adset";
    const selectedSet = new Set(selectedAdIds);
    const filterLogsForLayer = (logs: ActionLog[]) => {
      if (!isAdViewActive) return logs;
      return logs.filter((log) => {
        if (log.scopeType !== "AD") return true;
        const adId = log.metaAdId ?? (log.scopeType === "AD" ? log.scopeId : undefined);
        if (!adId) return false;
        return selectedSet.has(adId);
      });
    };

    if (showSelectedAdSetAverage) {
      const averaged = averageTrendPoints(pointEntries.map((entry) => entry.points));
      if (averaged.length > 0) {
        series.push({
          id: "adset-avg",
          label: `Selected Avg (${pointEntries.length})`,
          color: "#0ea5e9",
          points: averaged,
          markers: mapActionLogsToTimelineMarkers(selectedAdSetActionLogs, averaged, resolution, {
            viewLayer: markerViewLayer,
          }),
          variant: "line",
          emphasized: true,
        });
      }
    }

    if (showSelectedAdSetLines) {
      pointEntries.forEach((entry, index) => {
        series.push({
          id: entry.key,
          label: entry.adSet.name,
          color: adSetColorByKey.get(entry.key) ?? COMPARE_COLORS[index % COMPARE_COLORS.length],
          points: entry.points,
          markers: mapActionLogsToTimelineMarkers(
            filterLogsForLayer(actionLogsByAdSetId.get(entry.adSet.id) ?? []),
            entry.points,
            resolution,
            { viewLayer: markerViewLayer }
          ),
          variant: "line",
          emphasized: !showSelectedAdSetAverage && index === 0,
        });
      });
    }

    if (!showSelectedAdSetAverage && !showSelectedAdSetLines) {
      const [first] = pointEntries;
      series.push({
        id: first.key,
        label: first.adSet.name,
        color: adSetColorByKey.get(first.key) ?? "#0ea5e9",
        points: first.points,
        markers: mapActionLogsToTimelineMarkers(
          filterLogsForLayer(actionLogsByAdSetId.get(first.adSet.id) ?? []),
          first.points,
          resolution,
          { viewLayer: markerViewLayer }
        ),
        variant: "line",
        emphasized: true,
      });
    }

    return series;
  }, [
    actionLogsByAdSetId,
    adSetColorByKey,
    adSetMetric,
    resolution,
    selectedAdSetActionLogs,
    selectedScopedAdSets,
    isAdViewActive,
    selectedAdIds,
    showSelectedAdSetAverage,
    showSelectedAdSetLines,
  ]);

  const selectedAdSeries = React.useMemo<ObservabilityChartSeries[]>(() => {
    return selectedAds
      .map((ad, index) => ({
        id: `ad:${ad.id}`,
        label: ad.creative?.title || ad.name || `Ad ${index + 1}`,
        color: adColorById.get(ad.id) ?? COMPARE_COLORS[index % COMPARE_COLORS.length],
        points: mapTrendPoints(ad.trends, adSetMetric),
        variant: "line" as const,
        dashed: true,
        emphasized: false,
      }))
      .filter((entry) => entry.points.length > 0);
  }, [adColorById, adSetMetric, selectedAds]);

  const adSetChartSeries = React.useMemo(
    () => [...selectedAdSetSeries, ...selectedAdSeries],
    [selectedAdSeries, selectedAdSetSeries]
  );

  const isAdSetLoading = scopedCampaignIds.some(
    (campaignId) => adSetsByCampaign[campaignId]?.status === "loading"
  );

  const adSetErrors = scopedCampaignIds
    .map((campaignId) => adSetsByCampaign[campaignId]?.errorMessage)
    .filter((message): message is string => Boolean(message));

  const scopeRailItems = React.useMemo(() => {
    const indexItems = filteredIndexCards.map((entry) => ({
      key: `index:${entry.index.id}`,
      label: entry.index.name,
      type: "index" as const,
      value: entry.aggregate.metrics[adSetMetric] ?? 0,
      count: entry.members.length,
    }));

    const campaignItems = filteredCampaigns.map((campaign) => ({
      key: `campaign:${campaign.id}`,
      label: campaign.name,
      type: "campaign" as const,
      value: campaign.metrics?.[adSetMetric] ?? 0,
      campaignId: campaign.id,
    }));

    return [...indexItems, ...campaignItems];
  }, [adSetMetric, filteredCampaigns, filteredIndexCards]);

  const hasIndexRail = railEntityFilter !== "campaigns" && filteredIndexCards.length > 0;
  const hasCampaignRail = railEntityFilter !== "indexes";
  const shouldSplitCampaignRail = hasIndexRail && hasCampaignRail;
  const indexPanelDefaultSize = Math.min(55, Math.max(16, Math.min(filteredIndexCards.length, 3) * 12));
  const activeScopeLabel = React.useMemo(() => {
    if (!scope) return "All";
    if (scope.type === "campaign") {
      return campaignById.get(scope.id)?.name ?? "Campaign";
    }
    const idx = campaignIndexes.find((entry) => entry.id === scope.id);
    return idx ? `Index · ${idx.name}` : "Index";
  }, [campaignById, campaignIndexes, scope]);

  const creativeGalleryAds = React.useMemo(() => {
    if (selectedAds.length > 0) return selectedAds;
    return focusedAdSetAds.slice(0, 6);
  }, [focusedAdSetAds, selectedAds]);

  const applyAdSetSelectionById = React.useCallback(
    (adSetId: string): boolean => {
      const adSet = scopedAdSetById.get(adSetId);
      if (!adSet) return false;

      const key = scopedAdSetKey(adSet);
      setSelectedAdSetKeys((current) => (current.includes(key) ? current : [...current, key]));
      setFocusedAdSetKey(key);
      return true;
    },
    [scopedAdSetById]
  );

  const handleCampaignMarkerSelect = React.useCallback(
    (selection: ObservabilityChartMarkerSelection) => {
      const target = resolveMarkerTarget(selection);
      if (!target) return;

      setCampaignChartFocusTime(selection.time);

      if (!target.campaignId && !target.adSetId && !target.adId) return;

      if (target.campaignId) {
        setScope({ type: "campaign", id: target.campaignId });
        onSelectedCampaignChange?.(target.campaignId);
      }

      if (target.adSetId || target.adId) {
        setViewMode("adsets");
        setAdSetChartFocusTime(selection.time);
        pendingMarkerSelectionRef.current = {
          campaignId: target.campaignId,
          adSetId: target.adSetId,
          adId: target.adId,
          time: selection.time,
          actionType: target.actionType,
          sourceLogId: target.sourceLogId,
        };
      }
    },
    [onSelectedCampaignChange]
  );

  const handleAdSetMarkerSelect = React.useCallback(
    (selection: ObservabilityChartMarkerSelection) => {
      const target = resolveMarkerTarget(selection);
      if (!target) return;

      setAdSetChartFocusTime(selection.time);

      if (target.campaignId && (scope?.type !== "campaign" || scope.id !== target.campaignId)) {
        setScope({ type: "campaign", id: target.campaignId });
        onSelectedCampaignChange?.(target.campaignId);
      }

      if (target.adSetId) {
        applyAdSetSelectionById(target.adSetId);
      }

      if (target.adSetId || target.adId) {
        pendingMarkerSelectionRef.current = {
          campaignId: target.campaignId,
          adSetId: target.adSetId,
          adId: target.adId,
          time: selection.time,
          actionType: target.actionType,
          sourceLogId: target.sourceLogId,
        };
      }

      if (
        target.adId &&
        target.actionType &&
        (CREATIVE_SWAP_ACTION_TYPES as ReadonlyArray<string>).includes(target.actionType)
      ) {
        setOpenCreativeDetail({ adId: target.adId, focusLogId: target.sourceLogId });
      }
    },
    [applyAdSetSelectionById, onSelectedCampaignChange, scope?.id, scope?.type]
  );

  React.useEffect(() => {
    const pending = pendingMarkerSelectionRef.current;
    if (!pending) return;

    if (pending.campaignId && (scope?.type !== "campaign" || scope.id !== pending.campaignId)) {
      return;
    }

    if (!pending.adSetId) {
      pendingMarkerSelectionRef.current = null;
      return;
    }

    const adSetMatched = applyAdSetSelectionById(pending.adSetId);
    if (!adSetMatched) return;

    const adState = adsByAdSet[pending.adSetId];
    if (!adState || adState.status === "idle") {
      void loadAdsForAdSet(pending.adSetId);
      return;
    }
    if (adState.status === "loading") {
      return;
    }
    if (adState.status === "error") {
      void loadAdsForAdSet(pending.adSetId, { force: true });
      return;
    }

    setAdSetChartFocusTime(pending.time);
    if (pending.adId) {
      const exists = adState.ads.some((ad) => ad.id === pending.adId);
      if (exists) {
        setSelectedAdIds([pending.adId]);
        if (
          pending.actionType &&
          (CREATIVE_SWAP_ACTION_TYPES as ReadonlyArray<string>).includes(pending.actionType)
        ) {
          setOpenCreativeDetail({ adId: pending.adId, focusLogId: pending.sourceLogId });
        }
      }
    }
    pendingMarkerSelectionRef.current = null;
  }, [adsByAdSet, applyAdSetSelectionById, loadAdsForAdSet, scope?.id, scope?.type]);

  const creativeDetailContext = React.useMemo(() => {
    if (!openCreativeDetail) return null;
    for (const state of Object.values(adsByAdSet)) {
      const match = state.ads.find((entry) => entry.id === openCreativeDetail.adId);
      if (!match) continue;
      const adSetName = match.adsetId
        ? scopedAdSetById.get(match.adsetId)?.name ?? null
        : null;
      return { ad: match, adSetName };
    }
    return { ad: null, adSetName: null };
  }, [adsByAdSet, openCreativeDetail, scopedAdSetById]);

  const handleCreativeSheetOpenChange = React.useCallback((next: boolean) => {
    if (!next) setOpenCreativeDetail(null);
  }, []);

  return (
    <>
    <Card className="h-full min-h-[var(--dashboard-min-panel-height)] gap-0 overflow-hidden border-border/70 py-0">
      <div className="border-b border-border/70 bg-muted/20 px-2 py-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-sm font-semibold">Explorer</div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {toolbarSlot}
            <div
              data-tour-id="paid-adset-toggle"
              className="inline-flex rounded-md border border-border/70 bg-background p-0.5"
            >
              <Button
                variant={viewMode === "campaigns" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => {
                  setViewMode("campaigns");
                  onSelectedCampaignChange?.(undefined);
                }}
              >
                Campaigns
              </Button>
              <Button
                variant={viewMode === "adsets" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setViewMode("adsets")}
              >
                Ad Sets
              </Button>
            </div>

            <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                variant={resolution === "daily" ? "secondary" : "ghost"}
                onClick={() => handleResolutionChange("daily")}
              >
                Daily
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                variant={resolution === "hourly" ? "secondary" : "ghost"}
                onClick={() => handleResolutionChange("hourly")}
              >
                Hourly
              </Button>
            </div>

            {resolution === "hourly" ? (
              <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
                {HOURLY_SLICE_OPTIONS.map((slice) => {
                  const isActive = hourlySlice === slice;
                  const label = slice === "all" ? "All" : `${slice}h`;
                  return (
                    <Button
                      key={`hourly-slice-${label}`}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      variant={isActive ? "secondary" : "ghost"}
                      onClick={() => setHourlySlice(slice)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-background px-2.5">
              <Switch checked={activeOnly} onCheckedChange={onActiveOnlyChange} />
              <span className="text-[11px] font-medium">Active only</span>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="flex-1 min-h-0 p-0">
        {viewMode === "campaigns" ? (
          <section className="grid h-full min-h-0 gap-1.5 p-1.5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-md border border-border/70 bg-card p-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                  {selectedCompareSummary ?? "No selection"} · {labelForMetric(campaignMetric)}
                </span>
              </div>

              <ScrollArea className="mt-1.5 w-full">
                <div data-tour-id="paid-metric-cards" className="flex min-w-max gap-1.5 pb-1">
                  {campaignMetricCards.map((card) => (
                    <button
                      key={`campaign-metric-card-${card.metric}`}
                      type="button"
                      onClick={() => setCampaignMetric(card.metric)}
                      className={cn(
                        "w-[140px] cursor-pointer rounded-md border px-2 py-1 text-left transition-colors",
                        campaignMetric === card.metric
                          ? "border-primary/60 bg-primary/[0.07]"
                          : "border-border/70 bg-background hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
                        <span className="text-xs font-semibold">{formatMetric(card.metric, card.value)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-medium",
                            card.changePct == null
                              ? "text-muted-foreground"
                              : card.changePct >= 0
                                ? "text-emerald-600"
                                : "text-destructive"
                          )}
                        >
                          {card.changePct == null ? "No change data" : formatDeltaPercent(card.changePct)}
                        </span>
                      </div>
                      {card.spark.length > 0 ? (
                        <div className="mt-1 h-8">
                          <ObservabilityLightweightChart
                            compact
                            series={[
                              {
                                id: `campaign-spark-${card.metric}`,
                                label: card.label,
                                color: card.color,
                                points: card.spark,
                                variant: "line",
                                emphasized: true,
                              },
                            ]}
                          />
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {compareChartSeries.map((line) => (
                  <span
                    key={`legend-${line.id}`}
                    className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                    <span className="truncate">{line.label}</span>
                  </span>
                ))}
              </div>

              <ContextMenu>
                <ContextMenuTrigger>
                  <div data-tour-id="paid-performance-chart" className={cn("mt-1.5", CHART_HEIGHT_CLASS)}>
                    {compareChartSeries.length > 0 ? (
                      <ObservabilityLightweightChart
                        series={compareChartSeries}
                        visibleWindowSeconds={chartVisibleWindowSeconds}
                        focusTime={campaignChartFocusTime}
                        onMarkerSelect={handleCampaignMarkerSelect}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Add at least one campaign or index to visualize {labelForMetric(campaignMetric)}.
                      </div>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuLabel>Chart actions</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger inset>Quick actions</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-52">
                      <ContextMenuItem
                        onSelect={() => {
                          setScope(undefined);
                          setSelectedCompareKeys([]);
                          setCampaignMetric("spend");
                        }}
                      >
                        Reset compare view
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => setSelectedCompareKeys([])}>
                        Clear compared entities
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger inset>Display</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-52">
                      <ContextMenuCheckboxItem
                        checked={activeOnly}
                        onCheckedChange={(checked) => onActiveOnlyChange(checked === true)}
                      >
                        Active only
                      </ContextMenuCheckboxItem>
                      <ContextMenuCheckboxItem
                        checked={decomposeIndexes}
                        onCheckedChange={(checked) => setDecomposeIndexes(checked === true)}
                      >
                        Decompose indexes
                      </ContextMenuCheckboxItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger inset>Resolution</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-52">
                      <ContextMenuRadioGroup
                        value={resolution}
                        onValueChange={(value) => handleResolutionChange(value as TimelineResolution)}
                      >
                        <ContextMenuRadioItem value="daily">Daily</ContextMenuRadioItem>
                        <ContextMenuRadioItem value="hourly">Hourly</ContextMenuRadioItem>
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger inset>Metric</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-52">
                      <ContextMenuRadioGroup
                        value={campaignMetric}
                        onValueChange={(value) => setCampaignMetric(value as MetricKey)}
                      >
                        {METRICS.map((metric) => (
                          <ContextMenuRadioItem key={`campaign-metric-${metric}`} value={metric}>
                            {labelForMetric(metric)}
                          </ContextMenuRadioItem>
                        ))}
                      </ContextMenuRadioGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </ContextMenuContent>
              </ContextMenu>
            </div>

            <aside className="flex flex-col overflow-hidden rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground">
              <SidebarHeader className="space-y-2 p-2">
                <Input
                  value={campaignQuery}
                  onChange={(event) => setCampaignQuery(event.target.value)}
                  placeholder="Search by name, id, status, objective..."
                  className="h-8 border-sidebar-border/70 bg-sidebar-accent/30 text-xs"
                  aria-label="Search campaigns and indexes"
                />
                <div data-tour-id="paid-campaign-selector" className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant={railEntityFilter === "all" ? "secondary" : "ghost"}
                    onClick={showAllEntityOptions}
                  >
                    All
                  </Button>
                  <Button
                    size="xs"
                    variant={railEntityFilter === "indexes" ? "secondary" : "ghost"}
                    onClick={() => setRailEntityFilter("indexes")}
                  >
                    Indexes
                  </Button>
                  <Button
                    size="xs"
                    variant={railEntityFilter === "campaigns" ? "secondary" : "ghost"}
                    onClick={() => setRailEntityFilter("campaigns")}
                  >
                    Campaigns
                  </Button>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <Button size="icon-xs" variant="ghost" className="ml-auto">
                        <DotsHorizontalIcon />
                      </Button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      <ContextMenuLabel>Rail filters</ContextMenuLabel>
                      <ContextMenuSeparator />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger inset>Status</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuRadioGroup
                            value={campaignSearchFilter}
                            onValueChange={(value) => setCampaignSearchFilter(value as CampaignSearchFilter)}
                          >
                            <ContextMenuRadioItem value="all">All</ContextMenuRadioItem>
                            <ContextMenuRadioItem value="active">Active</ContextMenuRadioItem>
                            <ContextMenuRadioItem value="paused">Non-active</ContextMenuRadioItem>
                          </ContextMenuRadioGroup>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger inset>Actions</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-48">
                          <ContextMenuItem
                            onSelect={() => {
                              setCampaignQuery("");
                              setCampaignSearchFilter("all");
                              showAllEntityOptions();
                            }}
                          >
                            Reset rail filters
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              </SidebarHeader>

              <SidebarSeparator />

              <SidebarContent className="gap-0 overflow-hidden pb-2">
                {railEntityFilter === "all" ? (
                  <Command shouldFilter={false} className="h-full bg-transparent">
                    <CommandList className={cn(RAIL_SCROLL_HEIGHT_CLASS, "max-h-none px-1 pb-1")}>
                      {filteredIndexCards.length === 0 && filteredCampaigns.length === 0 ? (
                        <CommandEmpty>No campaigns or indexes match.</CommandEmpty>
                      ) : null}

                      {filteredIndexCards.length > 0 ? (
                        <CommandGroup heading="Indexes">
                          {filteredIndexCards.map((entry) => {
                            const indexKey = `index:${entry.index.id}`;
                            const isAdded = selectedCompareSet.has(indexKey);
                            return (
                              <CommandItem
                                key={`all-index-${entry.index.id}`}
                                value={`index ${entry.index.name} ${entry.index.id}`}
                                onSelect={() => {
                                  setScope({ type: "index", id: entry.index.id });
                                  toggleCompareEntity(indexKey);
                                  onSelectedCampaignChange?.(undefined);
                                }}
                                className={cn(
                                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-[11px]",
                                  isAdded ? "bg-sidebar-accent/70" : ""
                                )}
                              >
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <span className="rounded border border-sidebar-border/80 px-1 py-0 text-[9px] uppercase text-sidebar-foreground/70">
                                    IDX
                                  </span>
                                  <span className="truncate font-medium">{entry.index.name}</span>
                                </span>
                                <span className="text-sidebar-foreground/65">
                                  {formatMetric(campaignMetric, entry.aggregate.metrics[campaignMetric] ?? 0)}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ) : null}

                      {filteredIndexCards.length > 0 && filteredCampaigns.length > 0 ? <CommandSeparator /> : null}

                      {filteredCampaigns.length > 0 ? (
                        <CommandGroup heading="Campaigns">
                          {filteredCampaigns.map((campaign) => {
                            const key = `campaign:${campaign.id}`;
                            const isAdded = selectedCompareSet.has(key);
                            const campaignColor = compareColorByKey.get(key);
                            return (
                              <CommandItem
                                key={`all-campaign-${campaign.id}`}
                                value={`campaign ${campaign.name} ${campaign.id} ${campaign.status ?? ""}`}
                                onSelect={() => {
                                  setScope({ type: "campaign", id: campaign.id });
                                  toggleCompareEntity(key);
                                  onSelectedCampaignChange?.(campaign.id);
                                }}
                                className={cn(
                                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-[11px]",
                                  isAdded ? "bg-sidebar-accent/70" : ""
                                )}
                              >
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-sidebar-border/80"
                                    style={
                                      campaignColor
                                        ? { backgroundColor: campaignColor, borderColor: campaignColor }
                                        : undefined
                                    }
                                  />
                                  <span className="truncate">{campaign.name}</span>
                                </span>
                                <span className="text-sidebar-foreground/65">
                                  {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                </span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ) : null}
                    </CommandList>
                  </Command>
                ) : shouldSplitCampaignRail ? (
                  <ResizablePanelGroup orientation="vertical" className={RAIL_HEIGHT_CLASS}>
                    <ResizablePanel defaultSize={indexPanelDefaultSize} minSize={14} maxSize={65}>
                      <SidebarGroup className="pt-1">
                        <SidebarGroupLabel className="mb-1 flex h-auto items-center justify-between px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                          <span>Indexes</span>
                          <span className="flex items-center gap-1.5 normal-case tracking-normal">
                            <span className="text-[10px] text-sidebar-foreground/60">Decompose</span>
                            <Switch checked={decomposeIndexes} onCheckedChange={setDecomposeIndexes} />
                          </span>
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                          <ScrollArea className="h-full max-h-[220px] px-1 pb-1">
                            {filteredIndexCards.length === 0 ? (
                              <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                                No indexes match.
                              </div>
                            ) : (
                              <SidebarMenu>
                                {filteredIndexCards.map((entry) => {
                                  const indexKey = `index:${entry.index.id}`;
                                  const isAdded = selectedCompareSet.has(indexKey);
                                  return (
                                    <SidebarMenuItem key={indexKey}>
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setScope({ type: "index", id: entry.index.id });
                                              toggleCompareEntity(indexKey);
                                              onSelectedCampaignChange?.(undefined);
                                            }}
                                            className={cn(
                                              "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]",
                                              isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                            )}
                                          >
                                            <span className="truncate font-medium">{entry.index.name}</span>
                                            <span className="text-sidebar-foreground/65">
                                              {formatMetric(campaignMetric, entry.aggregate.metrics[campaignMetric] ?? 0)}
                                            </span>
                                          </button>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-52">
                                          <ContextMenuItem
                                            onSelect={() => {
                                              setScope({ type: "index", id: entry.index.id });
                                              setViewMode("adsets");
                                              onSelectedCampaignChange?.(undefined);
                                            }}
                                          >
                                            Open ad sets
                                          </ContextMenuItem>
                                          <ContextMenuItem onSelect={() => toggleCompareEntity(indexKey)}>
                                            {isAdded ? "Remove from compare" : "Add to compare"}
                                          </ContextMenuItem>
                                          <ContextMenuSeparator />
                                          <ContextMenuItem onSelect={() => onEditCampaignIndex?.(entry.index.id)}>
                                            Edit index
                                          </ContextMenuItem>
                                          <ContextMenuItem
                                            onSelect={() => onDeleteCampaignIndex?.(entry.index.id)}
                                            className="text-destructive"
                                          >
                                            Delete index
                                          </ContextMenuItem>
                                        </ContextMenuContent>
                                      </ContextMenu>

                                      {decomposeIndexes ? (
                                        <div className="mt-1 space-y-1 border-t border-sidebar-border/70 pt-1">
                                          {entry.members.map((campaign) => {
                                            const campaignKey = `campaign:${campaign.id}`;
                                            const campaignAdded = selectedCompareSet.has(campaignKey);
                                            const campaignColor = compareColorByKey.get(campaignKey);
                                            return (
                                              <button
                                                key={campaignKey}
                                                type="button"
                                                onClick={() => {
                                                  setScope({ type: "campaign", id: campaign.id });
                                                  toggleCompareEntity(campaignKey);
                                                  onSelectedCampaignChange?.(campaign.id);
                                                }}
                                                className={cn(
                                                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-1 text-left text-[11px]",
                                                  campaignAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                                )}
                                              >
                                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                                  <span
                                                    className="h-2 w-2 shrink-0 rounded-full border border-sidebar-border/80"
                                                    style={
                                                      campaignColor
                                                        ? { backgroundColor: campaignColor, borderColor: campaignColor }
                                                        : undefined
                                                    }
                                                  />
                                                  <span className="truncate">{campaign.name}</span>
                                                </span>
                                                <span className="text-sidebar-foreground/65">
                                                  {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                                </span>
                                                <span
                                                  title={`Open ad sets for ${campaign.name}`}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    setScope({ type: "campaign", id: campaign.id });
                                                    setViewMode("adsets");
                                                    onSelectedCampaignChange?.(campaign.id);
                                                  }}
                                                  className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                                                >
                                                  <ChevronRightIcon className="h-3 w-3" />
                                                </span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                    </SidebarMenuItem>
                                  );
                                })}
                              </SidebarMenu>
                            )}
                          </ScrollArea>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </ResizablePanel>
                    <ResizableHandle className="bg-sidebar-border/70" />
                    <ResizablePanel defaultSize={100 - indexPanelDefaultSize} minSize={30}>
                      <SidebarGroup className="pt-1">
                        <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                          Campaigns
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                          <ScrollArea className="h-full px-1 pb-1">
                            {filteredCampaigns.length === 0 ? (
                              <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                                No campaigns match.
                              </div>
                            ) : (
                              <SidebarMenu>
                                {filteredCampaigns.map((campaign) => {
                                  const key = `campaign:${campaign.id}`;
                                  const isAdded = selectedCompareSet.has(key);
                                  const campaignColor = compareColorByKey.get(key);
                                  return (
                                    <SidebarMenuItem key={campaign.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setScope({ type: "campaign", id: campaign.id });
                                          toggleCompareEntity(key);
                                          onSelectedCampaignChange?.(campaign.id);
                                        }}
                                        className={cn(
                                          "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]",
                                          isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                        )}
                                      >
                                        <span className="inline-flex min-w-0 items-center gap-1.5">
                                          <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-sidebar-border/80"
                                            style={
                                              campaignColor
                                                ? { backgroundColor: campaignColor, borderColor: campaignColor }
                                                : undefined
                                            }
                                          />
                                          <span className="truncate">{campaign.name}</span>
                                        </span>
                                        <span className="text-sidebar-foreground/65">
                                          {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                        </span>
                                        <span
                                          title={`Open ad sets for ${campaign.name}`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setScope({ type: "campaign", id: campaign.id });
                                            setViewMode("adsets");
                                            onSelectedCampaignChange?.(campaign.id);
                                          }}
                                          className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                                        >
                                          <ChevronRightIcon className="h-3 w-3" />
                                        </span>
                                      </button>
                                    </SidebarMenuItem>
                                  );
                                })}
                              </SidebarMenu>
                            )}
                          </ScrollArea>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : hasIndexRail ? (
                  <SidebarGroup className="flex-1 min-h-0 pt-1">
                    <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                      Indexes
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="flex flex-1 flex-col min-h-0">
                      <ScrollArea className={cn(RAIL_SCROLL_HEIGHT_CLASS, "px-1 pb-1")}>
                        {filteredIndexCards.map((entry) => {
                          const indexKey = `index:${entry.index.id}`;
                          const isAdded = selectedCompareSet.has(indexKey);
                          return (
                            <SidebarMenuItem key={indexKey}>
                              <button
                                type="button"
                                onClick={() => {
                                  setScope({ type: "index", id: entry.index.id });
                                  toggleCompareEntity(indexKey);
                                  onSelectedCampaignChange?.(undefined);
                                }}
                                className={cn(
                                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]",
                                  isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                )}
                              >
                                <span className="truncate font-medium">{entry.index.name}</span>
                                <span className="text-sidebar-foreground/65">
                                  {formatMetric(campaignMetric, entry.aggregate.metrics[campaignMetric] ?? 0)}
                                </span>
                              </button>
                            </SidebarMenuItem>
                          );
                        })}
                      </ScrollArea>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ) : (
                  <SidebarGroup className="flex-1 min-h-0 pt-1">
                    <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                      Campaigns
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="flex flex-1 flex-col min-h-0">
                      <ScrollArea className={cn(RAIL_SCROLL_HEIGHT_CLASS, "px-1 pb-1")}>
                        {filteredCampaigns.map((campaign) => {
                          const key = `campaign:${campaign.id}`;
                          const isAdded = selectedCompareSet.has(key);
                          const campaignColor = compareColorByKey.get(key);
                          return (
                            <SidebarMenuItem key={campaign.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setScope({ type: "campaign", id: campaign.id });
                                  toggleCompareEntity(key);
                                  onSelectedCampaignChange?.(campaign.id);
                                }}
                                className={cn(
                                  "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]",
                                  isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                )}
                              >
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-sidebar-border/80"
                                    style={
                                      campaignColor
                                        ? { backgroundColor: campaignColor, borderColor: campaignColor }
                                        : undefined
                                    }
                                  />
                                  <span className="truncate">{campaign.name}</span>
                                </span>
                                <span className="text-sidebar-foreground/65">
                                  {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                </span>
                                <span
                                  title={`Open ad sets for ${campaign.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setScope({ type: "campaign", id: campaign.id });
                                    setViewMode("adsets");
                                    onSelectedCampaignChange?.(campaign.id);
                                  }}
                                  className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                                >
                                  <ChevronRightIcon className="h-3 w-3" />
                                </span>
                              </button>
                            </SidebarMenuItem>
                          );
                        })}
                      </ScrollArea>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )}
              </SidebarContent>
            </aside>
          </section>
        ) : (
          <section className="grid h-full min-h-0 gap-1.5 p-1.5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-1.5">
              {adSetErrors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {adSetErrors[0]}
                </div>
              ) : null}

              <div className="rounded-md border border-border/70 p-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {selectedScopedAdSets.length === 0
                        ? "Select ad sets"
                        : selectedScopedAdSets.length === 1
                          ? selectedScopedAdSets[0]?.name
                          : `Selected Ad Sets (${selectedScopedAdSets.length})`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedScopedAdSets.length} selected · {showSelectedAdSetAverage ? "avg on" : "avg off"} ·{" "}
                      {showSelectedAdSetLines ? "lines on" : "lines off"} ·{" "}
                      {isAdViewActive ? `ad level (${selectedAdIds.length}/3)` : "adset level"}
                    </div>
                  </div>
                  <span className="rounded border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                    {labelForMetric(adSetMetric)}
                  </span>
                </div>

                <ScrollArea className="mt-1.5 w-full">
                  <div className="flex min-w-max gap-1.5 pb-1">
                    {adSetMetricCards.map((card) => (
                      <button
                        key={`adset-metric-card-${card.metric}`}
                        type="button"
                        onClick={() => setAdSetMetric(card.metric)}
                        className={cn(
                          "w-[140px] cursor-pointer rounded-md border px-2 py-1 text-left transition-colors",
                          adSetMetric === card.metric
                            ? "border-primary/60 bg-primary/[0.07]"
                            : "border-border/70 bg-background hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
                          <span className="text-xs font-semibold">{formatMetric(card.metric, card.value)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              card.changePct == null
                                ? "text-muted-foreground"
                                : card.changePct >= 0
                                  ? "text-emerald-600"
                                  : "text-destructive"
                            )}
                          >
                            {card.changePct == null ? "No change data" : formatDeltaPercent(card.changePct)}
                          </span>
                        </div>
                        {card.spark.length > 0 ? (
                          <div className="mt-1 h-8">
                            <ObservabilityLightweightChart
                              compact
                              series={[
                                {
                                  id: `adset-spark-${card.metric}`,
                                  label: card.label,
                                  color: card.color,
                                  points: card.spark,
                                  variant: "line",
                                  emphasized: true,
                                },
                              ]}
                            />
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {adSetChartSeries.map((line) => (
                    <span
                      key={`adset-legend-${line.id}`}
                      className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                      <span className="truncate">{line.label}</span>
                    </span>
                  ))}
                </div>

                <ContextMenu>
                  <ContextMenuTrigger>
                    <div className={cn("mt-1.5", CHART_HEIGHT_CLASS)}>
                      {adSetChartSeries.length > 0 ? (
                        <ObservabilityLightweightChart
                          series={adSetChartSeries}
                          visibleWindowSeconds={chartVisibleWindowSeconds}
                          focusTime={adSetChartFocusTime}
                          onMarkerSelect={handleAdSetMarkerSelect}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          {isAdSetLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <ReloadIcon className="h-4 w-4 animate-spin" />
                              Loading ad set timeline...
                            </span>
                          ) : (
                            "No timeline data for selected ad sets."
                          )}
                        </div>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuLabel>Ad set view actions</ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger inset>Quick actions</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-52">
                        <ContextMenuItem
                          onSelect={() => {
                            setAdSetMetric("spend");
                            setShowSelectedAdSetAverage(false);
                            setShowSelectedAdSetLines(true);
                            setSelectedAdIds([]);
                            const first = scopedAdSets[0];
                            if (!first) return;
                            const key = scopedAdSetKey(first);
                            setSelectedAdSetKeys([key]);
                            setFocusedAdSetKey(key);
                          }}
                        >
                          Reset view
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            const keys = filteredScopedAdSets.map((adSet) => scopedAdSetKey(adSet));
                            setSelectedAdSetKeys(keys);
                            if (keys.length > 0) setFocusedAdSetKey(keys[0]);
                          }}
                        >
                          Select all visible
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => {
                            setSelectedAdSetKeys([]);
                            setSelectedAdIds([]);
                          }}
                        >
                          Clear selected
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger inset>Display</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-52">
                        <ContextMenuCheckboxItem
                          checked={showSelectedAdSetAverage}
                          onCheckedChange={(checked) => setShowSelectedAdSetAverage(checked === true)}
                        >
                          Show averaged line
                        </ContextMenuCheckboxItem>
                        <ContextMenuCheckboxItem
                          checked={showSelectedAdSetLines}
                          onCheckedChange={(checked) => setShowSelectedAdSetLines(checked === true)}
                        >
                          Show individual lines
                        </ContextMenuCheckboxItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger inset>Metric</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-52">
                        <ContextMenuRadioGroup
                          value={adSetMetric}
                          onValueChange={(value) => setAdSetMetric(value as MetricKey)}
                        >
                          {METRICS.map((metric) => (
                            <ContextMenuRadioItem key={`adset-metric-${metric}`} value={metric}>
                              {labelForMetric(metric)}
                            </ContextMenuRadioItem>
                          ))}
                        </ContextMenuRadioGroup>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </ContextMenuContent>
                </ContextMenu>

                {focusedScopedAdSet ? (
                  <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-2.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium">Creatives · {focusedScopedAdSet.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Select up to 3 ads to overlay ad-level KPI trends.
                        </div>
                      </div>
                      <span className="rounded border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                        {selectedAdIds.length}/3 selected
                      </span>
                    </div>

                    {focusedAdSetAdsState?.status === "loading" ? (
                      <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <ReloadIcon className="h-3.5 w-3.5 animate-spin" />
                        Loading ad creatives...
                      </div>
                    ) : null}

                    {focusedAdSetAdsState?.status === "error" ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                        <span>{focusedAdSetAdsState.errorMessage ?? "Failed to load ad creatives"}</span>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void loadAdsForAdSet(focusedScopedAdSet.id, { force: true })}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : null}

                    {focusedAdSetAdsState?.status === "success" && creativeGalleryAds.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No creatives returned for this ad set.</div>
                    ) : null}

                    {creativeGalleryAds.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {creativeGalleryAds.map((ad) => {
                          const isSelected = selectedAdIdSet.has(ad.id);
                          const atSelectionLimit = selectedAdIds.length >= 3 && !isSelected;
                          const imageUrl = ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null;
                          const title = ad.creative?.title || ad.name || "Untitled ad";
                          const body = ad.creative?.body || "No copy available.";

                          return (
                            <CreativeHoverCard
                              key={`creative-gallery-${ad.id}`}
                              ad={{
                                id: ad.id,
                                name: ad.name,
                                adSetName: focusedScopedAdSet?.name ?? null,
                                status: ad.effectiveStatus ?? ad.status ?? null,
                                creative: ad.creative ?? null,
                              }}
                              logs={actionLogs}
                              onOpenDetail={(focusLogId) =>
                                setOpenCreativeDetail({ adId: ad.id, focusLogId })
                              }
                            >
                            <button
                              type="button"
                              onClick={() => toggleAdSelection(ad.id)}
                              disabled={atSelectionLimit}
                              className={cn(
                                "rounded-md border bg-background p-2 text-left transition-colors",
                                isSelected ? "border-primary/60 bg-primary/[0.06]" : "border-border/70 hover:bg-muted/40",
                                atSelectionLimit && "cursor-not-allowed opacity-55"
                              )}
                            >
                              <div className="relative mb-2 h-24 overflow-hidden rounded bg-muted/50">
                                {imageUrl ? (
                                  <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                                    No preview
                                  </div>
                                )}
                              </div>
                              <div className="line-clamp-1 text-xs font-medium">{title}</div>
                              <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{body}</div>
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <span className="text-[11px] text-muted-foreground">
                                  {formatMetric(adSetMetric, ad.metrics?.[adSetMetric] ?? 0)}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px]",
                                    isSelected
                                      ? "bg-primary/20 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {isSelected ? "Selected" : "Select"}
                                </span>
                              </div>
                            </button>
                            </CreativeHoverCard>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="flex flex-col overflow-hidden rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground">
              <SidebarHeader className="space-y-2 p-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setViewMode("campaigns");
                    onSelectedCampaignChange?.(undefined);
                  }}
                  className="h-7 w-full justify-start border-sidebar-border/70 bg-sidebar text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <ArrowLeftIcon className="mr-1 h-3.5 w-3.5" />
                  Back to campaigns
                </Button>
                <Input
                  value={campaignQuery}
                  onChange={(event) => setCampaignQuery(event.target.value)}
                  placeholder="Search scope and ad sets..."
                  className="h-8 border-sidebar-border/70 bg-sidebar-accent/30 text-xs"
                />
                <Breadcrumb>
                  <BreadcrumbList className="text-[11px]">
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[11px] text-sidebar-foreground/70">Campaigns</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[11px] text-sidebar-foreground/70">{activeScopeLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[11px]">Ad Sets</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </SidebarHeader>

              <SidebarSeparator />

              <SidebarContent className="gap-0 overflow-hidden pb-2">
                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                    Scope
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[150px] px-1 pb-1">
                      {scopeRailItems.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">No available scope.</div>
                      ) : (
                        <SidebarMenu>
                          {scopeRailItems.map((item) => {
                            const isActive = scope && `${scope.type}:${scope.id}` === item.key;
                            const campaignColor =
                              item.type === "campaign" ? compareColorByKey.get(item.key) : undefined;
                            return (
                              <SidebarMenuItem key={item.key}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.type === "campaign") {
                                      const campaignId = item.campaignId ?? item.key.replace("campaign:", "");
                                      setScope({ type: "campaign", id: campaignId });
                                      onSelectedCampaignChange?.(campaignId);
                                      return;
                                    }
                                    setScope({ type: "index", id: item.key.replace("index:", "") });
                                    onSelectedCampaignChange?.(undefined);
                                  }}
                                  className={cn(
                                    "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left",
                                    isActive ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                  )}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-1.5">
                                    {item.type === "campaign" ? (
                                      <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-sidebar-border/80"
                                        style={
                                          campaignColor
                                            ? { backgroundColor: campaignColor, borderColor: campaignColor }
                                            : undefined
                                        }
                                      />
                                    ) : null}
                                    <span className="truncate text-[12px]">
                                      {item.type === "index" ? `Index · ${item.label}` : item.label}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-sidebar-foreground/65">
                                    {formatMetric(adSetMetric, item.value)}
                                  </span>
                                </button>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      )}
                    </ScrollArea>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                    Ad Sets ({selectedScopedAdSets.length} selected)
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[300px] px-1 pb-1">
                      {isAdSetLoading ? (
                        <div className="space-y-1 px-1">
                          {Array.from({ length: 8 }).map((_, idx) => (
                            <Skeleton
                              key={`adset-list-skeleton-${idx}`}
                              className="h-8 w-full bg-sidebar-accent/50"
                            />
                          ))}
                        </div>
                      ) : filteredScopedAdSets.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                          No ad sets for this scope.
                        </div>
                      ) : (
                        <SidebarMenu>
                          {filteredScopedAdSets.map((adSet) => {
                            const key = scopedAdSetKey(adSet);
                            const isSelected = selectedAdSetSet.has(key);
                            const isFocused = focusedAdSetKey === key;
                            const adSetColor = adSetColorByKey.get(key);
                            return (
                              <SidebarMenuItem key={key}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleAdSetSelection(key);
                                    onSelectedCampaignChange?.(adSet.campaignId);
                                  }}
                                  className={cn(
                                    "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left",
                                    isSelected ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50",
                                    isFocused && "ring-1 ring-sidebar-ring"
                                  )}
                                >
                                  <span className="min-w-0">
                                    <span className="inline-flex items-center gap-1.5 truncate text-[12px]">
                                      <span
                                        className={cn(
                                          "h-2.5 w-2.5 shrink-0 rounded-full border border-sidebar-border/80",
                                          isSelected ? "opacity-100" : "opacity-40"
                                        )}
                                        style={
                                          adSetColor
                                            ? { backgroundColor: adSetColor, borderColor: adSetColor }
                                            : undefined
                                        }
                                      />
                                      {adSet.name}
                                    </span>
                                    <span className="block truncate text-[10px] text-sidebar-foreground/60">
                                      {adSet.campaignName}
                                    </span>
                                  </span>
                                  <span className="text-[11px] text-sidebar-foreground/65">
                                    {formatMetric(adSetMetric, adSet.metrics?.[adSetMetric] ?? 0)}
                                  </span>
                                </button>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      )}
                    </ScrollArea>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarSeparator />

                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                    Ads ({selectedAdIds.length}/3 selected)
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[220px] px-1 pb-1">
                      {!focusedScopedAdSet ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                          Select an ad set to browse ads.
                        </div>
                      ) : focusedAdSetAdsState?.status === "loading" ? (
                        <div className="grid grid-cols-2 gap-1.5 px-1">
                          {Array.from({ length: 6 }).map((_, idx) => (
                            <Skeleton
                              key={`ad-list-skeleton-${idx}`}
                              className="h-20 w-full rounded bg-sidebar-accent/50"
                            />
                          ))}
                        </div>
                      ) : focusedAdSetAdsState?.status === "error" ? (
                        <div className="space-y-1 px-2 py-1.5 text-[11px] text-destructive">
                          <div>{focusedAdSetAdsState.errorMessage ?? "Failed to load ads"}</div>
                          <Button
                            variant="outline"
                            size="xs"
                            className="h-6 border-sidebar-border/70 bg-sidebar text-[10px]"
                            onClick={() => void loadAdsForAdSet(focusedScopedAdSet.id, { force: true })}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : focusedAdSetAds.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                          No ads returned for this ad set.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 px-1">
                          {focusedAdSetAds.map((ad) => {
                            const isSelected = selectedAdIdSet.has(ad.id);
                            const atSelectionLimit = selectedAdIds.length >= 3 && !isSelected;
                            const imageUrl = ad.creative?.thumbnailUrl || ad.creative?.imageUrl || null;
                            return (
                              <button
                                key={`rail-ad-${ad.id}`}
                                type="button"
                                disabled={atSelectionLimit}
                                onClick={() => toggleAdSelection(ad.id)}
                                className={cn(
                                  "rounded border p-1 text-left transition-colors",
                                  isSelected
                                    ? "border-sidebar-ring bg-sidebar-accent/80"
                                    : "border-sidebar-border/70 bg-sidebar-accent/35 hover:bg-sidebar-accent/55",
                                  atSelectionLimit && "cursor-not-allowed opacity-55"
                                )}
                              >
                                <div className="h-12 overflow-hidden rounded bg-sidebar-accent/50">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={ad.name} className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-[10px] text-sidebar-foreground/60">
                                      No image
                                    </div>
                                  )}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[10px] leading-tight">{ad.name}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </aside>
          </section>
        )}
      </CardContent>
    </Card>
    <CreativeRotationSheet
      open={!!openCreativeDetail}
      onOpenChange={handleCreativeSheetOpenChange}
      ad={
        creativeDetailContext?.ad
          ? {
              id: creativeDetailContext.ad.id,
              name: creativeDetailContext.ad.name,
              adSetName: creativeDetailContext.adSetName ?? null,
              status:
                creativeDetailContext.ad.effectiveStatus ??
                creativeDetailContext.ad.status ??
                null,
              creative: creativeDetailContext.ad.creative ?? null,
            }
          : openCreativeDetail
            ? {
                id: openCreativeDetail.adId,
                name: openCreativeDetail.adId,
                adSetName: null,
                status: null,
                creative: null,
              }
            : null
      }
      logs={actionLogs}
      focusLogId={openCreativeDetail?.focusLogId}
    />
    </>
  );
}
