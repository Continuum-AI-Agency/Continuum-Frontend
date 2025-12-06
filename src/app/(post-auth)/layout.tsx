import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { isOnboardingComplete, type OnboardingMetadata, type OnboardingState } from "@/lib/onboarding/state";
import { fetchOnboardingMetadata, ensureOnboardingState, setActiveBrand } from "@/lib/onboarding/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  // Source of truth: brand_profiles.permissions
  const { data: perms, error: permsError } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("brand_profile_id, role, tier, brand_profiles!inner(id, brand_name)")
    .eq("user_id", data.user.id);

  if (permsError) {
    console.error("[layout] permissions query failed", permsError);
    redirect("/login");
  }

  type PermissionRow = {
    brand_profile_id: string;
    brand_profiles?: { id: string; brand_name: string | null } | null;
  };

  const permittedBrandSummaries = (perms ?? []).map((p) => ({
    id: p.brand_profile_id,
    name: (p as PermissionRow["brand_profiles"] | undefined)?.brand_name ?? "Untitled brand",
    completed: true, // assume usable; detailed completion not required for switcher
  }));

  if (permittedBrandSummaries.length === 0) {
    redirect("/onboarding");
  }

  const metadata: OnboardingMetadata = await fetchOnboardingMetadata();
  let activeBrandId = metadata.activeBrandId;
  const allowedIds = new Set(permittedBrandSummaries.map((b) => b.id));
  if (!activeBrandId || !allowedIds.has(activeBrandId)) {
    activeBrandId = permittedBrandSummaries[0]?.id;
    if (activeBrandId) {
      await setActiveBrand(activeBrandId);
    }
  }

  const { state: activeState } = await ensureOnboardingState(activeBrandId);
  metadata.brands[activeBrandId] = activeState;

  const brandSummaries = Object.keys(metadata.brands)
    .filter((id) => allowedIds.has(id))
    .map((id) => {
      const state = metadata.brands[id] as OnboardingState;
      return {
        id,
        name: state.brand.name || "Untitled brand",
        completed: isOnboardingComplete(state),
      };
    });

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <DashboardLayoutShell
        activeBrandId={activeBrandId}
        brandSummaries={brandSummaries}
      >
        {children}
      </DashboardLayoutShell>
    </div>
  );
}
