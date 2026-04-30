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
    <div className="grid min-h-[680px] gap-3 xl:h-[calc(100dvh-8.5rem)] xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-h-[520px] xl:min-h-0">
        <InstagramOrganicReportingWidget brandId={brandId} accounts={instagramAccounts} />
      </section>

      <aside className="min-h-[520px] xl:min-h-0">
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
      </aside>
    </div>
  );
}
