"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import {
  BarChart3Icon,
  LayoutGridIcon,
  MapPinIcon,
  PaletteIcon,
  UsersIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountInsights } from "@/hooks/useAccountInsights";
import type { ComputedInsight, InsightCategory } from "@/lib/paid-media/account-insights.types";
import type { PaidMediaTimeRange } from "./timeRange";
import { InsightCategoryCard } from "./InsightCategoryCard";

type AccountInsightsPanelProps = {
  brandId: string;
  adAccountId: string;
  timeRange: PaidMediaTimeRange;
};

const CATEGORY_CONFIG: ReadonlyArray<{
  key: InsightCategory;
  title: string;
  icon: typeof BarChart3Icon;
  accent: string;
}> = [
  {
    key: "formats",
    title: "Formats",
    icon: LayoutGridIcon,
    accent: "bg-violet-500/90",
  },
  {
    key: "placements",
    title: "Placement / Platform",
    icon: MapPinIcon,
    accent: "bg-blue-500/90",
  },
  {
    key: "audiences",
    title: "Audiences",
    icon: UsersIcon,
    accent: "bg-amber-500/90",
  },
  {
    key: "creative",
    title: "Creative / Visual",
    icon: PaletteIcon,
    accent: "bg-rose-500/90",
  },
];

function groupByCategory(
  insights: ComputedInsight[]
): Record<InsightCategory, ComputedInsight[]> {
  const grouped: Record<InsightCategory, ComputedInsight[]> = {
    formats: [],
    placements: [],
    audiences: [],
    creative: [],
  };

  for (const insight of insights) {
    grouped[insight.category].push(insight);
  }

  return grouped;
}

export function AccountInsightsPanel({
  brandId,
  adAccountId,
  timeRange,
}: AccountInsightsPanelProps) {
  const { insights, isLoading, error, refresh } = useAccountInsights({
    brandId,
    adAccountId,
    timeRange,
  });

  const grouped = React.useMemo(() => groupByCategory(insights), [insights]);
  const hasAnyInsights = insights.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3Icon className="size-4 text-muted-foreground" />
          Account Insights
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={refresh}
          disabled={isLoading}
        >
          <ReloadIcon
            className={isLoading ? "size-3.5 animate-spin" : "size-3.5"}
          />
        </Button>
      </CardHeader>

      <CardContent className="p-3">
        {isLoading && !hasAnyInsights ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_CONFIG.map((cat) => (
              <div
                key={cat.key}
                className="rounded-lg border border-border/70 bg-card p-3"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="py-4 text-center text-xs text-destructive">{error}</p>
        ) : !hasAnyInsights ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No insights available for the selected date range. Insights appear
            when there is enough breakdown data to identify patterns.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_CONFIG.map((cat) => (
              <InsightCategoryCard
                key={cat.key}
                title={cat.title}
                icon={cat.icon}
                insights={grouped[cat.key]}
                accentColor={cat.accent}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
