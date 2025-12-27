import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { BrandIntegrationsSection } from "@/components/settings/BrandIntegrationsSection";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const revalidate = 0;

export default async function IntegrationsSettingsPage() {
  const { activeBrandId } = await getActiveBrandContext();

  if (!activeBrandId) {
    return (
      <Container size="3" className="py-10">
        <Heading size="6">Integrations</Heading>
        <Text color="gray">Create a brand profile to connect integrations.</Text>
      </Container>
    );
  }

  await ensureOnboardingState(activeBrandId);
  const integrationSummary = await fetchBrandIntegrationSummary(activeBrandId);

  return (
    <Container size="3" className="py-10">
      <Flex direction="column" gap="4">
        <div>
          <Heading size="7" className="text-white">Integrations</Heading>
          <Text color="gray">
            Manage connections shared with the active brand and add personal accounts for future assignments.
          </Text>
        </div>
        <BrandIntegrationsSection initialSummary={integrationSummary} />
      </Flex>
    </Container>
  );
}
