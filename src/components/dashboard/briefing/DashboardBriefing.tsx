import type { ReactNode } from "react";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import { NorthStarActions } from "./NorthStarActions";

type DashboardBriefingProps = {
  brandId: string;
  lastGeneratedAt?: string;
  // Left column: the account insights list. Right column: the top creatives.
  insightsSlot?: ReactNode;
  creativesSlot?: ReactNode;
};

// The lead value moment for the home board: an "Overview" header + manual
// refresh, the three North Star actions, then the account insights beside the
// top creatives. Trends live in the Brand Trends data table below.
export function DashboardBriefing({
  brandId,
  lastGeneratedAt,
  insightsSlot,
  creativesSlot,
}: DashboardBriefingProps) {
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
        {insightsSlot}
        {creativesSlot}
      </div>
    </section>
  );
}
