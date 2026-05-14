import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  userId?: string;
  isAdmin?: boolean;
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
  targetUserId: string;
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
      action: "admin.user.set_admin",
      target_type: "auth_user",
      target_id: args.targetUserId,
      before: args.before,
      after: args.after,
      metadata: args.metadata ?? {},
      request_id: args.requestId,
      status: args.status ?? "success",
    });

  if (error) {
    console.error("[admin-set-admin] audit write failed", error);
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) => console.log(`[admin-set-admin] ${requestId} ${msg}`, extra ?? "");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase admin environment not configured" }, 500);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerData, error: callerError } = await adminClient.auth.getClaims(token);
  const callerUserId = callerData?.claims?.sub;
  if (callerError || !callerUserId) return json({ error: "Invalid token" }, 401);
  const callerIsAdmin = Boolean((callerData.claims?.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!callerIsAdmin) return json({ error: "Forbidden" }, 403);

  const { userId, isAdmin } = (await req.json().catch(() => ({}))) as RequestBody;
  if (!userId || typeof isAdmin !== "boolean") return json({ error: "userId and isAdmin required" }, 400);

  // Prevent demoting self out of admin to avoid lockout
  if (callerUserId === userId && !isAdmin) {
    return json({ error: "You cannot revoke your own admin status" }, 400);
  }

  const { data: beforeUserData } = await adminClient.auth.admin.getUserById(userId);
  const beforeUser = beforeUserData?.user ?? null;

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { is_admin: isAdmin },
  });

  if (updateError) {
    log("updateUserById failed", { updateError });
    await writeAudit({
      adminClient,
      actorUserId: callerUserId,
      targetUserId: userId,
      before: beforeUser,
      after: beforeUser,
      requestId,
      status: "failed",
      metadata: { error: updateError.message, isAdmin },
    });
    return json({ error: updateError.message }, 500);
  }

  const { data: afterUserData } = await adminClient.auth.admin.getUserById(userId);
  await writeAudit({
    adminClient,
    actorUserId: callerUserId,
    targetUserId: userId,
    before: beforeUser,
    after: afterUserData?.user ?? { id: userId, is_admin: isAdmin },
    requestId,
    metadata: { isAdmin },
  });

  log("success", { targetUser: userId, isAdmin });
  return json({ ok: true });
});
