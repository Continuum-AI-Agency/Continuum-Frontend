import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import {
  buildMetaEdgeCacheKey,
  readMetaEdgeCache,
  writeMetaEdgeCache,
} from "../_shared/meta-edge-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-meta-campaigns] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let brandId: string | null = null;
    let adAccountId: string | null = null;

    const url = new URL(req.url);
    brandId = url.searchParams.get("brandId") || url.searchParams.get("brandProfileId");
    adAccountId = url.searchParams.get("adAccountId") || url.searchParams.get("accountId") || url.searchParams.get("ad_account_id");

    if (req.method === "POST") {
      try {
        const text = await req.text();
        log("Received POST body text:", text);
        if (text) {
          const body = JSON.parse(text);
          brandId = brandId || body.brandId || body.brandProfileId;
          adAccountId = adAccountId || body.adAccountId || body.accountId || body.ad_account_id;
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

    log("Final extracted params:", { brandId, adAccountId });

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

    const cacheKey = buildMetaEdgeCacheKey({
      resource: "campaigns",
      adAccountId,
    });

    const cacheHit = await readMetaEdgeCache({
      supabase: supabase as any,
      cacheKey,
      log,
    });

    if (cacheHit) {
      return new Response(JSON.stringify(cacheHit.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

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

    // Fetch campaigns from Meta API
    const metaApiUrl = `https://graph.facebook.com/v23.0/${adAccountId}/campaigns`;
    const params = new URLSearchParams({
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
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

    const responsePayload = { campaigns };

    await writeMetaEdgeCache({
      supabase: supabase as any,
      cacheKey,
      accountId: adAccountId,
      scopeType: "meta_campaigns",
      scopeId: adAccountId,
      payload: responsePayload,
      log,
    });

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[fetch-meta-campaigns] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
