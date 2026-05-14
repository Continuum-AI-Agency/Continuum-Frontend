"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Callout, IconButton, Text } from "@radix-ui/themes";
import { useShallow } from "zustand/react/shallow";
import { Skeleton } from "@/components/ui/skeleton";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";
import type { PaidPerformanceMetricKey } from "@/components/paid-media/PaidMediaReportingWidget";
import { BudgetPacingChart, type BudgetPacingTrendMode, type RangeOption } from "./BudgetPacingChart";
import { BudgetPacingSummaryStrip, type BudgetPacingSummaryCardKey } from "./BudgetPacingSummaryStrip";
import { BudgetPacingTable } from "./BudgetPacingTable";
import {
  makeBudgetPacingKey,
  usePaidMediaPerformanceStore,
} from "@/lib/paid-media/performance-store";

type Props = {
  brandId: string;
  selectedAccountId: string | null;
  selectedMetric?: PaidPerformanceMetricKey;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: BudgetPacingResponse };

function mapMetricToSummaryCard(metric?: PaidPerformanceMetricKey): BudgetPacingSummaryCardKey {
  if (metric === "roas" || metric === "ctr") return "pace";
  if (metric === "impressions") return "budget";
  if (metric === "clicks") return "spend";
  if (metric === "cpc" || metric === "cpa") return "spend";
  return "spend";
}

function mapMetricToTrendMode(metric?: PaidPerformanceMetricKey): BudgetPacingTrendMode {
  if (metric === "roas" || metric === "ctr") return "pace";
  return "spend";
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
  const [selectedRange, setSelectedRange] = useState<RangeOption>("7d");
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
    }))
  );

  const state: LoadState = useMemo(() => {
    if (!selectedAccountId) return { status: "idle" };
    if (!entry) return { status: "idle" };
    if (entry.status === "loading") return { status: "loading" };
    if (entry.status === "error") return { status: "error", message: entry.error ?? "Failed to load budget pacing" };
    if (entry.status === "success" && entry.data) return { status: "success", data: entry.data };
    return { status: "idle" };
  }, [entry, selectedAccountId]);

  const fetchPacing = useCallback(
    async (accountId: string, force = false) => {
      setFocusKey(null);
      await loadBudgetPacing({ brandId, adAccountId: accountId }, { force }).catch(() => undefined);
    },
    [brandId, loadBudgetPacing]
  );

  useEffect(() => {
    if (selectedAccountId) fetchPacing(selectedAccountId);
  }, [selectedAccountId, fetchPacing]);

  return (
    <section
      data-tour-id="dashboard-budget-pacing"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--app-shell-gap)] border-b border-border/70 bg-muted/20 px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-xs font-semibold sm:text-sm">Budget Pace</h3>
          <span className="whitespace-nowrap rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
            Spend vs target · {selectedRange}
          </span>
        </div>
        <IconButton
          variant="ghost"
          size="1"
          disabled={state.status === "loading" || !selectedAccountId}
          onClick={() => { if (selectedAccountId) fetchPacing(selectedAccountId, true); }}
          aria-label="Refresh pacing"
        >
          <ReloadIcon className={state.status === "loading" ? "animate-spin" : undefined} />
        </IconButton>
      </div>

      <div className="min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] py-[var(--app-shell-pad-block)]">
        {state.status === "loading" && <BudgetPacingLoadingSkeleton />}

        {state.status === "error" && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{state.message}</Callout.Text>
          </Callout.Root>
        )}

        {state.status === "success" && (
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

        {state.status === "idle" && !selectedAccountId && (
          <Text size="2" color="gray" align="center" as="p" className="py-8">
            No ad account selected.
          </Text>
        )}
      </div>
    </section>
  );
}
