import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const listSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  brandProfileId: z.string().uuid().optional(),
  action: z.string().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin environment not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function requireAdmin(req: Request, adminClient: ReturnType<typeof createAdminClient>) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!token) throw new Error("Missing bearer token");

  const { data, error } = await adminClient.auth.getClaims(token);
  const actorUserId = data?.claims?.sub;
  if (error || !actorUserId) throw new Error("Invalid token");

  const isAdmin = Boolean((data.claims?.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!isAdmin) throw new Error("Forbidden");
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const adminClient = createAdminClient();
    await requireAdmin(req, adminClient);

    const parsed = listSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.message }, 400);

    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = adminClient
      .schema("brand_profiles")
      .from("admin_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (parsed.data.brandProfileId) {
      query = query.eq("brand_profile_id", parsed.data.brandProfileId);
    }
    if (parsed.data.action) {
      query = query.eq("action", parsed.data.action);
    }

    const { data, error, count } = await query;
    if (error) return json({ error: error.message }, 500);

    const totalCount = count ?? 0;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

    return json({
      entries: data ?? [],
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : message.includes("token") || message.includes("bearer") ? 401 : 500;
    console.error("[admin-audit-log] unhandled", error);
    return json({ error: message }, status);
  }
});
