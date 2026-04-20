"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";
import { BudgetPacingStatusBadge } from "./BudgetPacingStatusBadge";

type Props = {
  data: BudgetPacingResponse;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  subLabel?: React.ReactNode;
  progressValue: number;
  valueClassName?: string;
};

function KpiCard({ label, value, subLabel, progressValue, valueClassName }: KpiCardProps) {
  return (
    <div className="bg-background/80 border border-border/60 rounded-lg p-3 flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", valueClassName)}>{value}</p>
      {subLabel && <p className="text-muted-foreground text-xs">{subLabel}</p>}
      <Progress value={progressValue} className="h-1" />
    </div>
  );
}

export function BudgetPacingSummaryStrip({ data }: Props) {
  const { summary } = data;

  const spentPct = summary.totalBudget > 0
    ? (summary.totalSpend / summary.totalBudget) * 100
    : 0;

  const remainingPct = summary.totalBudget > 0
    ? (summary.totalBudgetRemaining / summary.totalBudget) * 100
    : 0;

  const isRemainingCritical =
    summary.totalBudget > 0 &&
    summary.totalBudgetRemaining / summary.totalBudget < 0.1;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Total Budget"
        value={formatCurrency(summary.totalBudget)}
        progressValue={100}
      />

      <KpiCard
        label="Spend to Date"
        value={formatCurrency(summary.totalSpend)}
        subLabel={`${spentPct.toFixed(1)}% spent`}
        progressValue={spentPct}
      />

      <KpiCard
        label="Remaining"
        value={formatCurrency(summary.totalBudgetRemaining)}
        valueClassName={isRemainingCritical ? "text-red-500" : undefined}
        progressValue={remainingPct}
      />

      <KpiCard
        label="Overall Pace"
        value={
          <span className="flex items-center gap-2">
            {summary.overallPacePct.toFixed(1)}%
            <BudgetPacingStatusBadge status={summary.paceStatus} />
          </span>
        }
        progressValue={Math.min(100, summary.overallPacePct)}
      />
    </div>
  );
}
