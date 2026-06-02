import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveActiveBrandId } from "@/lib/brands/resolve-active-brand";
import { setActiveBrandPreference } from "@/lib/brands/preferences";
import type { BrandSummary } from "@/lib/repositories/brandProfile";
import { requireClaimsIdentity } from "@/lib/auth/claims";
import type { AuthIdentity } from "@/lib/auth/identity";

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
  user: AuthIdentity | null;
};

type BrandPermissionRow = {
  brand_profile_id: string;
  role: string | null;
};

type BrandInviteRow = {
  brand_profile_id: string;
  role: string | null;
};

function isStatementTooComplex(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: string }).code === "54001";
}

async function fetchAccessibleBrandRows(user: AuthIdentity, supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
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

  if (!isStatementTooComplex(permsError) && !isStatementTooComplex(invitesError)) {
    return {
      permissions: (perms ?? []) as BrandPermissionRow[],
      invites: (invites ?? []) as BrandInviteRow[],
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const [{ data: adminPerms, error: adminPermsError }, { data: adminInvites, error: adminInvitesError }] =
      await Promise.all([
        admin
          .schema("brand_profiles")
          .from("permissions")
          .select("brand_profile_id, role")
          .eq("user_id", user.id),
        admin
          .schema("brand_profiles")
          .from("invites")
          .select("brand_profile_id, role")
          .eq("email", user.email ?? "")
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);

    if (adminPermsError) {
      console.error("[activeBrand] admin fallback permissions query failed", adminPermsError);
    }
    if (adminInvitesError) {
      console.error("[activeBrand] admin fallback invites query failed", adminInvitesError);
    }

    return {
      permissions: (adminPerms ?? []) as BrandPermissionRow[],
      invites: (adminInvites ?? []) as BrandInviteRow[],
    };
  } catch (error) {
    console.error("[activeBrand] admin fallback failed", describeError(error));
    return {
      permissions: (perms ?? []) as BrandPermissionRow[],
      invites: (invites ?? []) as BrandInviteRow[],
    };
  }
}

export const getActiveBrandContext = cache(async (): Promise<ActiveBrandContext> => {
  const supabase = await createSupabaseServerClient();
  const user = await requireClaimsIdentity();

  const { permissions: perms, invites } = await fetchAccessibleBrandRows(user, supabase);

  const permittedIds = (perms ?? []).map((p) => p.brand_profile_id);
  const invitedIds = (invites ?? []).map((i) => i.brand_profile_id);
  
  const allBrandIds = Array.from(new Set([...permittedIds, ...invitedIds])).filter(
    (id): id is string => Boolean(id)
  );

  let brandMap = new Map<string, { name: string; logoPath: string | null; tier: number; completedAt: string | null }>();

  // Run brand_profiles lookup and get_active_brand_id RPC in parallel — both only need
  // allBrandIds / permittedIds from the previous step, with no dependency on each other.
  const [brandsResult, activeBrandResult] = await Promise.all([
    allBrandIds.length > 0
      ? supabase
          .schema("brand_profiles")
          .from("brand_profiles")
          .select("id, brand_name, logo_path, tier, completed_at")
          .in("id", allBrandIds)
      : Promise.resolve({ data: [] as Array<{ id: string; brand_name: string | null; logo_path: string | null; tier: number; completed_at: string | null }>, error: null }),
    permittedIds.length > 0
      ? supabase.schema("brand_profiles").rpc("get_active_brand_id")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (brandsResult.error) {
    console.error("[activeBrand] brand_profiles lookup failed", brandsResult.error);
  } else {
    brandMap = new Map(
      (brandsResult.data ?? []).map((brand) => [
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

  // Batch logo signing: one request for all brands instead of N individual calls.
  const pathsToSign = allBrandIds
    .map((id) => brandMap.get(id)?.logoPath)
    .filter((p): p is string => Boolean(p));

  const signedUrlMap = new Map<string, string>();
  if (pathsToSign.length > 0) {
    try {
      const { data: signedUrls, error: signError } = await supabase.storage
        .from("brand-profile-assets")
        .createSignedUrls(pathsToSign, 604800);
      if (!signError && signedUrls) {
        for (const item of signedUrls) {
          if (item.signedUrl && item.path) signedUrlMap.set(item.path, item.signedUrl);
        }
      }
    } catch (e) {
      console.error("[activeBrand] Failed to batch sign URLs", e);
    }
  }

  const brandSummaries: BrandSummary[] = allBrandIds.flatMap((id) => {
    const brandData = brandMap.get(id);
    if (!brandData) return [];

    const logoPath = brandData.logoPath;
    const isPending = !permittedIds.includes(id);

    return [{
      id,
      name: brandData.name,
      completed: brandData.completedAt !== null,
      logoPath,
      logoUrl: logoPath ? signedUrlMap.get(logoPath) ?? null : null,
      isPending,
    }];
  });

  if (permittedIds.length === 0) {
    return {
      activeBrandId: null,
      brandSummaries,
      permissions: perms ?? [],
      activeBrandTier: 0,
      user
    };
  }

  const { data: activeBrandData, error: activeBrandError } = activeBrandResult;

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
