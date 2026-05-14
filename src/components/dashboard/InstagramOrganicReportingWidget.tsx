"use client";

import {
  Badge,
  Box,
  Callout,
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
import { fetchOrganicMetrics, type OrganicMetricsRequest } from "@/lib/api/organicMetrics.client";
import type { OrganicMetricsResponse, OrganicDateRangePreset, OrganicPlatform, MetricComparison, OrganicMetrics } from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";
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
  initialPlatform?: OrganicPlatform;
  className?: string;
};

type ViewMode = "overview" | "trends";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: OrganicMetricsResponse };

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";

type MetricKey = keyof OrganicMetricsResponse["metrics"];

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
};

type TrendDataPoint = {
  date: string;
  value?: number;
} & Partial<Record<MetricKey, number>>;

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

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function rangeLabel(preset: OrganicDateRangePreset) {
  return preset.replaceAll("_", " ");
}

function formatPercent(value?: number) {
  if (value === undefined) return null;
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? "+" : "-"}${rounded}%`;
}

function generateSampleTrendData(range: { since: string; until: string }, metrics: OrganicMetrics, specificMetric?: MetricKey) {
  const days = [];
  const startDate = new Date(range.since);
  const endDate = new Date(range.until);
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  for (let i = 0; i <= daysDiff; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const baseMultiplier = 0.7 + Math.random() * 0.6; 

    const dayData: TrendDataPoint = { date: dateStr };
    
    if (specificMetric) {
       const totalValue = metrics[specificMetric as keyof typeof metrics] as number | undefined;
       if (totalValue !== undefined) {
          dayData[specificMetric] = Math.round((totalValue / (daysDiff + 1)) * baseMultiplier);
          dayData.value = dayData[specificMetric]; 
       } else {
          dayData.value = 0;
       }
    } else {
       if (metrics.reach !== undefined) dayData.reach = Math.round((metrics.reach / (daysDiff + 1)) * baseMultiplier);
       if (metrics.views !== undefined) dayData.views = Math.round((metrics.views / (daysDiff + 1)) * baseMultiplier);
       if (metrics.likes !== undefined) dayData.likes = Math.round((metrics.likes / (daysDiff + 1)) * baseMultiplier);
       if (metrics.comments !== undefined) dayData.comments = Math.round((metrics.comments / (daysDiff + 1)) * baseMultiplier);
       if (metrics.shares !== undefined) dayData.shares = Math.round((metrics.shares / (daysDiff + 1)) * baseMultiplier);
    }

    days.push(dayData);
  }
  return days;
}

function TrendsPanel({ data }: { data: OrganicMetricsResponse }) {
  const { insights, range } = data;

  const trendData = React.useMemo(() => generateSampleTrendData(range, data.metrics), [range, data.metrics]);

  const chartConfig = {
    reach: {
      label: "Reach",
      color: "var(--color-primary)",
    },
    views: {
      label: "Views",
      color: "var(--color-secondary)",
    },
    likes: {
      label: "Likes",
      color: "var(--color-accent)",
    },
  } satisfies ChartConfig;

  const trendChartConfig = {
    ...chartConfig,
    reach: { ...chartConfig.reach, color: "var(--color-reach)" },
    views: { ...chartConfig.views, color: "var(--color-views)" },
  };

  return (
    <Box pt="4">
      <Flex align="center" justify="between" mb="3">
        <Box>
          <Heading size="4">Daily Trends</Heading>
          <Text size="2" color="gray">
            {range.since} → {range.until} ({rangeLabel(range.preset)})
          </Text>
        </Box>
        {(!insights || insights.length === 0) && (
          <Badge color="blue" variant="soft">Sample Data</Badge>
        )}
      </Flex>

      <Text size="2" color="gray" mb="4">
        Mouse over the chart to see values for specific dates
      </Text>

      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        {/* Reach and Views Trend */}
        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Text size="2" color="gray" mb="2">Reach & Views Trend</Text>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={<ChartTooltipContent
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  />}
                />
                <Line
                  type="monotone"
                  dataKey="reach"
                  stroke="var(--color-reach)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="var(--color-views)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          </Box>
        </Card>

        {/* Engagement Trend */}
        {(data.metrics.likes || data.metrics.comments || data.metrics.shares) && (
          <Card variant="surface" className="border border-subtle bg-surface">
            <Box p="3">
              <Text size="2" color="gray" mb="2">Engagement Trend</Text>
              <ChartContainer config={{
                likes: { label: "Likes", color: "var(--color-likes)" },
                comments: { label: "Comments", color: "var(--color-comments)" },
                shares: { label: "Shares", color: "var(--color-shares)" },
              }} className="aspect-auto h-[200px] w-full">
                <LineChart data={trendData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={<ChartTooltipContent
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    />}
                  />
                  {data.metrics.likes && (
                    <Line
                      type="monotone"
                      dataKey="likes"
                      stroke="var(--color-likes)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {data.metrics.comments && (
                    <Line
                      type="monotone"
                      dataKey="comments"
                      stroke="var(--color-comments)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {data.metrics.shares && (
                    <Line
                      type="monotone"
                      dataKey="shares"
                      stroke="var(--color-shares)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ChartContainer>
            </Box>
          </Card>
        )}
      </Grid>

      {(!insights || insights.length === 0) && (
        <Box pt="4">
          <Callout.Root color="blue" variant="surface">
            <Callout.Text>
              This shows sample trend data. When the backend daily data endpoint becomes available, you&apos;ll see real day-by-day metrics with interactive hover details.
            </Callout.Text>
          </Callout.Root>
        </Box>
      )}
    </Box>
  );
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

export function InstagramOrganicReportingWidget({ brandId, accounts, initialPlatform = "instagram", className }: Props) {
  const [platform, setPlatform] = React.useState<OrganicPlatform>(initialPlatform);
  const firstAccountId = accounts[0]?.integrationAccountId ?? null;
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(firstAccountId);
  const [viewMode, setViewMode] = React.useState<ViewMode>("overview");
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);

  // Reset when brand changes (new accounts arrive from server)
  React.useEffect(() => {
    const newFirst = accounts[0]?.integrationAccountId ?? null;
    setSelectedAccountId(newFirst);
    setState({ status: "idle" });
    setExpandedMetric(null);
  }, [brandId, accounts]);

  const selectedAccount = accounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  React.useEffect(() => {
    if (selectedAccountId === null || platform !== "instagram") {
      if (platform !== "instagram") {
        setState({ status: "idle" });
      }
      return;
    }
    const accountId = selectedAccountId;
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const request: OrganicMetricsRequest = {
          brandId,
          integrationAccountId: accountId,
          platform,
          range: { preset: DEFAULT_RANGE_PRESET },
        };

        // Request time series data for trends view
        if (viewMode === "trends") {
          request.insightsRequests = [
            {
              metrics: ["reach", "views", "accounts_engaged", "likes", "comments", "shares"],
              metric_type: "time_series",
              period: "day",
              since: "2025-12-01", // Would be calculated from range
              until: "2025-12-07", // Would be calculated from range
            },
          ];
        }

        const data = await fetchOrganicMetrics(request);
        if (cancelled) return;
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
        setState({ status: "error", message });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId, viewMode, platform]);

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
              <Select.Item value="youtube" disabled>
                <Flex align="center" gap="2" style={{ opacity: 0.5 }}>
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
          <span className="hidden whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
            {rangeLabel(DEFAULT_RANGE_PRESET)} · {viewMode}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
            {(["overview", "trends"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium capitalize transition-colors active:scale-[0.96]",
                  viewMode === mode ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                style={{ transitionProperty: "background-color, color, scale" }}
                aria-pressed={viewMode === mode}
              >
                {mode}
              </button>
            ))}
          </div>

          <div data-tour-id="dashboard-account-selector" className="inline-flex">
            <Select.Root value={selectedAccountId ?? ""} onValueChange={(value) => setSelectedAccountId(value)}>
              <Select.Trigger variant="surface" radius="medium" className="h-7 text-[11px]">
                {selectedAccount?.name ?? `Select ${platform} account`}
              </Select.Trigger>
              <Select.Content position="popper" variant="solid" highContrast>
                <Select.Group>
                  <Select.Label>{platform} accounts</Select.Label>
                  {accounts.map((account) => (
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
          {platform !== "instagram" ? (
             <Box py="8">
                <Flex direction="column" align="center" justify="center" gap="3">
                  <PlatformIcon platform={platform === "x" ? "threads" : platform} size={48} className="opacity-20" />
                  <Heading size="4" color="gray">{platform} Support Coming Soon</Heading>
                  <Text color="gray" size="2" align="center" style={{ maxWidth: 300 }}>
                    We&apos;re currently working on integrating {platform} organic metrics into your dashboard.
                  </Text>
                </Flex>
             </Box>
          ) : accounts.length === 0 ? (
            <Text color="gray" size="2">
              No {platform} accounts are linked to this brand profile.
            </Text>
          ) : state.status === "error" ? (
            <Callout.Root color="red" variant="surface">
              <Callout.Text>{state.message}</Callout.Text>
            </Callout.Root>
          ) : state.status === "loading" ? (
            <OrganicMetricsWidgetSkeleton />
           ) : state.status === "success" ? (
             viewMode === "overview" ? (
               <MetricsPanel
                 data={state.data}
                 expandedMetric={expandedMetric}
                 onMetricSelect={setExpandedMetric}
               />
             ) : (
               <TrendsPanel data={state.data} />
             )
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
  
  const chartData = React.useMemo(() => {
    return generateSampleTrendData(range, metrics, expandedKey);
  }, [range, metrics, expandedKey]);

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
              const deltaTone = delta === undefined ? "gray" : delta > 0 ? "green" : delta < 0 ? "red" : "gray";

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onMetricSelect(item.key)}
                  className="text-left w-full h-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  aria-pressed={isActive}
                >
                  <Card
                    variant="surface"
                    className={cn(
                      "border border-subtle bg-surface transition-all hover:bg-accent/5 cursor-pointer flex flex-col items-center justify-center min-h-[48px] overflow-hidden",
                      isActive && "ring-1 ring-primary bg-accent/10"
                    )}
                  >
                    <Box px="2" py="1" className="w-full">
                      <Flex direction="column" gap="0" align="center" justify="center" className="text-center w-full">
                        <Text color="gray" weight="medium" className="truncate w-full leading-tight text-[10px]">
                          {item.label}
                        </Text>
                        <Heading weight="bold" className="truncate w-full leading-tight text-sm tabular-nums">{formatNumber(item.value)}</Heading>
                        {formattedDelta ? (
                          <Text color={deltaTone} weight="bold" className="leading-none text-[10px] tabular-nums">
                            {formattedDelta}
                          </Text>
                        ) : (
                          <Box className="h-1.5" />
                        )}
                      </Flex>
                    </Box>
                  </Card>
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
              </Box>
            </Box>
          </Card>
        </Box>
      </Grid>

      {interactionBreakdowns && <InteractionBreakdownCharts breakdowns={interactionBreakdowns} />}
    </Flex>
  );
}
