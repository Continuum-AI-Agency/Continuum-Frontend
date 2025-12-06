import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string | null;
};

type PermissionRow = {
  user_id: string;
  brand_profile_id: string;
  role: string | null;
  tier: number | null;
  brand_name: string | null;
  brand_created_at?: string | null;
  brand_created_by?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) => console.log(`[admin-list-users] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      log("missing env", { supabaseUrl: Boolean(supabaseUrl), serviceRoleKey: Boolean(serviceRoleKey) });
      return jsonResponse({ error: "Supabase admin environment not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) {
      log("no bearer token");
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      log("getUser failed", { userError });
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const isAdmin = Boolean((userData.user.app_metadata as Record<string, unknown> | undefined)?.is_admin);
    if (!isAdmin) {
      log("forbidden (not admin)", { userId: userData.user.id });
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ perPage: 200 });
    if (usersError) {
      log("listUsers failed", { usersError });
      return jsonResponse({ error: usersError.message }, 500);
    }

    const users: AdminUser[] =
      usersData?.users?.map((user) => ({
        id: user.id,
        email: user.email ?? "unknown",
        name: (user.user_metadata as Record<string, unknown> | undefined)?.name ?? null,
        isAdmin: Boolean((user.app_metadata as Record<string, unknown> | undefined)?.is_admin),
        createdAt: user.created_at ?? null,
      })) ?? [];

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      log("no users found");
      return jsonResponse({ users: [], permissions: [] });
    }

  const { data: permsData, error: permsError } = await adminClient
    .schema("brand_profiles")
    .from("permissions")
    .select("user_id, brand_profile_id, role, tier")
    .in("user_id", userIds);

  if (permsError) {
    log("permissions query failed", { permsError });
    return jsonResponse({ error: permsError.message }, 500);
  }

  log("permissions fetched", { users: users.length, perms: permsData?.length ?? 0, userIds });

  const permissionRows = (permsData ?? []) as Array<{
    user_id: string;
    brand_profile_id: string;
    role: string | null;
    tier: number | string | null;
  }>;

  const brandIds = Array.from(new Set(permissionRows.map((p) => p.brand_profile_id))).filter(Boolean);
  let brandNameMap = new Map<string, string | null>();
  if (brandIds.length > 0) {
    const { data: brandRows, error: brandError } = await adminClient
      .schema("brand_profiles")
      .from("brand_profiles")
      .select("id, brand_name")
      .in("id", brandIds);
    if (brandError) {
      log("brand_profiles lookup failed", { brandError });
    } else {
      const rows = (brandRows ?? []) as Array<{ id: string; brand_name: string | null }>;
      brandNameMap = new Map(rows.map((row) => [row.id, row.brand_name ?? null]));
    }
  }

  const permissions: PermissionRow[] =
    permissionRows.map((row) => ({
      user_id: row.user_id,
      brand_profile_id: row.brand_profile_id,
      role: row.role ?? null,
      tier: (() => {
        const tierValue = row.tier;
        if (tierValue === null || tierValue === undefined || tierValue === "") return null;
        const n = typeof tierValue === "string" ? Number(tierValue) : tierValue;
        return Number.isFinite(n) ? n : null;
      })(),
      brand_name: brandNameMap.get(row.brand_profile_id) ?? null,
    })) ?? [];

  // Fallback memberships from onboarding state (state.members)
  const { data: onboardingRows, error: onboardingError } = await adminClient
    .schema("brand_profiles")
    .from("user_onboarding_states")
    .select("brand_id, user_id, state, created_at")
    .in("user_id", userIds)
    .eq("is_active", true);

  if (onboardingError) {
    log("user_onboarding_states lookup failed", { onboardingError });
  } else {
    const brandIdSet = new Set(brandIds);
    for (const row of onboardingRows ?? []) {
      const brandId = row.brand_id as string;
      if (!brandId) continue;
      const state = row.state as { members?: Array<{ id?: string; email?: string; role?: string }>; brand?: { name?: string } };
      const members = Array.isArray(state?.members) ? state.members : [];
      const matching = members.find(
        (m) =>
          m?.id === row.user_id ||
          (typeof m?.email === "string" &&
            m.email.toLowerCase() === (users.find((u) => u.id === row.user_id)?.email ?? "").toLowerCase())
      );
      const role = matching?.role ?? null;
      const brandName = brandNameMap.get(brandId) ?? (typeof state?.brand?.name === "string" ? state.brand.name : null);
      const already = permissions.find((p) => p.user_id === row.user_id && p.brand_profile_id === brandId);
      if (already) {
        if (!already.brand_name && brandName) already.brand_name = brandName;
        if (!already.role && role) already.role = role;
        continue;
      }
      permissions.push({
        user_id: row.user_id as string,
        brand_profile_id: brandId,
        role,
        tier: null,
        brand_name: brandName ?? null,
      });
      brandIdSet.add(brandId);
    }
  }

    log("success", { users: users.length, permissions: permissions.length });
    return jsonResponse({ users, permissions });
  } catch (error) {
    console.error("[admin-list-users] unhandled", error);
    return jsonResponse({ error: (error as Error)?.message ?? "Unknown error" }, 500);
  }
});
