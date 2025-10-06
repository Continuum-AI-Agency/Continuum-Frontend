import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export const metadata = {
  title: "Onboarding | Continuum AI",
};

export default function OnboardingPage() {
  return (
    <div className="min-h-screen py-10">
      <Container size="3">
        <Flex direction="column" gap="5">
          <div>
            <Heading size="7">Get started</Heading>
            <Text color="gray">Connect your accounts and create your first Brand Profile.</Text>
          </div>
          <OnboardingFlow />
        </Flex>
      </Container>
    </div>
  );
}


