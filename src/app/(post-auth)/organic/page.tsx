import { Container } from "@radix-ui/themes";
import { GlassPanel } from "@/components/ui/GlassPanel";

import { OrganicExperience } from "@/components/organic/OrganicExperience";
import { ORGANIC_PLATFORMS, type OrganicPlatformKey } from "@/lib/organic/platforms";
import { ensureOnboardingState } from "@/lib/onboarding/storage";

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

  return (
    <Container size="4">
      <GlassPanel className="p-6">
        <OrganicExperience
          brandName={onboarding.brand.name}
          brandDescription={brandDescription}
          platformAccounts={platformAccounts}
          brandProfileId={brandProfileId}
        />
      </GlassPanel>
    </Container>
  );
}
