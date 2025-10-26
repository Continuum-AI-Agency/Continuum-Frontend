import type { Metadata } from "next";
import OnboardingGate from "../../components/OnboardingGate";
import { DashboardLayoutClient } from "../../components/DashboardLayoutClient";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { isOnboardingComplete } from "@/lib/onboarding/state";
import { fetchOnboardingMetadata } from "@/lib/onboarding/storage";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <OnboardingGate>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </OnboardingGate>
  );
}
const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const activeState = metadata.brands[activeBrandId];
  if (!activeState || !isOnboardingComplete(activeState)) {
    redirect(`/onboarding?brand=${activeBrandId}`);
  }

  const brandSummaries = Object.entries(metadata.brands).map(([id, state]) => ({
    id,
    name: state.brand.name || "Untitled brand",
    completed: isOnboardingComplete(state),
  }));

  return (
    <DashboardLayoutShell
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
    >
      {children}
    </DashboardLayoutShell>
  );
}
