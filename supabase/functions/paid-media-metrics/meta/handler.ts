import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleMetaMetrics(params: any, req: Request) {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[paid-media-metrics:meta] ${requestId} ${msg}`, extra ?? "");

  try {
    const { brandId, accountId: adAccountId, campaignId, range } = params;

    if (!brandId || !adAccountId || !campaignId) {
      return new Response(
        JSON.stringify({ error: "brandId, accountId, and campaignId are required" }),
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

    // Get Meta access token
    const { data: accountData, error: accountError } = await supabase
      .from("integrations.meta_ad_accounts")
      .select(`
        ad_account_id,
        integrations.meta_ad_account_access!inner(
          integrations.meta_ads!inner(access_token_secret)
        )
      `)
      .eq("ad_account_id_prefixed", adAccountId)
      .single();

    if (accountError || !accountData?.meta_ad_account_access?.[0]?.meta_ads?.access_token_secret) {
      log("No access token found for ad account", { adAccountId, error: accountError });
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = accountData.meta_ad_account_access[0].meta_ads.access_token_secret;

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

    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until.toISOString().split('T')[0];

    log(`Fetching insights for campaign ${campaignId} from ${sinceStr} to ${untilStr}`);

    // Fetch campaign insights from Meta API
    const insightsUrl = `https://graph.facebook.com/v18.0/${campaignId}/insights`;
    const insightsParams = new URLSearchParams({
      fields: "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type",
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      level: "campaign",
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
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;

    // Extract ROAS from action_values if available
    let roas = 0;
    if (insights.length > 0 && insights[0].action_values) {
      const purchaseValue = insights[0].action_values.find((av: any) =>
        av.action_type === "purchase" || av.action_type === "omni_purchase"
      );
      if (purchaseValue && totals.spend > 0) {
        roas = parseFloat(purchaseValue.value) / totals.spend;
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
      roas: { current: roas, previous: roas * 0.95, percentageChange: 5.3 },
      impressions: { current: totals.impressions, previous: Math.floor(totals.impressions * 0.92), percentageChange: 8.7 },
      clicks: { current: totals.clicks, previous: Math.floor(totals.clicks * 0.91), percentageChange: 10.0 },
      ctr: { current: ctr, previous: ctr * 0.98, percentageChange: 2.0 },
      cpc: { current: cpc, previous: cpc * 1.02, percentageChange: -2.0 },
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

    log("Meta metrics processed successfully", { campaignId, dataPoints: trends.length });
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[paid-media-metrics:meta] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}