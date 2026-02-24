"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Box, Card, Flex, Heading, IconButton, Select, Text } from "@radix-ui/themes";

import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { CampaignAccordion } from "./CampaignAccordion";
import { TimelineContainer } from "@/components/paid-media/timeline/TimelineContainer";

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
};

type Platform = "meta" | "google-ads" | "dv360";
type TimePreset = "last_7d" | "last_14d" | "last_30d";

type PaidMediaDashboardProps = {
  brandId: string;
  adAccountId: string | null;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading-accounts" }
  | { status: "loading-campaigns" }
  | { status: "error"; message: string }
  | { status: "success" };

export function PaidMediaDashboard({ brandId, adAccountId }: PaidMediaDashboardProps) {
  const [platform, setPlatform] = React.useState<Platform>("meta");
  const [timeRange, setTimeRange] = React.useState<TimePreset>("last_7d");
  const [loadState, setLoadState] = React.useState<LoadState>({ status: "idle" });

  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);

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
            const { data: metricsData, error: metricsError } = await supabase.functions.invoke(
              `paid-media-metrics?platform=${platform}&brandId=${brandId}&accountId=${adAccountId}&campaignId=${campaign.id}`,
              {
                body: {
                  platform,
                  brandId,
                  accountId: adAccountId,
                  campaignId: campaign.id,
                  range: { preset: timeRange },
                },
              }
            );

            if (!metricsError && metricsData?.metrics) {
              return {
                ...campaign,
                metrics: metricsData.metrics,
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

        {adAccountId && (
          <Box className="w-full mb-4">
            <TimelineContainer accountId={adAccountId} />
          </Box>
        )}

        <div className="h-[calc(100dvh-17.5rem)] min-h-[var(--dashboard-min-panel-height)] overflow-hidden rounded-xl border bg-white/5">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={65} minSize={30}>
              <Box className="h-full overflow-auto p-4">
                {loadState.status === "loading-campaigns" ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : adAccountId ? (
                  <CampaignAccordion
                    campaigns={campaigns}
                    brandId={brandId}
                    accountId={adAccountId}
                    timeRange={{ preset: timeRange }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Select an ad account from the top-left selector to view campaigns.
                  </div>
                )}
              </Box>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-white/10" />

            <ResizablePanel defaultSize={35} minSize={20}>
              <Box className="h-full overflow-auto bg-black/20 p-4">
                <DCOActionsWidget brandId={brandId} metaAccountId={adAccountId ?? undefined} />
              </Box>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </Flex>
    </Box>
  );
}
