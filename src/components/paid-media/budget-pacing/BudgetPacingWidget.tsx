'use client';

import { ReloadIcon } from '@radix-ui/react-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { PaidPerformanceMetricKey } from '@/components/paid-media/PaidMediaReportingWidget';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  makeBudgetPacingKey,
  usePaidMediaPerformanceStore,
} from '@/lib/paid-media/performance-store';
import type { BudgetPacingResponse } from '@/lib/schemas/budgetPacing';
import {
  BudgetPacingChart,
  type BudgetPacingTrendMode,
  type RangeOption,
} from './BudgetPacingChart';
import {
  type BudgetPacingSummaryCardKey,
  BudgetPacingSummaryStrip,
} from './BudgetPacingSummaryStrip';
import { BudgetPacingTable } from './BudgetPacingTable';

type Props = {
  brandId: string;
  selectedAccountId: string | null;
  selectedMetric?: PaidPerformanceMetricKey;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: BudgetPacingResponse };

function mapMetricToSummaryCard(metric?: PaidPerformanceMetricKey): BudgetPacingSummaryCardKey {
  if (metric === 'roas' || metric === 'ctr') return 'pace';
  if (metric === 'impressions') return 'budget';
  if (metric === 'clicks') return 'spend';
  if (metric === 'cpc' || metric === 'cpa') return 'spend';
  return 'spend';
}

function mapMetricToTrendMode(metric?: PaidPerformanceMetricKey): BudgetPacingTrendMode {
  if (metric === 'roas' || metric === 'ctr') return 'pace';
  return 'spend';
}

function BudgetPacingLoadingSkeleton() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.9fr)_minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="min-h-0 rounded-lg" />
      <Skeleton className="min-h-0 rounded-lg" />
    </div>
  );
}

export function BudgetPacingWidget({ brandId, selectedAccountId, selectedMetric }: Props) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<RangeOption>('7d');
  const summaryCard = mapMetricToSummaryCard(selectedMetric);
  const trendMode = mapMetricToTrendMode(selectedMetric);
  const cacheKey = useMemo(() => {
    if (!selectedAccountId) return null;
    return makeBudgetPacingKey({ brandId, adAccountId: selectedAccountId });
  }, [brandId, selectedAccountId]);

  const { entry, loadBudgetPacing } = usePaidMediaPerformanceStore(
    useShallow((store) => ({
      entry: cacheKey ? store.budgetPacing[cacheKey] : undefined,
      loadBudgetPacing: store.loadBudgetPacing,
    })),
  );

  const state: LoadState = useMemo(() => {
    if (!selectedAccountId) return { status: 'idle' };
    if (!entry) return { status: 'idle' };
    if (entry.status === 'loading') return { status: 'loading' };
    if (entry.status === 'error')
      return { status: 'error', message: entry.error ?? 'Failed to load budget pacing' };
    if (entry.status === 'success' && entry.data) return { status: 'success', data: entry.data };
    return { status: 'idle' };
  }, [entry, selectedAccountId]);

  const fetchPacing = useCallback(
    async (accountId: string, force = false) => {
      setFocusKey(null);
      await loadBudgetPacing({ brandId, adAccountId: accountId }, { force }).catch(() => undefined);
    },
    [brandId, loadBudgetPacing],
  );

  useEffect(() => {
    if (selectedAccountId) fetchPacing(selectedAccountId);
  }, [selectedAccountId, fetchPacing]);

  return (
    <section
      data-tour-id="dashboard-budget-pacing"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--app-shell-gap)] border-b border-border/70 bg-muted/15 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold tracking-tight">Budget Pace</h3>
          <span className="whitespace-nowrap rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.08em] text-muted-foreground tabular-nums">
            Spend vs target · {selectedRange}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={state.status === 'loading' || !selectedAccountId}
          onClick={() => {
            if (selectedAccountId) fetchPacing(selectedAccountId, true);
          }}
          aria-label="Refresh pacing"
        >
          <ReloadIcon className={state.status === 'loading' ? 'animate-spin' : undefined} />
        </Button>
      </div>

      <div className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
        {state.status === 'loading' && <BudgetPacingLoadingSkeleton />}

        {state.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        {state.status === 'success' && (
          <div className="grid min-h-full min-w-0 gap-1.5 xl:grid-rows-[auto_minmax(220px,0.9fr)_minmax(220px,1fr)]">
            <BudgetPacingSummaryStrip data={state.data} activeKey={summaryCard} />
            <BudgetPacingChart
              campaigns={state.data.campaigns}
              focusKey={focusKey}
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
              metricMode={trendMode}
            />
            <BudgetPacingTable
              campaigns={state.data.campaigns}
              focusKey={focusKey}
              onFocusKey={setFocusKey}
              selectedRange={selectedRange}
            />
          </div>
        )}

        {state.status === 'idle' && !selectedAccountId && (
          <p className="py-8 text-center text-sm text-muted-foreground">No ad account selected.</p>
        )}
      </div>
    </section>
  );
}
