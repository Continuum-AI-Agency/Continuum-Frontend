import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { isOnboardingComplete, type OnboardingMetadata, type OnboardingState } from "@/lib/onboarding/state";
import { fetchOnboardingMetadata, ensureOnboardingState } from "@/lib/onboarding/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LOGIN_GLOW_GRADIENT } from "@/lib/ui/backgrounds";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/login");
  }

  const metadata: OnboardingMetadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const { state: activeState } = await ensureOnboardingState(activeBrandId);
  metadata.brands[activeBrandId] = activeState;

  const brandSummaries = Object.keys(metadata.brands).map((id) => {
    const state = metadata.brands[id] as OnboardingState;
    return {
      id,
      name: state.brand.name || "Untitled brand",
      completed: isOnboardingComplete(state),
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 overflow-hidden" style={{ backgroundImage: LOGIN_GLOW_GRADIENT }}>
      <DashboardLayoutShell
        activeBrandId={activeBrandId}
        brandSummaries={brandSummaries}
      >
        {children}
      </DashboardLayoutShell>
    </div>
  );
}
