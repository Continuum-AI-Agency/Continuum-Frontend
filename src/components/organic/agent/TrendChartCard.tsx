'use client';

import { ChevronDown, SearchCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AgentReceipt } from '@/components/shared/agent-cards/agentCardKit';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { UiLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';
import type { UiTrendChart } from './types';

const SERIES_LABELS = ['Trends', 'Events', 'Questions'] as const;

type Props = { chart: UiTrendChart };

type SeriesLabel = (typeof SERIES_LABELS)[number];

type TrendScanSummary = {
  title: string;
  windowLabel: string;
  totalSignals: number;
  counts: Array<{ label: SeriesLabel; value: number }>;
};

const windowFormatters = new Map<string, Intl.NumberFormat>();
const percentFormatters = new Map<UiLocale, Intl.NumberFormat>();

export function formatTrendWindowDays(days: number, locale?: UiLocale): string {
  if (!Number.isFinite(days)) return '';
  const years = days >= 365 && days % 365 === 0;
  if (!locale) return years ? `${days / 365}y` : `${days}d`;
  const unit = years ? 'year' : 'day';
  const key = `${locale}:${unit}`;
  let formatter = windowFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'narrow',
    });
    windowFormatters.set(key, formatter);
  }
  return formatter.format(years ? days / 365 : days);
}

function formatPlatform(platform: string | null): string | null {
  if (!platform) return null;
  return platform.replace(/[_-]+/g, ' ');
}

function formatConfidence(confidence: number | null, locale: UiLocale): string | null {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  const clamped = Math.max(0, Math.min(100, normalized));
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
      useGrouping: false,
    });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(Math.round(clamped) / 100);
}

function collectWindows(chart: UiTrendChart): number[] {
  const windows = new Set<number>();
  for (const window of chart.windows) {
    if (Number.isFinite(window)) windows.add(window);
  }
  for (const series of chart.series) {
    for (const point of series.data) {
      if (Number.isFinite(point.window)) windows.add(point.window);
    }
  }
  for (const signal of chart.topSignals) {
    if (Number.isFinite(signal.windowDays)) windows.add(signal.windowDays);
  }
  return [...windows].sort((a, b) => a - b);
}

export function getTrendScanSummary(
  chart: UiTrendChart,
  presentation: {
    translate?: ReturnType<typeof useTranslations<'organic'>>;
    locale?: UiLocale;
  } = {},
): TrendScanSummary {
  const title =
    typeof chart?.title === 'string' && chart.title.trim()
      ? chart.title
      : (presentation.translate?.('trendScanTitle') ?? 'Trend scan');
  const windows = collectWindows(chart);
  const counts = SERIES_LABELS.map((label) => {
    const value = chart.series
      .filter((series) => series.label === label)
      .flatMap((series) => series.data)
      .reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0);

    return { label, value };
  }).filter((count) => count.value > 0);

  return {
    title,
    windowLabel:
      windows.length > 0
        ? windows.map((days) => formatTrendWindowDays(days, presentation.locale)).join(' / ')
        : (presentation.translate?.('trendWindowCurrent') ?? 'current'),
    totalSignals: chart.topSignals.length,
    counts,
  };
}

export function TrendChartCard({ chart }: Props) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const [open, setOpen] = useState(false);
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];
  const summary = getTrendScanSummary(chart, {
    translate: uiText,
    locale: uiLocale,
  });

  if (topSignals.length === 0) return null;

  return (
    <AgentReceipt className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-muted-foreground transition-[background-color,color] duration-200 hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <SearchCheck className="h-3.5 w-3.5 shrink-0 text-foreground/45" />
                <span className="min-w-0 truncate text-sm font-medium text-foreground/85">
                  {summary.title}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground/70 sm:inline">
                  · {summary.windowLabel}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                  {uiText.rich('sentence_659ee1ea1cdb', {
                    count: summary.totalSignals,
                  })}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {summary.counts.slice(0, 3).map((count) => (
                  <span
                    key={count.label}
                    className="hidden rounded-md bg-background/45 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground/80 tabular-nums md:inline"
                  >
                    {uiText('trendSeriesCount', {
                      series: count.label,
                      count: count.value,
                    })}
                  </span>
                ))}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-200',
                    open && 'rotate-180',
                  )}
                />
              </span>
            </button>
          }
        />
        <CollapsibleContent className="space-y-2 border-t border-border/30 px-3 py-2.5 data-[state=closed]:hidden">
          {topSignals.slice(0, 4).map((signal) => (
            <div
              key={signal.id}
              className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-3"
            >
              <span className="min-w-0 truncate text-sm leading-snug text-foreground/90">
                {signal.title}
              </span>
              <span className="flex min-w-0 flex-wrap items-center text-2xs leading-snug text-muted-foreground/70">
                {[
                  uiText('trendSignalType', { kind: signal.type }),
                  formatPlatform(signal.platform),
                  formatConfidence(signal.confidence, uiLocale),
                  formatTrendWindowDays(signal.windowDays, uiLocale),
                ]
                  .filter((part): part is string => Boolean(part))
                  .map((part, i) => (
                    <span key={`${signal.id}:${i}`}>
                      {i > 0 && <span className="px-1 text-muted-foreground/35">·</span>}
                      <span className={cn(i === 0 && 'font-medium text-muted-foreground/85')}>
                        {part}
                      </span>
                    </span>
                  ))}
              </span>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </AgentReceipt>
  );
}
