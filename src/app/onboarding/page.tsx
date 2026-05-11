import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingExperience } from "@/components/onboarding/v2/OnboardingExperience";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import { ActiveBrandProvider } from "@/components/providers/ActiveBrandProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const metadata: Metadata = {
  title: "Onboarding | Continuum AI",
};

type OnboardingPageProps = {
  searchParams?: Promise<{ brand?: string }>;
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

  const { brand: brandIdParam } = (searchParams ? await searchParams : {}) as { brand?: string };
  const { brandSummaries, permissions } = await getActiveBrandContext();
  const { brandId, state } = await ensureOnboardingState(brandIdParam);

  if (isOnboardingComplete(state)) {
    redirect("/dashboard");
  }

  const defaultUrl = inferDomainFromEmail(user.email);

  return (
    <ActiveBrandProvider
      activeBrandId={brandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
    >
      <OnboardingExperience brandId={brandId} initialState={state} defaultUrl={defaultUrl} />
    </ActiveBrandProvider>
  );
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "live.com",
  "me.com",
]);

function inferDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}
