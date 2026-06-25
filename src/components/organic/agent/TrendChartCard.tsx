'use client';

import { ChevronDown, SearchCheck } from 'lucide-react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { AgentReceipt } from './agentCardKit';
import type { UiTrendChart } from './types';

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  trend: 'Trend',
  event: 'Event',
  question: 'Question',
};

const SERIES_LABELS = ['Trends', 'Events', 'Questions'] as const;

type Props = { chart: UiTrendChart };

type SeriesLabel = (typeof SERIES_LABELS)[number];

type TrendScanSummary = {
  title: string;
  windowLabel: string;
  totalSignals: number;
  counts: Array<{ label: SeriesLabel; value: number }>;
};

function formatWindowDays(days: number): string {
  return days >= 365 && days % 365 === 0 ? `${days / 365}y` : `${days}d`;
}

function formatPlatform(platform: string | null): string | null {
  if (!platform) return null;
  return platform.replace(/[_-]+/g, ' ');
}

function formatConfidence(confidence: number | null): string | null {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  const clamped = Math.max(0, Math.min(100, normalized));
  return `${Math.round(clamped)}%`;
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

export function getTrendScanSummary(chart: UiTrendChart): TrendScanSummary {
  const title = typeof chart?.title === 'string' && chart.title.trim() ? chart.title : 'Trend scan';
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
    windowLabel: windows.length > 0 ? windows.map(formatWindowDays).join(' / ') : 'current',
    totalSignals: chart.topSignals.length,
    counts,
  };
}

export function TrendChartCard({ chart }: Props) {
  const [open, setOpen] = useState(false);
  const topSignals = Array.isArray(chart?.topSignals) ? chart.topSignals : [];
  const summary = getTrendScanSummary(chart);

  if (topSignals.length === 0) return null;

  return (
    <AgentReceipt className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
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
                · {summary.totalSignals} signal{summary.totalSignals === 1 ? '' : 's'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {summary.counts.slice(0, 3).map((count) => (
                <span
                  key={count.label}
                  className="hidden rounded-md bg-background/45 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground/80 tabular-nums md:inline"
                >
                  {count.label} {count.value}
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
        </CollapsibleTrigger>
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
                  SIGNAL_TYPE_LABELS[signal.type] ?? signal.type,
                  formatPlatform(signal.platform),
                  formatConfidence(signal.confidence),
                  formatWindowDays(signal.windowDays),
                ]
                  .filter((part): part is string => Boolean(part))
                  .map((part, i) => (
                    <span key={`${signal.id}-${part}`}>
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
