"use client";

import dynamic from "next/dynamic";
import { Text } from "@radix-ui/themes";
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
      <section className="space-y-2">
        <div className="px-1">
          <Text size="3" weight="medium" className="text-balance">Organic Performance Snapshot</Text>
          <Text size="2" className="text-pretty text-muted-foreground">
            Read account KPIs and post-level velocity without leaving the dashboard.
          </Text>
        </div>
        <InstagramOrganicReportingWidget brandId={brandId} accounts={instagramAccounts} />
      </section>
      <section className="space-y-2">
        <div className="px-1">
          <Text size="3" weight="medium">Trend Intelligence</Text>
          <Text size="2" className="text-muted-foreground">
            Keep the publishing plan aligned with current demand shifts.
          </Text>
        </div>
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
      </section>
    </div>
  );
}
