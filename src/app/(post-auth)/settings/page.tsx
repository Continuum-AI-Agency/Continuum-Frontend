import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { fetchOnboardingMetadata } from "@/lib/onboarding/storage";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import BrandSettingsPanel from "@/components/settings/BrandSettingsPanel";

export default async function SettingsPage() {
  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;

  if (!activeBrandId) {
    return (
      <Container size="3" className="py-10">
        <Heading size="6">Settings</Heading>
        <Text color="gray">Set up a brand profile to unlock settings.</Text>
      </Container>
    );
  }

  const brandSummaries = Object.entries(metadata.brands).map(([id, state]) => ({
    id,
    name: state.brand.name || "Untitled brand",
    completed: isOnboardingComplete(state),
  }));

  const activeState = metadata.brands[activeBrandId];

  return (
    <Container size="3" className="py-10">
      <Flex direction="column" gap="6">
        <div>
          <Heading size="7">Settings</Heading>
          <Text color="gray">Invite teammates, manage brand profiles, and update workspace details.</Text>
        </div>
        <BrandSettingsPanel
          data={{
            activeBrandId,
            brandSummaries,
            brandName: activeState.brand.name,
            members: activeState.members,
            invites: activeState.invites,
          }}
        />
      </Flex>
    </Container>
  );
}
