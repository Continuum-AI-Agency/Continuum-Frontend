import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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

  const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);
  if (callerError || !callerData?.user) return json({ error: "Invalid token" }, 401);
  const callerIsAdmin = Boolean((callerData.user.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!callerIsAdmin) return json({ error: "Forbidden" }, 403);

  const { userId, isAdmin } = (await req.json().catch(() => ({}))) as RequestBody;
  if (!userId || typeof isAdmin !== "boolean") return json({ error: "userId and isAdmin required" }, 400);

  // Prevent demoting self out of admin to avoid lockout
  if (callerData.user.id === userId && !isAdmin) {
    return json({ error: "You cannot revoke your own admin status" }, 400);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { is_admin: isAdmin },
  });

  if (updateError) {
    log("updateUserById failed", { updateError });
    return json({ error: updateError.message }, 500);
  }

  log("success", { targetUser: userId, isAdmin });
  return json({ ok: true });
});
