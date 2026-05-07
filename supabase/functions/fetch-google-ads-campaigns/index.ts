import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-google-ads-campaigns] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId") || url.searchParams.get("brandProfileId");
    const customerId = url.searchParams.get("adAccountId") || url.searchParams.get("accountId");

    log("Params", { brandId, customerId });

    if (!brandId || !customerId) {
      return new Response(JSON.stringify({ error: "brandId and adAccountId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");

    if (!developerToken) {
      log("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
      return new Response(JSON.stringify({ error: "Server misconfiguration: missing Google Ads developer token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `google-ads:campaigns:${customerId}`;
    const nowIso = new Date().toISOString();
    const { data: cached } = await supabase
      .schema("brand_profiles")
      .from("reporting_cache")
      .select("payload, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", nowIso)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.payload) {
      log("Cache hit", { customerId });
      return new Response(JSON.stringify(cached.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    log("Resolving access token", { brandId, customerId });
    const { data: accessToken, error: tokenError } = await supabase.rpc("get_brand_integration_token", {
      p_brand_profile_id: brandId,
      p_provider: "google",
    });
    log("Token result", { found: !!accessToken, error: tokenError?.message ?? null });

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Google Ads account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanCustomerId = customerId.replace(/-/g, "");
    const searchUrl = `https://googleads.googleapis.com/v17/customers/${cleanCustomerId}/googleAds:search`;

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status IN ('ENABLED', 'PAUSED')
      ORDER BY campaign.name ASC
      LIMIT 100
    `;

    const googleRes = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!googleRes.ok) {
      const errorText = await googleRes.text();
      log("Google Ads API error", { status: googleRes.status, error: errorText });
      return new Response(JSON.stringify({ error: "Failed to fetch campaigns from Google Ads API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await googleRes.json();
    const campaigns = (data.results ?? []).map((row: any) => ({
      id: String(row.campaign.id),
      name: row.campaign.name,
      objective: row.campaign.advertisingChannelType ?? null,
      status: row.campaign.status,
      dailyBudget: row.campaignBudget?.amountMicros
        ? String(Math.round(parseInt(row.campaignBudget.amountMicros) / 1_000_000))
        : null,
      lifetimeBudget: null,
    }));

    log("Success", { count: campaigns.length });

    const responsePayload = { campaigns };

    const nowTime = new Date();
    const expiresAt = new Date(nowTime.getTime() + CACHE_TTL_MS);
    try {
      await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .insert({
          cache_key: cacheKey,
          provider: "google-ads",
          scope_type: "campaigns",
          account_id: customerId,
          scope_id: customerId,
          range_preset: "none",
          range_since: nowTime.toISOString().split("T")[0],
          range_until: nowTime.toISOString().split("T")[0],
          payload: responsePayload,
          fetched_at: nowTime.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: nowTime.toISOString(),
        });
    } catch (cacheError) {
      log("Cache write failed (non-fatal)", cacheError);
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[fetch-google-ads-campaigns] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
