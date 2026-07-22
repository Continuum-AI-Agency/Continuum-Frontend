'use client';

import type { UTCTimestamp } from 'lightweight-charts';
import {
  type ObservabilityChartSeries,
  ObservabilityLightweightChart,
} from '@/components/paid-media/dashboard/ObservabilityLightweightChart';
import { Skeleton } from '@/components/ui/skeleton';
import type { BudgetPacingEntry } from '@/lib/schemas/budgetPacing';
import { cn } from '@/lib/utils';

export type RangeOption = '7d' | '14d' | '30d' | 'all';
export type BudgetPacingTrendMode = 'spend' | 'pace';

export const RANGE_OPTIONS: ReadonlyArray<{
  value: RangeOption;
  label: string;
  seconds: number | null;
}> = [
  { value: '7d', label: '7D', seconds: 7 * 86400 },
  { value: '14d', label: '14D', seconds: 14 * 86400 },
  { value: '30d', label: '30D', seconds: 30 * 86400 },
  { value: 'all', label: 'All', seconds: null },
];

type DailyPoint = { date: string; spend: number; target: number };

type Props = {
  campaigns: BudgetPacingEntry[];
  focusKey: string | null;
  selectedRange: RangeOption;
  onRangeChange: (r: RangeOption) => void;
  metricMode?: BudgetPacingTrendMode;
  title?: string;
};

function toTimestamp(date: string): UTCTimestamp {
  return Math.floor(new Date(date + 'T12:00:00Z').getTime() / 1000) as UTCTimestamp;
}

function buildSeries(
  trend: DailyPoint[],
  metricMode: BudgetPacingTrendMode,
): ObservabilityChartSeries[] {
  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  if (metricMode === 'pace') {
    return [
      {
        id: 'actual-pace',
        label: 'Pace',
        color: '#3b82f6',
        dashed: false,
        points: sorted.map((p) => ({
          time: toTimestamp(p.date),
          value: p.target > 0 ? (p.spend / p.target) * 100 : 0,
        })),
      },
      {
        id: 'target-pace',
        label: 'Target Pace',
        color: '#f59e0b',
        dashed: true,
        points: sorted.map((p) => ({ time: toTimestamp(p.date), value: 100 })),
      },
    ];
  }

  return [
    {
      id: 'actual-spend',
      label: 'Spend',
      color: '#3b82f6',
      dashed: false,
      points: sorted.map((p) => ({ time: toTimestamp(p.date), value: p.spend })),
    },
    {
      id: 'target-pace',
      label: 'Target',
      color: '#f59e0b',
      dashed: true,
      points: sorted.map((p) => ({ time: toTimestamp(p.date), value: p.target })),
    },
  ];
}

function aggregateTrend(campaigns: BudgetPacingEntry[]): DailyPoint[] {
  const spendByDate = new Map<string, number>();
  const targetByDate = new Map<string, number>();
  for (const c of campaigns) {
    for (const p of c.dailyTrend) {
      spendByDate.set(p.date, (spendByDate.get(p.date) ?? 0) + p.spend);
      targetByDate.set(p.date, (targetByDate.get(p.date) ?? 0) + p.target);
    }
  }
  const dates = Array.from(new Set([...spendByDate.keys(), ...targetByDate.keys()])).sort();
  return dates.map((date) => ({
    date,
    spend: spendByDate.get(date) ?? 0,
    target: targetByDate.get(date) ?? 0,
  }));
}

function resolveFocusLabel(campaigns: BudgetPacingEntry[], focusKey: string): string | null {
  if (focusKey.startsWith('campaign:')) {
    const id = focusKey.slice('campaign:'.length);
    return campaigns.find((c) => c.campaignId === id)?.campaignName ?? null;
  }
  if (focusKey.startsWith('adset:')) {
    const id = focusKey.slice('adset:'.length);
    for (const c of campaigns) {
      const found = c.adSets.find((a) => a.adSetId === id);
      if (found) return found.adSetName;
    }
  }
  return null;
}

function resolveTrend(campaigns: BudgetPacingEntry[], focusKey: string | null): DailyPoint[] {
  if (!focusKey) return aggregateTrend(campaigns);

  if (focusKey.startsWith('campaign:')) {
    const id = focusKey.slice('campaign:'.length);
    const campaign = campaigns.find((c) => c.campaignId === id);
    return campaign ? [...campaign.dailyTrend] : aggregateTrend(campaigns);
  }

  if (focusKey.startsWith('adset:')) {
    const id = focusKey.slice('adset:'.length);
    for (const c of campaigns) {
      const adSet = c.adSets.find((a) => a.adSetId === id);
      if (adSet) return [...adSet.dailyTrend];
    }
  }

  return aggregateTrend(campaigns);
}

export function BudgetPacingChart({
  campaigns,
  focusKey,
  selectedRange,
  onRangeChange,
  metricMode = 'spend',
  title,
}: Props) {
  const hasTrendData = campaigns.some(
    (c) => c.dailyTrend.length > 0 || c.adSets.some((a) => a.dailyTrend.length > 0),
  );

  if (!hasTrendData) {
    return <Skeleton className="h-56 rounded-lg" />;
  }

  const trend = resolveTrend(campaigns, focusKey);
  const series = buildSeries(trend, metricMode);
  const focusLabel = focusKey ? resolveFocusLabel(campaigns, focusKey) : null;
  const activeWindowSeconds = RANGE_OPTIONS.find((r) => r.value === selectedRange)?.seconds ?? null;

  return (
    <div className="min-w-0 w-full overflow-hidden bg-background/80 border border-border/60 rounded-lg p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {title && <p className="text-sm font-medium shrink-0">{title}</p>}
          {focusLabel && (
            <span className="truncate text-xs text-muted-foreground">— {focusLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onRangeChange(opt.value)}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-[transform,background-color,color] active:scale-[0.96]',
                selectedRange === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <ObservabilityLightweightChart
        series={series}
        className="h-56"
        visibleWindowSeconds={activeWindowSeconds}
      />
    </div>
  );
}
