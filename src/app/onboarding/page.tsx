import { redirect } from "next/navigation";
import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import OnboardingContainer from "@/components/onboarding/OnboardingContainer";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import { ActiveBrandProvider } from "@/components/providers/ActiveBrandProvider";
import type { BrandSummary } from "@/lib/repositories/brandProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const [{ brandId, state }, { data: perms }] = await Promise.all([
    ensureOnboardingState(brandIdParam),
    supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("brand_profile_id")
      .eq("user_id", user.id),
  ]);

  if (isOnboardingComplete(state)) {
    redirect("/dashboard");
  }

  const permittedBrandIds = new Set<string>(
    (perms ?? [])
      .map(record => record.brand_profile_id)
      .filter((id): id is string => Boolean(id))
  );
  permittedBrandIds.add(brandId);

  const ids = Array.from(permittedBrandIds);

  let brandNameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: brands } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .select("id, brand_name")
      .in("id", ids);

    brandNameMap = new Map((brands ?? []).map(row => [row.id, row.brand_name ?? "Untitled brand"]));
  }

  const brandSummaries: BrandSummary[] = ids.map(id => ({
    id,
    name: brandNameMap.get(id) ?? (id === brandId ? state.brand.name || "Untitled brand" : "Untitled brand"),
    completed: id === brandId ? isOnboardingComplete(state) : true,
  }));

  return (
    <OnboardingGate>
      <ActiveBrandProvider activeBrandId={brandId} brandSummaries={brandSummaries}>
        <Container size="3" className="py-10">
          <Flex direction="column" gap="5">
            <div>
              <Heading size="7">Get started</Heading>
              <Text color="gray">Connect your accounts and create your first Brand Profile.</Text>
            </div>
            <OnboardingContainer brandId={brandId} initialState={state} />
          </Flex>
        </Container>
      </ActiveBrandProvider>
    </OnboardingGate>
  );
}
