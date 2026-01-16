import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-meta-campaigns] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const adAccountId = url.searchParams.get("adAccountId");

    if (!brandId || !adAccountId) {
      return new Response(JSON.stringify({ error: "brandId and adAccountId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(supabaseToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Looking for access token for ad account:", adAccountId);

    // Get Meta access token - try brand integrations first, then fallback to integrations
    log("Looking for access token for ad account:", adAccountId);

    let accessToken = null;

    // Try brand integrations first
    try {
      const { data: brandAdAccount } = await supabase
        .from("brand_integrations.meta_ad_accounts")
        .select("brand_integration_id")
        .eq("ad_account_id_prefixed", adAccountId)
        .single();

      if (brandAdAccount?.brand_integration_id) {
        const { data: integration } = await supabase
          .from("brand_profiles.user_integrations")
          .select("access_token_encrypted")
          .eq("id", brandAdAccount.brand_integration_id)
          .single();

        if (integration?.access_token_encrypted) {
          // Decrypt the token (assuming it's stored as bytea)
          accessToken = Buffer.from(integration.access_token_encrypted).toString();
          log("Found token in brand integrations");
        }
      }
    } catch (brandError) {
      log("Brand integrations query failed:", brandError);
    }

    // Fallback to integrations schema if not found
    if (!accessToken) {
      try {
        const { data: accountData } = await supabase
          .from("integrations.meta_ad_accounts")
          .select(`
            meta_ad_account_access!inner(
              meta_ads!inner(access_token_secret)
            )
          `)
          .eq("ad_account_id_prefixed", adAccountId)
          .single();

        if (accountData?.meta_ad_account_access?.[0]?.meta_ads?.access_token_secret) {
          accessToken = accountData.meta_ad_account_access[0].meta_ads.access_token_secret;
          log("Found token in integrations fallback");
        }
      } catch (integrationError) {
        log("Integrations fallback query failed:", integrationError);
      }
    }

    if (!accessToken) {
      log("No access token found for ad account in any schema", adAccountId);
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaigns from Meta API
    const metaApiUrl = `https://graph.facebook.com/v18.0/${adAccountId}/campaigns`;
    const params = new URLSearchParams({
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      filtering: JSON.stringify([{ field: "status", operator: "EQUAL", value: "ACTIVE" }]),
      limit: "100",
      access_token: accessToken,
    });

    const response = await fetch(`${metaApiUrl}?${params}`);
    if (!response.ok) {
      const errorData = await response.json();
      log("Meta API error", { status: response.status, error: errorData });
      return new Response(JSON.stringify({ error: "Failed to fetch campaigns from Meta API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const campaigns = data.data.map((campaign: any) => ({
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      dailyBudget: campaign.daily_budget,
      lifetimeBudget: campaign.lifetime_budget,
    }));

    log("success", { count: campaigns.length });

    return new Response(JSON.stringify({ campaigns }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-meta-campaigns] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});