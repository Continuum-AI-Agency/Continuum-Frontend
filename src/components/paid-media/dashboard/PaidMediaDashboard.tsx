"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Box, Card, Flex, Heading, IconButton, Select, Text } from "@radix-ui/themes";

import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CampaignTimelineWorkspace } from "./CampaignTimelineWorkspace";
import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "./PerformanceDetails";

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

type Platform = "meta" | "google-ads" | "dv360";
type TimePreset = "last_7d" | "last_14d" | "last_30d";
type TimelineResolution = "daily" | "hourly";

type PaidMediaDashboardProps = {
  brandId: string;
  adAccountId: string | null;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading-campaigns" }
  | { status: "error"; message: string }
  | { status: "success" };

export function PaidMediaDashboard({ brandId, adAccountId }: PaidMediaDashboardProps) {
  const [platform, setPlatform] = React.useState<Platform>("meta");
  const [timeRange, setTimeRange] = React.useState<TimePreset>("last_7d");
  const [timelineResolution, setTimelineResolution] = React.useState<TimelineResolution>("daily");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [loadState, setLoadState] = React.useState<LoadState>({ status: "idle" });

  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | undefined>();

  const loadCampaigns = React.useCallback(async () => {
    if (!adAccountId) {
      setCampaigns([]);
      setLoadState({ status: "idle" });
      return;
    }

    setLoadState({ status: "loading-campaigns" });

    try {
      const supabase = createSupabaseBrowserClient();

      const { data, error: fetchError } = await supabase.functions.invoke(
        `fetch-meta-campaigns?brandId=${brandId}&adAccountId=${adAccountId}`,
        {
          method: "POST",
          body: {
            brandId,
            adAccountId,
          },
        }
      );

      if (fetchError) {
        throw new Error(`Failed to fetch campaigns: ${fetchError.message}`);
      }

      const rawCampaigns = data?.campaigns ?? [];

      const campaignsWithMetrics = await Promise.all(
        rawCampaigns.map(async (campaign: Campaign) => {
          try {
            const metricsResponse = await fetch("/api/paid-metrics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform,
                brandId,
                accountId: adAccountId,
                campaignId: campaign.id,
                range: { preset: timeRange },
              }),
            });

            if (metricsResponse.ok) {
              const metricsData = await metricsResponse.json();
              return {
                ...campaign,
                metrics: metricsData.metrics,
                comparison: metricsData.comparison,
                trends: metricsData.trends,
              };
            }
          } catch (err) {
            console.error(`Failed to load metrics for campaign ${campaign.id}`, err);
          }

          return campaign;
        })
      );

      setCampaigns(campaignsWithMetrics);
      setLoadState({ status: "success" });
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load campaigns",
      });
    }
  }, [adAccountId, brandId, platform, timeRange]);

  React.useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const handleRefresh = () => {
    void loadCampaigns();
  };

  const handlePlatformChange = (value: Platform) => {
    setPlatform(value);
    setCampaigns([]);
  };

  const handleTimeRangeChange = (value: TimePreset) => {
    setTimeRange(value);
  };

  return (
    <Box className="w-full">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Heading size="6">Paid Media Dashboard</Heading>
          <Flex gap="2" align="center" wrap="wrap" className="w-full sm:w-auto">
            <Select.Root value={platform} onValueChange={handlePlatformChange}>
              <Select.Trigger placeholder="Select platform" className="min-w-[120px]" />
              <Select.Content>
                <Select.Item value="meta">Meta</Select.Item>
                <Select.Item value="google-ads" disabled>
                  Google Ads
                </Select.Item>
                <Select.Item value="dv360" disabled>
                  DV360
                </Select.Item>
              </Select.Content>
            </Select.Root>

            <Select.Root value={timeRange} onValueChange={handleTimeRangeChange}>
              <Select.Trigger placeholder="Select time range" className="min-w-[130px]" />
              <Select.Content>
                <Select.Item value="last_7d">Last 7 days</Select.Item>
                <Select.Item value="last_14d">Last 14 days</Select.Item>
                <Select.Item value="last_30d">Last 30 days</Select.Item>
              </Select.Content>
            </Select.Root>

            <IconButton
              variant="soft"
              onClick={handleRefresh}
              disabled={loadState.status === "loading-campaigns"}
              className="min-h-[44px] min-w-[44px]"
            >
              <ReloadIcon className={loadState.status === "loading-campaigns" ? "animate-spin" : ""} />
            </IconButton>
          </Flex>
        </Flex>

        {loadState.status === "error" && (
          <Card>
            <Flex direction="column" gap="2" p="4">
              <Text color="red" weight="bold">
                Error
              </Text>
              <Text color="red">{loadState.message}</Text>
            </Flex>
          </Card>
        )}

        {adAccountId ? (
          <CampaignTimelineWorkspace
            brandId={brandId}
            accountId={adAccountId}
            campaigns={campaigns}
            isLoadingCampaigns={loadState.status === "loading-campaigns"}
            timeRangePreset={timeRange}
            resolution={timelineResolution}
            onResolutionChange={setTimelineResolution}
            activeOnly={activeOnly}
            onActiveOnlyChange={setActiveOnly}
            onSelectedCampaignChange={setSelectedCampaignId}
          />
        ) : (
          <Card>
            <Box className="p-8 text-center text-muted-foreground">
              Select an ad account from the top-left selector to view campaigns.
            </Box>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <Heading size="4">DCO Action Log</Heading>
          </div>
          <Box className="p-4">
            <DCOActionsWidget
              brandId={brandId}
              metaAccountId={adAccountId ?? undefined}
              campaignId={selectedCampaignId}
            />
          </Box>
        </Card>
      </Flex>
    </Box>
  );
}
