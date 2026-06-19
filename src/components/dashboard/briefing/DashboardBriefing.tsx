import type { ReactNode } from "react";
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import { TrendSignalsTable } from "./TrendSignalsTable";
import { NorthStarActions } from "./NorthStarActions";
import { DashboardBriefingEmptyState } from "./DashboardBriefingEmptyState";

type DashboardBriefingProps = {
  brandId: string;
  trends: BrandInsightsTrend[];
  lastGeneratedAt?: string;
  // The right column beside Brand Trends — the organic creatives leaderboard.
  creativesSlot?: ReactNode;
};

// The lead value moment for the home board: an "Overview" header, the ranked
// insight leaderboard (or a teaching empty state), the competitor stub, and the
// three North Star actions. Insights refresh automatically (onboarding + daily
// cron); the manual refresh is a low-key secondary control, not a CTA.
export function DashboardBriefing({ brandId, trends, lastGeneratedAt, creativesSlot }: DashboardBriefingProps) {
  const hasInsights = trends.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Overview</h2>
          <p className="text-xs text-muted-foreground">Your weekly signal. Pick your next move.</p>
        </div>
        <BrandInsightsGenerateButton brandId={brandId} lastGeneratedAt={lastGeneratedAt} subtle force />
      </div>

      <NorthStarActions />

      <div data-tour-id="dashboard-top-content" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {hasInsights ? (
          <TrendSignalsTable trends={trends} />
        ) : (
          <DashboardBriefingEmptyState />
        )}
        {creativesSlot}
      </div>
    </section>
  );
}
