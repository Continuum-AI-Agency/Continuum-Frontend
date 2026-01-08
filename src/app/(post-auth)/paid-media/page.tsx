import { redirect } from "next/navigation";

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const dynamic = "force-dynamic";

export default async function PaidMediaPage() {
  const { activeBrandId, permissions } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  const tier = permissions.find((perm) => perm.brand_profile_id === activeBrandId)?.tier ?? 0;
  if (tier === 0) {
    // Redirect back to dashboard with a clear message.
    const msg = encodeURIComponent("Access Restricted: Paid Media is a paid feature. Please contact an Administrator.");
    redirect(`/dashboard?error=${msg}`);
  }

  // For now, redirect to the client component route (which shows placeholder UI)
  redirect("/paid-media/client");
}
