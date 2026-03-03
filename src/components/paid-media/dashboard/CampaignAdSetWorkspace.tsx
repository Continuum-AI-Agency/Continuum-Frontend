"use client";

import * as React from "react";
import { ArrowLeftIcon, ReloadIcon } from "@radix-ui/react-icons";
import type { UTCTimestamp } from "lightweight-charts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useTimelineBlocks } from "@/hooks/timeline/useTimelineBlocks";
import {
  buildCampaignIndexAggregate,
  type CampaignIndexRecord,
} from "@/lib/paid-media/campaign-indexes";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { AdSet } from "./AdSetTable";
import {
  ObservabilityLightweightChart,
  type ObservabilityChartPoint,
  type ObservabilityChartSeries,
} from "./ObservabilityLightweightChart";
import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "./PerformanceDetails";

type TimePreset = "last_7d" | "last_14d" | "last_30d";
type TimelineResolution = "daily" | "hourly";
type MetricKey = "spend" | "roas" | "ctr" | "cpc" | "impressions" | "clicks";
type ViewMode = "campaigns" | "adsets";
type Scope = { type: "campaign"; id: string } | { type: "index"; id: string };

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
};

type CampaignAdSetWorkspaceProps = {
  brandId: string;
  accountId: string;
  campaigns: Campaign[];
  campaignIndexes: CampaignIndexRecord[];
  selectedCampaignIndexId: string;
  onSelectedCampaignIndexChange?: (indexId: string) => void;
  timeRangePreset: TimePreset;
  resolution: TimelineResolution;
  onResolutionChange: (value: TimelineResolution) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  onSelectedCampaignChange?: (campaignId: string | undefined) => void;
};

const METRICS: MetricKey[] = ["spend", "roas", "ctr", "cpc", "impressions", "clicks"];
const COMPARE_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f97316",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#84cc16",
  "#f59e0b",
];

const METRIC_CARD_COLORS: Record<MetricKey, string> = {
  spend: "#0ea5e9",
  roas: "#10b981",
  ctr: "#8b5cf6",
  cpc: "#f97316",
  impressions: "#14b8a6",
  clicks: "#84cc16",
};

function daysForPreset(preset: TimePreset): number {
  switch (preset) {
    case "last_14d":
      return 14;
    case "last_30d":
      return 30;
    case "last_7d":
    default:
      return 7;
  }
}

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

function formatMetric(metric: MetricKey, value: number): string {
  if (metric === "spend" || metric === "cpc") return formatCurrency(value);
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

export function CampaignAdSetWorkspace({
  brandId,
  accountId,
  campaigns,
  campaignIndexes,
  selectedCampaignIndexId,
  onSelectedCampaignIndexChange,
  timeRangePreset,
  resolution,
  onResolutionChange,
  activeOnly,
  onActiveOnlyChange,
  onSelectedCampaignChange,
}: CampaignAdSetWorkspaceProps) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("campaigns");
  const [campaignQuery, setCampaignQuery] = React.useState("");
  const [decomposeIndexes, setDecomposeIndexes] = React.useState(false);
  const [scope, setScope] = React.useState<Scope | undefined>();
  const [campaignMetric, setCampaignMetric] = React.useState<MetricKey>("spend");
  const [adSetMetric, setAdSetMetric] = React.useState<MetricKey>("spend");
  const [selectedCompareKeys, setSelectedCompareKeys] = React.useState<string[]>([]);
  const [selectedAdSetKey, setSelectedAdSetKey] = React.useState<string | undefined>();
  const [adSetsByCampaign, setAdSetsByCampaign] = React.useState<Record<string, AdSetLoadState>>({});

  const now = React.useMemo(() => new Date(), []);
  const endDateIso = React.useMemo(() => now.toISOString(), [now]);
  const startDateIso = React.useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysForPreset(timeRangePreset));
    return date.toISOString();
  }, [now, timeRangePreset]);

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
    if (!normalized) return eligibleCampaigns;
    return eligibleCampaigns.filter((campaign) => campaign.name.toLowerCase().includes(normalized));
  }, [campaignQuery, eligibleCampaigns]);

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

  const compareEntities = React.useMemo(() => {
    const indexEntities: CompareEntity[] = indexCards.map((entry) => ({
      key: `index:${entry.index.id}`,
      label: entry.index.name,
      type: "index",
      trends: entry.aggregate.trends,
      metrics: entry.aggregate.metrics,
    }));

    const campaignEntities: CompareEntity[] = eligibleCampaigns.map((campaign) => ({
      key: `campaign:${campaign.id}`,
      label: campaign.name,
      type: "campaign",
      trends: campaign.trends ?? [],
      metrics: campaign.metrics,
    }));

    return [...indexEntities, ...campaignEntities];
  }, [eligibleCampaigns, indexCards]);

  const compareEntityByKey = React.useMemo(() => {
    return new Map(compareEntities.map((entity) => [entity.key, entity]));
  }, [compareEntities]);

  React.useEffect(() => {
    setSelectedCompareKeys((current) => {
      const valid = current.filter((key) => compareEntityByKey.has(key));
      if (valid.length > 0) return valid;

      if (selectedCampaignIndexId !== "all" && compareEntityByKey.has(`index:${selectedCampaignIndexId}`)) {
        return [`index:${selectedCampaignIndexId}`];
      }

      const firstIndex = indexCards[0]?.index.id;
      if (firstIndex && compareEntityByKey.has(`index:${firstIndex}`)) {
        return [`index:${firstIndex}`];
      }

      const firstCampaign = eligibleCampaigns[0]?.id;
      return firstCampaign ? [`campaign:${firstCampaign}`] : [];
    });
  }, [compareEntityByKey, eligibleCampaigns, indexCards, selectedCampaignIndexId]);

  const selectedCompareSet = React.useMemo(() => new Set(selectedCompareKeys), [selectedCompareKeys]);

  const selectedCompareEntities = React.useMemo(() => {
    return selectedCompareKeys
      .map((key) => compareEntityByKey.get(key))
      .filter((entity): entity is CompareEntity => Boolean(entity));
  }, [compareEntityByKey, selectedCompareKeys]);

  const compareChartSeries = React.useMemo<ObservabilityChartSeries[]>(() => {
    return selectedCompareEntities
      .map((entity, index) => ({
        id: entity.key,
        label: entity.label,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length],
        points: mapTrendPoints(entity.trends, campaignMetric),
        variant: index === 0 ? ("area" as const) : ("line" as const),
        emphasized: index === 0,
        dashed: index > 0,
      }))
      .filter((entry) => entry.points.length > 0);
  }, [campaignMetric, selectedCompareEntities]);

  const focusedCampaignContext = React.useMemo(() => {
    if (scope?.type === "index") {
      const entry = indexCards.find((card) => card.index.id === scope.id);
      if (entry) {
        return {
          label: `Index · ${entry.index.name}`,
          metrics: entry.aggregate.metrics,
          trends: entry.aggregate.trends,
        };
      }
    }

    if (scope?.type === "campaign") {
      const campaign = campaignById.get(scope.id);
      if (campaign) {
        return {
          label: campaign.name,
          metrics: campaign.metrics,
          trends: campaign.trends ?? [],
        };
      }
    }

    const selected = selectedCompareEntities[0];
    if (selected) {
      return {
        label: selected.type === "index" ? `Index · ${selected.label}` : selected.label,
        metrics: selected.metrics,
        trends: selected.trends,
      };
    }

    return undefined;
  }, [campaignById, indexCards, scope, selectedCompareEntities]);

  const campaignMetricCards = React.useMemo(() => {
    return METRICS.map((metric) => ({
      metric,
      label: labelForMetric(metric),
      value: latestMetricValue(metric, focusedCampaignContext?.metrics, focusedCampaignContext?.trends),
      color: METRIC_CARD_COLORS[metric],
      spark: mapTrendPoints(focusedCampaignContext?.trends, metric),
    }));
  }, [focusedCampaignContext?.metrics, focusedCampaignContext?.trends]);

  const toggleCompareEntity = React.useCallback((key: string) => {
    setSelectedCompareKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }, []);

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
                range: { preset: timeRangePreset },
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
    [accountId, adSetsByCampaign, brandId, timeRangePreset, timelineFallbackByCampaign]
  );

  React.useEffect(() => {
    setAdSetsByCampaign({});
    setSelectedAdSetKey(undefined);
  }, [accountId, brandId, resolution, timeRangePreset]);

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

    if (!scope && eligibleCampaigns.length > 0) {
      setScope({ type: "campaign", id: eligibleCampaigns[0].id });
    }
  }, [campaignIndexes, eligibleCampaigns, scope, selectedCampaignIndexId]);

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

  React.useEffect(() => {
    if (scopedAdSets.length === 0) {
      setSelectedAdSetKey(undefined);
      return;
    }

    setSelectedAdSetKey((current) => {
      if (current && scopedAdSets.some((row) => `${row.campaignId}:${row.id}` === current)) {
        return current;
      }
      return `${scopedAdSets[0].campaignId}:${scopedAdSets[0].id}`;
    });
  }, [scopedAdSets]);

  const selectedAdSet = React.useMemo(() => {
    if (!selectedAdSetKey) return undefined;
    return scopedAdSets.find((adSet) => `${adSet.campaignId}:${adSet.id}` === selectedAdSetKey);
  }, [scopedAdSets, selectedAdSetKey]);

  const adSetMetricCards = React.useMemo(() => {
    return METRICS.map((metric) => ({
      metric,
      label: labelForMetric(metric),
      value: latestMetricValue(metric, selectedAdSet?.metrics, selectedAdSet?.trends),
      color: METRIC_CARD_COLORS[metric],
      spark: mapTrendPoints(selectedAdSet?.trends, metric),
    }));
  }, [selectedAdSet?.metrics, selectedAdSet?.trends]);

  const selectedAdSetSeries = React.useMemo<ObservabilityChartSeries[]>(() => {
    const points = mapTrendPoints(selectedAdSet?.trends, adSetMetric);
    if (points.length === 0) return [];
    return [
      {
        id: selectedAdSet ? `${selectedAdSet.campaignId}:${selectedAdSet.id}` : "adset",
        label: selectedAdSet?.name ?? "Ad Set",
        color: "#0ea5e9",
        points,
        variant: "area",
        emphasized: true,
      },
    ];
  }, [adSetMetric, selectedAdSet]);

  const isAdSetLoading = scopedCampaignIds.some(
    (campaignId) => adSetsByCampaign[campaignId]?.status === "loading"
  );

  const adSetErrors = scopedCampaignIds
    .map((campaignId) => adSetsByCampaign[campaignId]?.errorMessage)
    .filter((message): message is string => Boolean(message));

  const scopeRailItems = React.useMemo(() => {
    const indexItems = indexCards.map((entry) => ({
      key: `index:${entry.index.id}`,
      label: entry.index.name,
      type: "index" as const,
      value: entry.aggregate.metrics[adSetMetric] ?? 0,
      count: entry.members.length,
    }));

    const campaignItems = eligibleCampaigns.map((campaign) => ({
      key: `campaign:${campaign.id}`,
      label: campaign.name,
      type: "campaign" as const,
      value: campaign.metrics?.[adSetMetric] ?? 0,
      campaignId: campaign.id,
    }));

    return [...indexItems, ...campaignItems];
  }, [adSetMetric, eligibleCampaigns, indexCards]);

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg">Campaign Explorer</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              TradingView-style compare for campaign/index performance, then ad set drill-in.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border/70 bg-background p-1">
              <Button
                variant={viewMode === "campaigns" ? "secondary" : "ghost"}
                size="sm"
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
                onClick={() => setViewMode("adsets")}
              >
                Ad Sets
              </Button>
            </div>

            <div className="inline-flex rounded-md border border-border/70 bg-background p-1">
              <Button
                size="sm"
                variant={resolution === "daily" ? "secondary" : "ghost"}
                onClick={() => onResolutionChange("daily")}
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={resolution === "hourly" ? "secondary" : "ghost"}
                onClick={() => onResolutionChange("hourly")}
              >
                Hourly
              </Button>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1">
              <Switch checked={activeOnly} onCheckedChange={onActiveOnlyChange} />
              <span className="text-xs font-medium">Active only</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {viewMode === "campaigns" ? (
          <section className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground">
              <SidebarHeader>
                <SidebarInput
                  value={campaignQuery}
                  onChange={(event) => setCampaignQuery(event.target.value)}
                  placeholder="Search campaigns"
                  className="text-xs"
                  aria-label="Search campaigns"
                />
              </SidebarHeader>

              <SidebarSeparator />

              <SidebarContent className="gap-0">
                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="mb-1 flex h-auto items-center justify-between px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                    <span>Indexes</span>
                    <span className="flex items-center gap-1.5 normal-case tracking-normal">
                      <span className="text-[10px] text-sidebar-foreground/60">Decompose</span>
                      <Switch checked={decomposeIndexes} onCheckedChange={setDecomposeIndexes} />
                    </span>
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[220px] px-1 pb-1">
                      {indexCards.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">No indexes available.</div>
                      ) : (
                        <SidebarMenu>
                          {indexCards.map((entry) => {
                            const indexKey = `index:${entry.index.id}`;
                            const isAdded = selectedCompareSet.has(indexKey);

                            return (
                              <SidebarMenuItem key={indexKey}>
                                <div className="rounded border border-transparent px-1 py-1 hover:border-sidebar-border/70 hover:bg-sidebar-accent/40">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setScope({ type: "index", id: entry.index.id });
                                        toggleCompareEntity(indexKey);
                                        onSelectedCampaignChange?.(undefined);
                                      }}
                                      className={cn(
                                        "grid min-w-0 flex-1 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left",
                                        isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                      )}
                                    >
                                      <span className="truncate text-[12px] font-medium">{entry.index.name}</span>
                                      <span className="text-[11px] text-sidebar-foreground/65">
                                        {formatMetric(campaignMetric, entry.aggregate.metrics[campaignMetric] ?? 0)}
                                      </span>
                                    </button>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 text-[10px]"
                                      onClick={() => {
                                        setScope({ type: "index", id: entry.index.id });
                                        setViewMode("adsets");
                                        onSelectedCampaignChange?.(undefined);
                                      }}
                                    >
                                      Open
                                    </Button>
                                  </div>

                                  {decomposeIndexes ? (
                                    <div className="mt-1 space-y-1 border-t border-sidebar-border/70 pt-1.5">
                                      {entry.members.map((campaign) => {
                                        const campaignKey = `campaign:${campaign.id}`;
                                        const campaignAdded = selectedCompareSet.has(campaignKey);
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
                                              "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1 text-left text-[11px]",
                                              campaignAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                            )}
                                          >
                                            <span className="truncate">{campaign.name}</span>
                                            <span className="text-sidebar-foreground/65">
                                              {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
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
                    Campaigns
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[290px] px-1 pb-1">
                      {filteredCampaigns.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">No campaigns match.</div>
                      ) : (
                        <SidebarMenu>
                          {filteredCampaigns.map((campaign) => {
                            const key = `campaign:${campaign.id}`;
                            const isAdded = selectedCompareSet.has(key);
                            return (
                              <SidebarMenuItem key={campaign.id}>
                                <div className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-sidebar-accent/40">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setScope({ type: "campaign", id: campaign.id });
                                      toggleCompareEntity(key);
                                      onSelectedCampaignChange?.(campaign.id);
                                    }}
                                    className={cn(
                                      "grid min-w-0 flex-1 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left",
                                      isAdded ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                    )}
                                  >
                                    <span className="truncate text-[12px]">{campaign.name}</span>
                                    <span className="text-[11px] text-sidebar-foreground/65">
                                      {formatMetric(campaignMetric, campaign.metrics?.[campaignMetric] ?? 0)}
                                    </span>
                                  </button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-[10px]"
                                    onClick={() => {
                                      setScope({ type: "campaign", id: campaign.id });
                                      setViewMode("adsets");
                                      onSelectedCampaignChange?.(campaign.id);
                                    }}
                                  >
                                    Open
                                  </Button>
                                </div>
                              </SidebarMenuItem>
                            );
                          })}
                        </SidebarMenu>
                      )}
                    </ScrollArea>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </aside>

            <div className="rounded-md border border-border/70 bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Compare Timeline</div>
                  <div className="text-xs text-muted-foreground">
                    {focusedCampaignContext
                      ? `Metric cards and timeline for ${focusedCampaignContext.label}.`
                      : "Select campaigns or indexes to compare."}
                  </div>
                </div>
                <span className="rounded border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                  Active KPI: {labelForMetric(campaignMetric)}
                </span>
              </div>

              <ScrollArea className="mt-3 w-full">
                <div className="flex min-w-max gap-2 pb-1">
                  {campaignMetricCards.map((card) => (
                    <button
                      key={`campaign-metric-card-${card.metric}`}
                      type="button"
                      onClick={() => setCampaignMetric(card.metric)}
                      className={cn(
                        "w-[172px] cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors",
                        campaignMetric === card.metric
                          ? "border-primary/60 bg-primary/[0.07]"
                          : "border-border/70 bg-background hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
                        <span className="text-xs font-semibold">{formatMetric(card.metric, card.value)}</span>
                      </div>
                      <div className="mt-2 h-11">
                        {card.spark.length > 0 ? (
                          <ObservabilityLightweightChart
                            compact
                            series={[
                              {
                                id: `campaign-spark-${card.metric}`,
                                label: card.label,
                                color: card.color,
                                points: card.spark,
                                variant: "area",
                                emphasized: true,
                              },
                            ]}
                          />
                        ) : (
                          <div className="h-full rounded bg-muted/50" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

              <div className="mt-3 h-[430px]">
                {compareChartSeries.length > 0 ? (
                  <ObservabilityLightweightChart series={compareChartSeries} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Add at least one campaign or index to visualize {labelForMetric(campaignMetric)}.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground">
              <SidebarHeader className="p-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewMode("campaigns");
                    onSelectedCampaignChange?.(undefined);
                  }}
                  className="h-8 w-full justify-start border-sidebar-border/70 bg-sidebar text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <ArrowLeftIcon className="mr-1 h-3.5 w-3.5" />
                  Back to campaigns
                </Button>
              </SidebarHeader>

              <SidebarSeparator />

              <SidebarContent className="gap-0">
                <SidebarGroup className="pt-1">
                  <SidebarGroupLabel className="mb-1 h-auto px-2 py-0 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
                    Scope
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[220px] px-1 pb-1">
                      {scopeRailItems.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">No available scope.</div>
                      ) : (
                        <SidebarMenu>
                          {scopeRailItems.map((item) => {
                            const isActive = scope && `${scope.type}:${scope.id}` === item.key;
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
                                  <span className="truncate text-[12px]">
                                    {item.type === "index" ? `Index · ${item.label}` : item.label}
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
                    Ad Sets
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <ScrollArea className="h-[360px] px-1 pb-1">
                      {isAdSetLoading ? (
                        <div className="space-y-1 px-1">
                          {Array.from({ length: 8 }).map((_, idx) => (
                            <Skeleton
                              key={`adset-list-skeleton-${idx}`}
                              className="h-8 w-full bg-sidebar-accent/50"
                            />
                          ))}
                        </div>
                      ) : scopedAdSets.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/60">
                          No ad sets for this scope.
                        </div>
                      ) : (
                        <SidebarMenu>
                          {scopedAdSets.map((adSet) => {
                            const key = `${adSet.campaignId}:${adSet.id}`;
                            const isSelected = key === selectedAdSetKey;
                            return (
                              <SidebarMenuItem key={key}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedAdSetKey(key);
                                    onSelectedCampaignChange?.(adSet.campaignId);
                                  }}
                                  className={cn(
                                    "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left",
                                    isSelected ? "bg-sidebar-accent/70" : "hover:bg-sidebar-accent/50"
                                  )}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-[12px]">{adSet.name}</span>
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
              </SidebarContent>
            </aside>

            <div className="space-y-3">
              {adSetErrors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {adSetErrors[0]}
                </div>
              ) : null}

              <div className="rounded-md border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {selectedAdSet ? selectedAdSet.name : "Select an ad set"}
                    </div>
                    <div className="text-xs text-muted-foreground">Single metric timeline</div>
                  </div>
                  <span className="rounded border border-border/70 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                    Active KPI: {labelForMetric(adSetMetric)}
                  </span>
                </div>

                <ScrollArea className="mt-3 w-full">
                  <div className="flex min-w-max gap-2 pb-1">
                    {adSetMetricCards.map((card) => (
                      <button
                        key={`adset-metric-card-${card.metric}`}
                        type="button"
                        onClick={() => setAdSetMetric(card.metric)}
                        className={cn(
                          "w-[172px] cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors",
                          adSetMetric === card.metric
                            ? "border-primary/60 bg-primary/[0.07]"
                            : "border-border/70 bg-background hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
                          <span className="text-xs font-semibold">{formatMetric(card.metric, card.value)}</span>
                        </div>
                        <div className="mt-2 h-11">
                          {card.spark.length > 0 ? (
                            <ObservabilityLightweightChart
                              compact
                              series={[
                                {
                                  id: `adset-spark-${card.metric}`,
                                  label: card.label,
                                  color: card.color,
                                  points: card.spark,
                                  variant: "area",
                                  emphasized: true,
                                },
                              ]}
                            />
                          ) : (
                            <div className="h-full rounded bg-muted/50" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {selectedAdSetSeries.map((line) => (
                    <span
                      key={`adset-legend-${line.id}`}
                      className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                      <span className="truncate">{line.label}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-3 h-[430px]">
                  {selectedAdSetSeries.length > 0 ? (
                    <ObservabilityLightweightChart series={selectedAdSetSeries} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {isAdSetLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <ReloadIcon className="h-4 w-4 animate-spin" />
                          Loading ad set timeline...
                        </span>
                      ) : (
                        "No timeline data for this ad set."
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
