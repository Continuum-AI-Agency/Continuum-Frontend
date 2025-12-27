import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveBrandId } from "@/lib/brands/resolve-active-brand";
import { setActiveBrand } from "@/lib/onboarding/storage";
import type { BrandSummary } from "@/lib/repositories/brandProfile";

export type ActiveBrandContext = {
  activeBrandId: string | null;
  brandSummaries: BrandSummary[];
  permissions: Array<{
    brand_profile_id: string;
    role: string | null;
    tier: number | null;
  }>;
};

export const getActiveBrandContext = cache(async (): Promise<ActiveBrandContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: perms, error: permsError } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("brand_profile_id, role, tier")
    .eq("user_id", user.id);

  if (permsError) {
    console.error("[activeBrand] permissions query failed", permsError);
  }

  const brandIds = Array.from(new Set((perms ?? []).map((p) => p.brand_profile_id))).filter(
    (id): id is string => Boolean(id)
  );

  let brandNameMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands, error: brandsError } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .select("id, brand_name")
      .in("id", brandIds);
    if (brandsError) {
      console.error("[activeBrand] brand_profiles lookup failed", brandsError);
    } else {
      brandNameMap = new Map(
        (brands ?? []).map((brand) => [brand.id, brand.brand_name ?? "Untitled brand"])
      );
    }
  }

  const brandSummaries: BrandSummary[] = brandIds.map((id) => ({
    id,
    name: brandNameMap.get(id) ?? "Untitled brand",
    completed: true,
  }));

  if (brandIds.length === 0) {
    return { activeBrandId: null, brandSummaries, permissions: perms ?? [] };
  }

  const { data: activeBrandData, error: activeBrandError } = await supabase
    .schema("brand_profiles")
    .rpc("get_active_brand_id");

  if (activeBrandError) {
    console.error("[activeBrand] active brand rpc failed", activeBrandError);
  }

  const { activeBrandId, shouldPersist } = resolveActiveBrandId({
    candidateBrandId: typeof activeBrandData === "string" ? activeBrandData : null,
    permittedBrandIds: brandIds,
  });

  if (activeBrandId && shouldPersist) {
    await setActiveBrand(activeBrandId);
  }

  return { activeBrandId, brandSummaries, permissions: perms ?? [] };
});
