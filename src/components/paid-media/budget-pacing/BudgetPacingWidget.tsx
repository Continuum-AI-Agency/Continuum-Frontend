"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Callout, Flex, IconButton, Text } from "@radix-ui/themes";
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
  const [selectedRange, setSelectedRange] = useState<RangeOption>("14d");
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
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <Flex align="center" justify="between" className="min-h-10 border-b border-border/70 px-2 py-1.5 sm:px-3">
        <div>
          <h3 className="text-sm font-semibold">Budget Pace</h3>
          <p className="text-[11px] text-muted-foreground">Spend vs target</p>
        </div>

        <IconButton
          variant="ghost"
          size="1"
          disabled={state.status === "loading" || !selectedAccountId}
          onClick={() => { if (selectedAccountId) fetchPacing(selectedAccountId, true); }}
        >
          <ReloadIcon className={state.status === "loading" ? "animate-spin" : undefined} />
        </IconButton>
      </Flex>

      <div className="min-h-0 overflow-y-auto p-2 sm:p-3">
        {state.status === "loading" && <BudgetPacingLoadingSkeleton />}

        {state.status === "error" && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{state.message}</Callout.Text>
          </Callout.Root>
        )}

        {state.status === "success" && (
          <div className="grid min-h-full gap-3 xl:grid-rows-[auto_minmax(260px,0.9fr)_minmax(280px,1fr)]">
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
