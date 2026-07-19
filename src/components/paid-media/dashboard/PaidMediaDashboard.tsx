'use client';

import { BellIcon, CalendarIcon, InfoCircledIcon, ReloadIcon } from '@radix-ui/react-icons';
import { format, parseISO } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { PendingActivityTabs } from '@/components/approvals/PendingActivityTabs';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CampaignIndexRecord } from '@/lib/paid-media/campaign-indexes';
import { usePaidMediaPerformanceStore } from '@/lib/paid-media/performance-store';
import type { CampaignPerformanceRow, PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { consumePrefetchedIndexes } from '@/lib/prefetch/paid-media-cache';
import { cn } from '@/lib/utils';
import { AccountInsightsPanel } from './AccountInsightsPanel';
import { CampaignAdSetWorkspace } from './CampaignAdSetWorkspace';
import { CampaignIndexManagerDialog } from './CampaignIndexManagerDialog';
import { CampaignInsightsPanel } from './CampaignInsightsPanel';
import { DCOActionAlertsBox } from './DCOActionAlertsBox';
import { LinkedInInsightsPanel } from './LinkedInInsightsPanel';
import {
  buildDefaultCustomRange,
  type PaidMediaTimeRange,
  TIME_RANGE_OPTIONS,
  type TimePreset,
  toMetricsRange,
} from './timeRange';
import { WhatsWorkingAdsCard } from './whats-working/WhatsWorkingAdsCard';

type Campaign = CampaignPerformanceRow;

type Platform = PaidMediaPlatform;
type TimelineResolution = 'daily' | 'hourly';

type PaidMediaDashboardProps = {
  brandId: string;
  adAccountId: string | null;
  platform: PaidMediaPlatform;
  onPlatformChange: (platform: PaidMediaPlatform) => void;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading-campaigns' }
  | { status: 'error'; message: string }
  | { status: 'success' };

type IndexSaveDraft = {
  id?: string;
  name: string;
  campaignIds: string[];
};

export function PaidMediaDashboard({
  brandId,
  adAccountId,
  platform,
  onPlatformChange,
}: PaidMediaDashboardProps) {
  const loadCampaignPerformance = usePaidMediaPerformanceStore(
    (state) => state.loadCampaignPerformance,
  );
  const defaultCustomRange = React.useMemo(() => buildDefaultCustomRange(), []);
  const [timeRangePreset, setTimeRangePreset] = React.useState<TimePreset>('last_7d');
  const [customSince, setCustomSince] = React.useState(defaultCustomRange.since);
  const [customUntil, setCustomUntil] = React.useState(defaultCustomRange.until);
  const [customRangeOpen, setCustomRangeOpen] = React.useState(false);
  const [timelineResolution, setTimelineResolution] = React.useState<TimelineResolution>('daily');
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'idle' });
  const prefersReducedMotion = useReducedMotion();

  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | undefined>();
  const [campaignIndexes, setCampaignIndexes] = React.useState<CampaignIndexRecord[]>([]);
  const [selectedCampaignIndexId, setSelectedCampaignIndexId] = React.useState<string>('all');
  const [indexDialogOpen, setIndexDialogOpen] = React.useState(false);
  const [alertsPanelOpen, setAlertsPanelOpen] = React.useState(false);
  const [alertsRefreshTick, setAlertsRefreshTick] = React.useState(0);
  const [savingIndex, setSavingIndex] = React.useState(false);
  const loadCampaignsRequestIdRef = React.useRef(0);
  const timeRange = React.useMemo<PaidMediaTimeRange>(() => {
    if (timeRangePreset !== 'custom') {
      return { preset: timeRangePreset };
    }
    return {
      preset: 'custom',
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
    [customSince, customUntil],
  );
  const customRangeLabel = React.useMemo(() => {
    const from = customRangeSelection.from;
    const to = customRangeSelection.to;
    if (!from) {
      return 'Pick a date range';
    }
    if (!to) {
      return format(from, 'LLL dd, yyyy');
    }
    return `${format(from, 'LLL dd, yyyy')} - ${format(to, 'LLL dd, yyyy')}`;
  }, [customRangeSelection.from, customRangeSelection.to]);

  const loadCampaigns = React.useCallback(
    async (force = false) => {
      const requestId = loadCampaignsRequestIdRef.current + 1;
      loadCampaignsRequestIdRef.current = requestId;

      if (!adAccountId) {
        setCampaigns([]);
        setSelectedCampaignId(undefined);
        setLoadState({ status: 'idle' });
        return;
      }

      setLoadState({ status: 'loading-campaigns' });

      try {
        const campaignsWithMetrics = await loadCampaignPerformance(
          {
            brandId,
            adAccountId,
            platform,
            range: metricsRange,
          },
          { force },
        );

        if (requestId !== loadCampaignsRequestIdRef.current) {
          return;
        }
        setCampaigns(campaignsWithMetrics);
        setLoadState({ status: 'success' });
      } catch (error) {
        if (requestId !== loadCampaignsRequestIdRef.current) {
          return;
        }
        console.error('Failed to load campaigns:', error);
        setLoadState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load campaigns',
        });
      }
    },
    [adAccountId, brandId, loadCampaignPerformance, metricsRange, platform],
  );

  const loadCampaignIndexes = React.useCallback(async () => {
    if (!adAccountId) {
      setCampaignIndexes([]);
      setSelectedCampaignIndexId('all');
      return;
    }

    try {
      const params = new URLSearchParams({
        brandId,
        metaAccountId: adAccountId,
      });

      const prefetched = consumePrefetchedIndexes(brandId, adAccountId);
      const payload = prefetched
        ? ((await prefetched) as { indexes?: CampaignIndexRecord[] })
        : await fetch(`/api/paid-media/campaign-indexes?${params.toString()}`).then(
            async (response) => {
              if (!response.ok) {
                throw new Error('Failed to load campaign indexes');
              }
              return (await response.json()) as { indexes?: CampaignIndexRecord[] };
            },
          );
      const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
      setCampaignIndexes(indexes);

      setSelectedCampaignIndexId((current) => {
        if (current === 'all') return current;
        return indexes.some((index) => index.id === current) ? current : 'all';
      });
    } catch (error) {
      console.error('Failed to load campaign indexes', error);
      setCampaignIndexes([]);
      setSelectedCampaignIndexId('all');
    }
  }, [adAccountId, brandId]);

  React.useEffect(() => {
    void loadCampaigns(false);
  }, [loadCampaigns]);

  React.useEffect(() => {
    void loadCampaignIndexes();
  }, [loadCampaignIndexes]);

  const handleRefresh = () => {
    void loadCampaigns(true);
  };

  const handlePlatformChange = (value: Platform) => {
    onPlatformChange(value);
    setCampaigns([]);
  };

  const handleTimeRangeChange = (value: TimePreset) => {
    setTimeRangePreset(value);
    if (value !== 'custom') {
      setCustomRangeOpen(false);
    }
  };

  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from || !range?.to) return;
    setCustomSince(format(range.from, 'yyyy-MM-dd'));
    setCustomUntil(format(range.to, 'yyyy-MM-dd'));
    setCustomRangeOpen(false);
  };

  const selectedCampaignIndex = React.useMemo(
    () => campaignIndexes.find((index) => index.id === selectedCampaignIndexId),
    [campaignIndexes, selectedCampaignIndexId],
  );

  const dialogInitialValue = React.useMemo<IndexSaveDraft | undefined>(() => {
    if (!selectedCampaignIndex || selectedCampaignIndexId === 'all') return undefined;
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
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: draft.name,
              campaignIds: draft.campaignIds,
            }),
          });

          if (!updateResponse.ok) {
            throw new Error('Failed to update campaign index');
          }
        } else {
          const createResponse = await fetch('/api/paid-media/campaign-indexes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandId,
              metaAccountId: adAccountId,
              name: draft.name,
              campaignIds: draft.campaignIds,
            }),
          });

          if (!createResponse.ok) {
            throw new Error('Failed to create campaign index');
          }

          const payload = (await createResponse.json()) as { index?: CampaignIndexRecord };
          if (payload.index?.id) {
            setSelectedCampaignIndexId(payload.index.id);
          }
        }

        await loadCampaignIndexes();
        setIndexDialogOpen(false);
      } catch (error) {
        console.error('Failed to save campaign index', error);
      } finally {
        setSavingIndex(false);
      }
    },
    [adAccountId, brandId, loadCampaignIndexes],
  );

  const deleteCampaignIndex = React.useCallback(
    async (indexId: string) => {
      setSavingIndex(true);
      try {
        const response = await fetch(`/api/paid-media/campaign-indexes/${indexId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete campaign index');
        }

        setSelectedCampaignIndexId('all');
        await loadCampaignIndexes();
      } catch (error) {
        console.error('Failed to delete campaign index', error);
      } finally {
        setSavingIndex(false);
      }
    },
    [loadCampaignIndexes],
  );

  const dashboardToolbar = (
    <>
      {loadState.status === 'loading-campaigns' ? (
        <span className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground">
          Loading
        </span>
      ) : null}

      <Select value={platform} onValueChange={(value) => handlePlatformChange(value as Platform)}>
        <SelectTrigger className="min-h-8 min-w-[110px] text-xs">
          <SelectValue placeholder="Select platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="meta">Meta</SelectItem>
          <SelectItem value="google-ads">Google Ads</SelectItem>
          <SelectItem value="linkedin">LinkedIn Ads</SelectItem>
          <SelectItem value="dv360" disabled>
            DV360
          </SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={timeRangePreset}
        onValueChange={(value) => handleTimeRangeChange(value as TimePreset)}
      >
        <SelectTrigger className="min-h-8 min-w-[120px] text-xs">
          <SelectValue placeholder="Select time range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AnimatePresence initial={false}>
        {timeRangePreset === 'custom' && (
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
                  className={cn(
                    'h-8 min-w-[220px] justify-start gap-1.5 text-left text-xs font-normal',
                    customRangeOpen &&
                      'border-primary/60 bg-primary/5 text-primary ring-1 ring-primary/20',
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{customRangeLabel}</span>
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
                  disabled={{ after: new Date() }}
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
              setSelectedCampaignIndexId('all');
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
          <Button
            data-tour-id="paid-dco-alerts"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
          >
            <BellIcon className="mr-1.5 h-3.5 w-3.5" />
            Alerts
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="h-[min(80vh,640px)] w-[min(96vw,1100px)] p-0">
          <PendingActivityTabs
            brandId={brandId}
            variant="dropdown"
            className="h-full"
            activityContent={
              <DCOActionAlertsBox
                brandId={brandId}
                metaAccountId={adAccountId ?? undefined}
                campaignId={selectedCampaignId}
                onRefresh={() => setAlertsRefreshTick((current) => current + 1)}
              />
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Chart attribution"
          >
            <InfoCircledIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 text-xs text-muted-foreground">
          Charting library provided by{' '}
          <a
            href="https://www.tradingview.com/lightweight-charts/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            TradingView Lightweight Charts
          </a>
          .
        </PopoverContent>
      </Popover>

      <Button
        variant="secondary"
        size="icon-sm"
        onClick={handleRefresh}
        disabled={loadState.status === 'loading-campaigns'}
        className="h-8 w-8"
        aria-label="Refresh campaigns"
      >
        <ReloadIcon className={loadState.status === 'loading-campaigns' ? 'animate-spin' : ''} />
      </Button>
    </>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      {loadState.status === 'error' ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{loadState.message}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-destructive/40 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Retry campaigns"
            onClick={() => void loadCampaigns(true)}
          >
            <ReloadIcon className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
        {adAccountId ? (
          <div className="grid min-h-full gap-1.5 xl:grid-rows-[minmax(0,1fr)_auto]">
            <CampaignAdSetWorkspace
              brandId={brandId}
              accountId={adAccountId}
              platform={platform}
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
              toolbarSlot={dashboardToolbar}
            />

            {platform === 'meta' ? (
              <WhatsWorkingAdsCard adAccountId={adAccountId} brandId={brandId} />
            ) : null}

            <div className="min-h-0">
              {platform === 'linkedin' ? (
                <LinkedInInsightsPanel
                  brandId={brandId}
                  adAccountId={adAccountId}
                  campaignId={selectedCampaignId}
                  campaignName={campaigns.find((c) => c.id === selectedCampaignId)?.name}
                  timeRange={timeRange}
                />
              ) : platform !== 'meta' ? (
                <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
                  <p className="text-sm font-medium text-foreground">Platform insights</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Performance KPIs, trends, and ranked entities are loaded above. Narrative
                    insight panels are available for Meta and LinkedIn.
                  </p>
                </div>
              ) : selectedCampaignId ? (
                <CampaignInsightsPanel
                  brandId={brandId}
                  adAccountId={adAccountId}
                  campaignId={selectedCampaignId}
                  campaignName={campaigns.find((c) => c.id === selectedCampaignId)?.name}
                  campaignObjective={campaigns.find((c) => c.id === selectedCampaignId)?.objective}
                  timeRange={timeRange}
                />
              ) : (
                <AccountInsightsPanel
                  brandId={brandId}
                  adAccountId={adAccountId}
                  timeRange={timeRange}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[18rem] place-items-center rounded-lg border border-dashed border-border/70 bg-background/70 p-6 text-center text-sm text-muted-foreground">
            Select an ad account to view campaigns.
          </div>
        )}
      </div>
    </section>
  );
}
