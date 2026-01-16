"use client";

import { ArrowDownIcon, ArrowUpIcon, PieChartIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Text,
  Callout,
} from "@radix-ui/themes";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, LineChart, Line, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fetchPaidMediaMetrics } from "@/lib/api/paidMetrics.client";
import type { PaidMetricsRequest, PaidMetricsResponse } from "@/lib/schemas/paidMetrics";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  brandId: string;
  adAccountId?: string;
};

type ViewMode = "overview" | "trends";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: PaidMetricsResponse };

type MetricKey = keyof PaidMetricsResponse["metrics"];

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
  format: "currency" | "number" | "percent";
};

const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Spend",
  roas: "ROAS",
  impressions: "Impressions",
  clicks: "Clicks",
  ctr: "CTR",
  cpc: "CPC",
};

function formatValue(value: number, type: "currency" | "number" | "percent") {
  if (type === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  if (type === "percent") return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value?: number) {
  if (value === undefined) return null;
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? "+" : "-"}${rounded}%`;
}

function PaidTrendsPanel({ data }: { data: PaidMetricsResponse }) {
  const { trends, range } = data;

  const chartConfig = {
    spend: { label: "Spend", color: "var(--color-primary)" },
    roas: { label: "ROAS", color: "var(--color-secondary)" },
  } satisfies ChartConfig;

  return (
    <Box pt="4">
      <Flex align="center" justify="between" mb="3">
        <Box>
          <Heading size="4">Daily Performance Trends</Heading>
          <Text size="2" color="gray">
            {range.since} → {range.until}
          </Text>
        </Box>
      </Flex>

      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Text size="2" color="gray" mb="2">Daily Spend</Text>
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
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
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  />}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--color-spend)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          </Box>
        </Card>

        <Card variant="surface" className="border border-subtle bg-surface">
          <Box p="3">
            <Text size="2" color="gray" mb="2">Return on Ad Spend (ROAS)</Text>
            <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
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
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  />}
                />
                <Line
                  type="monotone"
                  dataKey="roas"
                  stroke="var(--color-roas)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          </Box>
        </Card>
      </Grid>
    </Box>
  );
}

export function PaidMediaReportingWidget({ brandId, adAccountId }: Props) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("overview");
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      setState({ status: "loading" });
      try {
        const request: PaidMetricsRequest = {
          brandId,
          adAccountId,
          range: { preset: "last_7d" },
        };

        const data = await fetchPaidMediaMetrics(request);
        if (cancelled) return;
        setState({ status: "success", data });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load Paid Media metrics.";
        setState({ status: "error", message });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId, viewMode]);

  return (
    <Card variant="surface" className="border border-subtle bg-surface h-full flex flex-col">
      <Box p="4" className="flex-1 flex flex-col min-h-0">
        <Flex align="center" justify="between" gap="3" wrap="wrap" className="shrink-0">
          <Flex align="center" gap="2">
            <Badge color="blue" variant="soft" radius="full">
              <PieChartIcon />
            </Badge>
            <Box>
              <Text weight="medium">Paid Media Performance</Text>
              <Text color="gray" size="2">
                Last 7 Days · {viewMode}
              </Text>
            </Box>
          </Flex>

          <Select.Root value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
            <Select.Trigger variant="surface" radius="large" style={{ width: "120px" }}>
              {viewMode === "overview" ? "Overview" : "Trends"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="overview">Overview</Select.Item>
              <Select.Item value="trends">Trends</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>

        <Box pt="4" className="flex-1 min-h-0 overflow-y-auto">
          {state.status === "error" ? (
            <Callout.Root color="red" variant="surface">
              <Callout.Text>{state.message}</Callout.Text>
            </Callout.Root>
          ) : state.status === "loading" ? (
             <Flex direction="column" gap="3">
                 <Skeleton className="h-24 w-full" />
                 <Skeleton className="h-24 w-full" />
             </Flex>
           ) : state.status === "success" ? (
             viewMode === "overview" ? (
               <MetricsPanel
                 data={state.data}
                 expandedMetric={expandedMetric}
                 onMetricSelect={setExpandedMetric}
               />
             ) : (
               <PaidTrendsPanel data={state.data} />
             )
           ) : null}
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
  data: PaidMetricsResponse;
  expandedMetric: MetricKey | null;
  onMetricSelect: (key: MetricKey | null) => void;
}) {
  const { metrics, comparison, range } = data;

  const metricCards: MetricCard[] = [
    { key: "spend", label: "Spend", value: metrics.spend, format: "currency" },
    { key: "roas", label: "ROAS", value: metrics.roas, format: "number" },
    { key: "ctr", label: "CTR", value: metrics.ctr, format: "percent" },
    { key: "cpc", label: "CPC", value: metrics.cpc, format: "currency" },
    { key: "impressions", label: "Impressions", value: metrics.impressions, format: "number" },
    { key: "clicks", label: "Clicks", value: metrics.clicks, format: "number" },
  ];

  const expandedKey = expandedMetric ?? metricCards[0]?.key;
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : "";
  const expandedComparison = expandedKey ? comparison?.[expandedKey] : undefined;

  const chartData = [
    {
      name: "Performance",
      current: metrics[expandedKey as keyof typeof metrics],
      previous: expandedComparison?.previous ?? 0,
    },
  ];

  const chartConfig = {
    current: { label: "Current", color: "var(--color-primary)" },
    previous: { label: "Previous", color: "var(--color-muted)" },
  } satisfies ChartConfig;

  return (
    <Flex direction="column" gap="4">
      <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="3">
        {metricCards.map((item) => {
          const delta = comparison?.[item.key]?.percentageChange;
          const formattedDelta = formatPercent(delta);
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
                    <Text color="gray" size="2">{item.label}</Text>
                    {formattedDelta ? (
                      <Badge color={deltaTone} variant="soft" radius="full">
                        {delta !== undefined && delta !== 0 ? (
                          delta > 0 ? <ArrowUpIcon /> : <ArrowDownIcon />
                        ) : null}
                        {formattedDelta}
                      </Badge>
                    ) : null}
                  </Flex>
                  <Heading size="5">{formatValue(item.value, item.format)}</Heading>
                  <Text color="gray" size="1">Click to view trend</Text>
                </Box>
              </Card>
            </button>
          );
        })}
      </Grid>

      {expandedMetric ? (
        <Card variant="surface" className="border border-subtle bg-surface animate-in fade-in slide-in-from-right-5">
          <Box p="3">
            <Flex align="center" justify="between" gap="2">
              <Box>
                <Heading size="4">{expandedLabel}</Heading>
                <Text color="gray" size="2">{range.since} → {range.until}</Text>
              </Box>
              <IconButton variant="soft" color="gray" onClick={() => onMetricSelect(null)}>
                <ArrowDownIcon />
              </IconButton>
            </Flex>

            <Box pt="3">
              <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
                <BarChart accessibilityLayer data={chartData} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <YAxis dataKey="name" type="category" hide />
                  <XAxis type="number" hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="previous" fill="var(--color-previous)" radius={4} barSize={20} />
                  <Bar dataKey="current" fill="var(--color-current)" radius={4} barSize={20} />
                </BarChart>
              </ChartContainer>
            </Box>
          </Box>
        </Card>
      ) : null}
    </Flex>
  );
}
