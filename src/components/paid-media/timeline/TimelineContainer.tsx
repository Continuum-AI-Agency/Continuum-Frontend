import React, { useEffect, useMemo, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, subDays } from 'date-fns';

import { useTimelineBlocks } from '@/hooks/timeline/useTimelineBlocks';
import { TimelineGrid } from './TimelineGrid';
import { TimelineSidePanel } from './TimelineSidePanel';
import { TimelineEvent } from '@/types/timeline';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatTimestampLabel(timestamp: string, resolution: 'daily' | 'hourly'): string {
  const date = new Date(timestamp);
  if (resolution === 'hourly') {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      hour12: true,
    });
  }

  return date.toLocaleDateString('en-US', {
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
                tickFormatter={(value) => formatTimestampLabel(String(value), resolution)}
                minTickGap={24}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(value) => formatter(Number(value))}
                width={80}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(value) => formatTimestampLabel(String(value), resolution)}
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
          campaign.ad_sets?.some((adSet) => Array.isArray(adSet.ads) && adSet.ads.length > 0) ?? false;

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
      { label: 'Spend', value: formatCurrency(toNumber(summary.total_spend)), deltaPct: toNumber(deltas.spend_delta_pct) },
      { label: 'ROAS', value: formatNumber(toNumber(summary.avg_roas)), deltaPct: toNumber(deltas.roas_delta_pct) },
      { label: 'CTR', value: formatPercent(toNumber(summary.avg_ctr_pct)), deltaPct: toNumber(deltas.ctr_delta_pct) },
      { label: 'Conversions', value: formatNumber(toNumber(summary.total_conversions)) },
      { label: 'Active Campaigns', value: formatNumber(toNumber(summary.active_campaigns)) },
    ];
  }, [summary, deltas]);

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
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn('w-[260px] justify-start text-left font-normal', !date && 'text-muted-foreground')}
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
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
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

            <Select value={resolution} onValueChange={(value) => onResolutionChange(value as 'daily' | 'hourly')}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
              </SelectContent>
            </Select>

            {loading ? <span className="ml-2 animate-pulse text-sm text-muted-foreground">Loading blocks...</span> : null}
            {error ? <span className="ml-2 text-sm text-destructive">Error: {error.message}</span> : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSidebar(!showSidebar)} title="Toggle Events Sidebar">
              {showSidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
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
              label="Spend"
              color="#22c55e"
              resolution={resolution}
              formatter={(value) => formatCurrency(value)}
            />
            <SteppedMetricChart
              data={chartData}
              valueKey="roas"
              label="ROAS"
              color="#3b82f6"
              resolution={resolution}
              formatter={(value) => value.toFixed(2)}
            />
            <SteppedMetricChart
              data={chartData}
              valueKey="ctr"
              label="CTR %"
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
            <div className="p-8 text-sm text-muted-foreground">No DCO-managed campaigns available in this hourly range.</div>
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
        <CardTitle className="text-lg">DCO Timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">{content}</CardContent>
    </Card>
  );
}
