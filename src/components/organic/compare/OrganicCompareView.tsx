'use client';

// Cross-platform / multi-account Compare mode for organic metrics.
// Same fetchOrganicAnalytics path via loadBrandOrganicSnapshot.
// Series modes: Decompose (per account) | Blend (platform rollups) | Both.

import {
  defaultSelectedMetricIds,
  getOrganicMetric,
  isMetricAvailableOnPlatform,
  ORGANIC_METRIC_CATALOG,
  type OrganicMetricId,
  type OrganicMetricPlatform,
} from '@continuum/contracts';
import { Columns2 } from 'lucide-react';
import * as React from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import {
  formatNumber,
  formatPercentChange,
  formatRate,
  NO_DATA,
} from '@/components/organic/organic-format';
import { trendLineShape } from '@/components/organic/organic-metrics-utils';
import {
  type AccountsByPlatform,
  MetricsScopeSelector,
} from '@/components/organic/selection/MetricsScopeSelector';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  accountSeriesKey,
  assignSeriesColors,
  blendMetric,
  buildSeriesSet,
  groupAccountsByPlatform,
  type SeriesMode,
} from '@/lib/organic/blendAccounts';
import {
  type BrandOrganicSnapshot,
  flattenAccountsByPlatform,
  loadBrandOrganicSnapshot,
  metricDeltaForAccount,
  metricValueForAccount,
  type SnapshotAccountResult,
} from '@/lib/organic/brandOrganicSnapshot';
import type { OrganicDateRangePreset } from '@/lib/schemas/organicMetrics';

const PLATFORM_LABELS: Record<OrganicMetricPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

const PLATFORM_ORDER: OrganicMetricPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
];

// What the toolbar needs to know about Compare's own selection so shared actions
// (export, email) can act on it instead of being hidden in this view.
export type CompareExportSelection = Array<{
  platform: OrganicMetricPlatform;
  integrationAccountId: string;
  name: string;
}>;

export type OrganicCompareViewProps = {
  brandId: string;
  accountsByPlatform: AccountsByPlatform;
  rangePreset: OrganicDateRangePreset;
  reloadTick: number;
  forceRefreshOnTick?: boolean;
  onSelectionChange?: (selection: CompareExportSelection) => void;
};

function formatMetricValue(value: number | undefined, format: 'count' | 'percent'): string {
  if (value === undefined) return NO_DATA;
  if (format === 'percent') return formatRate(value);
  return formatNumber(value);
}

function keyOf(account: { platform: OrganicMetricPlatform; integrationAccountId: string }) {
  return accountSeriesKey(account.platform, account.integrationAccountId);
}

export function OrganicCompareView({
  brandId,
  accountsByPlatform,
  rangePreset,
  reloadTick,
  forceRefreshOnTick = false,
  onSelectionChange,
}: OrganicCompareViewProps) {
  const allAccounts = React.useMemo(
    () => flattenAccountsByPlatform(accountsByPlatform),
    [accountsByPlatform],
  );

  const connectedPlatforms = React.useMemo(
    () => PLATFORM_ORDER.filter((p) => (accountsByPlatform[p]?.length ?? 0) > 0),
    [accountsByPlatform],
  );

  const [selectedPlatforms, setSelectedPlatforms] = React.useState<OrganicMetricPlatform[]>(
    () => connectedPlatforms,
  );
  const [selectedAccountKeys, setSelectedAccountKeys] = React.useState<string[]>(() =>
    allAccounts.map(keyOf),
  );
  const [selectedMetrics, setSelectedMetrics] = React.useState<OrganicMetricId[]>(() =>
    defaultSelectedMetricIds(),
  );
  const [chartMetric, setChartMetric] = React.useState<OrganicMetricId>(
    () => defaultSelectedMetricIds()[0] ?? 'views',
  );
  // Default to the lowest level: per-account decompose. Users opt into Blend /
  // Both. With one account, Blend still shows that account's metrics (identity).
  const [seriesMode, setSeriesMode] = React.useState<SeriesMode>('decompose');
  const [snapshot, setSnapshot] = React.useState<BrandOrganicSnapshot | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const lastForcedTick = React.useRef(0);

  React.useEffect(() => {
    setSelectedPlatforms((current) => {
      const kept = current.filter((p) => connectedPlatforms.includes(p));
      return kept.length > 0 ? kept : connectedPlatforms;
    });
    setSelectedAccountKeys((current) => {
      const valid = new Set(allAccounts.map(keyOf));
      const kept = current.filter((k) => valid.has(k));
      return kept.length > 0 ? kept : allAccounts.map(keyOf);
    });
  }, [allAccounts, connectedPlatforms]);

  React.useEffect(() => {
    if (allAccounts.length === 0) {
      setSnapshot(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const forceRefresh =
      forceRefreshOnTick && reloadTick > 0 && reloadTick !== lastForcedTick.current;
    if (forceRefresh) lastForcedTick.current = reloadTick;

    setStatus('loading');
    setErrorMessage(null);

    void loadBrandOrganicSnapshot({
      brandId,
      accounts: allAccounts,
      rangePreset,
      forceRefresh,
    })
      .then((result) => {
        if (cancelled) return;
        setSnapshot(result);
        setStatus('success');
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load comparison data.');
      });

    return () => {
      cancelled = true;
    };
  }, [allAccounts, brandId, forceRefreshOnTick, rangePreset, reloadTick]);

  const selectedSet = React.useMemo(() => new Set(selectedAccountKeys), [selectedAccountKeys]);

  const visibleAccounts = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.accounts.filter((account) => selectedSet.has(keyOf(account)));
  }, [selectedSet, snapshot]);

  // Reported to the toolbar so shared actions can target Compare's selection.
  // Keyed off the accounts that actually loaded, because that is what an export
  // could read.
  React.useEffect(() => {
    onSelectionChange?.(
      visibleAccounts.map((account) => ({
        platform: account.platform,
        integrationAccountId: account.integrationAccountId,
        name: account.name,
      })),
    );
  }, [onSelectionChange, visibleAccounts]);

  const activeMetrics = React.useMemo(() => {
    return selectedMetrics
      .map((id) => getOrganicMetric(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [selectedMetrics]);

  React.useEffect(() => {
    if (selectedMetrics.includes(chartMetric)) return;
    if (selectedMetrics[0]) setChartMetric(selectedMetrics[0]);
  }, [chartMetric, selectedMetrics]);

  const colorByKey = React.useMemo(() => {
    const keys = allAccounts.map(keyOf);
    return assignSeriesColors(keys);
  }, [allAccounts]);

  const { series: chartSeries, chartRows } = React.useMemo(
    () =>
      buildSeriesSet({
        accounts: visibleAccounts,
        metricId: chartMetric,
        mode: seriesMode,
        colorByKey,
      }),
    [chartMetric, colorByKey, seriesMode, visibleAccounts],
  );

  // Every series on this chart shares one date axis, so the point count is the row
  // count. Two rows would otherwise be splined into a rise-and-fall that no
  // measurement supports.
  const chartLine = trendLineShape(chartRows.length);

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};
    for (const def of chartSeries) {
      config[def.key] = { label: def.label, color: def.color };
    }
    return config;
  }, [chartSeries]);

  const platformBlendRows = React.useMemo(() => {
    const byPlatform = groupAccountsByPlatform(visibleAccounts);
    const rows: Array<{
      platform: OrganicMetricPlatform;
      accounts: SnapshotAccountResult[];
      values: Partial<Record<OrganicMetricId, { value: number; delta?: number }>>;
    }> = [];
    for (const [platform, accounts] of byPlatform) {
      if (accounts.length < 2) continue;
      const values: Partial<Record<OrganicMetricId, { value: number; delta?: number }>> = {};
      for (const metric of activeMetrics) {
        const blended = blendMetric(accounts, metric.id);
        if (blended.kind !== 'sum') continue;
        values[metric.id] = {
          value: blended.total,
          delta: blended.comparison?.percentageChange,
        };
      }
      rows.push({ platform, accounts, values });
    }
    return rows;
  }, [activeMetrics, visibleAccounts]);

  const rollupItems = React.useMemo(() => {
    const items: MetricStripItem[] = [];
    for (const metric of activeMetrics) {
      if (!metric.summable) continue;
      const blended = blendMetric(visibleAccounts, metric.id);
      if (blended.kind !== 'sum') continue;
      items.push({
        label: `Total ${metric.label}`,
        value: formatNumber(blended.total),
        deltaPct: blended.comparison?.percentageChange,
      });
    }
    return items;
  }, [activeMetrics, visibleAccounts]);

  const toggleMetric = (id: OrganicMetricId) => {
    setSelectedMetrics((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  };

  if (allAccounts.length === 0) {
    return (
      <Empty className="min-h-[240px] rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Columns2 />
          </EmptyMedia>
          <EmptyTitle>No organic accounts connected</EmptyTitle>
          <EmptyDescription>
            Connect Instagram, Facebook, TikTok, YouTube, or LinkedIn in Integrations to compare
            metrics across platforms.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <TooltipProvider delay={150}>
      <div className="flex flex-col gap-4" data-tour-id="organic-compare-view">
        <MetricsScopeSelector
          mode="multi"
          accountsByPlatform={accountsByPlatform}
          selectedPlatforms={selectedPlatforms}
          onSelectedPlatformsChange={setSelectedPlatforms}
          selectedAccountKeys={selectedAccountKeys}
          onSelectedAccountKeysChange={setSelectedAccountKeys}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Metrics</span>
          {ORGANIC_METRIC_CATALOG.filter((entry) => entry.defaultSelected).map((entry) => {
            const on = selectedMetrics.includes(entry.id);
            return (
              <Button
                key={entry.id}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs"
                onClick={() => toggleMetric(entry.id)}
              >
                {entry.label}
              </Button>
            );
          })}
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                More metrics
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {ORGANIC_METRIC_CATALOG.map((entry) => {
                  const checked = selectedMetrics.includes(entry.id);
                  const checkboxId = `compare-metric-${entry.id}`;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={() => toggleMetric(entry.id)}
                      />
                      <label
                        htmlFor={checkboxId}
                        className="flex flex-1 cursor-pointer items-center gap-2"
                      >
                        <span className="flex-1">{entry.label}</span>
                        <span className="text-2xs text-muted-foreground">
                          {entry.platforms.length} plat.
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {status === 'loading' && !snapshot ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full max-w-md" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : null}

        {status === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {snapshot && snapshot.missing.length > 0 ? (
          <Alert>
            <AlertDescription className="text-pretty">
              Could not load {snapshot.missing.length} account
              {snapshot.missing.length === 1 ? '' : 's'}:{' '}
              {snapshot.missing
                .map((row) => `${PLATFORM_LABELS[row.platform]} (${row.name})`)
                .join(', ')}
              . Showing accounts with data.
            </AlertDescription>
          </Alert>
        ) : null}

        {visibleAccounts.length > 0 ? (
          <>
            {rollupItems.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground">
                  Combined total across selected accounts
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="What can be combined across accounts"
                          className="inline-flex size-3.5 items-center justify-center rounded-full border border-subtle text-2xs leading-none text-muted-foreground"
                        >
                          ?
                        </button>
                      }
                    />
                    <TooltipContent side="top" className="max-w-[240px]">
                      <p className="text-xs leading-snug">
                        Only metrics that can be added up appear here. Rates and unique-people
                        counts such as reach are left out, because adding them across accounts would
                        count the same person twice.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </span>
                <MetricStrip items={rollupItems} />
              </div>
            ) : null}

            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-base">Trend comparison</CardTitle>
                    <CardDescription>
                      Show one line per account, one combined line per platform, or both. Combined
                      lines are dashed.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Tabs
                      value={seriesMode}
                      onValueChange={(value) => setSeriesMode(value as SeriesMode)}
                      className="w-auto gap-0"
                      data-tour-id="organic-compare-series-mode"
                    >
                      <TabsList className="inline-flex h-8 w-auto rounded-lg border border-subtle bg-muted/20 p-0.5">
                        <TabsTrigger
                          value="decompose"
                          className="px-3 text-xs"
                          data-tour-id="series-mode-decompose"
                        >
                          Per account
                        </TabsTrigger>
                        <TabsTrigger
                          value="blend"
                          className="px-3 text-xs"
                          data-tour-id="series-mode-blend"
                        >
                          Combined
                        </TabsTrigger>
                        <TabsTrigger
                          value="both"
                          className="px-3 text-xs"
                          data-tour-id="series-mode-both"
                        >
                          Both
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="flex flex-wrap justify-end gap-1">
                      {activeMetrics.map((metric) => (
                        <Button
                          key={metric.id}
                          type="button"
                          size="sm"
                          variant={chartMetric === metric.id ? 'default' : 'outline'}
                          className="h-7 px-2 text-xs"
                          onClick={() => setChartMetric(metric.id)}
                        >
                          {metric.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {chartRows.length < 2 || chartSeries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Not enough daily history for{' '}
                    {getOrganicMetric(chartMetric)?.label ?? chartMetric} on the selected accounts
                    {seriesMode !== 'decompose'
                      ? ' (a combined line needs a metric that can be added up)'
                      : ''}
                    .
                  </p>
                ) : (
                  <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
                    <LineChart data={chartRows} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={24}
                        tickFormatter={(value: string) => value.slice(5)}
                      />
                      <YAxis tickLine={false} axisLine={false} width={48} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      {chartSeries.map((def) => (
                        <Line
                          key={def.key}
                          type={chartLine.curve}
                          dataKey={def.key}
                          name={def.label}
                          stroke={def.color}
                          strokeWidth={def.dashed ? 2.5 : 2}
                          strokeDasharray={def.dashed ? '6 4' : undefined}
                          dot={chartLine.showDots ? { r: 3 } : false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Metric matrix</CardTitle>
                <CardDescription>
                  Each account's values, with the change compared with the previous period. A
                  combined row appears for any platform where two or more selected accounts share
                  it.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pt-0" data-tour-id="organic-compare-matrix">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[10rem] pl-4">Account</TableHead>
                      {activeMetrics.map((metric) => (
                        <TableHead key={metric.id} className="text-right">
                          {metric.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAccounts.map((account) => (
                      <TableRow key={keyOf(account)}>
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: colorByKey.get(keyOf(account)) }}
                              aria-hidden
                            />
                            <PlatformIcon platform={account.platform} size={16} />
                            <div className="flex flex-col">
                              <span className="font-medium leading-tight">{account.name}</span>
                              <span className="text-2xs text-muted-foreground">
                                {PLATFORM_LABELS[account.platform]}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        {activeMetrics.map((metric) => {
                          const available = isMetricAvailableOnPlatform(
                            metric.id,
                            account.platform,
                          );
                          const value = metricValueForAccount(account, metric.id);
                          const delta = metricDeltaForAccount(account, metric.id);
                          return (
                            <TableCell key={metric.id} className="text-right tabular-nums">
                              {!available || value === undefined ? (
                                <span className="text-muted-foreground">{NO_DATA}</span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-medium">
                                    {formatMetricValue(value, metric.format)}
                                  </span>
                                  {typeof delta === 'number' ? (
                                    <span className="text-2xs text-muted-foreground">
                                      {formatPercentChange(delta)}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}

                    {platformBlendRows.map((row) => (
                      <TableRow key={`blend-${row.platform}`} className="bg-muted/20">
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={row.platform} size={16} />
                            <div className="flex flex-col">
                              <span className="font-medium leading-tight">
                                {PLATFORM_LABELS[row.platform]} (all · {row.accounts.length})
                              </span>
                              <span className="text-2xs text-muted-foreground">Combined</span>
                            </div>
                          </div>
                        </TableCell>
                        {activeMetrics.map((metric) => {
                          const cell = row.values[metric.id];
                          return (
                            <TableCell key={metric.id} className="text-right tabular-nums">
                              {!cell ? (
                                <span className="text-muted-foreground">{NO_DATA}</span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-medium">
                                    {formatMetricValue(cell.value, metric.format)}
                                  </span>
                                  {typeof cell.delta === 'number' ? (
                                    <span className="text-2xs text-muted-foreground">
                                      {formatPercentChange(cell.delta)}
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : status === 'success' ? (
          <Empty className="min-h-[160px] rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No accounts with data selected</EmptyTitle>
              <EmptyDescription>
                Select at least one account that loaded successfully, or refresh after fixing
                connection errors.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
