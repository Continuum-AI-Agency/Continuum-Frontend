import { format, subDays } from 'date-fns';
import {
  Calendar as CalendarIcon,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTimelineBlocks } from '@/hooks/timeline/useTimelineBlocks';
import type { UiLocale } from '@/i18n/config';
import { formatDecimal } from '@/lib/format/decimal';
import { cn } from '@/lib/utils';
import type { TimelineEvent } from '@/types/timeline';
import { TimelineGrid } from './TimelineGrid';
import { TimelineSidePanel } from './TimelineSidePanel';

interface TimelineContainerProps {
  brandId: string;
  accountId: string | null;
  resolution: 'daily' | 'hourly';
  onResolutionChange: (value: 'daily' | 'hourly') => void;
  onDcoManagedCampaignIdsChange?: (ids: string[]) => void;
}

type SummaryRecord = Record<string, unknown>;
type DeltaRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, locale: UiLocale = 'en'): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatPercent(value: number, locale: UiLocale = 'en'): string {
  return `${formatDecimal(value, 2, locale)}%`;
}

function formatTimestampLabel(
  timestamp: string,
  resolution: 'daily' | 'hourly',
  locale: UiLocale = 'en',
): string {
  const date = new Date(timestamp);
  if (resolution === 'hourly') {
    return date.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      hour12: true,
    });
  }

  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}

function SteppedMetricChart({
  data,
  valueKey,
  label,
  color,
  resolution,
  formatter,
}: {
  data: Array<Record<string, unknown>>;
  valueKey: string;
  label: string;
  color: string;
  resolution: 'daily' | 'hourly';
  formatter: (value: number) => string;
}) {
  const uiLocale = useLocale();
  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => formatTimestampLabel(String(value), resolution, uiLocale)}
                minTickGap={24}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(value) => formatter(Number(value))}
                width={80}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(value) =>
                  formatTimestampLabel(String(value), resolution, uiLocale)
                }
                formatter={(value) => formatter(Number(value))}
              />
              <Line
                type="stepAfter"
                dataKey={valueKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function TimelineContainer({
  brandId,
  accountId,
  resolution,
  onResolutionChange,
  onDcoManagedCampaignIdsChange,
}: TimelineContainerProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();

  const [date, setDate] = useState<{ from: Date; to: Date } | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const startDate = date?.from?.toISOString();
  const endDate = date?.to?.toISOString();

  const { blocks, campaigns, events, loading, error } = useTimelineBlocks({
    brandId,
    accountId,
    startDate,
    endDate,
    resolution,
  });

  const dcoManagedCampaignIds = useMemo(() => {
    const managedIds = campaigns
      .filter((campaign) => {
        const campaignWithAds = campaign as { ads?: unknown[] };
        const hasCampaignAds = Array.isArray(campaignWithAds.ads) && campaignWithAds.ads.length > 0;
        const hasAdSetAds =
          campaign.ad_sets?.some((adSet) => Array.isArray(adSet.ads) && adSet.ads.length > 0) ??
          false;

        return hasCampaignAds || hasAdSetAds;
      })
      .map((campaign) => campaign.id);

    if (managedIds.length > 0) {
      return managedIds;
    }

    return Array.from(new Set(campaigns.map((campaign) => campaign.id)));
  }, [campaigns]);

  useEffect(() => {
    onDcoManagedCampaignIdsChange?.(dcoManagedCampaignIds);
  }, [dcoManagedCampaignIds, onDcoManagedCampaignIdsChange]);

  const visibleCampaigns = useMemo(() => {
    if (resolution === 'hourly') {
      const managedIds = new Set(dcoManagedCampaignIds);
      return campaigns.filter((campaign) => managedIds.has(campaign.id));
    }

    return campaigns;
  }, [campaigns, dcoManagedCampaignIds, resolution]);

  const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;
  const summary = (latestBlock?.summary ?? {}) as SummaryRecord;
  const deltas = (latestBlock?.deltas ?? {}) as DeltaRecord;

  const chartData = useMemo(() => {
    return blocks.map((block) => {
      const blockSummary = (block.summary ?? {}) as SummaryRecord;
      return {
        timestamp: block.block_start,
        spend: toNumber(blockSummary.total_spend),
        roas: toNumber(blockSummary.avg_roas),
        ctr: toNumber(blockSummary.avg_ctr_pct),
      };
    });
  }, [blocks]);

  const metricStripItems = useMemo<MetricStripItem[]>(() => {
    return [
      {
        label: uiText('spend_85f3d55'),
        value: formatCurrency(toNumber(summary.total_spend), uiLocale),
        deltaPct: toNumber(deltas.spend_delta_pct),
      },
      {
        label: uiText('roas_b81bd97'),
        value: formatNumber(toNumber(summary.avg_roas), uiLocale),
        deltaPct: toNumber(deltas.roas_delta_pct),
      },
      {
        label: uiText('ctr_07fce34'),
        value: formatPercent(toNumber(summary.avg_ctr_pct), uiLocale),
        deltaPct: toNumber(deltas.ctr_delta_pct),
      },
      {
        label: uiText('conversions_236c262'),
        value: formatNumber(toNumber(summary.total_conversions), uiLocale),
      },
      {
        label: uiText('active_campaigns_4bac0c8'),
        value: formatNumber(toNumber(summary.active_campaigns), uiLocale),
      },
    ];
  }, [summary, deltas, uiText, uiLocale]);

  const handleEventClick = (event: TimelineEvent) => {
    setSelectedEventId(event.id);
    setShowSidebar(true);
  };

  const startDateMs = date?.from?.getTime() || new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
  const endDateMs = date?.to?.getTime() || new Date().getTime();

  const content = (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-muted/30 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    id="date"
                    variant="outline"
                    className={cn(
                      'w-[260px] justify-start text-left font-normal',
                      !date && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}
                        </>
                      ) : (
                        format(date.from, 'LLL dd, y')
                      )
                    ) : (
                      <span>{uiText('pick_a_date_range_fceaa2d')}</span>
                    )}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={(range: { from?: Date; to?: Date } | undefined) => {
                    if (!range?.from || !range?.to) return;
                    setDate({ from: range.from, to: range.to });
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <Select
              value={resolution}
              onValueChange={(value) => onResolutionChange(value as 'daily' | 'hourly')}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={uiText('resolution_d4055fa')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{uiText('daily_b36c261')}</SelectItem>
                <SelectItem value="hourly">{uiText('hourly_eab0cd8')}</SelectItem>
              </SelectContent>
            </Select>

            {loading ? (
              <span className="ml-2 animate-pulse text-sm text-muted-foreground">
                {uiText('loading_blocks_7843d1a')}
              </span>
            ) : null}
            {error ? (
              <span className="ml-2 text-sm text-destructive">
                {uiText.rich('sentence_15ce6edb9ac9', { v0: error.message })}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              title={uiText('toggle_events_sidebar_cab0ad8')}
            >
              {showSidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={
                isFullscreen
                  ? uiText('exit_fullscreen_5a164f4')
                  : uiText('enter_fullscreen_4036e4c')
              }
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </Button>
          </div>
        </div>
      </div>

      <div className="border-b border-border px-3 py-3">
        <MetricStrip items={metricStripItems} />

        {chartData.length > 1 ? (
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <SteppedMetricChart
              data={chartData}
              valueKey="spend"
              label={uiText('spend_85f3d55')}
              color="#22c55e"
              resolution={resolution}
              formatter={(value) => formatCurrency(value, uiLocale)}
            />
            <SteppedMetricChart
              data={chartData}
              valueKey="roas"
              label={uiText('roas_b81bd97')}
              color="#3b82f6"
              resolution={resolution}
              formatter={(value) => value.toFixed(2)}
            />
            <SteppedMetricChart
              data={chartData}
              valueKey="ctr"
              label={uiText('ctr_db9f039')}
              color="#06b6d4"
              resolution={resolution}
              formatter={(value) => `${value.toFixed(2)}%`}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-auto">
          {resolution === 'hourly' && visibleCampaigns.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              {uiText('no_dco_managed_campaigns_available_in_this_ho_f1b8176')}
            </div>
          ) : (
            <TimelineGrid
              startDateMs={startDateMs}
              endDateMs={endDateMs}
              campaigns={visibleCampaigns}
              onEventClick={handleEventClick}
              selectedEventId={selectedEventId}
            />
          )}
        </div>

        {showSidebar ? (
          <TimelineSidePanel
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={handleEventClick}
            onClose={() => setShowSidebar(false)}
          />
        ) : null}
      </div>
    </div>
  );

  if (isFullscreen) {
    return <div className="fixed inset-0 z-50 flex flex-col bg-background">{content}</div>;
  }

  return (
    <Card className="flex h-[780px] w-full flex-col overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-lg">{uiText('dco_timeline_20742ef')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">{content}</CardContent>
    </Card>
  );
}
