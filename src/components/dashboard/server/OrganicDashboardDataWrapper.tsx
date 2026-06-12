import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import { OrganicDashboardView } from "@/components/dashboard/views/OrganicDashboardView";
import type { BrandInsightsTrendsAndEvents, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

export async function OrganicDashboardDataWrapper({ brandId }: { brandId: string }) {
  const revalidate = 300;

  const [integrationSummary, insightsResult] = await Promise.all([
    fetchBrandIntegrationSummary(brandId),
    fetchBrandInsights(brandId, { revalidateSeconds: revalidate })
      .then((data) => ({ data }))
      .catch((error: unknown) => ({ error })),
  ]);

  const instagramAccounts = integrationSummary.instagram.accounts.map((account) => ({
    integrationAccountId: account.integrationAccountId,
    name: account.name,
    externalAccountId: account.externalAccountId,
  }));

  const youtubeAccounts = integrationSummary.youtube.accounts.map((account) => ({
    integrationAccountId: account.integrationAccountId,
    name: account.name,
    externalAccountId: account.externalAccountId,
  }));

  let insights = null;
  if (!("error" in insightsResult)) {
    insights = insightsResult.data;
  }

  const trendsAndEvents: BrandInsightsTrendsAndEvents =
    insights?.data.trendsAndEvents ?? {
      trends: [],
      events: [],
      country: undefined,
      status: undefined,
      generatedAt: undefined,
      weekAnalyzed: undefined,
    };

  const questionsByNiche: BrandInsightsQuestionsByNiche =
    insights?.data.questionsByNiche ?? {
      questionsByNiche: {},
      summary: undefined,
      status: undefined,
      generatedAt: undefined,
    };

  return (
    <OrganicDashboardView
      brandId={brandId}
      instagramAccounts={instagramAccounts}
      youtubeAccounts={youtubeAccounts}
      trendsAndEvents={trendsAndEvents}
      questionsByNiche={questionsByNiche}
      insightsGeneratedAt={insights?.generatedAt}
      insightsStatus={insights?.status}
    />
  );
}
