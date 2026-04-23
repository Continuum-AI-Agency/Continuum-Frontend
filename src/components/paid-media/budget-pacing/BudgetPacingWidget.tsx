"use client";

import { useState, useEffect, useCallback } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Callout, Flex, IconButton, Text } from "@radix-ui/themes";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";
import type { PaidPerformanceMetricKey } from "@/components/paid-media/PaidMediaReportingWidget";
import { BudgetPacingChart, type BudgetPacingTrendMode, type RangeOption } from "./BudgetPacingChart";
import { BudgetPacingSummaryStrip, type BudgetPacingSummaryCardKey } from "./BudgetPacingSummaryStrip";
import { BudgetPacingTable } from "./BudgetPacingTable";

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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

export function BudgetPacingWidget({ brandId, selectedAccountId, selectedMetric }: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<RangeOption>("14d");
  const summaryCard = mapMetricToSummaryCard(selectedMetric);
  const trendMode = mapMetricToTrendMode(selectedMetric);

  const fetchPacing = useCallback(
    async (accountId: string) => {
      setState({ status: "loading" });
      setFocusKey(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch("/api/paid-media/budget-pacing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ brandId, adAccountId: accountId }),
        });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const json = await res.json();
        setState({ status: "success", data: json });
      } catch (err) {
        setState({ status: "error", message: (err as Error).message });
      }
    },
    [brandId]
  );

  useEffect(() => {
    if (selectedAccountId) fetchPacing(selectedAccountId);
  }, [selectedAccountId, fetchPacing]);

  return (
    <div className="space-y-4 p-4">
      <Flex align="center" justify="between">
        <div>
          <h3 className="text-sm font-semibold">Budget Pace</h3>
          <p className="text-xs text-muted-foreground">Spend vs target</p>
        </div>

        <IconButton
          variant="ghost"
          size="1"
          disabled={state.status === "loading" || !selectedAccountId}
          onClick={() => { if (selectedAccountId) fetchPacing(selectedAccountId); }}
        >
          <ReloadIcon className={state.status === "loading" ? "animate-spin" : undefined} />
        </IconButton>
      </Flex>

      {state.status === "loading" && <BudgetPacingLoadingSkeleton />}

      {state.status === "error" && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{state.message}</Callout.Text>
        </Callout.Root>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
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
  );
}
