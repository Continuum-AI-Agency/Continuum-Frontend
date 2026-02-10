import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-meta-adsets] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let brandId: string | null = null;
    let adAccountId: string | null = null;
    let campaignId: string | null = null;

    const url = new URL(req.url);
    brandId = url.searchParams.get("brandId") || url.searchParams.get("brandProfileId");
    adAccountId = url.searchParams.get("adAccountId") || url.searchParams.get("accountId") || url.searchParams.get("ad_account_id");
    campaignId = url.searchParams.get("campaignId") || url.searchParams.get("campaign_id");

    if (req.method === "POST") {
      try {
        const text = await req.text();
        log("Received POST body text:", text);
        if (text) {
          const body = JSON.parse(text);
          brandId = brandId || body.brandId || body.brandProfileId;
          adAccountId = adAccountId || body.adAccountId || body.accountId || body.ad_account_id;
          campaignId = campaignId || body.campaignId || body.campaign_id;
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

    log("Final extracted params:", { brandId, adAccountId, campaignId });

    if (!brandId || !adAccountId || !campaignId) {
      return new Response(JSON.stringify({ error: "brandId, adAccountId, and campaignId required" }), {
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

    const { data: accessToken, error: tokenError } = await supabase
      .rpc("get_meta_access_token", { p_ad_account_id: adAccountId });

    if (tokenError) {
      log("Error fetching access token via RPC:", tokenError);
    }

    if (!accessToken) {
      log("No access token found for ad account in any schema", adAccountId);
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Fetching ad sets for campaign:", campaignId);

    const metaApiUrl = `https://graph.facebook.com/v23.0/${campaignId}/adsets`;
    const params = new URLSearchParams({
      fields: "id,name,status,daily_budget,lifetime_budget,bid_strategy,targeting,created_time,start_time,end_time",
      limit: "100",
      access_token: accessToken,
    });

    const response = await fetch(`${metaApiUrl}?${params}`);
    if (!response.ok) {
      const errorData = await response.json();
      log("Meta API error", { status: response.status, error: errorData });
      return new Response(JSON.stringify({ error: "Failed to fetch ad sets from Meta API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const adsets = (data.data || []).map((adset: any) => ({
      id: adset.id,
      name: adset.name,
      status: adset.status,
      dailyBudget: adset.daily_budget,
      lifetimeBudget: adset.lifetime_budget,
      bidStrategy: adset.bid_strategy,
      targeting: adset.targeting,
      createdTime: adset.created_time,
      startTime: adset.start_time,
      endTime: adset.end_time,
    }));

    log("success", { count: adsets.length });

    return new Response(JSON.stringify({ adsets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-meta-adsets] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
