import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  userId?: string;
  brandProfileId?: string;
  tier?: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase admin environment not configured" }, 500);

  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Auth & authorize caller
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) return json({ error: "Invalid token" }, 401);
  const isAdmin = Boolean((userData.user.app_metadata as Record<string, unknown> | undefined)?.is_admin);
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const { userId, brandProfileId, tier } = body;
  if (!userId || !brandProfileId || typeof brandProfileId !== "string") {
    return json({ error: "userId and brandProfileId required" }, 400);
  }

  const tierValue =
    tier === null || tier === undefined || tier === ""
      ? null
      : Number.isFinite(tier)
        ? tier
        : Number.isFinite(Number(tier))
          ? Number(tier)
          : null;

  const { error: upsertError } = await adminClient
    .schema("brand_profiles")
    .from("permissions")
    .upsert(
      { user_id: userId, brand_profile_id: brandProfileId, tier: tierValue, updated_at: new Date().toISOString() },
      { onConflict: "user_id,brand_profile_id" }
    );

  if (upsertError) return json({ error: upsertError.message }, 500);

  return json({ ok: true });
});
