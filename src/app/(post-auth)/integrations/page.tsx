import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { BrandIntegrationsCard } from "@/components/settings/BrandIntegrationsCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const revalidate = 0;

export default async function IntegrationsPage() {
  const { activeBrandId } = await getActiveBrandContext();

  if (!activeBrandId) {
    return (
      <Container size="4" className="py-10">
        <Flex direction="column" gap="3">
          <Heading size="6" className="text-white">
            Integrations
          </Heading>
          <Text color="gray">
            Create a brand profile in settings to manage integrations. Once a brand is active you can assign OAuth
            connections and business accounts here.
          </Text>
        </Flex>
      </Container>
    );
  }

  const integrationSummary = await fetchBrandIntegrationSummary(activeBrandId);

  return (
    <Container size="4" className="py-10">
      <Flex direction="column" gap="4">
        <Heading size="6" className="text-white">
          Integrations
        </Heading>
        <Text color="gray">
          Manage which social and ads accounts are linked to your active brand profile. OAuth flows remain managed
          centrally by Continuum.
        </Text>
        <GlassPanel className="p-6">
          <BrandIntegrationsCard summary={integrationSummary} showHeader={false} />
        </GlassPanel>
      </Flex>
    </Container>
  );
}
