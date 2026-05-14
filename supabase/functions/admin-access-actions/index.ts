import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const removeMemberSchema = z.object({
  action: z.literal("remove_member"),
  brandProfileId: z.string().uuid(),
  userId: z.string().uuid(),
});

const actionSchema = removeMemberSchema;

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

  return actorUserId;
}

async function writeAudit(args: {
  adminClient: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  brandProfileId: string;
  before: unknown;
  after: unknown;
  metadata?: Record<string, unknown>;
  requestId: string;
  status?: "success" | "failed";
}) {
  const { error } = await args.adminClient
    .schema("brand_profiles")
    .from("admin_audit_log")
    .insert({
      actor_user_id: args.actorUserId,
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      brand_profile_id: args.brandProfileId,
      before: args.before,
      after: args.after,
      metadata: args.metadata ?? {},
      request_id: args.requestId,
      status: args.status ?? "success",
    });

  if (error) {
    console.error("[admin-access-actions] audit write failed", error);
  }
}

async function handleRemoveMember(
  adminClient: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  requestId: string,
  input: z.infer<typeof removeMemberSchema>,
) {
  const { data: permissionRow, error: permissionError } = await adminClient
    .schema("brand_profiles")
    .from("permissions")
    .select("user_id, brand_profile_id, role, email, created_at")
    .eq("brand_profile_id", input.brandProfileId)
    .eq("user_id", input.userId)
    .single();

  if (permissionError || !permissionRow) {
    return json({ error: "Membership not found" }, 404);
  }

  if (permissionRow.role === "owner") {
    await writeAudit({
      adminClient,
      actorUserId,
      action: "admin.member.remove",
      targetType: "brand_membership",
      targetId: `${input.brandProfileId}:${input.userId}`,
      brandProfileId: input.brandProfileId,
      before: permissionRow,
      after: permissionRow,
      metadata: { blockedReason: "owner_untouchable" },
      requestId,
      status: "failed",
    });
    return json({ error: "Owners cannot be removed from brands." }, 400);
  }

  const { error: deleteError } = await adminClient
    .schema("brand_profiles")
    .from("permissions")
    .delete()
    .eq("brand_profile_id", input.brandProfileId)
    .eq("user_id", input.userId);

  if (deleteError) {
    await writeAudit({
      adminClient,
      actorUserId,
      action: "admin.member.remove",
      targetType: "brand_membership",
      targetId: `${input.brandProfileId}:${input.userId}`,
      brandProfileId: input.brandProfileId,
      before: permissionRow,
      after: permissionRow,
      metadata: { error: deleteError.message },
      requestId,
      status: "failed",
    });
    return json({ error: deleteError.message }, 500);
  }

  const nowIso = new Date().toISOString();
  const { error: cascadeError } = await adminClient
    .schema("brand_profiles")
    .from("brand_integration_grants")
    .update({ revoked_at: nowIso, revoked_by: actorUserId })
    .eq("brand_profile_id", input.brandProfileId)
    .eq("granted_by", input.userId)
    .is("revoked_at", null);

  await writeAudit({
    adminClient,
    actorUserId,
    action: "admin.member.remove",
    targetType: "brand_membership",
    targetId: `${input.brandProfileId}:${input.userId}`,
    brandProfileId: input.brandProfileId,
    before: permissionRow,
    after: null,
    metadata: {
      revokedIntegrationGrants: !cascadeError,
      cascadeError: cascadeError?.message,
    },
    requestId,
  });

  return json({ ok: true });
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const adminClient = createAdminClient();
    const actorUserId = await requireAdmin(req, adminClient);
    const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "Invalid request", details: parsed.error.message }, 400);
    }

    if (parsed.data.action === "remove_member") {
      return await handleRemoveMember(adminClient, actorUserId, requestId, parsed.data);
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : message.includes("token") || message.includes("bearer") ? 401 : 500;
    console.error("[admin-access-actions] unhandled", { requestId, error });
    return json({ error: message }, status);
  }
});
