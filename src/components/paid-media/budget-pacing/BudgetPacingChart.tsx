"use client";

import type { UTCTimestamp } from "lightweight-charts";
import { Skeleton } from "@/components/ui/skeleton";
import type { BudgetPacingEntry } from "@/lib/schemas/budgetPacing";
import {
  ObservabilityLightweightChart,
  type ObservabilityChartSeries,
} from "@/components/paid-media/dashboard/ObservabilityLightweightChart";

type Props = {
  campaigns: BudgetPacingEntry[];
  title?: string;
};

function toTimestamp(date: string): UTCTimestamp {
  return Math.floor(new Date(date + "T12:00:00Z").getTime() / 1000) as UTCTimestamp;
}

function buildAggregatedSeries(campaigns: BudgetPacingEntry[]): ObservabilityChartSeries[] {
  const spendByDate = new Map<string, number>();
  const targetByDate = new Map<string, number>();

  for (const campaign of campaigns) {
    for (const point of campaign.dailyTrend) {
      spendByDate.set(point.date, (spendByDate.get(point.date) ?? 0) + point.spend);
      targetByDate.set(point.date, (targetByDate.get(point.date) ?? 0) + point.target);
    }
  }

  const sortedDates = Array.from(new Set([...spendByDate.keys(), ...targetByDate.keys()])).sort();

  return [
    {
      id: "actual-spend",
      label: "Actual Spend",
      color: "#3b82f6",
      dashed: false,
      points: sortedDates.map((date) => ({
        time: toTimestamp(date),
        value: spendByDate.get(date) ?? 0,
      })),
    },
    {
      id: "target-pace",
      label: "Target Pace",
      color: "#f59e0b",
      dashed: true,
      points: sortedDates.map((date) => ({
        time: toTimestamp(date),
        value: targetByDate.get(date) ?? 0,
      })),
    },
  ];
}

function deriveDateRange(campaigns: BudgetPacingEntry[]): string | null {
  const dates: string[] = [];
  for (const campaign of campaigns) {
    for (const point of campaign.dailyTrend) {
      dates.push(point.date);
    }
  }
  if (dates.length === 0) return null;
  const sorted = dates.slice().sort();
  return `${sorted[0]} → ${sorted[sorted.length - 1]}`;
}

export function BudgetPacingChart({ campaigns, title = "Budget Pacing" }: Props) {
  const hasTrendData = campaigns.some((c) => c.dailyTrend.length > 0);

  if (!hasTrendData) {
    return <Skeleton className="h-56 rounded-lg" />;
  }

  const series = buildAggregatedSeries(campaigns);
  const dateRange = deriveDateRange(campaigns);

  return (
    <div className="bg-background/80 border border-border/60 rounded-lg p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        {dateRange && (
          <p className="text-muted-foreground text-xs">{dateRange}</p>
        )}
      </div>
      <ObservabilityLightweightChart series={series} className="h-56" />
    </div>
  );
}
