import { Suspense } from "react";
import { Callout, Heading } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";

import { OrganicMetricsDashboardLazy } from "@/components/organic/OrganicMetricsDashboardLazy";
import { OrganicWorkspaceTabs } from "@/components/organic/OrganicWorkspaceTabs";
import { OrganicCalendarWorkspace } from "@/components/organic/primitives/OrganicCalendarWorkspace";
import { BrandInsightsAutoGenerate } from "@/components/brand-insights/BrandInsightsAutoGenerate";
import {
  ORGANIC_PLATFORMS,
  ORGANIC_MVP_PLATFORM_KEYS,
  type OrganicPlatformKey,
} from "@/lib/organic/platforms";
import { type PlatformKey } from "@/components/onboarding/platforms";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import type { Trend } from "@/lib/organic/trends";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { deriveMetricAccountsByPlatform } from "@/lib/organic/metricAccounts";
import { redirect } from "next/navigation";
import { shouldAutoGenerateBrandInsights } from "@/lib/brand-insights/auto-generate";
import type { OrganicTrendGroup, OrganicTrendType } from "@/components/organic/primitives/types";

type OrganicPageProps = {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function OrganicContentSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="h-8 w-48 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="min-h-0 flex-1 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
    </div>
  );
}

async function OrganicContent({
  initialSelectedDraftId,
  initialWeekStart,
  initialView,
}: {
  initialSelectedDraftId: string | null;
  initialWeekStart: string | null;
  initialView: "week" | "month" | "list";
}) {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }
  const brandName = brandSummaries?.find(b => b.id === activeBrandId)?.name;

  // Run all three in parallel — ensureOnboardingState, integration summary, and
  // brand insights only need activeBrandId, with no dependency on each other.
  const [onboardingResult, integrationSummaryResult, insightsResult] = await Promise.allSettled([
    ensureOnboardingState(activeBrandId),
    fetchBrandIntegrationSummary(activeBrandId),
    fetchBrandInsights(activeBrandId, { revalidateSeconds: 300 }),
  ]);

  if (onboardingResult.status === "rejected") {
    throw onboardingResult.reason;
  }
  const { brandId, state: onboarding } = onboardingResult.value;
  const brandProfileId = brandId;
  const mvpPlatformSet = new Set<OrganicPlatformKey>(ORGANIC_MVP_PLATFORM_KEYS);

  const integrationSummary =
    integrationSummaryResult.status === "fulfilled" ? integrationSummaryResult.value : null;
  if (integrationSummaryResult.status === "rejected") {
    console.error(
      "[OrganicPage] Failed to load integration account summary",
      integrationSummaryResult.reason
    );
  }

  const platformAccounts = ORGANIC_PLATFORMS.filter(({ key }) =>
    mvpPlatformSet.has(key as OrganicPlatformKey)
  ).map(({ key, label }) => {
    const connection = onboarding.connections[key] ?? { connected: false, accountId: null };
    const summaryAccounts = integrationSummary?.[key as PlatformKey]?.accounts ?? [];
    
    // Platform is considered connected if either the user connected it personally OR the brand has assigned accounts.
    const isConnected = Boolean(connection.connected) || summaryAccounts.length > 0;
    
    // Priority for default account ID:
    // 1. Personal connection account ID
    // 2. First assigned brand account ID
    const accountId = connection.accountId ?? (summaryAccounts.length > 0 ? summaryAccounts[0].integrationAccountId : null);

    return {
      platform: key as OrganicPlatformKey,
      label,
      connected: isConnected,
      accountId,
    };
  });

  const activePlatformKeys = platformAccounts
    .filter((account) => account.connected && account.accountId)
    .map((account) => account.platform);

  const platformAccountIds = platformAccounts.reduce<Record<string, string>>((acc, account) => {
    if (account.connected && account.accountId) {
      acc[account.platform] = account.accountId;
    }
    return acc;
  }, {});
  const fallbackPlatforms =
    activePlatformKeys.length > 0 ? activePlatformKeys : [...ORGANIC_MVP_PLATFORM_KEYS];

  let selectorTrends: Trend[] = [];
  let trendTypes: OrganicTrendType[] = [];
  let insightsError: string | null = null;
  const insights =
    insightsResult.status === "fulfilled"
      ? insightsResult.value
      : null;

  if (insightsResult.status === "fulfilled" && insights) {
    const brandTrends = insights.data.trendsAndEvents.trends;
    selectorTrends = brandTrends.map((trend) => ({
      id: trend.id,
      title: trend.title,
      summary: trend.description ?? trend.relevanceToBrand ?? "High-signal topic identified for your brand.",
      momentum: trend.isSelected ? "rising" : "stable",
      platforms: fallbackPlatforms,
      tags: trend.source ? [trend.source] : [],
    }));

    const nicheMap = insights.data.questionsByNiche.questionsByNiche || {};
    
    const allQuestions = Object.entries(nicheMap).flatMap(([niche, data]) => {
      const nicheData = data as { questions: Array<{ id: string; question: string; socialPlatform?: string; contentTypeSuggestion?: string; whyRelevant?: string }> };
      return nicheData.questions.map((q) => ({ ...q, niche }));
    });

    const mappedQuestions = allQuestions.map((q) => {
      const platformKey = q.socialPlatform?.toLowerCase().includes("linkedin") ? "linkedin" : "instagram";
      return {
        id: q.id,
        title: q.question,
        summary: q.whyRelevant ?? q.contentTypeSuggestion ?? "Audience question",
        momentum: "stable" as const,
        platforms: [platformKey] as OrganicPlatformKey[],
        tags: ["question", q.niche],
      };
    });

    // Combine trends and questions
    selectorTrends = [...selectorTrends, ...mappedQuestions];

    const momentumGroups = ["rising", "stable", "cooling"] as const;
    const trendGroups: OrganicTrendGroup[] = momentumGroups
      .map((momentum) => {
        const items = selectorTrends.filter((t) => t.momentum === momentum && !t.tags.includes("question"));
        return {
          id: momentum,
          title: momentum === "rising" ? "Rising Now" : momentum === "stable" ? "Stable Interest" : "Cooling Down",
          trends: items,
        };
      })
      .filter((group) => group.trends.length > 0);

    const mappedEvents = insights.data.trendsAndEvents.events.map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.description ?? e.opportunity ?? "Seasonal event or holiday",
      momentum: "rising" as const,
      platforms: fallbackPlatforms,
      tags: ["event", e.date ?? ""],
    }));

    selectorTrends = [...selectorTrends, ...mappedEvents];

    trendTypes = [
      ...(trendGroups.length > 0 
        ? [{
            id: "trends",
            label: "Market Trends",
            groups: trendGroups,
          }] 
        : []),
      ...(mappedEvents.length > 0
        ? [{
            id: "events",
            label: "Key Events",
            groups: [{
              id: "all-events",
              title: "Upcoming Events",
              trends: mappedEvents,
            }],
          }]
        : []),
      ...(mappedQuestions.length > 0
        ? [{
            id: "questions",
            label: "Audience Questions",
            groups: [{
              id: "all-questions",
              title: "Questions by Niche",
              trends: mappedQuestions,
            }],
          }]
        : [])
    ];
  } else if (insightsResult.status === "rejected") {
    const reason = insightsResult.reason;
    insightsError =
      reason instanceof Error ? reason.message : "Unable to load brand insights for this brand.";
  }

  const shouldAutoGenerateInsights = shouldAutoGenerateBrandInsights({
    insights,
    errorMessage: insightsError,
  });


  const showNoTrendsMessage = selectorTrends.length === 0;
  const metricAccountsByPlatform = deriveMetricAccountsByPlatform({
    integrationSummary,
    onboardingConnections: {
      instagram: onboarding.connections.instagram,
      facebook: onboarding.connections.facebook,
    },
  });
  const initialMetricsPlatform: "instagram" | "facebook" =
    metricAccountsByPlatform.instagram.length > 0 ? "instagram" : "facebook";

  return (
    <>
      <div className="shrink-0 space-y-2">
        <BrandInsightsAutoGenerate
          brandId={brandProfileId}
          shouldGenerate={shouldAutoGenerateInsights}
        />
        <Heading size="5" className="text-foreground">
          Organic Planner
        </Heading>
        {insightsError ? (
          <Callout.Root color="red" variant="surface">
            <Callout.Icon>
              <LightningBoltIcon />
            </Callout.Icon>
            <Callout.Text>{insightsError}</Callout.Text>
          </Callout.Root>
        ) : null}
        {showNoTrendsMessage ? (
          <Callout.Root color="amber" variant="surface">
            <Callout.Icon>
              <LightningBoltIcon />
            </Callout.Icon>
            <Callout.Text>No trends yet. You can still plan posts without them.</Callout.Text>
          </Callout.Root>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <OrganicWorkspaceTabs
          plannerSlot={(
            <OrganicCalendarWorkspace
              trendTypes={trendTypes}
              trends={selectorTrends}
              activePlatforms={fallbackPlatforms}
              platformAccountIds={platformAccountIds}
              maxTrendSelections={5}
              brandProfileId={brandProfileId}
              brandName={brandName}
              initialSelectedDraftId={initialSelectedDraftId}
              initialWeekStart={initialWeekStart}
              initialView={initialView}
            />
          )}
          metricsSlot={(
            <OrganicMetricsDashboardLazy
              brandId={brandProfileId}
              accountsByPlatform={metricAccountsByPlatform}
              initialPlatform={initialMetricsPlatform}
            />
          )}
          metricsPrefetchParams={{
            brandId: brandProfileId,
            integrationAccountId: metricAccountsByPlatform[initialMetricsPlatform][0]?.integrationAccountId ?? "",
            platform: initialMetricsPlatform,
          }}
        />
      </div>
    </>
  );
}

const VALID_VIEWS = ["week", "month", "list"] as const

export default async function OrganicPage({ searchParams }: OrganicPageProps) {
  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};
  const initialSelectedDraftIdRaw = resolvedSearchParams.draftId;
  const initialWeekStartRaw = resolvedSearchParams.weekStartId ?? resolvedSearchParams.weekStart;
  const initialViewRaw = resolvedSearchParams.view;
  const initialSelectedDraftId =
    typeof initialSelectedDraftIdRaw === "string" && initialSelectedDraftIdRaw.trim().length > 0
      ? initialSelectedDraftIdRaw
      : null;
  const initialWeekStart =
    typeof initialWeekStartRaw === "string" && initialWeekStartRaw.trim().length > 0
      ? initialWeekStartRaw
      : null;
  const initialView: "week" | "month" | "list" =
    typeof initialViewRaw === "string" &&
    (VALID_VIEWS as readonly string[]).includes(initialViewRaw)
      ? (initialViewRaw as "week" | "month" | "list")
      : "week";

  return (
    <div className="flex h-[calc(100dvh-4.25rem)] min-h-[var(--workspace-min-height)] w-full flex-col gap-2 overflow-hidden px-2 pb-2 sm:px-3 lg:px-4">
      <Suspense fallback={<OrganicContentSkeleton />}>
        <OrganicContent
          initialSelectedDraftId={initialSelectedDraftId}
          initialWeekStart={initialWeekStart}
          initialView={initialView}
        />
      </Suspense>
    </div>
  );
}
