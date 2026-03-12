"use client";

import * as React from "react";
import { BellIcon, CalendarIcon, ReloadIcon } from "@radix-ui/react-icons";
import { Box, Card, Flex, IconButton, Select, Text } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { type CampaignIndexRecord } from "@/lib/paid-media/campaign-indexes";
import { CampaignAdSetWorkspace } from "./CampaignAdSetWorkspace";
import { CampaignIndexManagerDialog } from "./CampaignIndexManagerDialog";
import { DCOActionAlertsBox } from "./DCOActionAlertsBox";
import type { PaidMetricsComparison, PaidMetricsTrendPoint } from "./PerformanceDetails";
import {
  buildDefaultCustomRange,
  TIME_RANGE_OPTIONS,
  toMetricsRange,
  type PaidMediaTimeRange,
  type TimePreset,
} from "./timeRange";

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

type IndexSaveDraft = {
  id?: string;
  name: string;
  campaignIds: string[];
};

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  if (items.length === 0) return [];

  const safeLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<U>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(Array.from({ length: safeLimit }, () => worker()));
  return results;
}

export function PaidMediaDashboard({ brandId, adAccountId }: PaidMediaDashboardProps) {
  const [platform, setPlatform] = React.useState<Platform>("meta");
  const defaultCustomRange = React.useMemo(() => buildDefaultCustomRange(), []);
  const [timeRangePreset, setTimeRangePreset] = React.useState<TimePreset>("last_7d");
  const [customSince, setCustomSince] = React.useState(defaultCustomRange.since);
  const [customUntil, setCustomUntil] = React.useState(defaultCustomRange.until);
  const [customRangeOpen, setCustomRangeOpen] = React.useState(false);
  const [timelineResolution, setTimelineResolution] = React.useState<TimelineResolution>("daily");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [loadState, setLoadState] = React.useState<LoadState>({ status: "idle" });
  const prefersReducedMotion = useReducedMotion();

  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | undefined>();
  const [campaignIndexes, setCampaignIndexes] = React.useState<CampaignIndexRecord[]>([]);
  const [selectedCampaignIndexId, setSelectedCampaignIndexId] = React.useState<string>("all");
  const [indexDialogOpen, setIndexDialogOpen] = React.useState(false);
  const [alertsPanelOpen, setAlertsPanelOpen] = React.useState(false);
  const [alertsRefreshTick, setAlertsRefreshTick] = React.useState(0);
  const [savingIndex, setSavingIndex] = React.useState(false);
  const loadCampaignsRequestIdRef = React.useRef(0);
  const timeRange = React.useMemo<PaidMediaTimeRange>(() => {
    if (timeRangePreset !== "custom") {
      return { preset: timeRangePreset };
    }
    return {
      preset: "custom",
      since: customSince,
      until: customUntil,
    };
  }, [customSince, customUntil, timeRangePreset]);
  const metricsRange = React.useMemo(() => toMetricsRange(timeRange), [timeRange]);
  const customRangeSelection = React.useMemo<DateRange>(
    () => ({
      from: parseISO(customSince),
      to: parseISO(customUntil),
    }),
    [customSince, customUntil]
  );
  const customRangeLabel = React.useMemo(() => {
    const from = customRangeSelection.from;
    const to = customRangeSelection.to;
    if (!from) {
      return "Pick a date range";
    }
    if (!to) {
      return format(from, "LLL dd, yyyy");
    }
    return `${format(from, "LLL dd, yyyy")} - ${format(to, "LLL dd, yyyy")}`;
  }, [customRangeSelection.from, customRangeSelection.to]);

  const loadCampaigns = React.useCallback(async () => {
    const requestId = loadCampaignsRequestIdRef.current + 1;
    loadCampaignsRequestIdRef.current = requestId;

    if (!adAccountId) {
      setCampaigns([]);
      setSelectedCampaignId(undefined);
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

      const campaignsWithMetrics = await mapWithConcurrency(
        rawCampaigns,
        6,
        async (campaign: Campaign) => {
          try {
            const metricsResponse = await fetch("/api/paid-metrics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform,
                brandId,
                accountId: adAccountId,
                campaignId: campaign.id,
                range: metricsRange,
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
        }
      );

      if (requestId !== loadCampaignsRequestIdRef.current) {
        return;
      }
      setCampaigns(campaignsWithMetrics);
      setLoadState({ status: "success" });
    } catch (error) {
      if (requestId !== loadCampaignsRequestIdRef.current) {
        return;
      }
      console.error("Failed to load campaigns:", error);
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load campaigns",
      });
    }
  }, [adAccountId, brandId, metricsRange, platform]);

  const loadCampaignIndexes = React.useCallback(async () => {
    if (!adAccountId) {
      setCampaignIndexes([]);
      setSelectedCampaignIndexId("all");
      return;
    }

    try {
      const params = new URLSearchParams({
        brandId,
        metaAccountId: adAccountId,
      });

      const response = await fetch(`/api/paid-media/campaign-indexes?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load campaign indexes");
      }

      const payload = (await response.json()) as { indexes?: CampaignIndexRecord[] };
      const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
      setCampaignIndexes(indexes);

      setSelectedCampaignIndexId((current) => {
        if (current === "all") return current;
        return indexes.some((index) => index.id === current) ? current : "all";
      });
    } catch (error) {
      console.error("Failed to load campaign indexes", error);
      setCampaignIndexes([]);
      setSelectedCampaignIndexId("all");
    }
  }, [adAccountId, brandId]);

  React.useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  React.useEffect(() => {
    void loadCampaignIndexes();
  }, [loadCampaignIndexes]);

  const handleRefresh = () => {
    void loadCampaigns();
  };

  const handlePlatformChange = (value: Platform) => {
    setPlatform(value);
    setCampaigns([]);
  };

  const handleTimeRangeChange = (value: TimePreset) => {
    setTimeRangePreset(value);
    if (value !== "custom") {
      setCustomRangeOpen(false);
    }
  };

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return;
    setCustomSince(format(range.from, "yyyy-MM-dd"));
    setCustomUntil(format(range.to, "yyyy-MM-dd"));
    setCustomRangeOpen(false);
  };

  const selectedCampaignIndex = React.useMemo(
    () => campaignIndexes.find((index) => index.id === selectedCampaignIndexId),
    [campaignIndexes, selectedCampaignIndexId]
  );

  const dialogInitialValue = React.useMemo<IndexSaveDraft | undefined>(() => {
    if (!selectedCampaignIndex || selectedCampaignIndexId === "all") return undefined;
    return {
      id: selectedCampaignIndex.id,
      name: selectedCampaignIndex.name,
      campaignIds: selectedCampaignIndex.campaignIds,
    };
  }, [selectedCampaignIndex, selectedCampaignIndexId]);

  const saveCampaignIndex = React.useCallback(
    async (draft: IndexSaveDraft) => {
      if (!adAccountId) return;

      setSavingIndex(true);
      try {
        if (draft.id) {
          const updateResponse = await fetch(`/api/paid-media/campaign-indexes/${draft.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: draft.name,
              campaignIds: draft.campaignIds,
            }),
          });

          if (!updateResponse.ok) {
            throw new Error("Failed to update campaign index");
          }
        } else {
          const createResponse = await fetch("/api/paid-media/campaign-indexes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brandId,
              metaAccountId: adAccountId,
              name: draft.name,
              campaignIds: draft.campaignIds,
            }),
          });

          if (!createResponse.ok) {
            throw new Error("Failed to create campaign index");
          }

          const payload = (await createResponse.json()) as { index?: CampaignIndexRecord };
          if (payload.index?.id) {
            setSelectedCampaignIndexId(payload.index.id);
          }
        }

        await loadCampaignIndexes();
        setIndexDialogOpen(false);
      } catch (error) {
        console.error("Failed to save campaign index", error);
      } finally {
        setSavingIndex(false);
      }
    },
    [adAccountId, brandId, loadCampaignIndexes]
  );

  const deleteCampaignIndex = React.useCallback(async (indexId: string) => {
    setSavingIndex(true);
    try {
      const response = await fetch(`/api/paid-media/campaign-indexes/${indexId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete campaign index");
      }

      setSelectedCampaignIndexId("all");
      await loadCampaignIndexes();
    } catch (error) {
      console.error("Failed to delete campaign index", error);
    } finally {
      setSavingIndex(false);
    }
  }, [loadCampaignIndexes]);

  return (
    <Box className="w-full">
      <Flex direction="column" gap="2">
        <Flex justify="end" align="center" wrap="wrap" gap="2" className="px-1">
          <Select.Root value={platform} onValueChange={handlePlatformChange}>
            <Select.Trigger placeholder="Select platform" className="min-h-8 min-w-[110px] text-xs" />
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

          <Select.Root value={timeRangePreset} onValueChange={handleTimeRangeChange}>
            <Select.Trigger placeholder="Select time range" className="min-h-8 min-w-[120px] text-xs" />
            <Select.Content>
              {TIME_RANGE_OPTIONS.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          <AnimatePresence initial={false}>
            {timeRangePreset === "custom" && (
              <motion.div
                key="custom-range-calendar"
                initial={prefersReducedMotion ? false : { opacity: 0, y: -6, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <Popover open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 min-w-[250px] justify-start text-left text-xs font-normal"
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {customRangeLabel}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="range"
                      initialFocus
                      defaultMonth={customRangeSelection.from}
                      selected={customRangeSelection}
                      onSelect={handleCustomRangeSelect}
                      numberOfMonths={2}
                      classNames={{
                        head_row: "hidden",
                        head_cell: "hidden",
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </motion.div>
            )}
          </AnimatePresence>

          <Popover open={indexDialogOpen} onOpenChange={setIndexDialogOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setSelectedCampaignIndexId("all");
                }}
              >
                New index
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-[60] w-[min(96vw,560px)] p-0">
              <CampaignIndexManagerDialog
                campaigns={campaigns.map((campaign) => ({
                  id: campaign.id,
                  name: campaign.name,
                  status: campaign.status,
                }))}
                initialValue={dialogInitialValue}
                saving={savingIndex}
                onCancel={() => setIndexDialogOpen(false)}
                onSave={(draft) => void saveCampaignIndex(draft)}
              />
            </PopoverContent>
          </Popover>

          <DropdownMenu open={alertsPanelOpen} onOpenChange={setAlertsPanelOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <BellIcon className="mr-1.5 h-3.5 w-3.5" />
                Alerts
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(96vw,1100px)] p-0">
              <DCOActionAlertsBox
                brandId={brandId}
                metaAccountId={adAccountId ?? undefined}
                campaignId={selectedCampaignId}
                onRefresh={() => setAlertsRefreshTick((current) => current + 1)}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <IconButton
            variant="soft"
            onClick={handleRefresh}
            disabled={loadState.status === "loading-campaigns"}
            className="h-8 w-8"
          >
            <ReloadIcon className={loadState.status === "loading-campaigns" ? "animate-spin" : ""} />
          </IconButton>
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
          <CampaignAdSetWorkspace
            brandId={brandId}
            accountId={adAccountId}
            campaigns={campaigns}
            campaignIndexes={campaignIndexes}
            selectedCampaignIndexId={selectedCampaignIndexId}
            onSelectedCampaignIndexChange={setSelectedCampaignIndexId}
            timeRange={timeRange}
            resolution={timelineResolution}
            onResolutionChange={setTimelineResolution}
            activeOnly={activeOnly}
            onActiveOnlyChange={setActiveOnly}
            onSelectedCampaignChange={setSelectedCampaignId}
            alertsRefreshTick={alertsRefreshTick}
            onEditCampaignIndex={(indexId) => {
              setSelectedCampaignIndexId(indexId);
              setIndexDialogOpen(true);
            }}
            onDeleteCampaignIndex={(indexId) => void deleteCampaignIndex(indexId)}
          />
        ) : (
          <Card>
            <Box className="p-8 text-center text-muted-foreground">
              Select an ad account from the top-left selector to view campaigns.
            </Box>
          </Card>
        )}

        <Text size="1" color="gray" className="pb-1 text-center">
          Charting library generously provided by{" "}
          <a
            href="https://www.tradingview.com/lightweight-charts/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Trading View
          </a>
          .
        </Text>
      </Flex>
    </Box>
  );
}
