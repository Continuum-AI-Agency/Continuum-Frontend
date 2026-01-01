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
  Spinner,
  Text,
} from "@radix-ui/themes";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fetchInstagramOrganicMetrics } from "@/lib/api/organicMetrics.client";
import type { InstagramOrganicMetricsResponse, OrganicDateRangePreset } from "@/lib/schemas/organicMetrics";
import { cn } from "@/lib/utils";

export type InstagramAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type Props = {
  brandId: string;
  accounts: InstagramAccountOption[];
};

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

export function InstagramOrganicReportingWidget({ brandId, accounts }: Props) {
  const firstAccountId = accounts[0]?.integrationAccountId ?? null;
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(firstAccountId);
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
        const data = await fetchInstagramOrganicMetrics({
          brandId,
          integrationAccountId: accountId,
          range: { preset: DEFAULT_RANGE_PRESET },
        });
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
  }, [brandId, selectedAccountId]);

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
                {rangeLabel(DEFAULT_RANGE_PRESET)} overview
              </Text>
            </Box>
          </Flex>

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
            <Flex align="center" gap="2">
              <Spinner size="2" />
              <Text color="gray" size="2">
                Loading metrics…
              </Text>
            </Flex>
          ) : state.status === "success" ? (
            <MetricsPanel
              data={state.data}
              expandedMetric={expandedMetric}
              onMetricSelect={setExpandedMetric}
            />
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
  const { metrics, comparison, range } = data;

  const metricCards: MetricCard[] = [
    { key: "reach", label: METRIC_LABELS.reach, value: metrics.reach },
    { key: "views", label: METRIC_LABELS.views, value: metrics.views },
    { key: "newFollowers", label: METRIC_LABELS.newFollowers, value: metrics.newFollowers },
    { key: "accountsEngaged", label: METRIC_LABELS.accountsEngaged, value: metrics.accountsEngaged },
    { key: "reelsViews", label: METRIC_LABELS.reelsViews, value: metrics.reelsViews },
    { key: "postViews", label: METRIC_LABELS.postViews, value: metrics.postViews },
  ];

  const expandedKey = expandedMetric ?? metricCards[0]?.key;
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : "";
  const expandedValue = expandedKey ? metrics[expandedKey] : 0;
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
