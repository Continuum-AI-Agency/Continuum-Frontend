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
import { useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, LineChart, Line, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PaidMetricsResponse } from "@/lib/schemas/paidMetrics";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  brandId: string;
  accountId?: string;
};

type ViewMode = "overview" | "trends";

type Platform = "meta" | "google-ads" | "dv360";

const platforms = [
  { id: "meta" as Platform, name: "Meta", active: true },
  { id: "google-ads" as Platform, name: "Google Ads", active: false },
  { id: "dv360" as Platform, name: "DV360", active: false },
];

type AdAccount = {
  id: string;
  name: string;
};

type Campaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget?: string;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading-ad-accounts" }
  | { status: "loading-campaigns" }
  | { status: "loading-metrics" }
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

export function PaidMediaReportingWidget({ brandId, accountId }: Props) {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [viewMode, setViewMode] = React.useState<ViewMode>("overview");
  const [state, setState] = React.useState<LoadState>({ status: "idle" });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);

  // Ad account and campaign selection state
  const [selectedAdAccount, setSelectedAdAccount] = useState<string | null>(accountId || null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Fetch ad accounts
  const fetchAdAccounts = useCallback(async () => {
    if (!brandId) return;

    setState({ status: "loading-ad-accounts" });
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No authentication token available");
      }

      const response = await fetch(`/api/ad-accounts?brandId=${encodeURIComponent(brandId)}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch ad accounts");
      }
      const data = await response.json();
      setAdAccounts(data.accounts || []);

      // Auto-select first account if none selected
      if (!selectedAdAccount && data.accounts?.length > 0) {
        setSelectedAdAccount(data.accounts[0].id);
      }
    } catch (error) {
      console.error("Error fetching ad accounts:", error);
      setState({ status: "error", message: error instanceof Error ? error.message : "Failed to load ad accounts" });
    }
  }, [brandId, selectedAdAccount]);

  // Fetch campaigns for selected ad account
  const fetchCampaigns = useCallback(async (adAccountId: string) => {
    setState({ status: "loading-campaigns" });
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No authentication token available");
      }

      const url = `/api/campaigns?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(adAccountId)}&platform=${platform}`;
      console.log("Fetching campaigns from:", url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

       if (!response.ok) {
         const errorText = await response.text();
         console.error("Campaigns API error:", response.status, response.statusText, errorText);

         // Try to parse JSON error response
         let parsedError = null;
         try {
           parsedError = JSON.parse(errorText);
         } catch {
           // Not JSON, use raw text
         }

         // Handle different error scenarios
         if (response.status === 404) {
           throw new Error("Campaigns not found. This ad account may not have active campaigns or the account configuration may be incorrect.");
         } else if (response.status === 500 && parsedError?.error) {
           // Extract nested error message from edge function
           const nestedError = parsedError.error;
           if (nestedError.includes("404")) {
             throw new Error("Unable to retrieve campaign data. The ad account may not be properly connected or campaigns may not exist.");
           } else {
             throw new Error("Server error occurred while fetching campaigns. Please try again later.");
           }
         } else if (response.status === 401 || response.status === 403) {
           throw new Error("Authentication failed. Please reconfigure your ad account connection.");
         } else {
           throw new Error(`Failed to fetch campaigns: ${response.status} ${response.statusText}`);
         }
       }
      const data = await response.json();
      setCampaigns(data.campaigns || []);

      // Auto-select first campaign if none selected
      if (!selectedCampaign && data.campaigns?.length > 0) {
        setSelectedCampaign(data.campaigns[0].id);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load campaigns";

      // Check if it's an access token issue
      if (errorMessage.includes("Meta account not configured") || errorMessage.includes("access token missing")) {
        setState({
          status: "error",
          message: "This ad account needs to be reconnected. Please contact support or reconfigure your Meta integration."
        });
      } else {
        setState({ status: "error", message: errorMessage });
      }
    }
  }, [brandId, platform, selectedCampaign]);

  // Fetch metrics for selected campaign
  const fetchMetrics = useCallback(async (campaignId: string) => {
    if (!selectedAdAccount) return;

    setState({ status: "loading-metrics" });
    try {
      const response = await fetch("/api/paid-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          platform,
          accountId: selectedAdAccount,
          campaignId,
          range: { preset: "last_7d" },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch metrics");
      }

      const data = await response.json();
      setState({ status: "success", data });
    } catch (error) {
      console.error("Error fetching metrics:", error);
      setState({ status: "error", message: error instanceof Error ? error.message : "Failed to load metrics" });
    }
  }, [brandId, platform, selectedAdAccount]);

  // Initial load effect
  React.useEffect(() => {
    if (brandId) {
      fetchAdAccounts();
    }
  }, [brandId, fetchAdAccounts]);

  // Load campaigns when ad account changes
  React.useEffect(() => {
    if (selectedAdAccount) {
      fetchCampaigns(selectedAdAccount);
    }
  }, [selectedAdAccount, fetchCampaigns]);

  // Load metrics when campaign changes
  React.useEffect(() => {
    if (selectedCampaign) {
      fetchMetrics(selectedCampaign);
    }
  }, [selectedCampaign, fetchMetrics]);

  return (
    <Card variant="surface" className="border border-subtle bg-surface h-full flex flex-col">
      <Box p="4" className="flex-1 flex flex-col min-h-0">
        <Flex direction="column" gap="3" className="shrink-0">
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Flex align="center" gap="2">
              <Badge color="blue" variant="soft" radius="full">
                <PieChartIcon />
              </Badge>
              <Box>
                <Text weight="medium">Paid Media Performance</Text>
                <Text color="gray" size="2">
                  {selectedCampaign ? "Campaign Analytics" : "Select a campaign to view metrics"} · {viewMode}
                </Text>
              </Box>
            </Flex>

            <Flex align="center" gap="2">
              <Select.Root value={platform} onValueChange={(value: Platform) => setPlatform(value)}>
                <Select.Trigger variant="surface" radius="large" style={{ width: "180px" }}>
                  {platforms.find(p => p.id === platform)?.name}
                </Select.Trigger>
                <Select.Content>
                  {platforms.map(platformOption => (
                    <Select.Item
                      key={platformOption.id}
                      value={platformOption.id}
                      disabled={!platformOption.active}
                    >
                      {platformOption.name}
                      {!platformOption.active && " (Coming Soon)"}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>

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
          </Flex>

          <Flex align="center" gap="2" wrap="wrap">
            <Select.Root
              value={selectedAdAccount || ""}
              onValueChange={setSelectedAdAccount}
              disabled={adAccounts.length === 0}
            >
              <Select.Trigger variant="surface" radius="large" style={{ minWidth: "200px" }}>
                {adAccounts.length === 0
                  ? "No Ad Accounts Available"
                  : selectedAdAccount
                    ? adAccounts.find(acc => acc.id === selectedAdAccount)?.name || selectedAdAccount
                    : "Select Ad Account"
                }
              </Select.Trigger>
              <Select.Content>
                {adAccounts.length === 0 ? (
                  <Select.Item value="no-accounts" disabled>
                    No ad accounts available
                  </Select.Item>
                ) : (
                  adAccounts.map(account => (
                    <Select.Item key={account.id} value={account.id}>
                      {account.name}
                    </Select.Item>
                  ))
                )}
              </Select.Content>
            </Select.Root>

            <Select.Root
              value={selectedCampaign || ""}
              onValueChange={setSelectedCampaign}
              disabled={campaigns.length === 0}
            >
              <Select.Trigger variant="surface" radius="large" style={{ minWidth: "200px" }}>
                {campaigns.length === 0
                  ? "No Campaigns Available"
                  : selectedCampaign
                    ? campaigns.find(camp => camp.id === selectedCampaign)?.name || selectedCampaign
                    : "Select Campaign"
                }
              </Select.Trigger>
              <Select.Content>
                {campaigns.length === 0 ? (
                  <Select.Item value="no-campaigns" disabled>
                    No campaigns available
                  </Select.Item>
                ) : (
                  campaigns.map(campaign => (
                    <Select.Item key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </Select.Item>
                  ))
                )}
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>

        <Box pt="4" className="flex-1 min-h-0 overflow-y-auto">
          {state.status === "error" ? (
            <Callout.Root color="red" variant="surface">
              <Callout.Text>{state.message}</Callout.Text>
            </Callout.Root>
          ) : (state.status === "loading-ad-accounts" ||
               state.status === "loading-campaigns" ||
               state.status === "loading-metrics") ? (
             <Flex direction="column" gap="3">
                 <Skeleton className="h-24 w-full" />
                 <Skeleton className="h-24 w-full" />
                 <Text size="2" color="gray" align="center">
                   {state.status === "loading-ad-accounts" && "Loading ad accounts..."}
                   {state.status === "loading-campaigns" && "Loading campaigns..."}
                   {state.status === "loading-metrics" && "Loading metrics..."}
                 </Text>
             </Flex>
           ) : adAccounts.length === 0 ? (
             <Flex direction="column" align="center" justify="center" gap="3" className="h-full min-h-[200px]">
               <Text size="3" color="gray" align="center">
                 No Ad Accounts Available
               </Text>
               <Text size="2" color="gray" align="center">
                 You have no DCO actions or paid media metrics data to analyze.
               </Text>
             </Flex>
           ) : !selectedCampaign ? (
             <Flex direction="column" align="center" justify="center" gap="3" className="h-full min-h-[200px]">
               <Text size="3" color="gray" align="center">
                 {selectedAdAccount && campaigns.length === 0 ? "No Campaigns Available" : "Select a Campaign"}
               </Text>
               <Text size="2" color="gray" align="center">
                 {selectedAdAccount && campaigns.length === 0
                   ? "This ad account has no active campaigns to analyze."
                   : "Choose an ad account and campaign above to view performance metrics."
                 }
               </Text>
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
