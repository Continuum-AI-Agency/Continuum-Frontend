import { Callout, Container, Heading } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";

import { OrganicExperience } from "@/components/organic/OrganicExperience";
import { BrandEventsPanel } from "@/components/brand-insights/BrandEventsPanel";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  ORGANIC_PLATFORMS,
  ORGANIC_PLATFORM_KEYS,
  type OrganicPlatformKey,
} from "@/lib/organic/platforms";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import type { Trend } from "@/lib/organic/trends";

export default async function OrganicPage() {
  const { brandId, state: onboarding } = await ensureOnboardingState();
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

    return (
      <div className="space-y-4 w-full max-w-none px-2 sm:px-3 lg:px-4">
        <BrandTrendsPanel
          trends={brandTrends}
          country={trendsAndEvents.country ?? insights.data.country}
          weekStartDate={insights.data.weekStartDate}
          generatedAt={trendsAndEvents.generatedAt ?? insights.generatedAt}
          status={trendsAndEvents.status}
          brandId={brandProfileId}
        />
        <BrandEventsPanel
          events={trendsAndEvents.events}
          country={trendsAndEvents.country ?? insights.data.country}
          weekStartDate={insights.data.weekStartDate}
          generatedAt={trendsAndEvents.generatedAt ?? insights.generatedAt}
          status={trendsAndEvents.status}
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
    return (
      <div className="space-y-4 w-full max-w-none px-2 sm:px-3 lg:px-4">
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
