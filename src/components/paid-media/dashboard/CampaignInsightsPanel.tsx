"use client";

import * as React from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import {
  BarChart3Icon,
  MapPinIcon,
  PaletteIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignInsights } from "@/hooks/useCampaignInsights";
import type { ComputedInsight, InsightCategory } from "@/lib/paid-media/account-insights.types";
import type { PaidMediaTimeRange } from "./timeRange";
import { InsightCategoryCard } from "./InsightCategoryCard";

type CampaignInsightsPanelProps = {
  brandId: string;
  adAccountId: string;
  campaignId: string;
  campaignName?: string;
  campaignObjective?: string;
  timeRange: PaidMediaTimeRange;
};

const CATEGORY_CONFIG: ReadonlyArray<{
  key: InsightCategory;
  title: string;
  icon: typeof BarChart3Icon;
  accent: string;
}> = [
  {
    key: "budget",
    title: "Budget Pace",
    icon: WalletIcon,
    accent: "bg-emerald-500/90",
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
    budget: [],
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

export function CampaignInsightsPanel({
  brandId,
  adAccountId,
  campaignId,
  campaignName,
  campaignObjective,
  timeRange,
}: CampaignInsightsPanelProps) {
  const { insights, expiresAt, isLoading, error, refresh } =
    useCampaignInsights({
      brandId,
      adAccountId,
      campaignId,
      campaignName,
      campaignObjective,
      timeRange,
    });

  const grouped = React.useMemo(() => groupByCategory(insights), [insights]);
  const hasAnyInsights = insights.length > 0;

  const stalenessLabel = React.useMemo(() => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    if (remaining <= 0) return "Stale";
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `Fresh for ${days}d ${hours % 24}h`;
    if (hours > 0) return `Fresh for ${hours}h`;
    const mins = Math.ceil(remaining / (1000 * 60));
    return `Fresh for ${mins}m`;
  }, [expiresAt]);

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 px-3 py-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3Icon className="size-4 text-muted-foreground" />
          Campaign Insights
        </CardTitle>
        <div className="flex items-center gap-2">
          {stalenessLabel && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {stalenessLabel}
            </span>
          )}
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
        </div>
      </CardHeader>

      <CardContent className="p-2">
        <div className="max-h-[clamp(220px,34svh,420px)] overflow-y-auto">
          {isLoading && !hasAnyInsights ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {CATEGORY_CONFIG.map((cat) => (
                <div
                  key={cat.key}
                  className="rounded-lg border border-border/70 bg-card p-2.5"
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
            <p className="py-4 text-center text-xs text-muted-foreground">No insights for this range yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </CardContent>
    </Card>
  );
}
