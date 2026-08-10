'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
} from 'lucide-react';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  deltaTone,
  formatDeltaPct,
  formatMetric,
  type HeatmapPaint,
  heatmapPaint,
  MATRIX_METRICS,
  paintToStyle,
  percentile,
} from '@/lib/paid-media/heatmap';
import type {
  CampaignPerformanceMetricKey,
  CampaignPerformanceRow,
} from '@/lib/paid-media/performance-types';
import { getItem, setItem } from '@/lib/storage/brandScopedStorage';
import { cn } from '@/lib/utils';

type CampaignMetricHeatmapProps = {
  brandId: string;
  campaigns: CampaignPerformanceRow[];
  selectedMetric: CampaignPerformanceMetricKey;
  selectedCampaignId?: string | null;
  onMetricChange: (metric: CampaignPerformanceMetricKey) => void;
  onCampaignSelect?: (campaignId: string) => void;
};

type Density = 'comfortable' | 'compact';

const DENSITY_STORAGE_KEY = 'pm:heatmap-density';

function readDensity(brandId: string): Density {
  const stored = getItem(DENSITY_STORAGE_KEY, brandId);
  return stored === 'compact' ? 'compact' : 'comfortable';
}

function persistDensity(brandId: string, density: Density) {
  setItem(DENSITY_STORAGE_KEY, brandId, density);
}

function DeltaGlyph({
  tone,
  size = 10,
}: {
  tone: 'positive' | 'negative' | 'flat';
  size?: number;
}) {
  if (tone === 'positive') return <ArrowUpIcon width={size} height={size} aria-hidden />;
  if (tone === 'negative') return <ArrowDownIcon width={size} height={size} aria-hidden />;
  return <MinusIcon width={size} height={size} aria-hidden />;
}

export function CampaignMetricHeatmap({
  brandId,
  campaigns,
  selectedMetric,
  selectedCampaignId,
  onMetricChange,
  onCampaignSelect,
}: CampaignMetricHeatmapProps) {
  const [density, setDensityState] = React.useState<Density>('comfortable');

  React.useEffect(() => {
    setDensityState(readDensity(brandId));
  }, [brandId]);

  const toggleDensity = React.useCallback(() => {
    setDensityState((current) => {
      const next: Density = current === 'comfortable' ? 'compact' : 'comfortable';
      persistDensity(brandId, next);
      return next;
    });
  }, [brandId]);

  const sortedCampaigns = React.useMemo(() => {
    return campaigns
      .filter((campaign) => campaign.metrics)
      .toSorted(
        (left, right) =>
          (right.metrics?.[selectedMetric] ?? 0) - (left.metrics?.[selectedMetric] ?? 0),
      );
  }, [campaigns, selectedMetric]);

  const valuesByMetric = React.useMemo(() => {
    return new Map(
      MATRIX_METRICS.map((metric) => [
        metric.key,
        sortedCampaigns
          .map((campaign) => campaign.metrics?.[metric.key])
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ]),
    );
  }, [sortedCampaigns]);

  if (sortedCampaigns.length === 0) return null;

  const rowHeight = density === 'compact' ? 'h-7' : 'h-10';
  const cellPadding = density === 'compact' ? 'px-2 py-0.5' : 'px-2.5 py-1.5';

  return (
    <TooltipProvider delay={120}>
      <section className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/15 px-3 py-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Heatmap</h3>
            <p className="text-xs text-muted-foreground">
              Campaigns ranked by{' '}
              <span className="font-medium text-foreground">
                {MATRIX_METRICS.find((m) => m.key === selectedMetric)?.label ?? selectedMetric}
              </span>
              . Cell color encodes percentile across the visible set.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleDensity}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Switch to ${density === 'comfortable' ? 'compact' : 'comfortable'} density`}
          >
            {density === 'comfortable' ? (
              <ChevronUpIcon className="h-3 w-3" />
            ) : (
              <ChevronDownIcon className="h-3 w-3" />
            )}
            <span className="font-mono uppercase tracking-[0.08em]">
              {density === 'comfortable' ? 'Comfy' : 'Compact'}
            </span>
          </button>
        </header>

        <div className="overflow-x-auto">
          <div
            className="grid min-w-full"
            style={{
              gridTemplateColumns: `minmax(200px, 1.4fr) repeat(${MATRIX_METRICS.length}, minmax(92px, 1fr))`,
            }}
          >
            <div
              className={cn(
                'sticky left-0 z-10 flex items-center bg-card px-3 text-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground',
                'border-b border-r border-border/60',
                rowHeight,
              )}
            >
              Campaign
            </div>
            {MATRIX_METRICS.map((metric) => {
              const isActive = metric.key === selectedMetric;
              return (
                <button
                  key={metric.key}
                  type="button"
                  onClick={() => onMetricChange(metric.key)}
                  className={cn(
                    'flex items-center justify-end gap-1 border-b border-border/60 px-2.5 text-right text-2xs font-medium uppercase tracking-[0.08em] transition-colors',
                    isActive
                      ? 'bg-primary/[0.07] text-primary'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    rowHeight,
                  )}
                  aria-pressed={isActive}
                >
                  <span>{metric.shortLabel}</span>
                  {metric.direction === 'lower' ? (
                    <ArrowDownIcon className="h-3 w-3 opacity-70" />
                  ) : metric.direction === 'higher' ? (
                    <ArrowUpIcon className="h-3 w-3 opacity-70" />
                  ) : null}
                </button>
              );
            })}

            {sortedCampaigns.map((campaign, rowIndex) => {
              const isSelected = selectedCampaignId === campaign.id;
              const isLast = rowIndex === sortedCampaigns.length - 1;
              return (
                <React.Fragment key={campaign.id}>
                  <button
                    type="button"
                    onClick={() => onCampaignSelect?.(campaign.id)}
                    className={cn(
                      'sticky left-0 z-10 flex items-center gap-2 truncate bg-card px-3 text-left text-sm font-medium transition-colors',
                      'border-r border-border/60',
                      !isLast && 'border-b',
                      isSelected
                        ? 'border-l-2 border-l-primary bg-primary/[0.04] pl-[10px] text-foreground'
                        : 'border-l-2 border-l-transparent hover:bg-muted/40',
                      rowHeight,
                    )}
                  >
                    <span className="truncate" title={campaign.name}>
                      {campaign.name}
                    </span>
                  </button>

                  {MATRIX_METRICS.map((metric) => {
                    const value = campaign.metrics?.[metric.key];
                    const rank =
                      typeof value === 'number'
                        ? percentile(valuesByMetric.get(metric.key) ?? [], value)
                        : 0.5;
                    const paint: HeatmapPaint = heatmapPaint(metric, rank);
                    const comparison = campaign.comparison?.[metric.key];
                    const tone = deltaTone(metric, comparison?.percentageChange);
                    const isActiveColumn = metric.key === selectedMetric;
                    return (
                      <Tooltip key={metric.key}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onMetricChange(metric.key);
                                onCampaignSelect?.(campaign.id);
                              }}
                              data-active={isActiveColumn || undefined}
                              data-selected={isSelected || undefined}
                              className={cn(
                                'group relative flex items-center justify-between gap-1 text-right transition-[box-shadow,transform] duration-150',
                                'border-b border-border/40',
                                !isLast || 'border-b-0',
                                cellPadding,
                                'bg-[var(--hm-bg-light)] dark:bg-[var(--hm-bg-dark)]',
                                'hover:ring-1 hover:ring-inset hover:ring-foreground/15',
                                'data-[active]:shadow-[inset_0_0_0_2px_oklch(60%_0.20_280_/_0.35)]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset',
                              )}
                              style={paintToStyle(paint) as React.CSSProperties}
                            >
                              <span
                                className={cn(
                                  'text-2xs uppercase tracking-tight transition-colors',
                                  tone === 'positive' && 'text-emerald-700 dark:text-emerald-300',
                                  tone === 'negative' && 'text-rose-700 dark:text-rose-300',
                                  tone === 'flat' && 'text-muted-foreground/70',
                                )}
                              >
                                <DeltaGlyph tone={tone} size={density === 'compact' ? 9 : 10} />
                              </span>
                              <span className="truncate font-mono text-sm font-medium tabular-nums text-foreground">
                                {formatMetric(metric.key, value)}
                              </span>
                            </button>
                          }
                        />
                        <TooltipContent side="top" align="end" className="px-2 py-1.5">
                          <div className="space-y-0.5">
                            <div className="text-2xs uppercase tracking-[0.08em] text-muted-foreground">
                              {campaign.name}
                            </div>
                            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
                              <span className="font-medium">
                                {MATRIX_METRICS.find((m) => m.key === metric.key)?.label}
                              </span>
                              <span>{formatMetric(metric.key, value)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">vs prior</span>
                              <span
                                className={cn(
                                  'font-mono tabular-nums',
                                  tone === 'positive' && 'text-emerald-600 dark:text-emerald-300',
                                  tone === 'negative' && 'text-rose-600 dark:text-rose-300',
                                  tone === 'flat' && 'text-muted-foreground',
                                )}
                              >
                                {formatDeltaPct(comparison?.percentageChange)}
                              </span>
                              <span className="text-muted-foreground">
                                · {Math.round(rank * 100)}th pct
                              </span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
