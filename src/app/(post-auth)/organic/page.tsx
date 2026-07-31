import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { OrganicAgentMentionContext } from '@/components/organic/agent/OrganicAgentPanel';
import { OrganicAgentPanelLazy } from '@/components/organic/agent/OrganicAgentPanelLazy';
import { OrganicMetricsDashboardLazy } from '@/components/organic/OrganicMetricsDashboardLazy';
import { OrganicNoticeBridge } from '@/components/organic/OrganicNoticeBridge';
import { OrganicWorkspaceTabs } from '@/components/organic/OrganicWorkspaceTabs';
import { OrganicCalendarWorkspace } from '@/components/organic/primitives/OrganicCalendarWorkspace';
import { PlannerViewSkeleton } from '@/components/organic/primitives/PlannerViewSkeletons';
import type { OrganicTrendGroup, OrganicTrendType } from '@/components/organic/primitives/types';
import { fetchBrandInsights } from '@/lib/api/brandInsights.server';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { ensureOnboardingState } from '@/lib/onboarding/storage';
import { deriveMetricAccountsByPlatform } from '@/lib/organic/metricAccounts';
import { deriveOrganicPlatformAccounts } from '@/lib/organic/platformAccountOptions';
import { ORGANIC_MVP_PLATFORM_KEYS, type OrganicPlatformKey } from '@/lib/organic/platforms';
import type { Trend } from '@/lib/organic/trends';
import type { BrandInsightsQuestion } from '@/lib/schemas/brandInsights';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type OrganicPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// The route-level fallback. It used to be one full-bleed grey block, which is what a view
// switch looked like whenever a lazy planner view suspended past its own boundary. Sharing
// the planner's shaped skeletons means this fallback is recognisable as the app loading —
// and the testid lets a bench assert it is never attached while merely switching views.
function OrganicContentSkeleton({ view }: { view: 'week' | 'month' | 'list' }) {
  return (
    <div data-testid="organic-content-skeleton" className="flex h-full w-full flex-col gap-3">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted/70" />
      <div className="min-h-0 flex-1">
        <PlannerViewSkeleton view={view} />
      </div>
    </div>
  );
}

async function OrganicContent({
  initialSelectedDraftId,
  initialWeekStart,
  initialView,
  initialComposeTrendId,
  initialComposePlatform,
  initialAgentSessionId,
}: {
  initialSelectedDraftId: string | null;
  initialWeekStart: string | null;
  initialView: 'week' | 'month' | 'list';
  initialComposeTrendId: string | null;
  initialComposePlatform: OrganicPlatformKey | null;
  initialAgentSessionId: string | null;
}) {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect('/onboarding');
  }
  const brandName = brandSummaries?.find((b) => b.id === activeBrandId)?.name;

  // Run all four in parallel — none depend on each other, only on activeBrandId.
  const [onboardingResult, integrationSummaryResult, insightsResult, brandDocsResult] =
    await Promise.allSettled([
      ensureOnboardingState(activeBrandId),
      fetchBrandIntegrationSummary(activeBrandId),
      fetchBrandInsights(activeBrandId, { revalidateSeconds: 300 }),
      (async () => {
        const supabase = await createSupabaseServerClient();
        const { data } = await supabase
          .schema('brand_profiles')
          .from('brand_documents')
          .select('id, name, kind, text_excerpt')
          .eq('brand_id', activeBrandId)
          .eq('progress_step', 'ready')
          .order('created_at', { ascending: false });
        return (data ?? []) as Array<{
          id: string;
          name: string;
          kind: string | null;
          text_excerpt: string | null;
        }>;
      })(),
    ]);

  if (onboardingResult.status === 'rejected') {
    throw onboardingResult.reason;
  }
  const { brandId, state: onboarding } = onboardingResult.value;
  const brandProfileId = brandId;
  const mvpPlatforms: readonly OrganicPlatformKey[] = ORGANIC_MVP_PLATFORM_KEYS;

  const integrationSummary =
    integrationSummaryResult.status === 'fulfilled' ? integrationSummaryResult.value : null;
  if (integrationSummaryResult.status === 'rejected') {
    console.error(
      '[OrganicPage] Failed to load integration account summary',
      integrationSummaryResult.reason,
    );
  }

  // Shared with the automation action pickers so the planner and an automation
  // can never disagree about which (platform, account) pairs are publishable.
  const platformAccounts = deriveOrganicPlatformAccounts({
    integrationSummary,
    connections: onboarding.connections,
    platforms: mvpPlatforms,
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

  // Every account the brand could publish to, per platform — what the switcher offers.
  const platformAccountOptions = platformAccounts.reduce<
    Record<string, Array<{ id: string; label: string }>>
  >((acc, account) => {
    if (account.connected && account.options.length > 0) {
      acc[account.platform] = account.options;
    }
    return acc;
  }, {});
  const fallbackPlatforms =
    activePlatformKeys.length > 0 ? activePlatformKeys : [...ORGANIC_MVP_PLATFORM_KEYS];

  let selectorTrends: Trend[] = [];
  let trendTypes: OrganicTrendType[] = [];
  let insightsError: string | null = null;
  const brandDocuments = brandDocsResult.status === 'fulfilled' ? brandDocsResult.value : [];
  let organicAgentMentionContext: OrganicAgentMentionContext | undefined;
  const insights = insightsResult.status === 'fulfilled' ? insightsResult.value : null;

  if (insightsResult.status === 'fulfilled' && insights) {
    const brandTrends = insights.data.trendsAndEvents.trends;
    const nicheMap = insights.data.questionsByNiche.questionsByNiche || {};
    const allQuestions = Object.entries(nicheMap).flatMap(([niche, data]) => {
      const nicheData = data as { questions: BrandInsightsQuestion[] };
      return nicheData.questions.map((q) => ({ ...q, niche }));
    });

    organicAgentMentionContext = {
      generationId: insights.data.generationId,
      weekStartDate: insights.data.weekStartDate,
      trends: brandTrends,
      events: insights.data.trendsAndEvents.events,
      questions: allQuestions,
      documents: brandDocuments,
    };

    selectorTrends = brandTrends.map((trend) => ({
      id: trend.id,
      title: trend.title,
      summary:
        trend.description ??
        trend.relevanceToBrand ??
        'High-signal topic identified for your brand.',
      momentum: trend.isSelected ? 'rising' : 'stable',
      platforms: fallbackPlatforms,
      tags: trend.source ? [trend.source] : [],
      meta: {
        kind: 'trend' as const,
        confidence: trend.confidence,
        source: trend.source,
        sourceUrl: trend.sourceUrl,
        relevanceToBrand: trend.relevanceToBrand,
        analysisTags: trend.analysisTags,
        signalWindowStart: trend.signalWindowStart,
        signalWindowEnd: trend.signalWindowEnd,
        sourceSignalCount: trend.sourceSignalCount,
        recommendedPlatforms: trend.recommendedPlatforms,
        platformRecommendations: trend.platformRecommendations,
      },
    }));

    const mappedQuestions = allQuestions.map((q) => {
      const platformKey = q.socialPlatform?.toLowerCase().includes('linkedin')
        ? 'linkedin'
        : 'instagram';
      return {
        id: q.id,
        title: q.question,
        summary: q.whyRelevant ?? q.contentTypeSuggestion ?? 'Audience question',
        momentum: 'stable' as const,
        platforms: [platformKey] as OrganicPlatformKey[],
        tags: ['question', q.niche],
        meta: {
          kind: 'question' as const,
          confidence: q.confidence,
          relevanceToBrand: q.whyRelevant,
          analysisTags: q.analysisTags,
          sourceSignalCount: q.sourceSignalCount,
          recommendedPlatforms: q.recommendedPlatforms,
          platformRecommendations: q.platformRecommendations,
          niche: q.niche,
          contentTypeSuggestion: q.contentTypeSuggestion,
          whyRelevant: q.whyRelevant,
        },
      };
    });

    // Combine trends and questions
    selectorTrends = [...selectorTrends, ...mappedQuestions];

    const momentumGroups = ['rising', 'stable', 'cooling'] as const;
    const trendGroups: OrganicTrendGroup[] = momentumGroups
      .map((momentum) => {
        const items = selectorTrends.filter(
          (t) => t.momentum === momentum && !t.tags.includes('question'),
        );
        return {
          id: momentum,
          title:
            momentum === 'rising'
              ? 'Rising Now'
              : momentum === 'stable'
                ? 'Stable Interest'
                : 'Cooling Down',
          trends: items,
        };
      })
      .filter((group) => group.trends.length > 0);

    const mappedEvents = insights.data.trendsAndEvents.events.map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.description ?? e.opportunity ?? 'Seasonal event or holiday',
      momentum: 'rising' as const,
      platforms: fallbackPlatforms,
      tags: ['event', e.date ?? ''],
      meta: {
        kind: 'event' as const,
        confidence: e.confidence,
        source: e.source,
        sourceUrl: e.sourceUrl,
        relevanceToBrand: e.relevanceToBrand,
        analysisTags: e.analysisTags,
        signalWindowStart: e.signalWindowStart,
        signalWindowEnd: e.signalWindowEnd,
        sourceSignalCount: e.sourceSignalCount,
        recommendedPlatforms: e.recommendedPlatforms,
        platformRecommendations: e.platformRecommendations,
        opportunity: e.opportunity,
        eventDate: e.date,
      },
    }));

    selectorTrends = [...selectorTrends, ...mappedEvents];

    trendTypes = [
      ...(trendGroups.length > 0
        ? [
            {
              id: 'trends',
              label: 'Market Trends',
              groups: trendGroups,
            },
          ]
        : []),
      ...(mappedEvents.length > 0
        ? [
            {
              id: 'events',
              label: 'Key Events',
              groups: [
                {
                  id: 'all-events',
                  title: 'Upcoming Events',
                  trends: mappedEvents,
                },
              ],
            },
          ]
        : []),
      ...(mappedQuestions.length > 0
        ? [
            {
              id: 'questions',
              label: 'Audience Questions',
              groups: [
                {
                  id: 'all-questions',
                  title: 'Questions by Niche',
                  trends: mappedQuestions,
                },
              ],
            },
          ]
        : []),
    ];
  } else if (insightsResult.status === 'rejected') {
    const reason = insightsResult.reason;
    insightsError =
      reason instanceof Error ? reason.message : 'Unable to load brand insights for this brand.';
  }

  // If insights failed (or had no data), still surface documents if available.
  if (!organicAgentMentionContext && brandDocuments.length > 0) {
    organicAgentMentionContext = {
      trends: [],
      events: [],
      questions: [],
      documents: brandDocuments,
    };
  } else if (organicAgentMentionContext && !organicAgentMentionContext.documents) {
    organicAgentMentionContext = { ...organicAgentMentionContext, documents: brandDocuments };
  }

  const showNoTrendsMessage = selectorTrends.length === 0;
  const metricAccountsByPlatform = deriveMetricAccountsByPlatform({
    integrationSummary,
    onboardingConnections: {
      instagram: onboarding.connections.instagram,
      facebook: onboarding.connections.facebook,
      tiktok: onboarding.connections.tiktok,
    },
  });
  const initialMetricsPlatform: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin' =
    metricAccountsByPlatform.instagram.length > 0
      ? 'instagram'
      : metricAccountsByPlatform.tiktok.length > 0
        ? 'tiktok'
        : metricAccountsByPlatform.youtube.length > 0
          ? 'youtube'
          : metricAccountsByPlatform.linkedin.length > 0
            ? 'linkedin'
            : 'facebook';

  return (
    <div className="h-full min-h-0">
      <OrganicNoticeBridge
        brandId={brandProfileId}
        insightsError={insightsError}
        showNoTrendsMessage={showNoTrendsMessage}
      />
      <OrganicWorkspaceTabs
        brandId={brandProfileId}
        plannerSlot={
          <OrganicCalendarWorkspace
            trendTypes={trendTypes}
            trends={selectorTrends}
            // The planner adds Instagram as its usable empty-state row. Passing
            // every MVP platform here would falsely present disconnected
            // LinkedIn as active; trend suggestions can still use the broader
            // fallback platform set above.
            activePlatforms={activePlatformKeys}
            platformAccountIds={platformAccountIds}
            platformAccountOptions={platformAccountOptions}
            maxTrendSelections={5}
            brandProfileId={brandProfileId}
            brandName={brandName}
            initialSelectedDraftId={initialSelectedDraftId}
            initialWeekStart={initialWeekStart}
            initialView={initialView}
            initialComposeTrendId={initialComposeTrendId}
            initialComposePlatform={initialComposePlatform}
            postedContentAccountsByPlatform={metricAccountsByPlatform}
            insightsError={insightsError}
          />
        }
        metricsSlot={
          <OrganicMetricsDashboardLazy
            brandId={brandProfileId}
            accountsByPlatform={metricAccountsByPlatform}
            initialPlatform={initialMetricsPlatform}
            brandInsights={
              insights
                ? {
                    trendsAndEvents: insights.data.trendsAndEvents,
                    questionsByNiche: insights.data.questionsByNiche,
                    generatedAt: insights.data.trendsAndEvents.generatedAt ?? insights.generatedAt,
                    status: insights.data.trendsAndEvents.status ?? insights.status,
                    weekStartDate: insights.data.weekStartDate,
                    weeks: insights.data.weeks,
                    generationKind: insights.data.generationKind,
                    generationCount: insights.data.generationCount,
                  }
                : {
                    trendsAndEvents: {
                      trends: [],
                      events: [],
                    },
                    questionsByNiche: { questionsByNiche: {} },
                  }
            }
          />
        }
        metricsPrefetchParams={{
          brandId: brandProfileId,
          integrationAccountId:
            metricAccountsByPlatform[initialMetricsPlatform][0]?.integrationAccountId ?? '',
          platform: initialMetricsPlatform,
        }}
        agentSlot={
          <OrganicAgentPanelLazy
            brandId={brandProfileId}
            platformAccountIds={platformAccountIds}
            mentionContext={organicAgentMentionContext}
            initialSessionId={initialAgentSessionId}
          />
        }
      />
    </div>
  );
}

const VALID_VIEWS = ['week', 'month', 'list'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrganicPage({ searchParams }: OrganicPageProps) {
  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};
  const initialSelectedDraftIdRaw = resolvedSearchParams.draftId;
  const initialWeekStartRaw = resolvedSearchParams.weekStartId ?? resolvedSearchParams.weekStart;
  const initialViewRaw = resolvedSearchParams.view;
  const composeTrendIdRaw = resolvedSearchParams.composeTrendId;
  const composePlatformRaw = resolvedSearchParams.composePlatform;
  const initialSelectedDraftId =
    typeof initialSelectedDraftIdRaw === 'string' && initialSelectedDraftIdRaw.trim().length > 0
      ? initialSelectedDraftIdRaw
      : null;
  const initialWeekStart =
    typeof initialWeekStartRaw === 'string' && initialWeekStartRaw.trim().length > 0
      ? initialWeekStartRaw
      : null;
  const initialView: 'week' | 'month' | 'list' =
    typeof initialViewRaw === 'string' &&
    (VALID_VIEWS as readonly string[]).includes(initialViewRaw)
      ? (initialViewRaw as 'week' | 'month' | 'list')
      : 'month';
  // Dashboard "Generate from this trend" deep link — only real (uuid) trend ids
  // can anchor a one-shot generation, so anything else is dropped here.
  const initialComposeTrendId =
    typeof composeTrendIdRaw === 'string' && UUID_RE.test(composeTrendIdRaw)
      ? composeTrendIdRaw
      : null;
  const initialComposePlatform =
    typeof composePlatformRaw === 'string' &&
    (ORGANIC_MVP_PLATFORM_KEYS as readonly string[]).includes(composePlatformRaw)
      ? (composePlatformRaw as OrganicPlatformKey)
      : null;
  // Agent deep link (completion toasts emit /organic?tab=agent&sessionId=...).
  const agentSessionIdRaw = resolvedSearchParams.sessionId;
  const initialAgentSessionId =
    typeof agentSessionIdRaw === 'string' && agentSessionIdRaw.trim().length > 0
      ? agentSessionIdRaw
      : null;

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden px-2 pb-2 sm:px-3 lg:px-4">
      <Suspense fallback={<OrganicContentSkeleton view={initialView} />}>
        <OrganicContent
          initialSelectedDraftId={initialSelectedDraftId}
          initialWeekStart={initialWeekStart}
          initialView={initialView}
          initialComposeTrendId={initialComposeTrendId}
          initialComposePlatform={initialComposePlatform}
          initialAgentSessionId={initialAgentSessionId}
        />
      </Suspense>
    </div>
  );
}
