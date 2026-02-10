import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_TTL_MS = 60 * 60 * 1000;

function buildCacheKey(params: {
  provider: string;
  scopeType: string;
  accountId: string;
  scopeId: string;
  rangePreset: string;
  rangeSince?: string;
  rangeUntil?: string;
}) {
  const { provider, scopeType, accountId, scopeId, rangePreset, rangeSince, rangeUntil } = params;
  return [
    provider,
    scopeType,
    accountId,
    scopeId,
    rangePreset,
    rangeSince ?? "",
    rangeUntil ?? "",
  ].join(":");
}

export async function handleMetaMetrics(params: any, req: Request) {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[paid-media-metrics:meta] ${requestId} ${msg}`, extra ?? "");

  try {
    const { brandId, accountId: adAccountId, campaignId, adsetId, range, forceRefresh } = params;

    if (!brandId || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "brandId and accountId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    if (!campaignId && !adsetId) {
      return new Response(
        JSON.stringify({ error: "Either campaignId or adsetId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Get Supabase token from request
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser(supabaseToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse date range
    const now = new Date();
    let since: Date, until: Date;

    switch (range?.preset || "last_7d") {
      case "last_7d":
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        until = now;
        break;
      case "last_14d":
        since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        until = now;
        break;
      case "last_30d":
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        until = now;
        break;
      case "custom":
        since = range.since ? new Date(range.since) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        until = range.until ? new Date(range.until) : now;
        break;
      default:
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        until = now;
    }

    const sinceStr = since.toISOString().split("T")[0];
    const untilStr = until.toISOString().split("T")[0];

    const entityId = adsetId || campaignId;
    const scopeType = adsetId ? "paid_adset" : "paid_campaign";
    
    const cacheKey = buildCacheKey({
      provider: "meta",
      scopeType,
      accountId: adAccountId,
      scopeId: entityId,
      rangePreset: range?.preset || "last_7d",
      rangeSince: sinceStr,
      rangeUntil: untilStr,
    });

    if (!forceRefresh) {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .gt("expires_at", nowIso)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log("Cache read error", error);
      } else if (data?.payload && data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        if (expiresAt.getTime() > Date.now()) {
          return new Response(JSON.stringify(data.payload), {
            headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
          });
        }
      }
    }

    const { data: accessToken, error: tokenError } = await supabase
      .rpc("get_meta_access_token", { p_ad_account_id: adAccountId });

    if (tokenError || !accessToken) {
      log("No access token found for ad account", { adAccountId, error: tokenError });
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(`Fetching insights for ${adsetId ? 'adset' : 'campaign'} ${entityId} from ${sinceStr} to ${untilStr}`);

    // Fetch insights from Meta API (campaign or adset level)
    const insightsUrl = `https://graph.facebook.com/v23.0/${entityId}/insights`;
    const insightsParams = new URLSearchParams({
      fields: "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type",
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      level: adsetId ? "adset" : "campaign",
      time_increment: "1",
      access_token: accessToken,
    });

    const insightsResponse = await fetch(`${insightsUrl}?${insightsParams}`);
    if (!insightsResponse.ok) {
      const errorData = await insightsResponse.json();
      log("Meta insights API error", { status: insightsResponse.status, error: errorData });
      return new Response(JSON.stringify({ error: "Failed to fetch campaign insights from Meta API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insightsData = await insightsResponse.json();
    const insights = insightsData.data || [];

    // Aggregate insights across the time period
    const totals = insights.reduce((acc: any, day: any) => {
      acc.spend += parseFloat(day.spend || 0);
      acc.impressions += parseInt(day.impressions || 0);
      acc.clicks += parseInt(day.clicks || 0);
      return acc;
    }, { spend: 0, impressions: 0, clicks: 0 });

    // Calculate derived metrics
    const ctr = totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(4)) : 0;
    const cpc = totals.clicks > 0 ? Number((totals.spend / totals.clicks).toFixed(4)) : 0;

    // Extract ROAS from action_values if available
    let roas = 0;
    if (insights.length > 0 && insights[0].action_values) {
      const purchaseValue = insights[0].action_values.find((av: any) =>
        av.action_type === "purchase" || av.action_type === "omni_purchase"
      );
      if (purchaseValue && totals.spend > 0) {
        roas = Number((parseFloat(purchaseValue.value) / totals.spend).toFixed(4));
      }
    }

    // Generate trend data
    const trends = insights.map((day: any) => ({
      date: day.date_start,
      spend: parseFloat(day.spend || 0),
      roas: roas, // Using aggregate ROAS for now
      impressions: parseInt(day.impressions || 0),
      clicks: parseInt(day.clicks || 0),
    }));

    // Mock comparison data for now (would need previous period data)
    const comparison = {
      spend: { current: totals.spend, previous: totals.spend * 0.9, percentageChange: 11.1 },
      roas: { current: roas, previous: Number((roas * 0.95).toFixed(4)), percentageChange: 5.3 },
      impressions: { current: totals.impressions, previous: Math.floor(totals.impressions * 0.92), percentageChange: 8.7 },
      clicks: { current: totals.clicks, previous: Math.floor(totals.clicks * 0.91), percentageChange: 10.0 },
      ctr: { current: ctr, previous: Number((ctr * 0.98).toFixed(4)), percentageChange: 2.0 },
      cpc: { current: cpc, previous: Number((cpc * 1.02).toFixed(4)), percentageChange: -2.0 },
    };

    const response = {
      metrics: {
        spend: totals.spend,
        roas: roas,
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr: ctr,
        cpc: cpc,
      },
      comparison,
      trends,
      range: {
        since: sinceStr,
        until: untilStr,
        preset: range?.preset || "last_7d",
      }
    };

    try {
      const nowTime = new Date();
      const expiresAt = new Date(nowTime.getTime() + CACHE_TTL_MS);
      await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .insert({
        cache_key: cacheKey,
        provider: "meta",
        scope_type: scopeType,
        account_id: adAccountId,
        scope_id: entityId,
        range_preset: range?.preset || "last_7d",
        range_since: sinceStr,
        range_until: untilStr,
        payload: response,
        fetched_at: nowTime.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: nowTime.toISOString(),
      });
    } catch (cacheError) {
      log("Cache write failed", cacheError);
    }

    log("Meta metrics processed successfully", { entityId, scopeType, dataPoints: trends.length });
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });

  } catch (error) {
    console.error("[paid-media-metrics:meta] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}
