"use client";

import { ArrowDownIcon, ArrowUpIcon, InstagramLogoIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Box,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Text,
} from "@radix-ui/themes";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, LineChart, Line, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fetchInstagramOrganicMetrics, type InsightsRequest, type InstagramOrganicMetricsRequest } from "@/lib/api/organicMetrics.client";
import type { InstagramOrganicMetricsResponse, OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";
import { OrganicMetricsWidgetSkeleton } from "@/components/organic/MetricsSkeleton";

export type InstagramAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type Props = {
  brandId: string;
  accounts: InstagramAccountOption[];
};

type ViewMode = "overview" | "trends";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InstagramOrganicMetricsResponse };

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = "last_7d";

type MetricKey = keyof InstagramOrganicMetricsResponse["metrics"];

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
};

const METRIC_LABELS: Record<MetricKey, string> = {
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

function TrendsPanel({ data }: { data: InstagramOrganicMetricsResponse }) {
  const { insights, range } = data;

  // Generate sample daily trend data based on the current period
  // In a real implementation, this would come from insights API response
  const generateSampleTrendData = () => {
    const days = [];
    const startDate = new Date(range.since);
    const endDate = new Date(range.until);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      // Generate sample data with some variation
      const baseMultiplier = 0.7 + Math.random() * 0.6; // 70-130% of period average

      days.push({
        date: dateStr,
        reach: Math.round((data.metrics.reach / (daysDiff + 1)) * baseMultiplier),
        views: Math.round((data.metrics.views / (daysDiff + 1)) * baseMultiplier),
        likes: data.metrics.likes ? Math.round((data.metrics.likes / (daysDiff + 1)) * baseMultiplier) : undefined,
        comments: data.metrics.comments ? Math.round((data.metrics.comments / (daysDiff + 1)) * baseMultiplier) : undefined,
        shares: data.metrics.shares ? Math.round((data.metrics.shares / (daysDiff + 1)) * baseMultiplier) : undefined,
      });
    }
    return days;
  };

  const trendData = generateSampleTrendData();

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
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
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
              <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
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
                <Text size="2" color="gray" mb="2">{METRIC_LABELS[metric as MetricKey]}</Text>
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

export function InstagramOrganicReportingWidget({ brandId, accounts }: Props) {
  const firstAccountId = accounts[0]?.integrationAccountId ?? null;
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(firstAccountId);
  const [viewMode, setViewMode] = React.useState<ViewMode>("overview");
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);

  const selectedAccount = accounts.find((account) => account.integrationAccountId === selectedAccountId) ?? null;

  React.useEffect(() => {
    if (selectedAccountId === null) return;
    const accountId = selectedAccountId;
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const request: InstagramOrganicMetricsRequest = {
          brandId,
          integrationAccountId: accountId,
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

        const data = await fetchInstagramOrganicMetrics(request);
        if (cancelled) return;
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load Instagram organic metrics.";
        setState({ status: "error", message });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId, viewMode]);

  return (
    <Card variant="surface" className="border border-subtle bg-surface">
      <Box p="4">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="2">
            <Badge color="gray" variant="soft" radius="full">
              <InstagramLogoIcon />
            </Badge>
            <Box>
              <Text weight="medium">Instagram organic reporting</Text>
              <Text color="gray" size="2">
                {rangeLabel(DEFAULT_RANGE_PRESET)} {viewMode}
              </Text>
            </Box>
          </Flex>

          <Flex align="center" gap="2">
            <Select.Root value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
              <Select.Trigger variant="surface" radius="large" style={{ width: "120px" }}>
                {viewMode === "overview" ? "Overview" : "Trends"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="overview">Overview</Select.Item>
                <Select.Item value="trends">Trends</Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root value={selectedAccountId ?? ""} onValueChange={(value) => setSelectedAccountId(value)}>
              <Select.Trigger variant="surface" radius="large">
                {selectedAccount?.name ?? "Select an Instagram account"}
              </Select.Trigger>
              <Select.Content position="popper" variant="solid" highContrast>
                <Select.Group>
                  <Select.Label>Instagram accounts</Select.Label>
                  {accounts.map((account) => (
                    <Select.Item key={account.integrationAccountId} value={account.integrationAccountId}>
                      {account.name}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>

        <Box pt="4">
          {accounts.length === 0 ? (
            <Text color="gray" size="2">
              No Instagram accounts are linked to this brand profile.
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
              Select an Instagram account to view organic reporting.
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
  data: InstagramOrganicMetricsResponse;
  expandedMetric: MetricKey | null;
  onMetricSelect: (key: MetricKey | null) => void;
}) {
  const { metrics, comparison, range, interactionBreakdowns } = data;

  const baseMetrics: MetricCard[] = [
    { key: "reach", label: METRIC_LABELS.reach, value: metrics.reach },
    { key: "views", label: METRIC_LABELS.views, value: metrics.views },
    { key: "newFollowers", label: METRIC_LABELS.newFollowers, value: metrics.newFollowers },
    { key: "accountsEngaged", label: METRIC_LABELS.accountsEngaged, value: metrics.accountsEngaged },
    { key: "reelsViews", label: METRIC_LABELS.reelsViews, value: metrics.reelsViews },
    { key: "postViews", label: METRIC_LABELS.postViews, value: metrics.postViews },
  ];

  const interactionMetrics: MetricCard[] = [];
  if (metrics.likes !== undefined) {
    interactionMetrics.push({ key: "likes", label: METRIC_LABELS.likes, value: metrics.likes });
  }
  if (metrics.comments !== undefined) {
    interactionMetrics.push({ key: "comments", label: METRIC_LABELS.comments, value: metrics.comments });
  }
  if (metrics.shares !== undefined) {
    interactionMetrics.push({ key: "shares", label: METRIC_LABELS.shares, value: metrics.shares });
  }
  if (metrics.totalInteractions !== undefined) {
    interactionMetrics.push({ key: "totalInteractions", label: METRIC_LABELS.totalInteractions, value: metrics.totalInteractions });
  }

  const metricCards = [...baseMetrics, ...interactionMetrics];

  const expandedKey = expandedMetric ?? metricCards[0]?.key;
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : "";
  const expandedValue = expandedKey ? (metrics[expandedKey as keyof typeof metrics] as number | undefined) ?? 0 : 0;
  const expandedComparison = expandedKey ? comparison?.[expandedKey] : undefined;

  const chartData = [
    {
      name: expandedComparison ? "Comparison" : "Current",
      current: expandedComparison?.current ?? expandedValue,
      previous: expandedComparison?.previous ?? null,
    },
  ];

  const chartConfig = {
    current: {
      label: "Current",
      color: "var(--color-primary)",
    },
    previous: {
      label: "Previous",
      color: "var(--color-muted)",
    },
  } satisfies ChartConfig;

  return (
    <Flex direction="column" gap="4">
      <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="3">
        {metricCards.map((item) => {
          const delta = comparison?.[item.key]?.percentageChange;
          const formattedDelta = formatPercent(delta ?? undefined);
          const isActive = expandedMetric === item.key;
          const deltaTone = delta === undefined ? "gray" : delta > 0 ? "green" : delta < 0 ? "red" : "gray";

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onMetricSelect(expandedMetric === item.key ? null : item.key)}
              className="text-left"
              aria-pressed={isActive}
            >
              <Card
                variant="surface"
                className={cn(
                  "border border-subtle bg-surface transition-all hover:shadow-md",
                  isActive && "ring-2 ring-[var(--ring)]"
                )}
              >
                <Box p="3">
                  <Flex align="center" justify="between" gap="2">
                    <Text color="gray" size="2">
                      {item.label}
                    </Text>
                    {formattedDelta ? (
                      <Badge color={deltaTone} variant="soft" radius="full">
                        {delta !== undefined && delta !== 0 ? (
                          delta > 0 ? <ArrowUpIcon /> : <ArrowDownIcon />
                        ) : null}
                        {formattedDelta}
                      </Badge>
                    ) : null}
                  </Flex>
                  <Heading size="5">{formatNumber(item.value)}</Heading>
                  <Flex align="center" gap="2">
                    <Text color="gray" size="1">
                      Click to view trend
                    </Text>
                  </Flex>
                </Box>
              </Card>
            </button>
          );
        })}
      </Grid>

      {interactionBreakdowns && <InteractionBreakdownCharts breakdowns={interactionBreakdowns} />}

      {expandedMetric ? (
        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Flex align="center" justify="between" gap="2" wrap="wrap">
              <Box>
                <Heading size="4">{expandedLabel}</Heading>
                <Text color="gray" size="2">
                  {range.since} → {range.until} ({rangeLabel(range.preset)})
                </Text>
              </Box>
              <IconButton
                aria-label="Collapse metric chart"
                variant="soft"
                color="gray"
                onClick={() => onMetricSelect(null)}
              >
                <ArrowDownIcon />
              </IconButton>
            </Flex>

            <Box pt="3">
              <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                <BarChart accessibilityLayer data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {expandedComparison ? (
                    <Bar dataKey="previous" fill="var(--color-previous)" radius={6} />
                  ) : null}
                  <Bar dataKey="current" fill="var(--color-current)" radius={6} />
                </BarChart>
              </ChartContainer>
            </Box>

            <Flex align="center" justify="between" gap="2" wrap="wrap">
              <Text color="gray" size="2">
                Current value: {formatNumber(expandedValue)}
              </Text>
              {expandedComparison ? (
                <Text color="gray" size="2">
                  Previous: {formatNumber(expandedComparison.previous)}
                </Text>
              ) : (
                <Text color="gray" size="2">
                  Comparison data unavailable
                </Text>
              )}
            </Flex>
          </Box>
        </Card>
      ) : (
        <Text color="gray" size="2">
          Click a metric card to expand a comparison chart.
        </Text>
      )}
    </Flex>
  );
}
