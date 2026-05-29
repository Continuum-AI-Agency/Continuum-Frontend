import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { BrandAssetAssigner } from "@/components/integrations/BrandAssetAssigner";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

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
            Create a brand profile in settings to manage integrations. Once a brand is active you can connect
            accounts and assign them here.
          </Text>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="4" className="py-10">
      <Flex direction="column" gap="4">
        <div>
          <Heading size="6" className="text-white">
            Integrations
          </Heading>
          <Text color="gray">
            Connect your ad and social accounts, then tag the ones this brand should use. You can change this
            any time.
          </Text>
        </div>
        <BrandAssetAssigner brandId={activeBrandId} className="flex flex-col gap-6" />
      </Flex>
    </Container>
  );
}
