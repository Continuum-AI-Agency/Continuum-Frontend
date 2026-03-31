"use client";

import dynamic from "next/dynamic";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import { OrganicMetricsWidgetSkeleton } from "@/components/organic/MetricsSkeleton";
import type { BrandInsightsTrendsAndEvents, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

const InstagramOrganicReportingWidget = dynamic(
  () =>
    import("@/components/dashboard/InstagramOrganicReportingWidget").then((m) => ({
      default: m.InstagramOrganicReportingWidget,
    })),
  { ssr: false, loading: () => <OrganicMetricsWidgetSkeleton /> },
);

type OrganicDashboardViewProps = {
  brandId: string;
  instagramAccounts: InstagramAccountOption[];
  trendsAndEvents: BrandInsightsTrendsAndEvents;
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  insightsGeneratedAt?: string;
  insightsStatus?: string;
};

export function OrganicDashboardView({
  brandId,
  instagramAccounts,
  trendsAndEvents,
  questionsByNiche,
  insightsGeneratedAt,
  insightsStatus,
}: OrganicDashboardViewProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4 items-start">
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <InstagramOrganicReportingWidget brandId={brandId} accounts={instagramAccounts} />
      </div>
      <div className="rounded-lg bg-card shadow-sm overflow-hidden">
        <BrandTrendsPanel
          trends={trendsAndEvents.trends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          brandId={brandId}
          country={trendsAndEvents.country}
          generatedAt={trendsAndEvents.generatedAt ?? insightsGeneratedAt}
          status={trendsAndEvents.status ?? insightsStatus}
          statusSlot={<BrandInsightsGenerateButton brandId={brandId} />}
        />
      </div>
    </div>
  );
}
