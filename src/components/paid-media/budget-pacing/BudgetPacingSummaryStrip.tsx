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
      <Progress value={Math.min(100, progressValue)} className="h-1" />
    </div>
  );
}

export function BudgetPacingSummaryStrip({ data }: Props) {
  const { summary } = data;
  const isDaily = summary.accountBudgetPeriod === "daily";
  const isLifetime = summary.accountBudgetPeriod === "lifetime";

  // For daily accounts: compare today's spend to daily budget cap
  // For lifetime accounts: compare all-time spend to total budget
  const spendValue = isDaily ? summary.totalTodaySpend : summary.totalSpend;
  const spentPct = summary.totalBudget > 0
    ? (spendValue / summary.totalBudget) * 100
    : 0;

  const remainingPct = summary.totalBudget > 0
    ? (summary.totalBudgetRemaining / summary.totalBudget) * 100
    : 0;

  const isRemainingCritical =
    isLifetime &&
    summary.totalBudget > 0 &&
    summary.totalBudgetRemaining / summary.totalBudget < 0.1;

  const budgetLabel = isDaily ? "Daily Budget Cap" : isLifetime ? "Total Budget" : "Budget";
  const spendLabel = isDaily ? "Today's Spend" : "Spend to Date";
  const remainingLabel = isDaily ? "Today's Remaining" : "Remaining";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label={budgetLabel}
        value={summary.totalBudget > 0 ? formatCurrency(summary.totalBudget) : "—"}
        subLabel={isDaily ? "per day" : undefined}
        progressValue={100}
      />

      <KpiCard
        label={spendLabel}
        value={formatCurrency(spendValue)}
        subLabel={summary.totalBudget > 0 ? `${Math.min(spentPct, 999).toFixed(1)}% of cap` : undefined}
        progressValue={spentPct}
      />

      <KpiCard
        label={remainingLabel}
        value={summary.totalBudget > 0 ? formatCurrency(summary.totalBudgetRemaining) : "—"}
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
