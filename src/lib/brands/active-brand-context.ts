import "server-only";

import { cache } from "react";
import { type Entitlements, entitlementsSchema } from "@continuum/contracts";
import { billingSchema } from "@/lib/billing/supabase-billing";
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
  entitlements: Entitlements | null;
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

async function fetchActiveBrandEntitlements(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  brandId: string,
): Promise<Entitlements | null> {
  try {
    const { data, error } = await billingSchema(supabase).rpc("get_brand_entitlements", {
      p_brand_id: brandId,
    });
    if (error) {
      console.error("[activeBrand] entitlements rpc failed", error);
      return null;
    }
    const parsed = entitlementsSchema.safeParse(data);
    if (!parsed.success) {
      console.error("[activeBrand] entitlements parse failed", parsed.error.message);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("[activeBrand] entitlements fetch threw", describeError(error));
    return null;
  }
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

  let brandMap = new Map<string, { name: string; logoPath: string | null; completedAt: string | null }>();

  // Run brand_profiles lookup and get_active_brand_id RPC in parallel — both only need
  // allBrandIds / permittedIds from the previous step, with no dependency on each other.
  const [brandsResult, activeBrandResult] = await Promise.all([
    allBrandIds.length > 0
      ? supabase
          .schema("brand_profiles")
          .from("brand_profiles")
          .select("id, brand_name, logo_path, completed_at")
          .in("id", allBrandIds)
          // Exclude soft-deleted brands (delete_brand_profile sets active=false).
          // Without this, a deleted brand reappears because its permissions row
          // is retained. `active` is non-nullable, so eq(true) is safe.
          .eq("active", true)
      : Promise.resolve({ data: [] as Array<{ id: string; brand_name: string | null; logo_path: string | null; completed_at: string | null }>, error: null }),
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
          completedAt: brand.completed_at ?? null,
        },
      ])
    );
  }

  // Permissions can outlive a soft-deleted brand, so resolve "what the user can
  // see" against the brands that actually came back active (brandMap). This keeps
  // a deleted brand from lingering as the active pointer or blocking the
  // onboarding redirect when it was the user's only brand.
  const visiblePermittedIds = permittedIds.filter((id) => brandMap.has(id));

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

  if (visiblePermittedIds.length === 0) {
    return {
      activeBrandId: null,
      brandSummaries,
      permissions: perms ?? [],
      entitlements: null,
      user
    };
  }

  const { data: activeBrandData, error: activeBrandError } = activeBrandResult;

  if (activeBrandError) {
    console.error("[activeBrand] active brand rpc failed", activeBrandError);
  }

  const { activeBrandId, shouldPersist } = resolveActiveBrandId({
    candidateBrandId: typeof activeBrandData === "string" ? activeBrandData : null,
    permittedBrandIds: visiblePermittedIds,
  });

  if (activeBrandId && shouldPersist) {
    try {
      await setActiveBrandPreference(activeBrandId);
    } catch (e) {
      console.error("[activeBrand] Failed to persist active brand preference:", describeError(e));
    }
  }

  const entitlements = activeBrandId
    ? await fetchActiveBrandEntitlements(supabase, activeBrandId)
    : null;
  return { activeBrandId, brandSummaries, permissions: perms ?? [], entitlements, user };
});
