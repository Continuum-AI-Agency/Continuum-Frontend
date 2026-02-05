import { redirect } from "next/navigation";
import { Container, Flex, Heading, Text, Box } from "@radix-ui/themes";
import OnboardingContainer from "@/components/onboarding/OnboardingContainer";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import { ActiveBrandProvider } from "@/components/providers/ActiveBrandProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandSwitcher } from "@/components/navigation/BrandSwitcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const metadata = {
  title: "Onboarding | Continuum AI",
};

type OnboardingPageProps = {
  searchParams?: Promise<{
    brand?: string;
  }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const brandIdParam =
    typeof resolvedSearchParams?.brand === "string" ? resolvedSearchParams.brand : undefined;
  
  const { brandSummaries } = await getActiveBrandContext();
  const { brandId, state } = await ensureOnboardingState(brandIdParam);

  if (isOnboardingComplete(state)) {
    redirect("/dashboard");
  }

  return (
    <OnboardingGate>
      <ActiveBrandProvider activeBrandId={brandId} brandSummaries={brandSummaries} user={user}>
        <SidebarProvider defaultOpen={false}>
          <Container size="3" className="py-10">
            <Flex direction="column" gap="5">
              <Flex align="center" justify="between">
                <Box>
                  <Heading size="7">Get started</Heading>
                  <Text color="gray">Connect your accounts and create your first Brand Profile.</Text>
                </Box>
                <Box className="w-64">
                  <BrandSwitcher />
                </Box>
              </Flex>
              <OnboardingContainer brandId={brandId} initialState={state} />
            </Flex>
          </Container>
        </SidebarProvider>
      </ActiveBrandProvider>
    </OnboardingGate>
  );
}
