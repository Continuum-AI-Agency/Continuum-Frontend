import { redirect } from "next/navigation";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import { HomeBaseDashboard } from "@/components/dashboard/HomeBaseDashboard";
import type { BrandInsightsTrendsAndEvents, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function DashboardPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const [integrationSummary, insightsResult] = await Promise.all([
    fetchBrandIntegrationSummary(activeBrandId),
    fetchBrandInsights(activeBrandId, { revalidateSeconds: revalidate })
      .then((data) => ({ data }))
      .catch((error: unknown) => ({ error })),
  ]);

  const instagramAccounts = integrationSummary.instagram.accounts.map((account) => ({
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
    <div className="h-full w-full overflow-hidden">
      <HomeBaseDashboard
        brandId={activeBrandId}
        instagramAccounts={instagramAccounts}
        trendsAndEvents={trendsAndEvents}
        questionsByNiche={questionsByNiche}
        insightsGeneratedAt={insights?.generatedAt}
        insightsStatus={insights?.status}
      />
    </div>
  );
}
