import { redirect } from "next/navigation";
import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { isOnboardingComplete } from "@/lib/onboarding/state";

export const metadata = {
  title: "Onboarding | Continuum AI",
};

type OnboardingPageProps = {
  searchParams?: Promise<{
    brand?: string;
  }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const brandIdParam =
    typeof resolvedSearchParams?.brand === "string" ? resolvedSearchParams.brand : undefined;
  const { brandId, state } = await ensureOnboardingState(brandIdParam);

  if (isOnboardingComplete(state)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen py-10">
      <Container size="3">
        <Flex direction="column" gap="5">
          <div>
            <Heading size="7">Get started</Heading>
            <Text color="gray">Connect your accounts and create your first Brand Profile.</Text>
          </div>
          <OnboardingFlow brandId={brandId} initialState={state} />
        </Flex>
      </Container>
    </div>
  );
}
