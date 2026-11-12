'use client';

import { PieChart, RotateCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import React, { useCallback, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Pill } from '@/components/kibo-ui/pill';
import { paidDeltaIsGood } from '@/components/paid-media/metricDelta';
import { figureProps, formatCurrency } from '@/components/paid-media/optimizer/format';
import { NO_SINGLE_RESULT } from '@/components/paid-media/optimizer/sections/platforms/googleAdsOverviewModel';
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
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';
import type { PaidMetricsResponse } from '@/lib/schemas/paidMetrics';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  accountId?: string;
  /** The account record's currency (what the Optimizer knows); the payload's own label wins.
   *  Unknown prints a bare figure, never `$` (PP-L3-home-paid-prints-dollar-signs-no-currency). */
  accountCurrency?: string | null;
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

function formatValue(
  value: number,
  type: 'currency' | 'number' | 'percent',
  currency: string | null,
  locale: UiLocale = 'en',
) {
  if (type === 'currency') return formatCurrency(value, currency, locale);
  if (type === 'percent') return `${formatDecimal(value, 2, locale)}%`;
  return new Intl.NumberFormat(locale).format(value);
}

/** Whole-number metrics print as counts and are stamped as such; ROAS is a 'number' card that
 *  prints to two decimals and is left unstamped, the way CTR is. */
const COUNT_METRICS: ReadonlySet<MetricKey> = new Set([
  'impressions',
  'clicks',
  'gaSessions',
  'gaConversions',
]);

/** A short axis tick: `$1.2k` only when the money is USD; a bare `1.2k` otherwise — never a
 *  `$` the account did not earn. */
function axisMoney(value: number, currency: string | null, locale: UiLocale = 'en'): string {
  const body = value >= 1000 ? `${formatDecimal(value / 1000, 1, locale)}k` : String(value);
  return currency === 'USD' ? `$${body}` : body;
}

function formatPercent(value?: number, locale: UiLocale = 'en') {
  if (value === undefined) return null;
  const rounded = formatDecimal(Math.abs(value), 1, locale);
  return `${value >= 0 ? '+' : '-'}${rounded}%`;
}

function PaidTrendsPanel({ data }: { data: PaidMetricsResponse }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const { trends, range } = data;

  const chartConfig = {
    spend: { label: uiText('spend_85f3d55'), color: 'var(--color-primary)' },
    roas: { label: uiText('roas_b81bd97'), color: 'var(--color-secondary)' },
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
          <h4 className="text-lg font-semibold">{uiText('daily_performance_trends_39380ab')}</h4>
          <span className="text-sm text-muted-foreground">
            {range.since} → {range.until}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-subtle bg-surface">
          <div className="p-3">
            <p className="mb-2 text-sm text-muted-foreground">{uiText('daily_spend_36ee25b')}</p>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(uiLocale, { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString(uiLocale, {
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
            <p className="mb-2 text-sm text-muted-foreground">
              {uiText('return_on_ad_spend_roas_7852da1')}
            </p>
            <ChartContainer config={trendChartConfig} className="aspect-auto h-[200px] w-full">
              <LineChart data={trends}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString(uiLocale, { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString(uiLocale, {
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
  accountCurrency = null,
  onAccountChange,
  selectedMetric,
  onSelectedMetricChange,
}: Props) {
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
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
            range: lastCompleteDays(7),
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
          message: formatUiError(error),
        });
      }
    },
    [brandId, platform, selectedAdAccount, formatUiError],
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
                <PieChart />
              </Pill>
              <div>
                <span className="font-medium">{uiText('paid_media_performance_0874e5e')}</span>
                <span className="block text-sm text-muted-foreground">
                  {selectedCampaign
                    ? uiText('campaign_view_120c42d')
                    : uiText('select_campaign_4b24468')}{' '}
                  · {viewMode}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={uiText('select_platform_cd4b40b')} />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((platformOption) => (
                    <SelectItem
                      key={platformOption.id}
                      value={platformOption.id}
                      disabled={!platformOption.active}
                    >
                      {platformOption.name}
                      {!platformOption.active && uiText('coming_soon_7c7f811')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">{uiText('overview_d4b1ea5')}</SelectItem>
                  <SelectItem value="trends">{uiText('trends_e856c6c')}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={
                  state.status.startsWith('loading') || (!selectedAdAccount && !selectedCampaign)
                }
                title={uiText('refresh_data_894c866')}
              >
                <RotateCw className={state.status.startsWith('loading') ? 'animate-spin' : ''} />
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
                    adAccounts.length === 0
                      ? uiText('no_ad_accounts_available_ada98b1')
                      : uiText('select_ad_account_b2a30d1')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {adAccounts.length === 0 ? (
                  <SelectItem value="no-accounts" disabled>
                    {uiText('no_ad_accounts_available_cb25673')}
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
                    campaigns.length === 0
                      ? uiText('no_campaigns_available_d19d029')
                      : uiText('select_campaign_caf1575')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {campaigns.length === 0 ? (
                  <SelectItem value="no-campaigns" disabled>
                    {uiText('no_campaigns_available_8d541d5')}
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
                  ? uiText('loading_ad_accounts_b085a18')
                  : state.status === 'loading-campaigns'
                    ? uiText('loading_campaigns_0c8164a')
                    : uiText('loading_metrics_cdd5e29')
              }
            />
          ) : adAccounts.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
              <p className="text-center text-base text-muted-foreground">
                {uiText('no_ad_accounts_available_ada98b1')}
              </p>
              <p className="text-center text-sm text-muted-foreground">
                {uiText('connect_an_ad_account_to_load_paid_metrics_180373a')}
              </p>
            </div>
          ) : !selectedCampaign ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
              <p className="text-center text-base text-muted-foreground">
                {selectedAdAccount && campaigns.length === 0
                  ? uiText('no_campaigns_available_d19d029')
                  : uiText('select_a_campaign_8065887')}
              </p>
              <p className="text-center text-sm text-muted-foreground">
                {selectedAdAccount && campaigns.length === 0
                  ? uiText('no_active_campaigns_in_this_account_69418ef')
                  : uiText('pick_a_campaign_to_load_metrics_1eb107d')}
              </p>
            </div>
          ) : state.status === 'success' ? (
            viewMode === 'overview' ? (
              <MetricsPanel
                accountCurrency={accountCurrency}
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
  accountCurrency = null,
  expandedMetric,
  onMetricSelect,
}: {
  data: PaidMetricsResponse;
  accountCurrency?: string | null;
  expandedMetric: MetricKey;
  onMetricSelect: (key: MetricKey) => void;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const METRIC_LABELS: Record<MetricKey, string> = useMemo(
    () => ({
      spend: uiText('spend_85f3d55'),
      roas: uiText('roas_b81bd97'),
      impressions: uiText('impressions_c6310e9'),
      clicks: uiText('clicks_921fc98'),
      ctr: uiText('ctr_07fce34'),
      cpc: 'CPC',
      cpa: 'CPA',
      // GA4 sessions/conversions merged into the paid trend line by date (brand/
      // property-level, same regardless of the selected campaign — see
      // paid-media-metrics/README.md).
      gaSessions: uiText('ga_sessions_ec10442'),
      gaConversions: uiText('ga_conversions_fc8bc8f'),
    }),
    [uiText],
  );

  const { metrics, comparison, range, trends } = data;
  // The payload's own currency label first, the account record's second, bare when neither.
  const currency = data.currency ?? accountCurrency ?? null;

  const metricCards: MetricCard[] = [
    { key: 'spend', label: uiText('spend_85f3d55'), value: metrics.spend, format: 'currency' },
    { key: 'roas', label: uiText('roas_b81bd97'), value: metrics.roas, format: 'number' },
    { key: 'ctr', label: uiText('ctr_07fce34'), value: metrics.ctr, format: 'percent' },
    { key: 'cpc', label: 'CPC', value: metrics.cpc, format: 'currency' },
    {
      key: 'impressions',
      label: uiText('impressions_c6310e9'),
      value: metrics.impressions,
      format: 'number',
    },
    { key: 'clicks', label: uiText('clicks_921fc98'), value: metrics.clicks, format: 'number' },
    {
      key: 'gaSessions',
      label: uiText('ga_sessions_ec10442'),
      value: metrics.gaSessions,
      format: 'number',
    },
    {
      key: 'gaConversions',
      label: uiText('ga_conversions_fc8bc8f'),
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
            const formattedDelta = formatPercent(delta, uiLocale);
            const isActive = expandedKey === item.key;
            // Colour by what the move MEANS, not by its sign. CPC is one of these cards and
            // a CPC that fell — the good outcome — used to render destructive-red.
            const deltaToneClass =
              delta === undefined || delta === 0
                ? 'text-muted-foreground'
                : paidDeltaIsGood(item.key, delta)
                  ? 'text-success'
                  : 'text-destructive';

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
                        {...(item.format === 'currency'
                          ? figureProps(`home.widget.${item.key}`, item.value, currency, 'd7')
                          : COUNT_METRICS.has(item.key)
                            ? figureProps(
                                `home.widget.${item.key}`,
                                item.value,
                                null,
                                'd7',
                                'count',
                              )
                            : {})}
                      >
                        {formatValue(item.value, item.format, currency, uiLocale)}
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
          {/* A null CPA is the Google edge saying the account's goals name no single result
              (result_basis.unambiguous false). Say so; never print it as 0. */}
          {metrics.cpa === null ? (
            <div
              data-testid="paid-widget-cpa"
              title={NO_SINGLE_RESULT}
              className="flex min-h-[64px] flex-col items-center justify-center overflow-hidden rounded-lg border border-subtle bg-surface"
            >
              <div className="flex w-full flex-col items-center justify-center gap-0 p-2 text-center">
                <span
                  className="w-full truncate font-medium leading-none text-muted-foreground"
                  style={{ fontSize: '0.66rem' }}
                >
                  CPA
                </span>
                <div
                  className="w-full truncate font-semibold leading-tight tabular-nums"
                  style={{ fontSize: '0.8rem' }}
                >
                  —
                </div>
                <span
                  className="w-full truncate leading-none text-muted-foreground"
                  style={{ fontSize: '0.66rem' }}
                >
                  {NO_SINGLE_RESULT}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 h-full min-h-[200px] w-full">
        <div className="flex h-full flex-col rounded-lg border border-subtle bg-surface">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">
                  {uiText.rich('sentence_55344c4eea78', { v0: expandedLabel })}
                </h3>
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
                      new Date(value).toLocaleDateString(uiLocale, {
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
                        return axisMoney(value, currency, uiLocale);
                      }
                      return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(value);
                    }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) =>
                          new Date(label).toLocaleDateString(uiLocale, {
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
