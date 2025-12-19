import { redirect } from "next/navigation";

import AIStudioClient from "./AIStudioClient";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { fetchOnboardingMetadata } from "@/lib/onboarding/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AIStudioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/login");
  }

  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  const { data: permRow, error: permError } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("tier")
    .eq("brand_profile_id", activeBrandId)
    .eq("user_id", user.id)
    .maybeSingle();

  const tier = permRow?.tier ?? 0;
  if (permError || tier === 0) {
    // Redirect back to dashboard with a clear message.
    const msg = encodeURIComponent("This is a paid feature only. Please contact an Administrator.");
    redirect(`/?error=${msg}`);
  }

  const activeBrandState = metadata.brands[activeBrandId];
  const brandName =
    activeBrandState?.brand?.name && activeBrandState.brand.name.trim().length > 0
      ? activeBrandState.brand.name
      : "Untitled brand";

  return (
    <ClientOnly
      fallback={
        <div className="fixed inset-0 md:left-[88px] flex items-center justify-center bg-slate-950 text-white">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-4 shadow-xl">
            Loading AI Studio…
          </div>
        </div>
      }
    >
      <AIStudioClient brandProfileId={activeBrandId} brandName={brandName} />
    </ClientOnly>
  );
}
