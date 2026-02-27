import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveBrandId } from "@/lib/brands/resolve-active-brand";
import { setActiveBrandPreference } from "@/lib/brands/preferences";
import type { BrandSummary } from "@/lib/repositories/brandProfile";
import type { User } from "@supabase/supabase-js";

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const value = error as { message?: string; code?: string; hint?: string; details?: string };
    const parts = [
      value.message,
      value.code ? `code=${value.code}` : null,
      value.details ? `details=${value.details}` : null,
      value.hint ? `hint=${value.hint}` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Unknown error";
}

export type ActiveBrandContext = {
  activeBrandId: string | null;
  brandSummaries: BrandSummary[];
  permissions: Array<{
    brand_profile_id: string;
    role: string | null;
  }>;
  activeBrandTier: number;
  user: User | null;
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

  const [{ data: perms, error: permsError }, { data: invites, error: invitesError }] = await Promise.all([
    supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("brand_profile_id, role")
      .eq("user_id", user.id),
    supabase
      .schema("brand_profiles")
      .from("invites")
      .select("brand_profile_id, role")
      .eq("email", user.email ?? "")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  if (permsError) {
    console.error("[activeBrand] permissions query failed", permsError);
  }
  if (invitesError) {
    console.error("[activeBrand] invites query failed", invitesError);
  }

  const permittedIds = (perms ?? []).map((p) => p.brand_profile_id);
  const invitedIds = (invites ?? []).map((i) => i.brand_profile_id);
  
  const allBrandIds = Array.from(new Set([...permittedIds, ...invitedIds])).filter(
    (id): id is string => Boolean(id)
  );

  let brandMap = new Map<string, { name: string; logoPath: string | null; tier: number; completedAt: string | null }>();
  if (allBrandIds.length > 0) {
    const { data: brands, error: brandsError } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .select("id, brand_name, logo_path, tier, completed_at")
      .in("id", allBrandIds);
    if (brandsError) {
      console.error("[activeBrand] brand_profiles lookup failed", brandsError);
    } else {
      brandMap = new Map(
        (brands ?? []).map((brand) => [
          brand.id,
          {
            name: brand.brand_name ?? "Untitled brand",
            logoPath: brand.logo_path ?? null,
            tier: brand.tier,
            completedAt: brand.completed_at ?? null,
          },
        ])
      );
    }
  }

  const brandSummaries: BrandSummary[] = (await Promise.all(
    allBrandIds.map(async (id) => {
      const brandData = brandMap.get(id);
      
      if (!brandData?.completedAt) {
        return null;
      }

      const name = brandData.name;
      const logoPath = brandData.logoPath;
      let logoUrl = null;

      if (logoPath) {
        try {
          const { data, error: urlError } = await supabase.storage
            .from("brand-profile-assets")
            .createSignedUrl(logoPath, 604800);

          if (!urlError && data?.signedUrl) {
            logoUrl = data.signedUrl;
          }
        } catch (e) {
          console.error(`[activeBrand] Failed to sign URL for ${logoPath}`, e);
        }
      }

      const isPending = !permittedIds.includes(id);

      const summary: BrandSummary = {
        id,
        name,
        completed: true,
        logoPath,
        logoUrl,
        isPending,
      };

      return summary;
    })
  )).filter((b): b is BrandSummary => b !== null);

  if (permittedIds.length === 0) {
    return { 
      activeBrandId: null, 
      brandSummaries, 
      permissions: perms ?? [], 
      activeBrandTier: 0,
      user
    };
  }

  const { data: activeBrandData, error: activeBrandError } = await supabase
    .schema("brand_profiles")
    .rpc("get_active_brand_id");

  if (activeBrandError) {
    console.error("[activeBrand] active brand rpc failed", activeBrandError);
  }

  const { activeBrandId, shouldPersist } = resolveActiveBrandId({
    candidateBrandId: typeof activeBrandData === "string" ? activeBrandData : null,
    permittedBrandIds: permittedIds,
  });

  if (activeBrandId && shouldPersist) {
    try {
      await setActiveBrandPreference(activeBrandId);
    } catch (e) {
      console.error("[activeBrand] Failed to persist active brand preference:", describeError(e));
    }
  }

  const activeBrandTier = activeBrandId ? brandMap.get(activeBrandId)?.tier ?? 0 : 0;
  return { activeBrandId, brandSummaries, permissions: perms ?? [], activeBrandTier, user };
});
