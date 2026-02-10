"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Box, Flex, Heading, IconButton, Select, Text, Card } from "@radix-ui/themes";
import { CampaignAccordion } from "./CampaignAccordion";
import { DCOActionsWidget } from "@/components/dashboard/DCOActionsWidget";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandIntegrations } from "@/hooks/useBrandIntegrations";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { PaidMetricsResponse } from "@/lib/schemas/paidMetrics";

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
};

type LoadState =
  | { status: "idle" }
  | { status: "loading-accounts" }
  | { status: "loading-campaigns" }
  | { status: "error"; message: string }
  | { status: "success" };

export function PaidMediaDashboard({ brandId }: PaidMediaDashboardProps) {
  const [platform, setPlatform] = React.useState<Platform>("meta");
  const [timeRange, setTimeRange] = React.useState<TimePreset>("last_7d");
  const [loadState, setLoadState] = React.useState<LoadState>({ status: "idle" });
  
  const [selectedAccount, setSelectedAccount] = React.useState<string | null>(null);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);

  const { integrations, isLoading: integrationsLoading } = useBrandIntegrations(brandId);

  const adAccounts = React.useMemo(() => {
    if (!integrations) return [];
    const facebookAccounts = integrations.facebook?.accounts ?? [];
    return facebookAccounts.map((acc) => ({
      id: acc.externalAccountId ?? acc.integrationAccountId,
      name: acc.name,
    }));
  }, [integrations]);

  const loadCampaigns = React.useCallback(async () => {
    if (!selectedAccount) return;

    setLoadState({ status: "loading-campaigns" });

    try {
      const supabase = createSupabaseBrowserClient();
      
      const { data, error: fetchError } = await supabase.functions.invoke(
        `fetch-meta-campaigns?brandId=${brandId}&adAccountId=${selectedAccount}`, 
        {
          method: "POST",
          body: {
            brandId,
            adAccountId: selectedAccount,
          },
        }
      );

      if (fetchError) {
        throw new Error(`Failed to fetch campaigns: ${fetchError.message}`);
      }

      const rawCampaigns = data.campaigns || [];

      const campaignsWithMetrics = await Promise.all(
        rawCampaigns.map(async (campaign: any) => {
          try {
            const { data: metricsData, error: metricsError } = await supabase.functions.invoke(
              `paid-media-metrics?platform=${platform}&brandId=${brandId}&accountId=${selectedAccount}&campaignId=${campaign.id}`,
              {
                body: {
                  platform,
                  brandId,
                  accountId: selectedAccount,
                  campaignId: campaign.id,
                  range: { preset: timeRange },
                },
              }
            );

            if (!metricsError && metricsData) {
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
  }, [brandId, selectedAccount, platform, timeRange]);

  React.useEffect(() => {
    if (adAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(adAccounts[0].id);
    }
  }, [adAccounts, selectedAccount]);

  React.useEffect(() => {
    if (selectedAccount) {
      loadCampaigns();
    }
  }, [loadCampaigns, selectedAccount]);

  const handleRefresh = () => {
    if (selectedAccount) {
      loadCampaigns();
    }
  };

  const handleAccountChange = (value: string) => {
    setSelectedAccount(value);
  };

  const handlePlatformChange = (value: Platform) => {
    setPlatform(value);
    setSelectedAccount(null);
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

            {adAccounts.length > 0 && (
              <Select.Root value={selectedAccount || undefined} onValueChange={handleAccountChange}>
                <Select.Trigger placeholder="Select account" className="min-w-[140px]" />
                <Select.Content>
                  {adAccounts.map((account) => (
                    <Select.Item key={account.id} value={account.id}>
                      {account.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}

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
              <ReloadIcon
                className={loadState.status === "loading-campaigns" ? "animate-spin" : ""}
              />
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

        <div className="h-[calc(100vh-280px)] min-h-[600px] border rounded-xl overflow-hidden bg-white/5">
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
                ) : selectedAccount ? (
                  <CampaignAccordion
                    campaigns={campaigns}
                    brandId={brandId}
                    accountId={selectedAccount}
                    timeRange={{ preset: timeRange }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Select an ad account to view campaigns
                  </div>
                )}
              </Box>
            </ResizablePanel>
            
            <ResizableHandle withHandle className="bg-white/10" />
            
            <ResizablePanel defaultSize={35} minSize={20}>
              <Box className="h-full overflow-auto p-4 bg-black/20">
                <DCOActionsWidget brandId={brandId} />
              </Box>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </Flex>
    </Box>
  );
}
