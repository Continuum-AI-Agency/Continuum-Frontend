'use client';

import dynamic from 'next/dynamic';
import { BrandInsightsGenerateButton } from '@/components/brand-insights/BrandInsightsGenerateButton';
import { BrandTrendsPanel } from '@/components/brand-insights/BrandTrendsPanel';
import { DashboardBriefing } from '@/components/dashboard/briefing/DashboardBriefing';
import { OrganicCreativesTable } from '@/components/dashboard/briefing/OrganicCreativesTable';
import { OrganicInsightsList } from '@/components/dashboard/briefing/OrganicInsightsList';
import { OrganicMetricStrip } from '@/components/dashboard/briefing/OrganicMetricStrip';
import { CompetitorOrganicTable } from '@/components/dashboard/competitor/CompetitorOrganicTable';
import { DashboardWarmOnMount } from '@/components/dashboard/DashboardWarmOnMount';
import type { InstagramAccountOption } from '@/components/dashboard/InstagramOrganicReportingWidget';
import { OrganicMetricsWidgetSkeleton } from '@/components/organic/MetricsSkeleton';
import { ModuleShortcutLink } from '@/components/shared/ModuleShortcutLink';
import type {
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrendsAndEvents,
} from '@/lib/schemas/brandInsights';

const InstagramOrganicReportingWidget = dynamic(
  () =>
    import('@/components/dashboard/InstagramOrganicReportingWidget').then((m) => ({
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
        lastGeneratedAt={generatedAt}
        metricStripSlot={
          <OrganicMetricStrip
            brandId={brandId}
            accounts={instagramAccounts}
            youtubeAccounts={youtubeAccounts}
          />
        }
        insightsSlot={
          <OrganicInsightsList
            brandId={brandId}
            accounts={instagramAccounts}
            youtubeAccounts={youtubeAccounts}
          />
        }
        creativesSlot={
          <OrganicCreativesTable
            brandId={brandId}
            accounts={instagramAccounts}
            youtubeAccounts={youtubeAccounts}
          />
        }
      />

      <section>
        <CompetitorOrganicTable brandId={brandId} />
      </section>

      <section className="min-h-[var(--dashboard-compact-panel-min-height)]">
        <BrandTrendsPanel
          trends={trendsAndEvents.trends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          brandId={brandId}
          country={trendsAndEvents.country}
          generatedAt={generatedAt}
          status={trendsAndEvents.status ?? insightsStatus}
          actionSlot={<ModuleShortcutLink href="/organic?tab=metrics" label="Open metrics" />}
          statusSlot={
            <BrandInsightsGenerateButton brandId={brandId} lastGeneratedAt={generatedAt} force />
          }
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
