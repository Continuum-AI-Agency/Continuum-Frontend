"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDownIcon, ReloadIcon } from "@radix-ui/react-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTimelineBlocks } from "@/hooks/timeline/useTimelineBlocks";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdSet } from "./AdSetTable";
import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "./PerformanceDetails";

type TimelineResolution = "daily" | "hourly";
type TimePreset = "last_7d" | "last_14d" | "last_30d";
type SortDirection = "desc" | "asc";
type MetricKey = "spend" | "roas" | "ctr" | "cpc" | "impressions" | "clicks";

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
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

type AdSetLoadState = {
  status: "idle" | "loading" | "success" | "error";
  adSets: AdSet[];
  errorMessage?: string;
  source?: "timeline" | "live";
  loadingStartedAt?: number;
};

type CampaignTimelineWorkspaceProps = {
  brandId: string;
  accountId: string;
  campaigns: Campaign[];
  isLoadingCampaigns: boolean;
  timeRangePreset: TimePreset;
  resolution: TimelineResolution;
  onResolutionChange: (value: TimelineResolution) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  onSelectedCampaignChange?: (campaignId: string | undefined) => void;
};

type TrendSeriesPoint = {
  timestamp: string;
  actual: number;
  target: number | null;
};

type TopChartLine = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  filled?: boolean;
};

type ActionScopeType = "CAMPAIGN" | "ADSET" | "AD" | "ACCOUNT" | "GLOBAL";

type ActionLogMarker = {
  id: string;
  actionType: string;
  status: string;
  scopeType: ActionScopeType | string;
  scopeId: string;
  occurredAt: string;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdId?: string | null;
  actionPayload?: Record<string, unknown> | null;
  paramsChanged?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  decisionNote?: string | null;
  error?: string | null;
};

type MarkerPoint = {
  id: string;
  x: string;
  y: number;
  color: string;
  scopeLabel: string;
  count: number;
  tooltip: string;
};

const KPI_COLUMNS: MetricKey[] = ["spend", "roas", "ctr", "cpc", "impressions", "clicks"];

const radarConfig = {
  baseline: {
    label: "Baseline",
    color: "hsl(var(--muted-foreground))",
  },
  delta: {
    label: "Delta",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const LINE_COLORS = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee", "#f97316", "#84cc16"];
const DELTA_TARGET_COLOR = "#ef4444";
const AD_SET_LOADING_STALE_MS = 25000;
const META_RATE_LIMIT_COOLDOWN_MS = 60000;
const IRIDESCENT_BADGE_CLASS =
  "border-cyan-300/70 bg-[linear-gradient(120deg,rgba(56,189,248,0.24),rgba(192,132,252,0.28),rgba(251,191,36,0.22))] text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset,0_4px_16px_rgba(56,189,248,0.22)] backdrop-blur-sm";
const LIVE_BADGE_CLASS = "border-border/70 bg-background/70 text-muted-foreground";
const SCOPE_SIGNPOST_STYLES: Record<ActionScopeType, { color: string; label: string }> = {
  CAMPAIGN: { color: "#38bdf8", label: "Campaign" },
  ADSET: { color: "#f59e0b", label: "Ad Set" },
  AD: { color: "#f43f5e", label: "Ad" },
  ACCOUNT: { color: "#a78bfa", label: "Account" },
  GLOBAL: { color: "#94a3b8", label: "Global" },
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

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

function formatMetricValue(metric: MetricKey, value: number): string {
  if (metric === "spend" || metric === "cpc") return formatCurrency(value);
  if (metric === "ctr") return formatPercent(value);
  if (metric === "roas") return value.toFixed(2);
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
      return "Impr.";
    case "clicks":
      return "Clicks";
    default:
      return metric;
  }
}

function getCampaignMetricValue(campaign: Campaign, metric: MetricKey): number {
  return campaign.metrics?.[metric] ?? 0;
}

function toActionScope(value: string | undefined): ActionScopeType {
  const normalized = (value ?? "").toUpperCase();
  if (normalized === "CAMPAIGN") return "CAMPAIGN";
  if (normalized === "ADSET") return "ADSET";
  if (normalized === "AD") return "AD";
  if (normalized === "ACCOUNT") return "ACCOUNT";
  return "GLOBAL";
}

function toResolutionBucket(timestamp: string, resolution: TimelineResolution): string | null {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  if (resolution === "daily") {
    return parsed.toISOString().slice(0, 10);
  }

  parsed.setMinutes(0, 0, 0);
  return parsed.toISOString();
}

function rowBucketKey(rowTimestamp: string, resolution: TimelineResolution): string {
  if (resolution === "daily") {
    return rowTimestamp.slice(0, 10);
  }

  const parsed = new Date(rowTimestamp);
  if (Number.isNaN(parsed.getTime())) return rowTimestamp;
  parsed.setMinutes(0, 0, 0);
  return parsed.toISOString();
}

function parseNumericRowValue(row: Record<string, unknown>, key: string | undefined): number | null {
  if (!key) return null;
  const raw = row[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function resolveAdSetIdFromAction(log: ActionLogMarker): string | null {
  if (log.metaAdsetId) return log.metaAdsetId;

  const candidates = [log.actionPayload, log.paramsChanged, log.result];
  for (const source of candidates) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    const raw =
      record.meta_adset_id ??
      record.metaAdsetId ??
      record.adset_id ??
      record.adSetId;
    if (typeof raw === "string" && raw.length > 0) {
      return raw;
    }
  }

  return null;
}

function resolveCampaignIdFromAction(log: ActionLogMarker): string | null {
  if (log.metaCampaignId) return log.metaCampaignId;

  const candidates = [log.actionPayload, log.paramsChanged, log.result];
  for (const source of candidates) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    const raw =
      record.meta_campaign_id ??
      record.metaCampaignId ??
      record.campaign_id ??
      record.campaignId;
    if (typeof raw === "string" && raw.length > 0) {
      return raw;
    }
  }

  return null;
}

function normalizeActionLogRow(input: unknown): ActionLogMarker | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;

  const id = readString([row.id]);
  const actionType = readString([row.actionType, row.action_type]) ?? "UNKNOWN";
  const status = readString([row.status]) ?? "UNKNOWN";
  const scopeType = readString([row.scopeType, row.scope_type]) ?? "GLOBAL";
  const scopeId = readString([row.scopeId, row.scope_id]) ?? "";
  const occurredAt = readString([row.occurredAt, row.occurred_at]) ?? "";

  if (!id || !occurredAt) return null;

  const actionPayload =
    row.actionPayload && typeof row.actionPayload === "object"
      ? (row.actionPayload as Record<string, unknown>)
      : row.action_payload && typeof row.action_payload === "object"
        ? (row.action_payload as Record<string, unknown>)
        : null;
  const paramsChanged =
    row.paramsChanged && typeof row.paramsChanged === "object"
      ? (row.paramsChanged as Record<string, unknown>)
      : row.params_changed && typeof row.params_changed === "object"
        ? (row.params_changed as Record<string, unknown>)
        : null;
  const result =
    row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>)
      : null;

  return {
    id,
    actionType,
    status,
    scopeType,
    scopeId,
    occurredAt,
    metaCampaignId: readString([row.metaCampaignId, row.meta_campaign_id]),
    metaAdsetId: readString([row.metaAdsetId, row.meta_adset_id]),
    metaAdId: readString([row.metaAdId, row.meta_ad_id]),
    actionPayload,
    paramsChanged,
    result,
    decisionNote: readString([row.decisionNote, row.decision_note]),
    error: readString([row.error]),
  };
}

function isActiveStatus(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "ACTIVE";
}

function getTrendMetricValue(point: PaidMetricsTrendPoint, metric: MetricKey): number {
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

function getDcoManagedCampaignIds(timelineCampaigns: Array<{ id: string; ad_sets?: Array<{ ads?: unknown[] }> }>): string[] {
  const explicitManagedIds = timelineCampaigns
    .filter((campaign) => campaign.ad_sets?.some((adSet) => Array.isArray(adSet.ads) && adSet.ads.length > 0))
    .map((campaign) => campaign.id);

  if (explicitManagedIds.length > 0) {
    return explicitManagedIds;
  }

  // Some timeline payloads do not include nested ad arrays. In that case,
  // presence in DCO timeline blocks is treated as DCO-managed for target overlays.
  return Array.from(new Set(timelineCampaigns.map((campaign) => campaign.id)));
}

function normalizeRadarValue(deltaPct: number): number {
  const clamped = Math.max(-100, Math.min(100, deltaPct));
  return 50 + clamped / 2;
}

function getEntityDeltaPct(
  metric: MetricKey,
  comparison: PaidMetricsComparison | undefined,
  isDcoEnabled: boolean,
  dcoDeltas: Record<string, unknown>
): number {
  if (isDcoEnabled) {
    if (metric === "spend") return toNumber(dcoDeltas.spend_delta_pct);
    if (metric === "roas") return toNumber(dcoDeltas.roas_delta_pct);
    if (metric === "ctr") return toNumber(dcoDeltas.ctr_delta_pct);
  }

  return comparison?.[metric]?.percentageChange ?? 0;
}

function computeTargetValue(actual: number, deltaPct: number): number | null {
  const ratio = 1 + deltaPct / 100;
  if (Math.abs(ratio) < 0.0001) return null;
  return actual / ratio;
}

function buildSeriesFromTrends(
  trends: PaidMetricsTrendPoint[] | undefined,
  metric: MetricKey,
  deltaPct: number,
  showTarget: boolean
): TrendSeriesPoint[] {
  if (!trends || trends.length === 0) {
    return [];
  }

  const latestActual = getTrendMetricValue(trends[trends.length - 1], metric);
  const derivedTarget = showTarget ? computeTargetValue(latestActual, deltaPct) : null;

  return trends.map((point) => {
    const actual = getTrendMetricValue(point, metric);
    return {
      timestamp: point.date,
      actual,
      target: derivedTarget,
    };
  });
}

function getLatestSeriesValue(
  rows: Array<object>,
  key: string | undefined
): number | null {
  if (!key) return null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = (rows[index] as Record<string, unknown>)?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getLatestSeriesPoint(
  rows: Array<object>,
  xKey: string,
  yKey: string | undefined
): { x: string | number; y: number } | null {
  if (!yKey) return null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] as Record<string, unknown>;
    const yValue = row[yKey];
    const xValue = row[xKey];

    const yParsed =
      typeof yValue === "number"
        ? yValue
        : typeof yValue === "string"
          ? Number(yValue)
          : NaN;

    if (!Number.isFinite(yParsed)) {
      continue;
    }

    if (typeof xValue === "string" || typeof xValue === "number") {
      return { x: xValue, y: yParsed };
    }
  }

  return null;
}

function formatDenominatorSummary(
  metric: MetricKey,
  actualValue: number | null,
  targetValue: number | null
): string | null {
  if (actualValue === null || targetValue === null || !Number.isFinite(targetValue) || targetValue <= 0) {
    return null;
  }

  const ratioPct = (actualValue / targetValue) * 100;
  return `${formatMetricValue(metric, actualValue)} / ${formatMetricValue(metric, targetValue)} (${ratioPct.toFixed(1)}%)`;
}

function isMetaRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user request limit reached") ||
    normalized.includes("code 17") ||
    normalized.includes("error_subcode: 2446079") ||
    normalized.includes("2446079")
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  if (!(error instanceof Error)) {
    return "Edge function request failed";
  }

  const baseMessage = error.message;
  const maybeContext = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
  if (!maybeContext) {
    return baseMessage;
  }

  try {
    if (typeof maybeContext.json === "function") {
      const payload = (await maybeContext.json()) as { error?: string };
      if (payload?.error) {
        return payload.error;
      }
    }
  } catch {
    // Fallback to plain-text extraction below.
  }

  try {
    if (typeof maybeContext.text === "function") {
      const text = await maybeContext.text();
      if (text) {
        return text;
      }
    }
  } catch {
    // Return the base error message when response parsing fails.
  }

  return baseMessage;
}

function buildTimelineFallbackAdSets(
  timelineCampaigns: Array<{ id: string; ad_sets?: Array<{ id?: string; name?: string; status?: string }> }>,
  campaignId: string
): AdSet[] {
  const campaign = timelineCampaigns.find((item) => item.id === campaignId);
  if (!campaign?.ad_sets?.length) {
    return [];
  }

  const seen = new Set<string>();
  const fallback: AdSet[] = [];

  campaign.ad_sets.forEach((adSet) => {
    if (!adSet.id || seen.has(adSet.id)) {
      return;
    }

    seen.add(adSet.id);
    fallback.push({
      id: adSet.id,
      name: adSet.name ?? adSet.id,
      status: adSet.status ?? "UNKNOWN",
    });
  });

  return fallback;
}

type ContextMetricCardProps = {
  metric: MetricKey;
  value: number;
  delta: number;
  selected: boolean;
  onClick: () => void;
};

function ContextMetricCard({ metric, value, delta, selected, onClick }: ContextMetricCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-3 py-2 text-left transition-colors",
        selected ? "border-emerald-400 bg-emerald-500/10" : "border-border bg-background hover:bg-muted/40"
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{labelForMetric(metric)}</div>
      <div className="mt-1 text-sm font-semibold">{formatMetricValue(metric, value)}</div>
      <div className={cn("text-xs", delta >= 0 ? "text-emerald-500" : "text-red-500")}>{delta.toFixed(2)}%</div>
    </button>
  );
}

type EntityRadarTooltipProps = {
  label: string;
  comparison?: PaidMetricsComparison;
  isDcoEnabled: boolean;
  dcoDeltas: Record<string, unknown>;
};

function EntityRadarTooltip({ label, comparison, isDcoEnabled, dcoDeltas }: EntityRadarTooltipProps) {
  const radarData = KPI_COLUMNS.map((metric) => {
    const deltaPct = getEntityDeltaPct(metric, comparison, isDcoEnabled, dcoDeltas);
    return {
      kpi: labelForMetric(metric),
      baseline: 50,
      delta: normalizeRadarValue(deltaPct),
      deltaPct,
    };
  });

  return (
    <TooltipContent className="w-[320px] border-border/70 bg-background/95 p-3" side="top" align="start">
      <div className="mb-2 text-xs font-medium text-foreground">{label} KPI Delta Radar</div>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
        <ChartContainer config={radarConfig} className="h-[170px] w-full">
          <RadarChart data={radarData} outerRadius={60}>
            <PolarGrid />
            <PolarAngleAxis dataKey="kpi" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis tick={false} domain={[0, 100]} axisLine={false} />
            <Radar dataKey="baseline" stroke="var(--color-baseline)" fill="transparent" />
            <Radar dataKey="delta" stroke="var(--color-delta)" fill="var(--color-delta)" fillOpacity={0.2} />
          </RadarChart>
        </ChartContainer>

        <div className="space-y-1 text-xs">
          {radarData.map((item) => (
            <div key={item.kpi} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                <span>{item.kpi}</span>
              </div>
              <span className={cn(item.deltaPct >= 0 ? "text-emerald-500" : "text-red-500")}>{item.deltaPct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">Center = no delta, outward = positive, inward = negative.</div>
    </TooltipContent>
  );
}

type MetricSparkCellProps = {
  metric: MetricKey;
  series: TrendSeriesPoint[];
  isSelected: boolean;
  showTarget: boolean;
  onClick: () => void;
};

function SignpostShape({
  cx,
  cy,
  color,
  tooltip,
  count,
}: {
  cx?: number;
  cy?: number;
  color: string;
  tooltip: string;
  count: number;
}) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  const top = cy - 12;

  return (
    <g>
      <title>{tooltip}</title>
      <line x1={cx} y1={cy} x2={cx} y2={top} stroke={color} strokeWidth={1.4} />
      <path d={`M ${cx} ${top} L ${cx + 7} ${top + 3} L ${cx} ${top + 6} Z`} fill={color} />
      {count > 1 ? (
        <text x={cx + 8} y={top + 4} fill={color} fontSize={9} fontWeight={700}>
          {count}
        </text>
      ) : null}
    </g>
  );
}

function MetricSparkCell({ metric, series, isSelected, showTarget, onClick }: MetricSparkCellProps) {
  const currentValue = series.length > 0 ? series[series.length - 1].actual : 0;
  const areaGradientId = React.useMemo(() => `spark-area-${metric}-${Math.random().toString(36).slice(2, 8)}`, [metric]);
  const latestTargetPoint = React.useMemo(() => {
    for (let index = series.length - 1; index >= 0; index -= 1) {
      const target = series[index]?.target;
      if (typeof target === "number" && Number.isFinite(target)) {
        return { x: series[index].timestamp, y: target };
      }
    }
    return null;
  }, [series]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-2 py-1 text-left transition-colors",
        isSelected ? "border-emerald-400 bg-emerald-500/10" : "border-border bg-background hover:bg-muted/40"
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{labelForMetric(metric)}</span>
        <span className="text-[11px] font-semibold">{formatMetricValue(metric, currentValue)}</span>
      </div>
      <div className="h-10">
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="stepAfter"
                dataKey="actual"
                stroke="#34d399"
                strokeWidth={1.8}
                fill={`url(#${areaGradientId})`}
                dot={false}
                isAnimationActive={false}
              />
              {showTarget ? (
                <Area
                  type="stepAfter"
                  dataKey="target"
                  stroke={DELTA_TARGET_COLOR}
                  strokeDasharray="3 3"
                  strokeWidth={1.25}
                  fillOpacity={0}
                  connectNulls
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null}
              {showTarget && latestTargetPoint ? (
                <ReferenceDot
                  x={latestTargetPoint.x}
                  y={latestTargetPoint.y}
                  r={2.8}
                  fill="white"
                  stroke={DELTA_TARGET_COLOR}
                  strokeWidth={1.3}
                  ifOverflow="extendDomain"
                  isFront
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center text-[10px] text-muted-foreground">No data</div>
        )}
      </div>
    </button>
  );
}

export function CampaignTimelineWorkspace({
  brandId,
  accountId,
  campaigns,
  isLoadingCampaigns,
  timeRangePreset,
  resolution,
  onResolutionChange,
  activeOnly,
  onActiveOnlyChange,
  onSelectedCampaignChange,
}: CampaignTimelineWorkspaceProps) {
  const [sortMetric, setSortMetric] = React.useState<MetricKey>("spend");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [selectedMetric, setSelectedMetric] = React.useState<MetricKey>("spend");
  const [expandedCampaignId, setExpandedCampaignId] = React.useState<string | undefined>();
  const [expandedAdSetChartId, setExpandedAdSetChartId] = React.useState<string | undefined>();
  const [focusedCampaignId, setFocusedCampaignId] = React.useState<string | undefined>();
  const [focusedAdSet, setFocusedAdSet] = React.useState<{ campaignId: string; adSetId: string } | undefined>();
  const [adSetState, setAdSetState] = React.useState<Record<string, AdSetLoadState>>({});
  const [timelineActionLogs, setTimelineActionLogs] = React.useState<ActionLogMarker[]>([]);

  const adSetStateRef = React.useRef(adSetState);
  const inFlightAdSetLoads = React.useRef<Set<string>>(new Set());
  const rateLimitedUntilRef = React.useRef<number>(0);

  React.useEffect(() => {
    adSetStateRef.current = adSetState;
  }, [adSetState]);

  const now = React.useMemo(() => new Date(), []);
  const endDateIso = React.useMemo(() => now.toISOString(), [now]);
  const startDate = React.useMemo(() => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysForPreset(timeRangePreset));
    return date.toISOString();
  }, [now, timeRangePreset]);

  const { blocks, campaigns: timelineCampaigns } = useTimelineBlocks({
    brandId,
    accountId,
    startDate,
    endDate: endDateIso,
    resolution,
  });

  React.useEffect(() => {
    let cancelled = false;

    async function loadActionLogs() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!accessToken || !supabaseUrl) {
          if (!cancelled) setTimelineActionLogs([]);
          return;
        }

        const allRows: unknown[] = [];
        let page = 1;
        let hasNextPage = true;

        while (!cancelled && hasNextPage && page <= 50) {
          const params = new URLSearchParams({
            brandId,
            metaAccountId: accountId,
            dateFrom: startDate,
            dateTo: endDateIso,
            sortBy: "occurred_at",
            sortOrder: "desc",
            page: String(page),
            pageSize: "100",
          });

          const response = await fetch(`${supabaseUrl}/functions/v1/fetch-rule-action-logs?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch action logs");
          }

          const payload = (await response.json()) as {
            data?: unknown[];
            pagination?: { hasNextPage?: boolean; totalPages?: number; page?: number };
          };

          if (Array.isArray(payload.data)) {
            allRows.push(...payload.data);
          }

          hasNextPage = Boolean(payload.pagination?.hasNextPage);
          page += 1;
        }

        if (!cancelled) {
          const deduped = new Map<string, ActionLogMarker>();
          allRows.forEach((row) => {
            const normalized = normalizeActionLogRow(row);
            if (!normalized) return;
            deduped.set(normalized.id, normalized);
          });

          const sorted = Array.from(deduped.values()).sort(
            (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
          );
          setTimelineActionLogs(sorted);
        }
      } catch {
        if (!cancelled) setTimelineActionLogs([]);
      }
    }

    void loadActionLogs();
    return () => {
      cancelled = true;
    };
  }, [accountId, brandId, endDateIso, startDate]);

  const latestDcoDeltas = React.useMemo(() => {
    const latestBlock = blocks[blocks.length - 1];
    return (latestBlock?.deltas ?? {}) as Record<string, unknown>;
  }, [blocks]);

  const latestSummaryMetrics = React.useMemo(() => {
    const latestBlock = blocks[blocks.length - 1];
    const summary = (latestBlock?.summary ?? {}) as Record<string, unknown>;

    return {
      spend: toNumber(summary.total_spend),
      roas: toNumber(summary.avg_roas),
      ctr: toNumber(summary.avg_ctr_pct),
      cpc: toNumber(summary.avg_cpc),
      impressions: toNumber(summary.total_impressions),
      clicks: toNumber(summary.total_clicks),
    };
  }, [blocks]);

  const dcoManagedCampaignIds = React.useMemo(() => {
    return getDcoManagedCampaignIds(timelineCampaigns);
  }, [timelineCampaigns]);

  const timelineAdSetFallbackByCampaignId = React.useMemo(() => {
    return timelineCampaigns.reduce<Record<string, AdSet[]>>((acc, campaign) => {
      acc[campaign.id] = buildTimelineFallbackAdSets(timelineCampaigns, campaign.id);
      return acc;
    }, {});
  }, [timelineCampaigns]);

  const filteredCampaigns = React.useMemo(() => {
    const managedSet = new Set(dcoManagedCampaignIds);

    return campaigns
      .filter((campaign) => {
        if (activeOnly && campaign.status.toUpperCase() !== "ACTIVE") {
          return false;
        }

        if (resolution === "hourly" && !managedSet.has(campaign.id)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftValue = getCampaignMetricValue(left, sortMetric);
        const rightValue = getCampaignMetricValue(right, sortMetric);
        return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
      });
  }, [activeOnly, campaigns, dcoManagedCampaignIds, resolution, sortDirection, sortMetric]);

  const loadAdSets = React.useCallback(
    async (campaignId: string) => {
      const current = adSetStateRef.current[campaignId];
      if (current?.status === "success" && current.source === "live") {
        return;
      }

      if (
        current?.status === "loading" &&
        current.loadingStartedAt &&
        Date.now() - current.loadingStartedAt < AD_SET_LOADING_STALE_MS
      ) {
        return;
      }

      if (inFlightAdSetLoads.current.has(campaignId)) {
        return;
      }

      if (Date.now() < rateLimitedUntilRef.current) {
        const secondsLeft = Math.ceil((rateLimitedUntilRef.current - Date.now()) / 1000);
        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: "error",
            adSets: prev[campaignId]?.adSets ?? [],
            errorMessage: `Meta API rate limit active. Retry in ~${secondsLeft}s.`,
          },
        }));
        return;
      }

      const fallbackAdSets = timelineAdSetFallbackByCampaignId[campaignId] ?? [];

      inFlightAdSetLoads.current.add(campaignId);
      setAdSetState((prev) => ({
        ...prev,
        [campaignId]: {
          status: "loading",
          adSets: fallbackAdSets.length > 0 ? fallbackAdSets : current?.adSets ?? [],
          source: fallbackAdSets.length > 0 ? "timeline" : current?.source,
          loadingStartedAt: Date.now(),
        },
      }));

      try {
        const supabase = createSupabaseBrowserClient();
        const invokePromise = supabase.functions.invoke(
          `fetch-meta-adsets?brandId=${brandId}&adAccountId=${accountId}&campaignId=${campaignId}`,
          {
            method: "POST",
            body: {
              brandId,
              adAccountId: accountId,
              campaignId,
            },
          }
        );

        const { data, error } = await withTimeout(invokePromise, 15000, "Ad set fetch");

        if (error) {
          const message = await extractInvokeErrorMessage(error);
          throw new Error(message);
        }

        const rawAdSets: AdSet[] = (data?.adsets ?? []).map((adSet: AdSet) => ({
          ...adSet,
          status: adSet.status ?? "UNKNOWN",
        }));
        const baseAdSets = rawAdSets.length > 0 ? rawAdSets : fallbackAdSets;
        const adSetsWithMetrics = await Promise.all(
          baseAdSets.map(async (adSet) => {
            try {
              const response = await withTimeout(
                fetch("/api/paid-metrics", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    platform: "meta",
                    brandId,
                    accountId,
                    adsetId: adSet.id,
                    range: { preset: timeRangePreset },
                  }),
                }),
                12000,
                "Ad set metrics fetch"
              );

              if (!response.ok) {
                return adSet;
              }

              const metrics = await response.json();
              return {
                ...adSet,
                metrics: metrics.metrics,
                comparison: metrics.comparison,
                trends: metrics.trends,
              };
            } catch {
              return adSet;
            }
          })
        );

        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: "success",
            adSets: adSetsWithMetrics,
            source: rawAdSets.length > 0 ? "live" : "timeline",
          },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load ad sets";
        if (isMetaRateLimitMessage(message)) {
          rateLimitedUntilRef.current = Date.now() + META_RATE_LIMIT_COOLDOWN_MS;
        }

        setAdSetState((prev) => ({
          ...prev,
          [campaignId]: {
            status: fallbackAdSets.length > 0 ? "success" : "error",
            adSets: fallbackAdSets,
            source: fallbackAdSets.length > 0 ? "timeline" : undefined,
            errorMessage:
              fallbackAdSets.length > 0 ? undefined : message,
          },
        }));
      } finally {
        inFlightAdSetLoads.current.delete(campaignId);
      }
    },
    [accountId, brandId, timeRangePreset, timelineAdSetFallbackByCampaignId]
  );

  React.useEffect(() => {
    setAdSetState({});
    setExpandedAdSetChartId(undefined);
    setFocusedAdSet(undefined);
    inFlightAdSetLoads.current.clear();
  }, [accountId, brandId, resolution, timeRangePreset]);

  React.useEffect(() => {
    setAdSetState((prev) => {
      const validCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
      const next = Object.fromEntries(
        Object.entries(prev).filter(([campaignId]) => validCampaignIds.has(campaignId))
      ) as Record<string, AdSetLoadState>;
      return next;
    });
  }, [campaigns]);

  React.useEffect(() => {
    if (filteredCampaigns.length === 0) {
      setExpandedCampaignId(undefined);
      setFocusedCampaignId(undefined);
      onSelectedCampaignChange?.(undefined);
      return;
    }

    const selected =
      expandedCampaignId && filteredCampaigns.some((campaign) => campaign.id === expandedCampaignId)
        ? expandedCampaignId
        : filteredCampaigns[0].id;

    setExpandedCampaignId(selected);
    setFocusedCampaignId((current) => current ?? selected);
    onSelectedCampaignChange?.(selected);
  }, [expandedCampaignId, filteredCampaigns, onSelectedCampaignChange]);

  React.useEffect(() => {
    if (!expandedCampaignId) return;
    void loadAdSets(expandedCampaignId);
  }, [expandedCampaignId, loadAdSets]);

  React.useEffect(() => {
    if (!focusedCampaignId) return;
    void loadAdSets(focusedCampaignId);
  }, [focusedCampaignId, loadAdSets]);

  const focusedCampaign = React.useMemo(
    () => campaigns.find((campaign) => campaign.id === focusedCampaignId),
    [campaigns, focusedCampaignId]
  );

  const focusedIsDcoEnabled = React.useMemo(() => {
    if (focusedCampaign) {
      return dcoManagedCampaignIds.includes(focusedCampaign.id);
    }

    return true;
  }, [dcoManagedCampaignIds, focusedCampaign]);

  const focusedComparison = focusedCampaign?.comparison;
  const focusedDeltaPct = getEntityDeltaPct(selectedMetric, focusedComparison, focusedIsDcoEnabled, latestDcoDeltas);
  // Campaign-level target overlays are intentionally hidden; DCO state is signaled via badges.
  const focusedShowTarget = false;

  const focusMetrics = focusedCampaign?.metrics ?? latestSummaryMetrics;
  const focusLabel = focusedCampaign ? `Campaign: ${focusedCampaign.name}` : "Account Context";

  const topChartModel = React.useMemo(() => {
    const rowsByTime = new Map<string, Record<string, unknown>>();
    const lines: TopChartLine[] = [];

    const ensureRow = (timestamp: string) => {
      if (!rowsByTime.has(timestamp)) {
        rowsByTime.set(timestamp, { timestamp });
      }
      return rowsByTime.get(timestamp)!;
    };

    if (focusedCampaign?.trends?.length) {
      const campaignSeries = buildSeriesFromTrends(
        focusedCampaign.trends,
        selectedMetric,
        getEntityDeltaPct(selectedMetric, focusedCampaign.comparison, dcoManagedCampaignIds.includes(focusedCampaign.id), latestDcoDeltas),
        focusedShowTarget
      );

      lines.push({ key: "campaign_actual", label: "Campaign", color: LINE_COLORS[0] });
      campaignSeries.forEach((point) => {
        const row = ensureRow(point.timestamp);
        row.campaign_actual = point.actual;
        if (focusedShowTarget && point.target !== null) {
          row.campaign_target = point.target;
        }
      });

      if (focusedShowTarget) {
        lines.push({ key: "campaign_target", label: "Target", color: DELTA_TARGET_COLOR, dashed: true });
      }

      const adSets = (adSetState[focusedCampaign.id]?.adSets ?? []).filter((adSet) =>
        activeOnly ? isActiveStatus(adSet.status) : true
      );
      adSets.forEach((adSet, index) => {
        const series = buildSeriesFromTrends(
          adSet.trends,
          selectedMetric,
          getEntityDeltaPct(selectedMetric, adSet.comparison, dcoManagedCampaignIds.includes(focusedCampaign.id), latestDcoDeltas),
          false
        );

        if (series.length === 0) {
          return;
        }

        const key = `adset_${index}`;
        lines.push({ key, label: adSet.name, color: LINE_COLORS[(index + 1) % LINE_COLORS.length] });

        series.forEach((point) => {
          const row = ensureRow(point.timestamp);
          row[key] = point.actual;
        });
      });
    } else {
      const accountSeries = blocks.map((block) => {
        const summary = (block.summary ?? {}) as Record<string, unknown>;
        const metricMap: Record<MetricKey, number> = {
          spend: toNumber(summary.total_spend),
          roas: toNumber(summary.avg_roas),
          ctr: toNumber(summary.avg_ctr_pct),
          cpc: toNumber(summary.avg_cpc),
          impressions: toNumber(summary.total_impressions),
          clicks: toNumber(summary.total_clicks),
        };

        return {
          timestamp: block.block_start,
          actual: metricMap[selectedMetric],
          target: focusedShowTarget ? computeTargetValue(metricMap[selectedMetric], focusedDeltaPct) : null,
        };
      });

      lines.push({ key: "account_actual", label: "Account", color: LINE_COLORS[0] });
      accountSeries.forEach((point) => {
        const row = ensureRow(point.timestamp);
        row.account_actual = point.actual;
        if (focusedShowTarget && point.target !== null) {
          row.account_target = point.target;
        }
      });

      if (focusedShowTarget) {
        lines.push({ key: "account_target", label: "Target", color: DELTA_TARGET_COLOR, dashed: true });
      }
    }

    const data = Array.from(rowsByTime.values()).sort((a, b) => {
      return new Date(String(a.timestamp)).getTime() - new Date(String(b.timestamp)).getTime();
    });

    return { data, lines };
  }, [activeOnly, adSetState, blocks, dcoManagedCampaignIds, focusedCampaign, focusedDeltaPct, focusedShowTarget, latestDcoDeltas, selectedMetric]);

  const graphTitle = focusedCampaign
    ? `${focusedCampaign.name} - ${labelForMetric(selectedMetric)}`
    : `Account - ${labelForMetric(selectedMetric)}`;

  const topPrimaryLineKey = React.useMemo(() => {
    const preferred = topChartModel.lines.find(
      (line) => line.key === "campaign_actual" || line.key === "account_actual"
    );
    if (preferred) return preferred.key;
    return topChartModel.lines.find((line) => !line.dashed)?.key;
  }, [topChartModel.lines]);

  const focusedKnownAdSetIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!focusedCampaignId) return ids;

    const loaded = adSetState[focusedCampaignId]?.adSets ?? [];
    loaded.forEach((adSet) => {
      if (adSet.id) ids.add(adSet.id);
    });

    const fallback = timelineAdSetFallbackByCampaignId[focusedCampaignId] ?? [];
    fallback.forEach((adSet) => {
      if (adSet.id) ids.add(adSet.id);
    });

    return ids;
  }, [adSetState, focusedCampaignId, timelineAdSetFallbackByCampaignId]);

  const scopedTimelineActionLogs = React.useMemo(() => {
    if (!focusedCampaignId) return [] as ActionLogMarker[];

    return timelineActionLogs.filter((log) => {
      const scope = toActionScope(log.scopeType);
      if (scope !== "CAMPAIGN" && scope !== "ADSET" && scope !== "AD") {
        return false;
      }

      const scopeId = log.scopeId;
      const campaignId = resolveCampaignIdFromAction(log) ?? (scope === "CAMPAIGN" ? scopeId : null);
      const adSetId = resolveAdSetIdFromAction(log) ?? (scope === "ADSET" ? scopeId : null);

      const campaignMatch = campaignId === focusedCampaignId || (scope === "CAMPAIGN" && scopeId === focusedCampaignId);
      const adSetMatch = Boolean(adSetId && focusedKnownAdSetIds.has(adSetId));

      if (scope === "CAMPAIGN") {
        return campaignMatch;
      }

      return adSetMatch || campaignMatch;
    });
  }, [focusedCampaignId, focusedKnownAdSetIds, timelineActionLogs]);

  const topSignposts = React.useMemo<MarkerPoint[]>(() => {
    if (!topPrimaryLineKey || scopedTimelineActionLogs.length === 0) {
      return [];
    }

    const rowByBucket = new Map<string, { timestamp: string; y: number }>();
    topChartModel.data.forEach((rawRow) => {
      const row = rawRow as Record<string, unknown>;
      const timestamp = String(row.timestamp ?? "");
      const bucket = rowBucketKey(timestamp, resolution);
      const y = parseNumericRowValue(row, topPrimaryLineKey);
      if (!timestamp || y === null) return;
      rowByBucket.set(bucket, { timestamp, y });
    });

    const grouped = new Map<
      string,
      {
        bucket: string;
        scope: ActionScopeType;
        count: number;
        actionTypes: Set<string>;
        statuses: Set<string>;
        latestAt: string;
      }
    >();

    scopedTimelineActionLogs.forEach((log) => {
      const scope = toActionScope(log.scopeType);
      if (scope !== "CAMPAIGN" && scope !== "ADSET" && scope !== "AD") return;
      const bucket = toResolutionBucket(log.occurredAt, resolution);
      if (!bucket || !rowByBucket.has(bucket)) return;

      const key = `${bucket}:${scope}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.actionTypes.add(log.actionType);
        existing.statuses.add(log.status);
        if (new Date(log.occurredAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = log.occurredAt;
        }
        return;
      }

      grouped.set(key, {
        bucket,
        scope,
        count: 1,
        actionTypes: new Set([log.actionType]),
        statuses: new Set([log.status]),
        latestAt: log.occurredAt,
      });
    });

    return Array.from(grouped.entries())
      .map(([id, group]) => {
        const row = rowByBucket.get(group.bucket);
        if (!row) return null;
        const style = SCOPE_SIGNPOST_STYLES[group.scope];
        const timestampLabel = new Date(group.latestAt).toLocaleString("en-US");
        const actionLabel = Array.from(group.actionTypes).slice(0, 2).join(", ");
        const statusLabel = Array.from(group.statuses).join(", ");
        return {
          id,
          x: row.timestamp,
          y: row.y,
          color: style.color,
          scopeLabel: style.label,
          count: group.count,
          tooltip: `${style.label} action${group.count > 1 ? "s" : ""} (${group.count})\n${actionLabel}\nStatus: ${statusLabel}\nLatest: ${timestampLabel}`,
        };
      })
      .filter((marker): marker is MarkerPoint => marker !== null);
  }, [resolution, scopedTimelineActionLogs, topChartModel.data, topPrimaryLineKey]);

  const adSetSignpostGroupsById = React.useMemo(() => {
    const groupedByAdSet = new Map<
      string,
      Map<
        string,
        {
          bucket: string;
          scope: ActionScopeType;
          count: number;
          actionTypes: Set<string>;
          statuses: Set<string>;
          latestAt: string;
        }
      >
    >();

    scopedTimelineActionLogs.forEach((log) => {
      const scope = toActionScope(log.scopeType);
      if (scope !== "ADSET" && scope !== "AD") return;
      const bucket = toResolutionBucket(log.occurredAt, resolution);
      if (!bucket) return;

      const adSetId =
        resolveAdSetIdFromAction(log) ??
        (scope === "ADSET" ? log.scopeId : null);
      if (!adSetId || !focusedKnownAdSetIds.has(adSetId)) return;

      if (!groupedByAdSet.has(adSetId)) {
        groupedByAdSet.set(adSetId, new Map());
      }

      const perAdSet = groupedByAdSet.get(adSetId)!;
      const key = `${bucket}:${scope}`;
      const existing = perAdSet.get(key);
      if (existing) {
        existing.count += 1;
        existing.actionTypes.add(log.actionType);
        existing.statuses.add(log.status);
        if (new Date(log.occurredAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = log.occurredAt;
        }
        return;
      }

      perAdSet.set(key, {
        bucket,
        scope,
        count: 1,
        actionTypes: new Set([log.actionType]),
        statuses: new Set([log.status]),
        latestAt: log.occurredAt,
      });
    });

    return groupedByAdSet;
  }, [focusedKnownAdSetIds, resolution, scopedTimelineActionLogs]);

  const topAreaGradientId = React.useMemo(
    () => `top-area-${selectedMetric}-${Math.random().toString(36).slice(2, 8)}`,
    [selectedMetric]
  );
  const topTargetLineKey = React.useMemo(
    () => topChartModel.lines.find((line) => line.dashed && line.label === "Target")?.key,
    [topChartModel.lines]
  );
  const topTargetPoint = React.useMemo(
    () => getLatestSeriesPoint(topChartModel.data, "timestamp", topTargetLineKey),
    [topChartModel.data, topTargetLineKey]
  );
  const topTargetValue = React.useMemo(
    () => topTargetPoint?.y ?? null,
    [topTargetPoint]
  );
  const topActualValue = React.useMemo(
    () => getLatestSeriesValue(topChartModel.data, topPrimaryLineKey),
    [topChartModel.data, topPrimaryLineKey]
  );
  const topDenominatorSummary = React.useMemo(
    () => formatDenominatorSummary(selectedMetric, topActualValue, topTargetValue),
    [selectedMetric, topActualValue, topTargetValue]
  );

  return (
    <TooltipProvider>
      <Card className="h-[70dvh] overflow-hidden">
        <CardHeader className="border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Campaign Timeline Workspace</CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={resolution} onValueChange={(value) => onResolutionChange(value as TimelineResolution)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortMetric} onValueChange={(value) => setSortMetric(value as MetricKey)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spend">Sort: Spend</SelectItem>
                  <SelectItem value="roas">Sort: ROAS</SelectItem>
                  <SelectItem value="ctr">Sort: CTR</SelectItem>
                  <SelectItem value="cpc">Sort: CPC</SelectItem>
                  <SelectItem value="impressions">Sort: Impr.</SelectItem>
                  <SelectItem value="clicks">Sort: Clicks</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Highest</SelectItem>
                  <SelectItem value="asc">Lowest</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                <span>Active only</span>
                <Switch checked={activeOnly} onCheckedChange={onActiveOnlyChange} />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex h-[calc(70dvh-4.5rem)] flex-col gap-3 overflow-hidden p-3">
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <span>{focusLabel}</span>
                {focusedCampaign ? (
                  <Badge
                    variant="outline"
                    className={focusedIsDcoEnabled ? IRIDESCENT_BADGE_CLASS : LIVE_BADGE_CLASS}
                  >
                    {focusedIsDcoEnabled ? "DCO" : "Live"}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {topDenominatorSummary ? (
                  <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-500">
                    Target baseline: {topDenominatorSummary}
                  </span>
                ) : null}
                <span>{graphTitle}</span>
              </div>
            </div>

            <div className="mb-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              {KPI_COLUMNS.map((metric) => {
                const delta = getEntityDeltaPct(metric, focusedComparison, focusedIsDcoEnabled, latestDcoDeltas);
                return (
                  <ContextMetricCard
                    key={`ctx-${metric}`}
                    metric={metric}
                    value={focusMetrics?.[metric] ?? 0}
                    delta={delta}
                    selected={selectedMetric === metric}
                    onClick={() => setSelectedMetric(metric)}
                  />
                );
              })}
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={topChartModel.data} margin={{ top: 8, right: 8, left: 2, bottom: 0 }}>
                  <defs>
                    <linearGradient id={topAreaGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.24} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="2 3" strokeOpacity={0.08} />
                  <XAxis dataKey="timestamp" hide />
                  <YAxis
                    tickFormatter={(value) => formatMetricValue(selectedMetric, Number(value))}
                    width={90}
                    tickCount={4}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip
                    labelFormatter={(value) => new Date(String(value)).toLocaleString("en-US")}
                    formatter={(value, name) => {
                      const lineMeta = topChartModel.lines.find((line) => line.key === name);
                      return [formatMetricValue(selectedMetric, Number(value)), lineMeta?.label ?? String(name)];
                    }}
                  />
                  {topChartModel.lines.map((line) => (
                    <Area
                      key={line.key}
                      type="stepAfter"
                      dataKey={line.key}
                      stroke={line.color}
                      strokeWidth={line.dashed ? 1.5 : 2}
                      strokeDasharray={line.dashed ? "4 4" : undefined}
                      fill={line.key === topPrimaryLineKey ? `url(#${topAreaGradientId})` : "transparent"}
                      fillOpacity={line.key === topPrimaryLineKey ? 1 : 0}
                      isAnimationActive={false}
                      dot={false}
                      connectNulls
                    />
                  ))}
                  {topSignposts.map((marker) => (
                    <ReferenceDot
                      key={`top-signpost-${marker.id}`}
                      x={marker.x}
                      y={marker.y}
                      ifOverflow="extendDomain"
                      isFront
                      shape={(props) => (
                        <SignpostShape
                          cx={props.cx}
                          cy={props.cy}
                          color={marker.color}
                          tooltip={marker.tooltip}
                          count={marker.count}
                        />
                      )}
                    />
                  ))}
                  {topTargetValue !== null ? (
                    <ReferenceLine
                      y={topTargetValue}
                      stroke={DELTA_TARGET_COLOR}
                      strokeDasharray="2 3"
                      strokeOpacity={0.45}
                      ifOverflow="extendDomain"
                      label={{
                        value: `Target ${formatMetricValue(selectedMetric, topTargetValue)}`,
                        position: "insideTopRight",
                        fill: DELTA_TARGET_COLOR,
                        fontSize: 10,
                      }}
                    />
                  ) : null}
                  {topTargetPoint ? (
                    <ReferenceDot
                      x={topTargetPoint.x}
                      y={topTargetPoint.y}
                      r={4.8}
                      fill="white"
                      stroke={DELTA_TARGET_COLOR}
                      strokeWidth={2}
                      label={{
                        value: "T",
                        position: "top",
                        fill: DELTA_TARGET_COLOR,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                      ifOverflow="extendDomain"
                      isFront
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-md border">
            <div className="grid grid-cols-[minmax(260px,1.2fr)_repeat(6,minmax(130px,1fr))] gap-2 border-b bg-muted/20 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <div>Campaign / Ad Set</div>
              {KPI_COLUMNS.map((metric) => (
                <div key={metric}>{labelForMetric(metric)}</div>
              ))}
            </div>

            {isLoadingCampaigns ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No campaigns match this filter.</div>
            ) : (
              <div className="divide-y">
                {filteredCampaigns.map((campaign) => {
                  const isExpanded = expandedCampaignId === campaign.id;
                  const adSetLoad = adSetState[campaign.id] ?? { status: "idle", adSets: [] };
                  const visibleAdSets = activeOnly
                    ? adSetLoad.adSets.filter((adSet) => isActiveStatus(adSet.status))
                    : adSetLoad.adSets;
                  const showAdSetRows =
                    (adSetLoad.status === "success" || adSetLoad.status === "loading") &&
                    visibleAdSets.length > 0;
                  const isDcoManaged = dcoManagedCampaignIds.includes(campaign.id);

                  const campaignDeltaByMetric = Object.fromEntries(
                    KPI_COLUMNS.map((metric) => [
                      metric,
                      getEntityDeltaPct(metric, campaign.comparison, isDcoManaged, latestDcoDeltas),
                    ])
                  ) as Record<MetricKey, number>;

                  const campaignSeriesByMetric = Object.fromEntries(
                    KPI_COLUMNS.map((metric) => {
                      const showTarget = isDcoManaged && (metric === "spend" || metric === "roas" || metric === "ctr");
                      return [metric, buildSeriesFromTrends(campaign.trends, metric, campaignDeltaByMetric[metric], showTarget)];
                    })
                  ) as Record<MetricKey, TrendSeriesPoint[]>;

                  return (
                    <div key={campaign.id} className="p-3">
                      <div className="grid grid-cols-[minmax(260px,1.2fr)_repeat(6,minmax(130px,1fr))] gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                const next = isExpanded ? undefined : campaign.id;
                                setExpandedCampaignId(next);
                                if (next) {
                                  setFocusedCampaignId(campaign.id);
                                  setFocusedAdSet(undefined);
                                  setExpandedAdSetChartId(undefined);
                                }
                                onSelectedCampaignChange?.(next);
                              }}
                            >
                              <ChevronDownIcon className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "")} />
                            </Button>

                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="truncate text-left text-sm font-semibold hover:underline"
                                  onClick={() => {
                                    setFocusedCampaignId(campaign.id);
                                    setFocusedAdSet(undefined);
                                    onSelectedCampaignChange?.(campaign.id);
                                  }}
                                >
                                  {campaign.name}
                                </button>
                              </TooltipTrigger>
                              <EntityRadarTooltip
                                label={campaign.name}
                                comparison={campaign.comparison}
                                isDcoEnabled={isDcoManaged}
                                dcoDeltas={latestDcoDeltas}
                              />
                            </UiTooltip>
                          </div>

                          <div className="ml-8 mt-1 flex items-center gap-2">
                            <Badge variant={campaign.status.toUpperCase() === "ACTIVE" ? "default" : "secondary"}>{campaign.status}</Badge>
                            <Badge
                              variant="outline"
                              className={isDcoManaged ? IRIDESCENT_BADGE_CLASS : LIVE_BADGE_CLASS}
                            >
                              {isDcoManaged ? "DCO" : "Live"}
                            </Badge>
                          </div>
                        </div>

                        {KPI_COLUMNS.map((metric) => {
                          const showTarget = false;

                          return (
                            <MetricSparkCell
                              key={`${campaign.id}-${metric}`}
                              metric={metric}
                              series={campaignSeriesByMetric[metric]}
                              isSelected={!focusedAdSet && focusedCampaignId === campaign.id && selectedMetric === metric}
                              showTarget={showTarget}
                              onClick={() => {
                                setSelectedMetric(metric);
                                setFocusedCampaignId(campaign.id);
                                setFocusedAdSet(undefined);
                                onSelectedCampaignChange?.(campaign.id);
                              }}
                            />
                          );
                        })}
                      </div>

                      {isExpanded ? (
                        <div className="mt-2 ml-8 rounded border bg-muted/10 p-2">
                          {adSetLoad.status === "loading" ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <ReloadIcon className="h-3 w-3 animate-spin" />
                              {visibleAdSets.length > 0 ? "Refreshing live ad sets..." : "Loading ad sets..."}
                            </div>
                          ) : null}

                          {adSetLoad.status === "error" ? (
                            <div className="flex items-center gap-2 text-xs text-destructive">
                              <span>{adSetLoad.errorMessage ?? "Failed to load ad sets"}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => {
                                  setAdSetState((prev) => ({
                                    ...prev,
                                    [campaign.id]: { status: "idle", adSets: [] },
                                  }));
                                  void loadAdSets(campaign.id);
                                }}
                              >
                                Retry
                              </Button>
                            </div>
                          ) : null}

                          {(adSetLoad.status === "success" || adSetLoad.status === "error") && visibleAdSets.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {activeOnly ? "No active ad sets for this campaign." : "No ad sets returned for this campaign."}
                            </div>
                          ) : null}

                          {showAdSetRows ? (
                            <div className="space-y-2">
                              {[...visibleAdSets]
                                .sort((left, right) => {
                                  const leftValue = left.metrics?.[sortMetric] ?? 0;
                                  const rightValue = right.metrics?.[sortMetric] ?? 0;
                                  return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
                                })
                                .map((adSet) => {
                                  const adSetChartId = `${campaign.id}::${adSet.id}`;
                                  const adSetExpanded = expandedAdSetChartId === adSetChartId;

                                  const adSetSeriesByMetric = Object.fromEntries(
                                    KPI_COLUMNS.map((metric) => {
                                      const deltaPct = getEntityDeltaPct(metric, adSet.comparison, isDcoManaged, latestDcoDeltas);
                                      const showTarget = isDcoManaged && (metric === "spend" || metric === "roas" || metric === "ctr");
                                      return [metric, buildSeriesFromTrends(adSet.trends, metric, deltaPct, showTarget)];
                                    })
                                  ) as Record<MetricKey, TrendSeriesPoint[]>;

                                  const adSetDeltaForSelected = getEntityDeltaPct(
                                    selectedMetric,
                                    adSet.comparison,
                                    isDcoManaged,
                                    latestDcoDeltas
                                  );
                                  const selectedSeries = adSetSeriesByMetric[selectedMetric];
                                  const adSetTargetValue = getLatestSeriesValue(selectedSeries, "target");
                                  const adSetActualValue = getLatestSeriesValue(selectedSeries, "actual");
                                  const adSetTargetPoint = getLatestSeriesPoint(selectedSeries, "timestamp", "target");
                                  const adSetSignposts = (() => {
                                    const grouped = adSetSignpostGroupsById.get(adSet.id);
                                    if (!grouped || selectedSeries.length === 0) return [] as MarkerPoint[];

                                    const rowByBucket = new Map<string, { timestamp: string; y: number }>();
                                    selectedSeries.forEach((point) => {
                                      const bucket = rowBucketKey(point.timestamp, resolution);
                                      if (typeof point.actual === "number" && Number.isFinite(point.actual)) {
                                        rowByBucket.set(bucket, { timestamp: point.timestamp, y: point.actual });
                                      }
                                    });

                                    return Array.from(grouped.entries())
                                      .map(([id, group]) => {
                                        const row = rowByBucket.get(group.bucket);
                                        if (!row) return null;
                                        const style = SCOPE_SIGNPOST_STYLES[group.scope];
                                        const timestampLabel = new Date(group.latestAt).toLocaleString("en-US");
                                        const actionLabel = Array.from(group.actionTypes).slice(0, 2).join(", ");
                                        const statusLabel = Array.from(group.statuses).join(", ");
                                        return {
                                          id,
                                          x: row.timestamp,
                                          y: row.y,
                                          color: style.color,
                                          scopeLabel: style.label,
                                          count: group.count,
                                          tooltip: `${style.label} action${group.count > 1 ? "s" : ""} (${group.count})\n${actionLabel}\nStatus: ${statusLabel}\nLatest: ${timestampLabel}`,
                                        };
                                      })
                                      .filter((marker): marker is MarkerPoint => marker !== null);
                                  })();
                                  const adSetDenominatorSummary = formatDenominatorSummary(
                                    selectedMetric,
                                    adSetActualValue,
                                    adSetTargetValue
                                  );

                                  return (
                                    <div key={adSet.id} className="rounded border bg-background p-2">
                                      <div className="grid grid-cols-[minmax(220px,1.1fr)_repeat(6,minmax(120px,1fr))] gap-2">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0"
                                              onClick={() => {
                                                const next = adSetExpanded ? undefined : adSetChartId;
                                                setExpandedAdSetChartId(next);
                                                setFocusedCampaignId(campaign.id);
                                                setFocusedAdSet({ campaignId: campaign.id, adSetId: adSet.id });
                                                onSelectedCampaignChange?.(campaign.id);
                                              }}
                                            >
                                              <ChevronDownIcon className={cn("h-3 w-3 transition-transform", adSetExpanded ? "rotate-180" : "")} />
                                            </Button>

                                            <UiTooltip>
                                              <TooltipTrigger asChild>
                                                <button
                                                  type="button"
                                                  className="truncate text-left text-xs font-semibold hover:underline"
                                                  onClick={() => {
                                                    setFocusedCampaignId(campaign.id);
                                                    setFocusedAdSet({ campaignId: campaign.id, adSetId: adSet.id });
                                                    onSelectedCampaignChange?.(campaign.id);
                                                  }}
                                                >
                                                  {adSet.name}
                                                </button>
                                              </TooltipTrigger>
                                              <EntityRadarTooltip
                                                label={adSet.name}
                                                comparison={adSet.comparison}
                                                isDcoEnabled={isDcoManaged}
                                                dcoDeltas={latestDcoDeltas}
                                              />
                                            </UiTooltip>
                                            <Badge variant={adSet.status?.toUpperCase() === "ACTIVE" ? "default" : "secondary"}>
                                              {adSet.status ?? "UNKNOWN"}
                                            </Badge>
                                          </div>
                                        </div>

                                        {KPI_COLUMNS.map((metric) => {
                                          const showTarget = isDcoManaged && (metric === "spend" || metric === "roas" || metric === "ctr");
                                          return (
                                            <MetricSparkCell
                                              key={`${campaign.id}-${adSet.id}-${metric}`}
                                              metric={metric}
                                              series={adSetSeriesByMetric[metric]}
                                              isSelected={
                                                focusedAdSet?.campaignId === campaign.id &&
                                                focusedAdSet?.adSetId === adSet.id &&
                                                selectedMetric === metric
                                              }
                                              showTarget={showTarget}
                                              onClick={() => {
                                                setSelectedMetric(metric);
                                                setFocusedCampaignId(campaign.id);
                                                setFocusedAdSet({ campaignId: campaign.id, adSetId: adSet.id });
                                                onSelectedCampaignChange?.(campaign.id);
                                              }}
                                            />
                                          );
                                        })}
                                      </div>

                                      {adSetExpanded ? (
                                        <div className="mt-2 rounded border bg-muted/20 p-2">
                                          <div className="mb-2 flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">{adSet.name} {labelForMetric(selectedMetric)} trend</span>
                                            <div className="flex items-center gap-2">
                                              {adSetDenominatorSummary ? (
                                                <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-500">
                                                  Target baseline: {adSetDenominatorSummary}
                                                </span>
                                              ) : null}
                                              <span className={cn(adSetDeltaForSelected >= 0 ? "text-emerald-500" : "text-red-500")}>
                                                Delta: {adSetDeltaForSelected.toFixed(2)}%
                                              </span>
                                            </div>
                                          </div>
                                          <div className="h-40">
                                            <ResponsiveContainer width="100%" height="100%">
                                              <AreaChart
                                                data={adSetSeriesByMetric[selectedMetric]}
                                                margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                                              >
                                                <defs>
                                                  <linearGradient
                                                    id={`adset-area-${campaign.id}-${adSet.id}-${selectedMetric}`}
                                                    x1="0"
                                                    y1="0"
                                                    x2="0"
                                                    y2="1"
                                                  >
                                                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.24} />
                                                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                                  </linearGradient>
                                                </defs>
                                                <CartesianGrid vertical={false} strokeDasharray="2 3" strokeOpacity={0.08} />
                                                <XAxis dataKey="timestamp" hide />
                                                <YAxis tick={{ fontSize: 10 }} width={80} tickCount={4} />
                                                <RechartsTooltip
                                                  labelFormatter={(value) => new Date(String(value)).toLocaleString("en-US")}
                                                  formatter={(value, name) => {
                                                    if (name === "target") {
                                                      return [formatMetricValue(selectedMetric, Number(value)), "Target"];
                                                    }
                                                    return [formatMetricValue(selectedMetric, Number(value)), "Actual"];
                                                  }}
                                                />
                                                <Area
                                                  type="stepAfter"
                                                  dataKey="actual"
                                                  stroke="#34d399"
                                                  strokeWidth={2}
                                                  fill={`url(#adset-area-${campaign.id}-${adSet.id}-${selectedMetric})`}
                                                  dot={false}
                                                  isAnimationActive={false}
                                                />
                                                {adSetSignposts.map((marker) => (
                                                  <ReferenceDot
                                                    key={`adset-signpost-${adSet.id}-${marker.id}`}
                                                    x={marker.x}
                                                    y={marker.y}
                                                    ifOverflow="extendDomain"
                                                    isFront
                                                    shape={(props) => (
                                                      <SignpostShape
                                                        cx={props.cx}
                                                        cy={props.cy}
                                                        color={marker.color}
                                                        tooltip={marker.tooltip}
                                                        count={marker.count}
                                                      />
                                                    )}
                                                  />
                                                ))}
                                                {isDcoManaged && (selectedMetric === "spend" || selectedMetric === "roas" || selectedMetric === "ctr") ? (
                                                  <Area
                                                    type="stepAfter"
                                                    dataKey="target"
                                                    stroke={DELTA_TARGET_COLOR}
                                                    strokeDasharray="4 4"
                                                    strokeWidth={1.5}
                                                    fillOpacity={0}
                                                    isAnimationActive={false}
                                                    dot={false}
                                                    connectNulls
                                                  />
                                                ) : null}
                                                {adSetTargetValue !== null ? (
                                                  <ReferenceLine
                                                    y={adSetTargetValue}
                                                    stroke={DELTA_TARGET_COLOR}
                                                    strokeDasharray="2 3"
                                                    strokeOpacity={0.45}
                                                    ifOverflow="extendDomain"
                                                    label={{
                                                      value: `Target ${formatMetricValue(selectedMetric, adSetTargetValue)}`,
                                                      position: "insideTopRight",
                                                      fill: DELTA_TARGET_COLOR,
                                                      fontSize: 10,
                                                    }}
                                                  />
                                                ) : null}
                                                {adSetTargetPoint ? (
                                                  <ReferenceDot
                                                    x={adSetTargetPoint.x}
                                                    y={adSetTargetPoint.y}
                                                    r={4.2}
                                                    fill="white"
                                                    stroke={DELTA_TARGET_COLOR}
                                                    strokeWidth={1.8}
                                                    label={{
                                                      value: "T",
                                                      position: "top",
                                                      fill: DELTA_TARGET_COLOR,
                                                      fontSize: 10,
                                                      fontWeight: 700,
                                                    }}
                                                    ifOverflow="extendDomain"
                                                    isFront
                                                  />
                                                ) : null}
                                              </AreaChart>
                                            </ResponsiveContainer>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
