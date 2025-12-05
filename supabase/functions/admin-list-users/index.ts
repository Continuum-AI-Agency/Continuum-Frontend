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
      .select("user_id, brand_profile_id, role, tier, brand_profiles!inner(id, brand_name)")
      .in("user_id", userIds);

    if (permsError) {
      log("permissions query failed", { permsError });
      return jsonResponse({ error: permsError.message }, 500);
    }

    const permissions: PermissionRow[] =
      permsData?.map((row) => ({
        user_id: row.user_id,
        brand_profile_id: row.brand_profile_id,
        role: (row as Record<string, unknown> & { role?: string }).role ?? null,
        tier: (() => {
          const tierValue = (row as Record<string, unknown> & { tier?: number | string }).tier;
          if (tierValue === null || tierValue === undefined || tierValue === "") return null;
          const n = typeof tierValue === "string" ? Number(tierValue) : tierValue;
          return Number.isFinite(n) ? n : null;
        })(),
        brand_name: (row as Record<string, unknown> & { brand_profiles?: { brand_name?: string } }).brand_profiles?.brand_name ?? null,
      })) ?? [];

    log("success", { users: users.length, permissions: permissions.length });
    return jsonResponse({ users, permissions });
  } catch (error) {
    console.error("[admin-list-users] unhandled", error);
    return jsonResponse({ error: (error as Error)?.message ?? "Unknown error" }, 500);
  }
});
