import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  brand_tier: number;
  brand_name: string | null;
};

type AdminPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  nextPage: number | null;
  lastPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePositiveInt(value: unknown, fallback: number) {
  const numberValue = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }
  return Math.floor(numberValue);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseTierValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? (numeric as number) : 0;
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

    const url = new URL(req.url);
    const queryPage = url.searchParams.get("page");
    const queryPageSize = url.searchParams.get("pageSize") ?? url.searchParams.get("perPage") ?? url.searchParams.get("per_page");
    let bodyParams: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        bodyParams = await req.json();
      } catch {
        bodyParams = {};
      }
    }

    const page = Math.max(
      1,
      parsePositiveInt(bodyParams.page ?? queryPage, 1)
    );
    const pageSize = clamp(
      parsePositiveInt(bodyParams.pageSize ?? bodyParams.perPage ?? queryPageSize, DEFAULT_PAGE_SIZE),
      1,
      MAX_PAGE_SIZE
    );
    const queryParam = url.searchParams.get("query") ?? url.searchParams.get("q");
    const rawQuery = typeof bodyParams.query === "string" ? bodyParams.query : queryParam ?? "";
    const normalizedQuery = rawQuery.trim().toLowerCase();
    const hasQuery = normalizedQuery.length > 0;

    const { data: claimsData, error: userError } = await adminClient.auth.getClaims(accessToken);
    const userId = claimsData?.claims?.sub;
    if (userError || !userId) {
      log("getUser failed", { userError });
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const isAdmin = Boolean((claimsData.claims?.app_metadata as Record<string, unknown> | undefined)?.is_admin);
    if (!isAdmin) {
      log("forbidden (not admin)", { userId });
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const offset = (page - 1) * pageSize;
    const { data: directoryRows, error: directoryError } = await adminClient
      .schema("brand_profiles")
      .rpc("search_admin_user_directory", {
        p_query: hasQuery ? normalizedQuery : "",
        p_limit: pageSize,
        p_offset: offset,
      });

    if (directoryError) {
      log("directory search failed", { directoryError });
      return jsonResponse({ error: directoryError.message }, 500);
    }

    const typedDirectoryRows = (directoryRows ?? []) as Array<{
      user_id: string;
      email: string;
      name: string | null;
      is_admin: boolean;
      auth_created_at: string | null;
      total_count: number | string | null;
    }>;

    const totalCount = Number(typedDirectoryRows[0]?.total_count ?? 0);
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
    const effectivePage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    const users = typedDirectoryRows.map((row) => ({
      id: row.user_id,
      email: row.email,
      name: row.name,
      isAdmin: row.is_admin,
      createdAt: row.auth_created_at,
    }));

    const pagination: AdminPagination = {
      page: effectivePage,
      pageSize,
      totalCount,
      totalPages,
      nextPage: totalPages > 0 && effectivePage < totalPages ? effectivePage + 1 : null,
      lastPage: totalPages,
      hasNextPage: totalPages > 0 && effectivePage < totalPages,
      hasPrevPage: effectivePage > 1,
    };

    const userIds = users.map((u) => u.id);

    if (userIds.length === 0) {
      log("no users found");
      return jsonResponse({ users: [], permissions: [], pagination });
    }

    const { data: permsData, error: permsError } = await adminClient
      .schema("brand_profiles")
      .from("permissions")
      .select("user_id, brand_profile_id, role")
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
    }>;

    // Fallback memberships from onboarding state (state.members)
    const { data: onboardingRows, error: onboardingError } = await adminClient
      .schema("brand_profiles")
      .from("user_onboarding_states")
      .select("brand_id, user_id, state, created_at")
      .in("user_id", userIds)
      .eq("is_active", true);

    if (onboardingError) {
      log("user_onboarding_states lookup failed", { onboardingError });
    }

    const brandIdSet = new Set<string>();
    for (const row of permissionRows) {
      if (row.brand_profile_id) {
        brandIdSet.add(row.brand_profile_id);
      }
    }
    for (const row of onboardingRows ?? []) {
      const brandId = row.brand_id as string;
      if (brandId) {
        brandIdSet.add(brandId);
      }
    }

    let brandMap = new Map<string, { name: string | null; tier: number }>();
    const brandIds = Array.from(brandIdSet);
    if (brandIds.length > 0) {
      const { data: brandRows, error: brandError } = await adminClient
        .schema("brand_profiles")
        .from("brand_profiles")
        .select("id, brand_name, tier")
        .in("id", brandIds);
      if (brandError) {
        log("brand_profiles lookup failed", { brandError });
      } else {
        const rows = (brandRows ?? []) as Array<{ id: string; brand_name: string | null; tier: number | string | null }>;
        brandMap = new Map(
          rows.map((row) => [
            row.id,
            {
              name: row.brand_name ?? null,
              tier: parseTierValue(row.tier),
            },
          ])
        );
      }
    }

    const permissions: PermissionRow[] =
      permissionRows.map((row) => {
        const brandInfo = brandMap.get(row.brand_profile_id);
        return {
          user_id: row.user_id,
          brand_profile_id: row.brand_profile_id,
          role: row.role ?? null,
          brand_tier: brandInfo?.tier ?? 0,
          brand_name: brandInfo?.name ?? null,
        };
      }) ?? [];

    if (!onboardingError) {
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
        const brandInfo = brandMap.get(brandId);
        const brandName = brandInfo?.name ?? (typeof state?.brand?.name === "string" ? state.brand.name : null);
        const brandTier = brandInfo?.tier ?? 0;
        const already = permissions.find((p) => p.user_id === row.user_id && p.brand_profile_id === brandId);
        if (already) {
          if (!already.brand_name && brandName) already.brand_name = brandName;
          already.brand_tier = brandTier;
          if (!already.role && role) already.role = role;
          continue;
        }
        permissions.push({
          user_id: row.user_id as string,
          brand_profile_id: brandId,
          role,
          brand_tier: brandTier,
          brand_name: brandName ?? null,
        });
      }
    }

    log("success", { users: users.length, permissions: permissions.length, page, pageSize, totalCount: pagination.totalCount });
    return jsonResponse({ users, permissions, pagination });
  } catch (error) {
    console.error("[admin-list-users] unhandled", error);
    return jsonResponse({ error: (error as Error)?.message ?? "Unknown error" }, 500);
  }
});
