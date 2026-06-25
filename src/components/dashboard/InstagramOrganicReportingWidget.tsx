"use client";

import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Text,
} from "@radix-ui/themes";
import React from "react";
import { CartesianGrid, XAxis, LineChart, Line, YAxis, PieChart, Pie, Cell } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fetchOrganicAnalytics } from "@/lib/api/organicAnalytics.client";
import type { OrganicMetricsResponse, OrganicDateRangePreset, OrganicPlatform, MetricComparison, OrganicTrendPoint } from "@/lib/schemas/organicMetrics";
import { IntegrationErrorBanner } from "@/components/ui/IntegrationErrorBanner";
import type { IntegrationErrorCode } from "@continuum/contracts";
import { cn } from "@/lib/utils";
import { useAccountSelectionStore } from "@/lib/integrations/accountSelectionStore";
import { OrganicMetricsWidgetSkeleton } from "@/components/organic/MetricsSkeleton";
import { PlatformIcon } from "@/components/onboarding/PlatformIcons";

export type InstagramAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type Props = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
  initialPlatform?: OrganicPlatform;
  className?: string;
};

// Platforms this widget can fetch real organic metrics for; others show a placeholder.
const SUPPORTED_WIDGET_PLATFORMS: ReadonlySet<OrganicPlatform> = new Set(["instagram", "youtube"]);

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: "success"; data: OrganicMetricsResponse };

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";

type MetricKey = keyof OrganicMetricsResponse["metrics"];

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
};

const METRIC_LABELS: Record<string, string> = {
  reach: "Reach",
  views: "Views",
  newFollowers: "New followers",
  accountsEngaged: "Accounts engaged",
  reelsViews: "Reels views",
  postViews: "Post views",
  storiesViews: "Stories views",
  profileVisitsYesterday: "Profile visits",
  nonFollowerReach: "Non-follower reach",
  followerReach: "Follower reach",
  likes: "Likes",
  comments: "Comments",
  replies: "Replies",
  shares: "Shares",
  saved: "Saved",
  totalInteractions: "Total interactions",
  subscribers: "Subscribers",
  impressions: "Impressions",
};

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function rangeLabel(preset: OrganicDateRangePreset) {
  return preset.replaceAll("_", " ");
}

function formatPercent(value?: number) {
  if (value === undefined) return null;
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? "+" : "-"}${rounded}%`;
}

// Maps the response's real per-day trend points to a single-series dataset for
// the selected KPI, so the chart tooltip shows the actual value on each date.
// Returns null when the response carries no daily series for that metric
// (OrganicTrendPoint only covers a subset of metric keys).
function buildDailySeries(
  trends: OrganicTrendPoint[] | undefined,
  metricKey: MetricKey,
): Array<{ date: string; value: number }> | null {
  if (!trends || trends.length === 0) return null;
  const series = trends
    .map((point) => {
      const value = (point as Record<string, unknown>)[metricKey];
      return typeof value === "number" ? { date: point.date, value } : null;
    })
    .filter((entry): entry is { date: string; value: number } => entry !== null);
  return series.length > 0 ? series : null;
}

function InteractionBreakdownCharts({ breakdowns }: { breakdowns: Record<string, Record<string, number>> }) {
  const interactionMetrics = ['likes', 'comments', 'shares', 'saved'];

  return (
    <Box pt="4">
      <Heading size="4" mb="3">Interaction Breakdown by Content Type</Heading>
      <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="3">
        {interactionMetrics.map((metric) => {
          const metricData = breakdowns[metric];
          if (!metricData || Object.keys(metricData).length === 0) return null;

          const chartData = Object.entries(metricData).map(([type, value]) => ({
            name: type,
            value,
            fill: getColorForType(type),
          }));

          return (
            <Card variant="surface" className="border border-subtle bg-surface" key={metric}>
              <Box p="3">
                <Text size="2" color="gray" mb="2">{METRIC_LABELS[metric]}</Text>
                <ChartContainer config={{}} className="aspect-square h-[120px] w-full">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={50}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </Box>
            </Card>
          );
        })}
      </Grid>
    </Box>
  );
}

function getColorForType(type: string): string {
  switch (type.toUpperCase()) {
    case 'REEL': return 'var(--color-primary)';
    case 'POST': return 'var(--color-secondary)';
    case 'STORY': return 'var(--color-accent)';
    default: return 'var(--color-muted)';
  }
}

export function InstagramOrganicReportingWidget({ brandId, accounts, youtubeAccounts = [], initialPlatform = "instagram", className }: Props) {
  const [platform, setPlatform] = React.useState<OrganicPlatform>(initialPlatform);
  const { getSelection, setSelection } = useAccountSelectionStore();
  const platformAccounts = platform === "youtube" ? youtubeAccounts : accounts;
  const isSupportedPlatform = SUPPORTED_WIDGET_PLATFORMS.has(platform);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(
    () => {
      const stored = useAccountSelectionStore.getState().getSelection(brandId, initialPlatform);
      const isValid = stored !== null && accounts.some((a) => a.integrationAccountId === stored);
      return isValid ? stored : (accounts[0]?.integrationAccountId ?? null);
    }
  );
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);

  // Re-resolve the selected account when the brand or platform changes (each
  // platform keeps its own remembered selection and its own account list).
  React.useEffect(() => {
    const stored = getSelection(brandId, platform);
    const isValid = stored !== null && platformAccounts.some((a) => a.integrationAccountId === stored);
    setSelectedAccountId(isValid ? stored : (platformAccounts[0]?.integrationAccountId ?? null));
    setState({ status: "idle" });
    setExpandedMetric(null);
  }, [brandId, platform, platformAccounts, getSelection]);

  const selectedAccount = platformAccounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  React.useEffect(() => {
    if (selectedAccountId === null || !isSupportedPlatform) {
      if (!isSupportedPlatform) {
        setState({ status: "idle" });
      }
      return;
    }
    const accountId = selectedAccountId;
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId: accountId,
          platform: platform as "instagram" | "youtube",
          range: { preset: DEFAULT_RANGE_PRESET },
          scope: "kpis",
        });
        if (cancelled) return;
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
        const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
        const retryAfter = (error as { retryAfter?: number }).retryAfter;
        setState({ status: "error", message, errorCode, retryAfter });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId, platform]);

  return (
    <Card data-tour-id="dashboard-organic-metrics" variant="surface" className={cn("border border-subtle bg-surface flex flex-col gap-0 overflow-hidden py-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 bg-muted/20 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select.Root value={platform} onValueChange={(val) => setPlatform(val as OrganicPlatform)}>
            <Select.Trigger variant="ghost" className="p-0 h-auto">
              <Badge color="gray" variant="soft" radius="full">
                <PlatformIcon platform={platform === "x" ? "threads" : platform} />
              </Badge>
            </Select.Trigger>
            <Select.Content position="popper">
              <Select.Item value="instagram">
                <Flex align="center" gap="2">
                  <PlatformIcon platform="instagram" />
                  <Text>Instagram</Text>
                </Flex>
              </Select.Item>
              <Select.Item value="youtube">
                <Flex align="center" gap="2">
                  <PlatformIcon platform="youtube" />
                  <Text>YouTube</Text>
                </Flex>
              </Select.Item>
              <Select.Item value="x" disabled>
                <Flex align="center" gap="2" style={{ opacity: 0.5 }}>
                  <PlatformIcon platform="threads" />
                  <Text>X</Text>
                </Flex>
              </Select.Item>
              <Select.Item value="tiktok" disabled>
                <Flex align="center" gap="2" style={{ opacity: 0.5 }}>
                  <PlatformIcon platform="tiktok" />
                  <Text>TikTok</Text>
                </Flex>
              </Select.Item>
            </Select.Content>
          </Select.Root>
          <h3 className="truncate text-xs font-semibold capitalize sm:text-sm">{platform} reporting</h3>
          <span className="hidden whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground sm:inline-block">
            {rangeLabel(DEFAULT_RANGE_PRESET)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div data-tour-id="dashboard-account-selector" className="inline-flex">
            <Select.Root
              value={selectedAccountId ?? ""}
              onValueChange={(value) => {
                setSelectedAccountId(value);
                setSelection(brandId, platform, value);
              }}
            >
              <Select.Trigger variant="surface" radius="medium" className="h-7 text-xs">
                {selectedAccount?.name ?? `Select ${platform} account`}
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
          </div>
        </div>
      </div>

      <Box p="2" className="min-h-0 flex flex-col">
        <Box pt="0" className="min-h-0">
          {!isSupportedPlatform ? (
             <Box py="8">
                <Flex direction="column" align="center" justify="center" gap="3">
                  <PlatformIcon platform={platform === "x" ? "threads" : platform} size={48} className="opacity-20" />
                  <Heading size="4" color="gray">{platform} Support Coming Soon</Heading>
                  <Text color="gray" size="2" align="center" style={{ maxWidth: 300 }}>
                    We&apos;re currently working on integrating {platform} organic metrics into your dashboard.
                  </Text>
                </Flex>
             </Box>
          ) : platformAccounts.length === 0 ? (
            <Text color="gray" size="2">
              No {platform} accounts are linked to this brand profile.
            </Text>
          ) : state.status === "error" ? (
            <IntegrationErrorBanner
              errorCode={state.errorCode}
              message={state.message}
              platform={platform}
              retryAfter={state.retryAfter}
            />
          ) : state.status === "loading" ? (
            <OrganicMetricsWidgetSkeleton />
           ) : state.status === "success" ? (
             <MetricsPanel
               data={state.data}
               expandedMetric={expandedMetric}
               onMetricSelect={setExpandedMetric}
             />
           ) : (
            <Text color="gray" size="2">
              Select a {platform} account to view organic reporting.
            </Text>
          )}
        </Box>
      </Box>
    </Card>
  );
}

// Compact, data-backed bars showing the metric's recent daily series. Reserves
// its height even when the series is unavailable so cards stay aligned.
function MiniBars({ values, active }: { values: number[]; active?: boolean }) {
  if (values.length === 0) return <div className="h-5" aria-hidden="true" />;
  const max = Math.max(...values, 1);

  return (
    <div className="flex h-5 items-end gap-px" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            "min-w-[2px] flex-1 rounded-[1px]",
            active ? "bg-[var(--primary)]" : "bg-[color-mix(in_srgb,var(--muted-foreground)_35%,transparent)]",
          )}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function MetricsPanel({
  data,
  expandedMetric,
  onMetricSelect,
}: {
  data: OrganicMetricsResponse;
  expandedMetric: MetricKey | null;
  onMetricSelect: (key: MetricKey | null) => void;
}) {
  const { metrics, comparison: rawComparison, range, interactionBreakdowns: rawBreakdowns } = data;
  const comparison = rawComparison as Record<string, MetricComparison> | null | undefined;
  const interactionBreakdowns = rawBreakdowns as Record<string, Record<string, number>> | undefined;

  const metricCards: MetricCard[] = [];

  if (metrics.views !== undefined) metricCards.push({ key: "views", label: METRIC_LABELS.views, value: metrics.views });
  if (metrics.reach !== undefined) metricCards.push({ key: "reach", label: METRIC_LABELS.reach, value: metrics.reach });
  if (metrics.newFollowers !== undefined) metricCards.push({ key: "newFollowers", label: METRIC_LABELS.newFollowers, value: metrics.newFollowers });
  if (metrics.accountsEngaged !== undefined) metricCards.push({ key: "accountsEngaged", label: METRIC_LABELS.accountsEngaged, value: metrics.accountsEngaged });
  if (metrics.reelsViews !== undefined) metricCards.push({ key: "reelsViews", label: METRIC_LABELS.reelsViews, value: metrics.reelsViews });
  if (metrics.postViews !== undefined) metricCards.push({ key: "postViews", label: METRIC_LABELS.postViews, value: metrics.postViews });

  const expandedKey = expandedMetric ?? "views";
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : "";

  const chartData = React.useMemo(
    () => buildDailySeries(data.trends, expandedKey),
    [data.trends, expandedKey],
  );

  const chartConfig = {
    value: {
      label: expandedLabel,
      color: "var(--color-primary)",
    },
  } satisfies ChartConfig;

  return (
    <Flex direction="column" gap="2" className="min-h-0">
      <Grid columns={{ initial: "1", lg: "1" }} gap="2" className="min-h-0">
        <Box className="w-full">
          <Grid columns={{ initial: "2", sm: "3", lg: "6" }} gap="1.5">
            {metricCards.map((item) => {
              const delta = comparison?.[item.key]?.percentageChange;
              const formattedDelta = formatPercent(delta ?? undefined);
              const isActive = expandedKey === item.key;
              const deltaClass =
                delta === undefined || delta === 0
                  ? "text-muted-foreground"
                  : delta > 0
                    ? "text-emerald-500"
                    : "text-red-500";
              const seriesValues = (buildDailySeries(data.trends, item.key) ?? []).map((point) => point.value);

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onMetricSelect(item.key)}
                  aria-pressed={isActive}
                  className={cn(
                    "group/kpi flex h-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isActive
                      ? "border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]"
                      : "border-border/70 bg-card",
                  )}
                >
                  <span className="truncate font-mono text-2xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
                      {formatCompact(item.value)}
                    </span>
                    {formattedDelta ? (
                      <span className={cn("font-mono text-2xs tabular-nums", deltaClass)}>{formattedDelta}</span>
                    ) : null}
                  </div>
                  <MiniBars values={seriesValues} active={isActive} />
                </button>
              );
            })}
          </Grid>
        </Box>

        <Box className="w-full min-h-[280px]">
          <Card variant="surface" className="border border-subtle bg-surface flex flex-col">
            <Box p="3" className="flex-1 flex flex-col min-h-0">
              <Flex align="center" justify="between" gap="2" mb="2">
                <Box>
                  <Heading size="3">{expandedLabel} Trend</Heading>
                  <Text color="gray" size="1">
                    {range.since} → {range.until} ({rangeLabel(range.preset)})
                  </Text>
                </Box>
              </Flex>

              <Box className="flex-1 min-h-0 overflow-hidden">
                {chartData ? (
                  <ChartContainer config={chartConfig} className="h-[250px] w-full aspect-auto">
                    <LineChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        width={40}
                        tickFormatter={(value) => {
                           if (typeof value !== 'number') return String(value);
                           return value >= 1000 ? (value/1000).toFixed(1) + 'k' : String(value);
                        }}
                      />
                      <ChartTooltip content={<ChartTooltipContent
                        labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      />} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "var(--color-primary)" }}
                        activeDot={{ r: 6 }}
                        animationDuration={500}
                      />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <Flex align="center" justify="center" className="h-[250px]">
                    <Text color="gray" size="2" align="center">
                      Daily breakdown unavailable for {expandedLabel}.
                    </Text>
                  </Flex>
                )}
              </Box>
            </Box>
          </Card>
        </Box>
      </Grid>

      {interactionBreakdowns && <InteractionBreakdownCharts breakdowns={interactionBreakdowns} />}
    </Flex>
  );
}
