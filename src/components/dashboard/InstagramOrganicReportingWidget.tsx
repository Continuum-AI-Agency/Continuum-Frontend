'use client';

import type { IntegrationErrorCode } from '@continuum/contracts';
import { Flag } from 'lucide-react';
import React from 'react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { Pill } from '@/components/kibo-ui/pill';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import { OrganicMetricsWidgetSkeleton } from '@/components/organic/MetricsSkeleton';
import {
  buildPostActivityDays,
  renderPostActivityReferenceLines,
} from '@/components/organic/PostActivityMarkers';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { IntegrationErrorBanner } from '@/components/ui/IntegrationErrorBanner';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import { useAccountSelectionStore } from '@/lib/integrations/accountSelectionStore';
import type {
  MetricComparison,
  OrganicDateRangePreset,
  OrganicMetricsResponse,
  OrganicPlatform,
  OrganicPost,
  OrganicTrendPoint,
} from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';

export type InstagramAccountOption = {
  integrationAccountId: string;
  name: string;
  externalAccountId: string | null;
};

type Props = {
  brandId: string;
  accounts: InstagramAccountOption[];
  youtubeAccounts?: InstagramAccountOption[];
  initialPlatform?: OrganicPlatform;
  className?: string;
};

// Platforms this widget can fetch real organic metrics for; others show a placeholder.
const SUPPORTED_WIDGET_PLATFORMS: ReadonlySet<OrganicPlatform> = new Set(['instagram', 'youtube']);

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; errorCode?: IntegrationErrorCode; retryAfter?: number }
  | { status: 'success'; data: OrganicMetricsResponse };

const DEFAULT_RANGE_PRESET: OrganicDateRangePreset = 'last_7d';

type MetricKey = keyof OrganicMetricsResponse['metrics'];

type MetricCard = {
  key: MetricKey;
  label: string;
  value: number;
};

const METRIC_LABELS: Record<string, string> = {
  reach: 'Reach',
  views: 'Views',
  newFollowers: 'New followers',
  accountsEngaged: 'Accounts engaged',
  reelsViews: 'Reels views',
  postViews: 'Post views',
  storiesViews: 'Stories views',
  profileVisitsYesterday: 'Profile visits',
  nonFollowerReach: 'Non-follower reach',
  followerReach: 'Follower reach',
  likes: 'Likes',
  comments: 'Comments',
  replies: 'Replies',
  shares: 'Shares',
  saved: 'Saved',
  totalInteractions: 'Total interactions',
  subscribers: 'Subscribers',
  impressions: 'Impressions',
};

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function rangeLabel(preset: OrganicDateRangePreset) {
  return preset.replaceAll('_', ' ');
}

function formatPercent(value?: number) {
  if (value === undefined) return null;
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? '+' : '-'}${rounded}%`;
}

// Maps the response's real per-day trend points to a single-series dataset for
// the selected KPI, so the chart tooltip shows the actual value on each date.
// Returns null when the response carries no daily series for that metric
// (OrganicTrendPoint only covers a subset of metric keys).
function buildDailySeries(
  trends: OrganicTrendPoint[] | undefined,
  metricKey: MetricKey,
): Array<{ date: string; value: number }> | null {
  if (!trends || trends.length === 0) return null;
  const series = trends
    .map((point) => {
      const value = (point as Record<string, unknown>)[metricKey];
      return typeof value === 'number' ? { date: point.date, value } : null;
    })
    .filter((entry): entry is { date: string; value: number } => entry !== null);
  return series.length > 0 ? series : null;
}

function InteractionBreakdownCharts({
  breakdowns,
}: {
  breakdowns: Record<string, Record<string, number>>;
}) {
  const interactionMetrics = ['likes', 'comments', 'shares', 'saved'];

  return (
    <div className="pt-4">
      <h3 className="mb-3 text-lg font-semibold">Interaction Breakdown by Content Type</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {interactionMetrics.map((metric) => {
          const metricData = breakdowns[metric];
          if (!metricData || Object.keys(metricData).length === 0) return null;

          const chartData = Object.entries(metricData).map(([type, value]) => ({
            name: type,
            value,
            fill: getColorForType(type),
          }));

          return (
            <div className="rounded-lg border border-subtle bg-surface" key={metric}>
              <div className="p-3">
                <span className="mb-2 block text-sm text-muted-foreground">
                  {METRIC_LABELS[metric]}
                </span>
                <ChartContainer config={{}} className="aspect-square h-[120px] w-full">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={50}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getColorForType(type: string): string {
  switch (type.toUpperCase()) {
    case 'REEL':
      return 'var(--color-primary)';
    case 'POST':
      return 'var(--color-secondary)';
    case 'STORY':
      return 'var(--color-accent)';
    default:
      return 'var(--color-muted)';
  }
}

export function InstagramOrganicReportingWidget({
  brandId,
  accounts,
  youtubeAccounts = [],
  initialPlatform = 'instagram',
  className,
}: Props) {
  const [platform, setPlatform] = React.useState<OrganicPlatform>(initialPlatform);
  const { getSelection, setSelection } = useAccountSelectionStore();
  const platformAccounts = platform === 'youtube' ? youtubeAccounts : accounts;
  const isSupportedPlatform = SUPPORTED_WIDGET_PLATFORMS.has(platform);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(() => {
    const stored = useAccountSelectionStore.getState().getSelection(brandId, initialPlatform);
    const isValid = stored !== null && accounts.some((a) => a.integrationAccountId === stored);
    return isValid ? stored : (accounts[0]?.integrationAccountId ?? null);
  });
  const [state, setState] = React.useState<LoadState>({ status: 'idle' });
  const [expandedMetric, setExpandedMetric] = React.useState<MetricKey | null>(null);
  const [posts, setPosts] = React.useState<OrganicPost[]>([]);
  const [showFlags, setShowFlags] = React.useState(true);

  // Re-resolve the selected account when the brand or platform changes (each
  // platform keeps its own remembered selection and its own account list).
  React.useEffect(() => {
    const stored = getSelection(brandId, platform);
    const isValid =
      stored !== null && platformAccounts.some((a) => a.integrationAccountId === stored);
    setSelectedAccountId(isValid ? stored : (platformAccounts[0]?.integrationAccountId ?? null));
    setState({ status: 'idle' });
    setExpandedMetric(null);
    setPosts([]);
  }, [brandId, platform, platformAccounts, getSelection]);

  React.useEffect(() => {
    if (selectedAccountId === null || !isSupportedPlatform) {
      if (!isSupportedPlatform) {
        setState({ status: 'idle' });
      }
      return;
    }
    const accountId = selectedAccountId;
    let cancelled = false;

    async function run() {
      setState({ status: 'loading' });
      try {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId: accountId,
          platform: platform as 'instagram' | 'youtube',
          range: { preset: DEFAULT_RANGE_PRESET },
          scope: 'kpis',
        });
        if (cancelled) return;
        setState({ status: 'success', data });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : `Unable to load ${platform} organic metrics.`;
        const errorCode = (error as { errorCode?: IntegrationErrorCode }).errorCode;
        const retryAfter = (error as { retryAfter?: number }).retryAfter;
        setState({ status: 'error', message, errorCode, retryAfter });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId, platform]);

  // Post-activity markers: fetched in parallel and off the critical path so the
  // KPI/trend chart renders immediately and markers fill in a moment later.
  // Instagram-only for now; failures are silent (markers just don't appear).
  React.useEffect(() => {
    if (selectedAccountId === null || platform !== 'instagram') {
      setPosts([]);
      return;
    }
    const accountId = selectedAccountId;
    let cancelled = false;

    async function loadPosts() {
      try {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId: accountId,
          platform: 'instagram',
          range: { preset: DEFAULT_RANGE_PRESET },
          scope: 'posts',
          postsLimit: 25,
        });
        if (cancelled) return;
        setPosts(data.posts ?? []);
      } catch {
        if (cancelled) return;
        setPosts([]);
      }
    }

    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, [brandId, selectedAccountId, platform]);

  return (
    <div
      data-tour-id="dashboard-organic-metrics"
      className={cn(
        'flex flex-col gap-0 overflow-hidden rounded-lg border border-subtle bg-surface py-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 bg-muted/20 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select value={platform} onValueChange={(val) => setPlatform(val as OrganicPlatform)}>
            <SelectTrigger className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0">
              <Pill variant="muted">
                <PlatformIcon platform={platform === 'x' ? 'threads' : platform} />
              </Pill>
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="instagram">
                <span className="flex items-center gap-2">
                  <PlatformIcon platform="instagram" />
                  <span>Instagram</span>
                </span>
              </SelectItem>
              <SelectItem value="youtube">
                <span className="flex items-center gap-2">
                  <PlatformIcon platform="youtube" />
                  <span>YouTube</span>
                </span>
              </SelectItem>
              <SelectItem value="x" disabled>
                <span className="flex items-center gap-2">
                  <PlatformIcon platform="threads" />
                  <span>X</span>
                </span>
              </SelectItem>
              <SelectItem value="tiktok" disabled>
                <span className="flex items-center gap-2">
                  <PlatformIcon platform="tiktok" />
                  <span>TikTok</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <h3 className="truncate text-xs font-semibold capitalize sm:text-sm">
            {platform} reporting
          </h3>
          <span className="hidden whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground sm:inline-block">
            {rangeLabel(DEFAULT_RANGE_PRESET)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {platform === 'instagram' && posts.length > 0 ? (
            <label
              htmlFor="ig-reporting-post-flags"
              className="flex cursor-pointer select-none items-center gap-1 rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-2xs text-muted-foreground"
            >
              <Flag size={11} className="text-primary" />
              <span className="hidden sm:inline">Posts</span>
              <Switch
                id="ig-reporting-post-flags"
                checked={showFlags}
                onCheckedChange={setShowFlags}
                aria-label="Toggle post activity markers"
              />
            </label>
          ) : null}
          <div data-tour-id="dashboard-account-selector" className="inline-flex">
            <Select
              value={selectedAccountId ?? ''}
              onValueChange={(value) => {
                setSelectedAccountId(value);
                setSelection(brandId, platform, value);
              }}
            >
              <SelectTrigger size="sm" className="h-7 text-xs">
                <SelectValue placeholder={`Select ${platform} account`} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectLabel>{platform} accounts</SelectLabel>
                  {platformAccounts.map((account) => (
                    <SelectItem
                      key={account.integrationAccountId}
                      value={account.integrationAccountId}
                    >
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-col p-2">
        <div className="min-h-0 pt-0">
          {!isSupportedPlatform ? (
            <div className="py-8">
              <div className="flex flex-col items-center justify-center gap-3">
                <PlatformIcon
                  platform={platform === 'x' ? 'threads' : platform}
                  size={48}
                  className="opacity-20"
                />
                <h3 className="text-lg font-semibold text-muted-foreground">
                  {platform} Support Coming Soon
                </h3>
                <span className="block max-w-[300px] text-center text-sm text-muted-foreground">
                  We&apos;re currently working on integrating {platform} organic metrics into your
                  dashboard.
                </span>
              </div>
            </div>
          ) : platformAccounts.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No {platform} accounts are linked to this brand profile.
            </span>
          ) : state.status === 'error' ? (
            <IntegrationErrorBanner
              errorCode={state.errorCode}
              message={state.message}
              platform={platform}
              retryAfter={state.retryAfter}
            />
          ) : state.status === 'loading' ? (
            <OrganicMetricsWidgetSkeleton />
          ) : state.status === 'success' ? (
            <MetricsPanel
              data={state.data}
              posts={posts}
              showFlags={showFlags}
              expandedMetric={expandedMetric}
              onMetricSelect={setExpandedMetric}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              Select a {platform} account to view organic reporting.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact, data-backed bars showing the metric's recent daily series. Reserves
// its height even when the series is unavailable so cards stay aligned.
function MiniBars({ values, active }: { values: number[]; active?: boolean }) {
  if (values.length === 0) return <div className="h-5" aria-hidden="true" />;
  const max = Math.max(...values, 1);

  return (
    <div className="flex h-5 items-end gap-px" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            'min-w-[2px] flex-1 rounded-[1px]',
            active
              ? 'bg-[var(--primary)]'
              : 'bg-[color-mix(in_srgb,var(--muted-foreground)_35%,transparent)]',
          )}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function MetricsPanel({
  data,
  posts,
  showFlags,
  expandedMetric,
  onMetricSelect,
}: {
  data: OrganicMetricsResponse;
  posts: OrganicPost[];
  showFlags: boolean;
  expandedMetric: MetricKey | null;
  onMetricSelect: (key: MetricKey | null) => void;
}) {
  const { metrics, comparison: rawComparison, range, interactionBreakdowns: rawBreakdowns } = data;
  const comparison = rawComparison as Record<string, MetricComparison> | null | undefined;
  const interactionBreakdowns = rawBreakdowns as Record<string, Record<string, number>> | undefined;

  const metricCards: MetricCard[] = [];

  if (metrics.views !== undefined)
    metricCards.push({ key: 'views', label: METRIC_LABELS.views, value: metrics.views });
  if (metrics.reach !== undefined)
    metricCards.push({ key: 'reach', label: METRIC_LABELS.reach, value: metrics.reach });
  if (metrics.newFollowers !== undefined)
    metricCards.push({
      key: 'newFollowers',
      label: METRIC_LABELS.newFollowers,
      value: metrics.newFollowers,
    });
  if (metrics.accountsEngaged !== undefined)
    metricCards.push({
      key: 'accountsEngaged',
      label: METRIC_LABELS.accountsEngaged,
      value: metrics.accountsEngaged,
    });
  if (metrics.reelsViews !== undefined)
    metricCards.push({
      key: 'reelsViews',
      label: METRIC_LABELS.reelsViews,
      value: metrics.reelsViews,
    });
  if (metrics.postViews !== undefined)
    metricCards.push({
      key: 'postViews',
      label: METRIC_LABELS.postViews,
      value: metrics.postViews,
    });

  const expandedKey = expandedMetric ?? 'views';
  const expandedLabel = expandedKey ? METRIC_LABELS[expandedKey] : '';

  const chartData = React.useMemo(
    () => buildDailySeries(data.trends, expandedKey),
    [data.trends, expandedKey],
  );

  const axisDates = React.useMemo(
    () => new Set((chartData ?? []).map((point) => point.date)),
    [chartData],
  );

  const activityDays = React.useMemo(
    () => (showFlags ? buildPostActivityDays(data.trends, posts, axisDates) : []),
    [showFlags, data.trends, posts, axisDates],
  );

  const chartConfig = {
    value: {
      label: expandedLabel,
      color: 'var(--color-primary)',
    },
  } satisfies ChartConfig;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="grid min-h-0 grid-cols-1 gap-2">
        <div className="w-full">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {metricCards.map((item) => {
              const delta = comparison?.[item.key]?.percentageChange;
              const formattedDelta = formatPercent(delta ?? undefined);
              const isActive = expandedKey === item.key;
              const deltaClass =
                delta === undefined || delta === 0
                  ? 'text-muted-foreground'
                  : delta > 0
                    ? 'text-emerald-500'
                    : 'text-red-500';
              const seriesValues = (buildDailySeries(data.trends, item.key) ?? []).map(
                (point) => point.value,
              );

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onMetricSelect(item.key)}
                  aria-pressed={isActive}
                  className={cn(
                    'group/kpi flex h-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                    isActive
                      ? 'border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]'
                      : 'border-border/70 bg-card',
                  )}
                >
                  <span className="truncate font-mono text-2xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
                      {formatCompact(item.value)}
                    </span>
                    {formattedDelta ? (
                      <span className={cn('font-mono text-2xs tabular-nums', deltaClass)}>
                        {formattedDelta}
                      </span>
                    ) : null}
                  </div>
                  <MiniBars values={seriesValues} active={isActive} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-[280px] w-full">
          <div className="flex flex-col rounded-lg border border-subtle bg-surface">
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">{expandedLabel} Trend</h3>
                  <span className="text-xs text-muted-foreground">
                    {range.since} → {range.until} ({rangeLabel(range.preset)})
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {chartData ? (
                  <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
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
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: 'var(--color-primary)' }}
                        activeDot={{ r: 6 }}
                        animationDuration={500}
                      />
                      {renderPostActivityReferenceLines(activityDays)}
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-[250px] items-center justify-center">
                    <span className="text-center text-sm text-muted-foreground">
                      Daily breakdown unavailable for {expandedLabel}.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {interactionBreakdowns && <InteractionBreakdownCharts breakdowns={interactionBreakdowns} />}
    </div>
  );
}
