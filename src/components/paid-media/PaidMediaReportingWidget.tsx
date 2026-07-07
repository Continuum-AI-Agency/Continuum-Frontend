'use client';

import { PieChartIcon, ReloadIcon } from '@radix-ui/react-icons';
import React, { useCallback, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Pill } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import type { PaidMetricsResponse } from '@/lib/schemas/paidMetrics';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  accountId?: string;
  onAccountChange?: (id: string) => void;
  selectedMetric?: PaidPerformanceMetricKey;
  onSelectedMetricChange?: (metric: PaidPerformanceMetricKey) => void;
};

type ViewMode = 'overview' | 'trends';

type Platform = 'meta' | 'google-ads' | 'dv360';

const platforms = [
  { id: 'meta' as Platform, name: 'Meta', active: true },
  { id: 'google-ads' as Platform, name: 'Google Ads', active: true },
  { id: 'dv360' as Platform, name: 'DV360', active: false },
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

type IntegrationAccountCandidate = {
  externalAccountId?: string | null;
  integrationAccountId?: string | null;
  name?: string | null;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading-ad-accounts' }
  | { status: 'loading-campaigns' }
  | { status: 'loading-metrics' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: PaidMetricsResponse };

export type PaidPerformanceMetricKey = keyof PaidMetricsResponse['metrics'];
type MetricKey = PaidPerformanceMetricKey;

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent';
};

const METRIC_LABELS: Record<MetricKey, string> = {
  spend: 'Spend',
  roas: 'ROAS',
  impressions: 'Impressions',
  clicks: 'Clicks',
  ctr: 'CTR',
  cpc: 'CPC',
  cpa: 'CPA',
  // GA4 sessions/conversions merged into the paid trend line by date (brand/
  // property-level, same regardless of the selected campaign — see
  // paid-media-metrics/README.md).
  gaSessions: 'GA Sessions',
  gaConversions: 'GA Conversions',
};

type PaidMetricsTrendRow = PaidMetricsResponse['trends'][number];

// Pure per-day value for the currently expanded metric-card's trend chart.
// Direct metrics (spend, roas, GA4 sessions/conversions) come straight off
// the merged trend row; derived metrics (ctr, cpc) are computed from clicks/
// impressions/spend for that day. Extracted from the chart's useMemo so it is
// independently testable without mounting recharts.
export function deriveMetricTrendValue(
  day: PaidMetricsTrendRow,
  key: PaidPerformanceMetricKey,
): number {
  if (key === 'spend') return day.spend;
  if (key === 'roas') return day.roas;
  if (key === 'impressions') return day.impressions || 0;
  if (key === 'clicks') return day.clicks || 0;
  if (key === 'ctr')
    return day.clicks && day.impressions ? (day.clicks / day.impressions) * 100 : 0;
  if (key === 'cpc') return day.clicks && day.spend ? day.spend / day.clicks : 0;
  // GA4 metrics: already a daily value merged in by date, no derivation.
  if (key === 'gaSessions') return day.gaSessions || 0;
  if (key === 'gaConversions') return day.gaConversions || 0;
  return 0;
}

function formatValue(value: number, type: 'currency' | 'number' | 'percent') {
  if (type === 'currency')
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  if (type === 'percent') return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value?: number) {
  if (value === undefined) return null;
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? '+' : '-'}${rounded}%`;
}

function PaidTrendsPanel({ data }: { data: PaidMetricsResponse }) {
  const { trends, range } = data;

  const chartConfig = {
    spend: { label: 'Spend', color: 'var(--color-primary)' },
    roas: { label: 'ROAS', color: 'var(--color-secondary)' },
  } satisfies ChartConfig;

  const trendChartConfig = {
    ...chartConfig,
    spend: { ...chartConfig.spend, color: 'var(--chart-1)' },
    roas: { ...chartConfig.roas, color: 'var(--chart-2)' },
  };

  return (
    <div className="pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold">Daily Performance Trends</h4>
          <span className="text-sm text-muted-foreground">
            {range.since} → {range.until}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-subtle bg-surface">
          <div className="p-3">
            <p className="mb-2 text-sm text-muted-foreground">Daily Spend</p>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                        })
                      }
                    />
                  }
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
          </div>
        </div>

        <div className="rounded-lg border border-subtle bg-surface">
          <div className="p-3">
            <p className="mb-2 text-sm text-muted-foreground">Return on Ad Spend (ROAS)</p>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                        })
                      }
                    />
                  }
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
          </div>
        </div>
      </div>
    </div>
  );
}

function PaidReportingLoadingSkeleton({
  viewMode,
  message,
}: {
  viewMode: ViewMode;
  message: string;
}) {
  if (viewMode === 'trends') {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-subtle bg-surface">
            <div className="p-3">
              <Skeleton className="mb-3 h-4 w-40" />
              <Skeleton className="h-[200px] w-full" />
            </div>
          </div>
          <div className="rounded-lg border border-subtle bg-surface">
            <div className="p-3">
              <Skeleton className="mb-3 h-4 w-44" />
              <Skeleton className="h-[200px] w-full" />
            </div>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`paid-metric-skeleton-${index}`}
            className="rounded-lg border border-subtle bg-surface"
          >
            <div className="p-3">
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="mb-2 h-6 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-subtle bg-surface">
        <div className="p-3">
          <Skeleton className="mb-3 h-4 w-52" />
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function PaidMediaReportingWidget({
  brandId,
  accountId,
  onAccountChange,
  selectedMetric,
  onSelectedMetricChange,
}: Props) {
  const [platform, setPlatform] = useState<Platform>('meta');
  const [viewMode, setViewMode] = React.useState<ViewMode>('overview');
  const [state, setState] = React.useState<LoadState>({ status: 'idle' });
  const [internalExpandedMetric, setInternalExpandedMetric] = React.useState<MetricKey>('spend');

  // Ad account and campaign selection state
  const [selectedAdAccount, setSelectedAdAccount] = useState<string | null>(accountId || null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Fetch ad accounts using the stable brand-integrations method
  const { integrations, isLoading: isLoadingAccounts } = useBrandIntegrations(brandId);

  const adAccounts = React.useMemo(() => {
    if (!integrations) return [];

    let platformAccounts: IntegrationAccountCandidate[] = [];
    if (platform === 'meta') {
      platformAccounts = integrations.facebook?.accounts ?? [];
    } else if (platform === 'google-ads') {
      platformAccounts = integrations.googleAds?.accounts ?? [];
    } else if (platform === 'dv360') {
      platformAccounts = integrations.dv360?.accounts ?? [];
    }

    return platformAccounts
      .map((acc) => ({
        id: acc.externalAccountId ?? acc.integrationAccountId ?? '',
        name: acc.name ?? 'Unnamed account',
      }))
      .filter((acc) => acc.id.length > 0);
  }, [integrations, platform]);

  // Auto-select first account if none selected
  React.useEffect(() => {
    if (!selectedAdAccount && adAccounts.length > 0) {
      setSelectedAdAccount(adAccounts[0].id);
      onAccountChange?.(adAccounts[0].id);
    }
  }, [selectedAdAccount, adAccounts, onAccountChange]);

  // Fetch campaigns for selected ad account
  const fetchCampaigns = useCallback(
    async (adAccountId: string) => {
      setState({ status: 'loading-campaigns' });
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error('No authentication token available');
        }

        const url = `/api/campaigns?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(adAccountId)}&platform=${platform}`;
        console.log('Fetching campaigns from:', url);

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Campaigns API error:', response.status, response.statusText, errorText);

          // Try to parse JSON error response
          let parsedError = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            // Not JSON, use raw text
          }

          // Handle different error scenarios
          if (response.status === 404) {
            throw new Error(
              'Campaigns not found. This ad account may not have active campaigns or the account configuration may be incorrect.',
            );
          } else if (response.status === 500 && parsedError?.error) {
            // Extract nested error message from edge function
            const nestedError = parsedError.error;
            if (nestedError.includes('404')) {
              throw new Error(
                'Unable to retrieve campaign data. The ad account may not be properly connected or campaigns may not exist.',
              );
            } else {
              throw new Error(
                'Server error occurred while fetching campaigns. Please try again later.',
              );
            }
          } else if (response.status === 401 || response.status === 403) {
            throw new Error(
              parsedError?.error ??
                'Authentication failed. Please reconfigure your ad account connection.',
            );
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
        console.error('Error fetching campaigns:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load campaigns';

        // Check if it's an access token issue
        if (
          errorMessage.toLowerCase().includes('account not configured') ||
          errorMessage.toLowerCase().includes('access token missing')
        ) {
          const platformName = platforms.find((p) => p.id === platform)?.name || 'selected';
          setState({
            status: 'error',
            message: `This ${platformName} account needs to be reconnected. Please contact support or reconfigure your integration.`,
          });
        } else {
          setState({ status: 'error', message: errorMessage });
        }
      }
    },
    [brandId, platform, selectedCampaign],
  );

  // Fetch metrics for selected campaign
  const fetchMetrics = useCallback(
    async (campaignId: string) => {
      if (!selectedAdAccount) return;

      setState({ status: 'loading-metrics' });
      try {
        const response = await fetch('/api/paid-metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            platform,
            accountId: selectedAdAccount,
            campaignId,
            range: { preset: 'last_7d' },
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }

        const data = await response.json();
        setState({ status: 'success', data });
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load metrics',
        });
      }
    },
    [brandId, platform, selectedAdAccount],
  );

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

  const handleRefresh = useCallback(() => {
    if (selectedCampaign) {
      fetchMetrics(selectedCampaign);
    } else if (selectedAdAccount) {
      fetchCampaigns(selectedAdAccount);
    }
  }, [selectedCampaign, selectedAdAccount, fetchMetrics, fetchCampaigns]);

  const expandedMetric = selectedMetric ?? internalExpandedMetric;
  const handleMetricSelect = React.useCallback(
    (metric: MetricKey) => {
      if (selectedMetric === undefined) {
        setInternalExpandedMetric(metric);
      }
      onSelectedMetricChange?.(metric);
    },
    [onSelectedMetricChange, selectedMetric],
  );

  return (
    <div
      data-tour-id="dashboard-paid-metrics"
      className="flex h-full flex-col rounded-lg border border-subtle bg-surface"
    >
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex shrink-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Pill variant="teal">
                <PieChartIcon />
              </Pill>
              <div>
                <span className="font-medium">Paid Media Performance</span>
                <span className="block text-sm text-muted-foreground">
                  {selectedCampaign ? 'Campaign view' : 'Select campaign'} · {viewMode}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((platformOption) => (
                    <SelectItem
                      key={platformOption.id}
                      value={platformOption.id}
                      disabled={!platformOption.active}
                    >
                      {platformOption.name}
                      {!platformOption.active && ' (Coming Soon)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="trends">Trends</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={
                  state.status.startsWith('loading') || (!selectedAdAccount && !selectedCampaign)
                }
                title="Refresh data"
              >
                <ReloadIcon className={state.status.startsWith('loading') ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedAdAccount || ''}
              onValueChange={(id) => {
                setSelectedAdAccount(id);
                onAccountChange?.(id);
              }}
              disabled={adAccounts.length === 0}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue
                  placeholder={
                    adAccounts.length === 0 ? 'No Ad Accounts Available' : 'Select Ad Account'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {adAccounts.length === 0 ? (
                  <SelectItem value="no-accounts" disabled>
                    No ad accounts available
                  </SelectItem>
                ) : (
                  adAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Select
              value={selectedCampaign || ''}
              onValueChange={setSelectedCampaign}
              disabled={campaigns.length === 0}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue
                  placeholder={
                    campaigns.length === 0 ? 'No Campaigns Available' : 'Select Campaign'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {campaigns.length === 0 ? (
                  <SelectItem value="no-campaigns" disabled>
                    No campaigns available
                  </SelectItem>
                ) : (
                  campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          {state.status === 'error' ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : isLoadingAccounts ||
            state.status === 'loading-campaigns' ||
            state.status === 'loading-metrics' ? (
            <PaidReportingLoadingSkeleton
              viewMode={viewMode}
              message={
                isLoadingAccounts
                  ? 'Loading ad accounts...'
                  : state.status === 'loading-campaigns'
                    ? 'Loading campaigns...'
                    : 'Loading metrics...'
              }
            />
          ) : adAccounts.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
              <p className="text-center text-base text-muted-foreground">
                No Ad Accounts Available
              </p>
              <p className="text-center text-sm text-muted-foreground">
                Connect an ad account to load paid metrics.
              </p>
            </div>
          ) : !selectedCampaign ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
              <p className="text-center text-base text-muted-foreground">
                {selectedAdAccount && campaigns.length === 0
                  ? 'No Campaigns Available'
                  : 'Select a Campaign'}
              </p>
              <p className="text-center text-sm text-muted-foreground">
                {selectedAdAccount && campaigns.length === 0
                  ? 'No active campaigns in this account.'
                  : 'Pick a campaign to load metrics.'}
              </p>
            </div>
          ) : state.status === 'success' ? (
            viewMode === 'overview' ? (
              <MetricsPanel
                data={state.data}
                expandedMetric={expandedMetric}
                onMetricSelect={handleMetricSelect}
              />
            ) : (
              <PaidTrendsPanel data={state.data} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Exported (rather than kept file-local) so it is independently testable —
// the surrounding PaidMediaReportingWidget also owns ad-account/campaign
// selection and Supabase-backed fetching, which would make a MetricsPanel
// test disproportionately heavy for what it renders.
export function MetricsPanel({
  data,
  expandedMetric,
  onMetricSelect,
}: {
  data: PaidMetricsResponse;
  expandedMetric: MetricKey;
  onMetricSelect: (key: MetricKey) => void;
}) {
  const { metrics, comparison, range, trends } = data;

  const metricCards: MetricCard[] = [
    { key: 'spend', label: 'Spend', value: metrics.spend, format: 'currency' },
    { key: 'roas', label: 'ROAS', value: metrics.roas, format: 'number' },
    { key: 'ctr', label: 'CTR', value: metrics.ctr, format: 'percent' },
    { key: 'cpc', label: 'CPC', value: metrics.cpc, format: 'currency' },
    { key: 'impressions', label: 'Impressions', value: metrics.impressions, format: 'number' },
    { key: 'clicks', label: 'Clicks', value: metrics.clicks, format: 'number' },
    { key: 'gaSessions', label: 'GA Sessions', value: metrics.gaSessions, format: 'number' },
    {
      key: 'gaConversions',
      label: 'GA Conversions',
      value: metrics.gaConversions,
      format: 'number',
    },
  ];

  const expandedKey = expandedMetric;
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : '';

  // Calculate trend data for the selected metric
  const chartData = React.useMemo(() => {
    if (!trends) return [];
    return trends.map((day) => ({
      date: day.date,
      value: deriveMetricTrendValue(day, expandedKey),
    }));
  }, [trends, expandedKey]);

  const metricColorMap: Record<string, string> = {
    spend: 'var(--chart-1)',
    roas: 'var(--chart-2)',
    impressions: 'var(--chart-3)',
    clicks: 'var(--chart-4)',
    ctr: 'var(--chart-5)',
    cpc: 'var(--chart-1)',
    gaSessions: 'var(--chart-2)',
    gaConversions: 'var(--chart-3)',
  };

  const activeColor = metricColorMap[expandedKey as string] || 'var(--color-primary)';

  const mainChartConfig = {
    value: { label: expandedLabel, color: activeColor },
  } satisfies ChartConfig;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="w-full shrink-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {metricCards.map((item) => {
            const delta = comparison?.[item.key]?.percentageChange;
            const formattedDelta = formatPercent(delta);
            const isActive = expandedKey === item.key;
            const deltaToneClass =
              delta === undefined
                ? 'text-muted-foreground'
                : delta > 0
                  ? 'text-success'
                  : delta < 0
                    ? 'text-destructive'
                    : 'text-muted-foreground';

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onMetricSelect(item.key)}
                className="text-left w-full h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-pressed={isActive}
              >
                <div
                  className={cn(
                    'flex min-h-[64px] flex-col items-center justify-center overflow-hidden rounded-lg border border-subtle bg-surface transition-[background-color,box-shadow] hover:bg-accent/5 cursor-pointer',
                    isActive && 'ring-1 ring-primary bg-accent/10',
                  )}
                >
                  <div className="w-full p-2">
                    <div className="flex w-full flex-col items-center justify-center gap-0 text-center">
                      <span
                        className="w-full truncate font-medium leading-none text-muted-foreground"
                        style={{ fontSize: '0.66rem' }}
                      >
                        {item.label}
                      </span>
                      <div
                        className="w-full truncate font-semibold leading-tight tabular-nums"
                        style={{ fontSize: '0.8rem' }}
                      >
                        {formatValue(item.value, item.format)}
                      </div>
                      {formattedDelta ? (
                        <span
                          className={cn('font-semibold leading-none tabular-nums', deltaToneClass)}
                          style={{ fontSize: '0.66rem' }}
                        >
                          {formattedDelta}
                        </span>
                      ) : (
                        <div className="h-2" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 h-full min-h-[200px] w-full">
        <div className="flex h-full flex-col rounded-lg border border-subtle bg-surface">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{expandedLabel} Trend</h3>
                <span className="text-xs text-muted-foreground">
                  {range.since} → {range.until}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ChartContainer config={mainChartConfig} className="h-[250px] w-full aspect-auto">
                <LineChart data={chartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                    minTickGap={30}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    width={40}
                    tickFormatter={(value) => {
                      if (typeof value !== 'number') return String(value);
                      if (expandedKey === 'ctr' || expandedKey === 'roas') return value.toFixed(1);
                      if (expandedKey === 'spend' || expandedKey === 'cpc') {
                        return `$${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`;
                      }
                      return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(value);
                    }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) =>
                          new Date(label).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                          })
                        }
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={activeColor}
                    strokeWidth={2}
                    dot={{ r: 4, fill: activeColor }}
                    activeDot={{ r: 6 }}
                    animationDuration={500}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
