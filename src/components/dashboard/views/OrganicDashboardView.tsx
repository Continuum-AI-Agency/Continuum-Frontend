"use client";

import dynamic from "next/dynamic";
import type { InstagramAccountOption } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { DashboardBriefing } from "@/components/dashboard/briefing/DashboardBriefing";
import { OrganicCreativesLeaderboard } from "@/components/dashboard/briefing/OrganicCreativesLeaderboard";
import { DashboardWarmOnMount } from "@/components/dashboard/DashboardWarmOnMount";
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
  youtubeAccounts?: InstagramAccountOption[];
  trendsAndEvents: BrandInsightsTrendsAndEvents;
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  insightsGeneratedAt?: string;
  insightsStatus?: string;
};

export function OrganicDashboardView({
  brandId,
  instagramAccounts,
  youtubeAccounts,
  trendsAndEvents,
  questionsByNiche,
  insightsGeneratedAt,
  insightsStatus,
}: OrganicDashboardViewProps) {
  const generatedAt = trendsAndEvents.generatedAt ?? insightsGeneratedAt;
  const isCold = trendsAndEvents.trends.length === 0 || !generatedAt;

  return (
    <div className="flex w-full min-w-0 flex-col gap-[var(--app-shell-gap)]">
      <DashboardWarmOnMount brandId={brandId} isCold={isCold} />
      <DashboardBriefing
        brandId={brandId}
        trends={trendsAndEvents.trends}
        lastGeneratedAt={generatedAt}
        creativesSlot={
          <OrganicCreativesLeaderboard
            brandId={brandId}
            accounts={instagramAccounts}
            youtubeAccounts={youtubeAccounts}
          />
        }
      />

      <section className="min-h-[clamp(220px,28dvh,500px)]">
        <BrandTrendsPanel
          trends={trendsAndEvents.trends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          brandId={brandId}
          country={trendsAndEvents.country}
          generatedAt={generatedAt}
          status={trendsAndEvents.status ?? insightsStatus}
        />
      </section>

      <section>
        <InstagramOrganicReportingWidget
          brandId={brandId}
          accounts={instagramAccounts}
          youtubeAccounts={youtubeAccounts}
          className="min-h-[var(--dashboard-min-panel-height)]"
        />
      </section>
    </div>
  );
}
