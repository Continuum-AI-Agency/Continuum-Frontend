import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { ensureOnboardingState, fetchOnboardingMetadata } from "@/lib/onboarding/storage";
import { isOnboardingComplete, type OnboardingState, type OnboardingMetadata } from "@/lib/onboarding/state";
import BrandSettingsPanel from "@/components/settings/BrandSettingsPanel";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { BrandIntegrationsCard } from "@/components/settings/BrandIntegrationsCard";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";

export default async function SettingsPage() {
  const metadata: OnboardingMetadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;

  if (!activeBrandId) {
    return (
    <Container size="3" className="py-10">
        <Heading size="6">Settings</Heading>
        <Text color="gray">Set up a brand profile to unlock settings.</Text>
      </Container>
    );
  }

  const brands = metadata.brands as Record<string, OnboardingState>;
  const brandSummaries = Object.keys(brands).map((id) => {
    const state = brands[id];
    return {
      id,
      name: state.brand.name || "Untitled brand",
      completed: isOnboardingComplete(state),
    };
  });

  const { state: activeState } = await ensureOnboardingState(activeBrandId);
  const integrationSummary = await fetchBrandIntegrationSummary(activeBrandId);

  return (
    <Container size="3" className="py-10">
      <Flex direction="column" gap="6">
        <div>
          <Heading size="7" className="text-white">Settings</Heading>
          <Text color="gray">Invite teammates, manage brand profiles, and update workspace details.</Text>
        </div>
        <GlassPanel className="p-6">
          <BrandSettingsPanel
            data={{
              activeBrandId,
              brandSummaries,
              brandName: activeState.brand.name,
              members: activeState.members,
              invites: activeState.invites as OnboardingState["invites"],
            }}
          />
        </GlassPanel>
        <GlassPanel className="p-6">
          <BrandIntegrationsCard summary={integrationSummary} />
        </GlassPanel>
      </Flex>
    </Container>
  );
}
