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
    <div className="flex h-full min-h-[680px] min-w-0 flex-col gap-2 overflow-y-auto pr-1">
      <section className="shrink-0">
        <InstagramOrganicReportingWidget
          brandId={brandId}
          accounts={instagramAccounts}
          className="min-h-[390px]"
        />
      </section>

      <section className="min-h-[360px] flex-1">
        <BrandTrendsPanel
          trends={trendsAndEvents.trends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          brandId={brandId}
          country={trendsAndEvents.country}
          generatedAt={trendsAndEvents.generatedAt ?? insightsGeneratedAt}
          status={trendsAndEvents.status ?? insightsStatus}
          statusSlot={<BrandInsightsGenerateButton brandId={brandId} />}
          className="h-full"
        />
      </section>
    </div>
  );
}
