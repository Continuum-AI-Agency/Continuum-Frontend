import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TimelineAccountsRequest = {
  brandId?: string;
};

type TimelineAccount = {
  id: string;
  name: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-timeline-accounts] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!accessToken) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    let body: TimelineAccountsRequest;
    try {
      body = (await req.json()) as TimelineAccountsRequest;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const brandId = body.brandId?.trim();
    if (!brandId) {
      return jsonResponse({ error: "brandId is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase function configuration" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(accessToken);

    if (authError || !claimsData?.claims?.sub) {
      log("auth failed", { authError });
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: membership, error: membershipError } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("brand_profile_id")
      .eq("brand_profile_id", brandId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      log("membership check failed", { membershipError });
      return jsonResponse({ error: "Failed to validate brand access" }, 500);
    }

    if (!membership) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: timelineAccounts, error: timelineAccountsError } = await supabase
      .schema("DCO_Campaigns")
      .from("timeline_accounts")
      .select("account_id, account_name")
      .eq("brand_id", brandId)
      .order("account_id", { ascending: true });

    if (timelineAccountsError) {
      log("timeline accounts query failed", { timelineAccountsError });
      return jsonResponse({ error: timelineAccountsError.message }, 500);
    }

    const ids = Array.from(new Set((timelineAccounts ?? []).map((a) => a.account_id).filter(Boolean)));

    let metaNameMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: metaAccounts, error: metaAccountsError } = await supabase
        .schema("brand_integrations")
        .from("meta_ad_accounts")
        .select("ad_account_id_prefixed, name")
        .in("ad_account_id_prefixed", ids);

      if (metaAccountsError) {
        log("meta account name lookup failed", { metaAccountsError });
      } else {
        metaNameMap = new Map((metaAccounts ?? []).map((a) => [a.ad_account_id_prefixed, a.name ?? a.ad_account_id_prefixed]));
      }
    }

    const accounts: TimelineAccount[] = (timelineAccounts ?? []).map((account) => ({
      id: account.account_id,
      name: metaNameMap.get(account.account_id) ?? account.account_name ?? account.account_id,
    }));

    return jsonResponse({ accounts });
  } catch (error) {
    console.error("[fetch-timeline-accounts] unhandled error", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
