import { Callout, Heading } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";

import { OrganicExperience } from "@/components/organic/OrganicExperience";
import { BrandInsightsSignalsPanel } from "@/components/brand-insights/BrandInsightsSignalsPanel";
import { BrandInsightsAutoGenerate } from "@/components/brand-insights/BrandInsightsAutoGenerate";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  ORGANIC_PLATFORMS,
  ORGANIC_PLATFORM_KEYS,
  type OrganicPlatformKey,
} from "@/lib/organic/platforms";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import type { Trend } from "@/lib/organic/trends";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { redirect } from "next/navigation";
import { shouldAutoGenerateBrandInsights } from "@/lib/brand-insights/auto-generate";

export default async function OrganicPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }
  const { brandId, state: onboarding } = await ensureOnboardingState(activeBrandId);
  const brandProfileId = brandId;

  const platformAccounts = ORGANIC_PLATFORMS.map(({ key, label }) => {
    const connection = onboarding.connections[key] ?? { connected: false, accountId: null };
    return {
      platform: key as OrganicPlatformKey,
      label,
      connected: Boolean(connection.connected),
      accountId: connection.accountId ?? null,
    };
  });

  const brandDescription = [
    onboarding.brand.industry,
    onboarding.brand.targetAudience,
    onboarding.brand.brandVoice ?? undefined,
  ]
    .filter(Boolean)
    .join(" • ");

  try {
    const insights = await fetchBrandInsights(brandProfileId, { revalidateSeconds: 300 });
    const trendsAndEvents = insights.data.trendsAndEvents;
    const questionsByNiche = insights.data.questionsByNiche;
    const brandTrends = trendsAndEvents.trends;
    const activePlatformKeys = platformAccounts
      .filter((account) => account.connected && account.accountId)
      .map((account) => account.platform);
    const fallbackPlatforms =
      activePlatformKeys.length > 0 ? activePlatformKeys : [...ORGANIC_PLATFORM_KEYS];

    const selectorTrends: Trend[] = brandTrends.map((trend) => ({
      id: trend.id,
      title: trend.title,
      summary: trend.description ?? trend.relevanceToBrand ?? "High-signal topic identified for your brand.",
      momentum: trend.isSelected ? "rising" : "stable",
      platforms: fallbackPlatforms,
      tags: trend.source ? [trend.source] : [],
    }));

    const shouldAutoGenerateInsights = shouldAutoGenerateBrandInsights({
      insights,
      errorMessage: null,
    });

    return (
      <div className="space-y-4 w-full max-w-none px-2 sm:px-3 lg:px-4">
        <BrandInsightsAutoGenerate
          brandId={brandProfileId}
          shouldGenerate={shouldAutoGenerateInsights}
        />
        <BrandInsightsSignalsPanel
          trends={brandTrends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          country={trendsAndEvents.country ?? insights.data.country}
          weekStartDate={insights.data.weekStartDate}
          generatedAt={trendsAndEvents.generatedAt ?? insights.generatedAt}
          status={trendsAndEvents.status}
          brandId={brandProfileId}
        />
        <GlassPanel className="p-6">
          <OrganicExperience
            brandName={onboarding.brand.name}
            brandDescription={brandDescription}
            platformAccounts={platformAccounts}
            brandProfileId={brandProfileId}
            trends={selectorTrends}
          />
        </GlassPanel>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load brand insights for this brand.";
    const shouldAutoGenerateInsights = shouldAutoGenerateBrandInsights({
      insights: null,
      errorMessage: message,
    });
    return (
      <div className="space-y-4 w-full max-w-none px-2 sm:px-3 lg:px-4">
        <BrandInsightsAutoGenerate
          brandId={brandProfileId}
          shouldGenerate={shouldAutoGenerateInsights}
        />
        <Heading size="6" className="text-white">
          Organic Planner
        </Heading>
        <Callout.Root color="red" variant="surface">
          <Callout.Icon>
            <LightningBoltIcon />
          </Callout.Icon>
          <Callout.Text>{message}</Callout.Text>
        </Callout.Root>
      </div>
    );
  }
}
