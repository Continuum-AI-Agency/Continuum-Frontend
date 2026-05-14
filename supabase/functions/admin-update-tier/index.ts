import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  brandProfileId?: string;
  tier?: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function writeAudit(args: {
  adminClient: ReturnType<typeof createClient>;
  actorUserId: string;
  brandProfileId: string;
  before: unknown;
  after: unknown;
  requestId: string;
  status?: "success" | "failed";
  metadata?: Record<string, unknown>;
}) {
  const { error } = await args.adminClient
    .schema("brand_profiles")
    .from("admin_audit_log")
    .insert({
      actor_user_id: args.actorUserId,
      action: "admin.brand.update_tier",
      target_type: "brand_profile",
      target_id: args.brandProfileId,
      brand_profile_id: args.brandProfileId,
      before: args.before,
      after: args.after,
      metadata: args.metadata ?? {},
      request_id: args.requestId,
      status: args.status ?? "success",
    });

  if (error) {
    console.error("[admin-update-tier] audit write failed", error);
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) => console.log(`[admin-update-tier] ${requestId} ${msg}`, extra ?? "");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase admin environment not configured" }, 500);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await adminClient.auth.getClaims(token);
  const actorUserId = userData?.claims?.sub;
  if (userError || !actorUserId) return json({ error: "Invalid token" }, 401);
  const isAdmin = Boolean((userData.claims?.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const { brandProfileId, tier } = body;
  if (!brandProfileId || typeof brandProfileId !== "string") {
    return json({ error: "brandProfileId required" }, 400);
  }

  let tierValue = 0;
  if (tier !== null && tier !== undefined && tier !== "") {
    const numeric = typeof tier === "number" ? tier : Number(tier);
    if (!Number.isFinite(numeric)) {
      return json({ error: "tier must be a number" }, 400);
    }
    tierValue = numeric;
  }

  const { data: beforeRows } = await adminClient
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name, tier, updated_at")
    .eq("id", brandProfileId)
    .limit(1);
  const before = beforeRows?.[0] ?? null;

  const { error: updateError } = await adminClient
    .schema("brand_profiles")
    .from("brand_profiles")
    .update({
      tier: tierValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandProfileId);

  if (updateError) {
    log("brand_profiles update failed", { updateError, brandProfileId, tier: tierValue });
    await writeAudit({
      adminClient,
      actorUserId,
      brandProfileId,
      before,
      after: before,
      requestId,
      status: "failed",
      metadata: { error: updateError.message, tier: tierValue },
    });
    return json({ error: updateError.message }, 500);
  }

  const { data: afterRows } = await adminClient
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, brand_name, tier, updated_at")
    .eq("id", brandProfileId)
    .limit(1);

  await writeAudit({
    adminClient,
    actorUserId,
    brandProfileId,
    before,
    after: afterRows?.[0] ?? { id: brandProfileId, tier: tierValue },
    requestId,
    metadata: { tier: tierValue },
  });

  log("success", { brandProfileId, tier: tierValue });
  return json({ ok: true });
});
