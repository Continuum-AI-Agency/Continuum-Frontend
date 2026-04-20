"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BudgetPacingEntry } from "@/lib/schemas/budgetPacing";
import { BudgetPacingStatusBadge } from "./BudgetPacingStatusBadge";

type Props = {
  campaigns: BudgetPacingEntry[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

const paceColorByStatus: Record<string, string> = {
  on_pace: "text-emerald-500",
  underspending: "text-amber-500",
  overspending: "text-red-500",
};

function CampaignSparkline({ data }: { data: BudgetPacingEntry["dailyTrend"] }) {
  return (
    <ResponsiveContainer width={60} height={24}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="spend"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BudgetPacingTable({ campaigns }: Props) {
  if (campaigns.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No campaigns found.
      </p>
    );
  }

  const sorted = [...campaigns].sort((a, b) => b.pacePct - a.pacePct);

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] gap-x-4 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Campaign</span>
        <span>Type</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Spend</span>
        <span className="text-right">Remaining</span>
        <span className="text-right">Pace</span>
        <span>Status</span>
        <span>Trend</span>
      </div>

      {sorted.map((campaign) => (
        <div
          key={campaign.campaignId}
          className={cn(
            "grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] items-center gap-x-4 border-b border-border/40 px-4 py-2.5 last:border-b-0",
            campaign.paceStatus === "overspending" && "bg-red-500/5"
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{campaign.campaignName}</p>
            {campaign.daysRemaining !== null ? (
              <p className="text-xs text-muted-foreground">{campaign.daysRemaining}d left</p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>

          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {campaign.budgetType}
          </span>

          <span className="tabular-nums text-sm text-right">
            {formatCurrency(campaign.totalBudget)}
          </span>

          <span className="tabular-nums text-sm text-right">
            {formatCurrency(campaign.spendToDate)}
          </span>

          <span className="tabular-nums text-sm text-right">
            {formatCurrency(campaign.budgetRemaining)}
          </span>

          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                "tabular-nums text-sm",
                paceColorByStatus[campaign.paceStatus]
              )}
            >
              {campaign.pacePct.toFixed(1)}%
            </span>
            <Progress value={Math.min(100, campaign.pacePct)} className="h-1 w-16" />
          </div>

          <BudgetPacingStatusBadge status={campaign.paceStatus} />

          <CampaignSparkline data={campaign.dailyTrend} />
        </div>
      ))}
    </div>
  );
}
