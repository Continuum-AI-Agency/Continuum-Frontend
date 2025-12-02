// Edge Function: delete_brand_profile
// Deletes a brand profile record and deactivates related artifacts.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const InputSchema = z.object({
  brandId: z.string().min(1, "brandId is required"),
});

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function jsonResponse(body: Record<string, JsonValue>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function createSupabaseClient(authHeader?: string | null) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return createClient(url, serviceRoleKey, {
    global: { headers },
  });
}

type AuthzResult = { status: number; message?: string };

async function assertUserAccess(supabase: ReturnType<typeof createSupabaseClient>, brandId: string): Promise<AuthzResult> {
  const {
    data: userResult,
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !userResult?.user) {
    return { status: 401, message: "Unauthorized" };
  }

  const userId = userResult.user.id;

  const { data: brand, error: brandError } = await supabase
    .schema("brand_profiles")
    .from("brand_profiles")
    .select("id, created_by")
    .eq("id", brandId)
    .maybeSingle();

  if (brandError) {
    return { status: 500, message: brandError.message };
  }

  if (!brand) {
    return { status: 404, message: "Brand profile not found" };
  }

  if (brand.created_by === userId) {
    return { status: 200 };
  }

  // Only allow owners/admins associated to this brand.
  const { data: onboardingRow, error: membershipError } = await supabase
    .schema("brand_profiles")
    .from("user_onboarding_states")
    .select("state")
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    return { status: 500, message: membershipError.message };
  }

  if (!onboardingRow?.state) {
    return { status: 403, message: "Forbidden" };
  }

  const email = userResult.user.email?.toLowerCase() ?? "";
  const members = Array.isArray(onboardingRow.state.members) ? onboardingRow.state.members : [];
  const matching = members.find((member: any) => typeof member?.email === "string" && member.email.toLowerCase() === email);
  if (!matching) {
    return { status: 403, message: "Forbidden" };
  }

  if (matching.role === "owner" || matching.role === "admin") {
    return { status: 200 };
  }

  return { status: 403, message: "Only owners or admins can delete this brand profile" };
}

serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let input: z.infer<typeof InputSchema>;
  try {
    const payload = await req.json();
    input = InputSchema.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    return jsonResponse({ error: message }, 400);
  }

  const authHeader = req.headers.get("Authorization");

  let supabase: ReturnType<typeof createSupabaseClient>;
  try {
    supabase = createSupabaseClient(authHeader);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase client init failed";
    return jsonResponse({ error: message }, 500);
  }

  const authz = await assertUserAccess(supabase, input.brandId);
  if (authz.status !== 200) {
    return jsonResponse({ error: authz.message }, authz.status);
  }

  const { error: reportError, count: deactivatedReports } = await supabase
    .schema("brand_profiles")
    .from("brand_reports")
    .update({ active: false })
    .eq("brand_profile_id", input.brandId)
    .select("id", { count: "exact" });

  if (reportError) {
    return jsonResponse({ error: reportError.message }, 500);
  }

  const { error: analysisError, count: deactivatedAnalyses } = await supabase
    .schema("brand_profiles")
    .from("strategic_analyses")
    .update({ active: false })
    .eq("brand_id", input.brandId)
    .select("brand_id", { count: "exact" });

  if (analysisError) {
    return jsonResponse({ error: analysisError.message }, 500);
  }

  // Clean up dependent records that may block deletion via FK constraints.
  const { error: integrationError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .delete()
    .eq("brand_profile_id", input.brandId);

  if (integrationError) {
    return jsonResponse({ error: integrationError.message }, 500);
  }

  const { error: draftError } = await supabase
    .schema("brand_profiles")
    .from("brand_report_drafts")
    .delete()
    .eq("brand_profile_id", input.brandId);

  if (draftError) {
    return jsonResponse({ error: draftError.message }, 500);
  }

  const { error: deleteError } = await supabase
    .schema("brand_profiles")
    .from("brand_profiles")
    .delete()
    .eq("id", input.brandId);

  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    deactivatedReports: deactivatedReports ?? 0,
    deactivatedAnalyses: deactivatedAnalyses ?? 0,
  });
});
