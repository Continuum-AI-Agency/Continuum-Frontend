import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleMetaMetrics } from "./meta/handler.ts";
import { handleMockMetrics } from "./mock/handler.ts";
import { handleGoogleMetrics } from "./google/handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let platform = "meta";
    let params: any = {};

    const url = new URL(req.url);
    if (url.searchParams.has("platform")) platform = url.searchParams.get("platform")!;
    
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== "platform") params[key] = value;
    }

    if (req.method === "POST") {
      try {
        const text = await req.text();
        console.log(`[paid-media-metrics] Received POST body text:`, text);
        if (text) {
          const body = JSON.parse(text);
          if (body.platform) platform = body.platform;
          params = { ...params, ...body };
          delete params.platform;
        }
      } catch (e) {
        console.log(`[paid-media-metrics] Error parsing body text as JSON`, e);
      }
    }

    params.brandId = params.brandId || params.brandProfileId;
    params.accountId = params.accountId || params.adAccountId || params.ad_account_id;
    params.campaignId = params.campaignId || params.campaign_id;
    params.adsetId = params.adsetId || params.adset_id;

    console.log(`[paid-media-metrics] Processing request for platform: ${platform}`, params);

    switch (platform) {
      case "meta":
        return await handleMetaMetrics(params, req);
      case "google-ads":
        return await handleGoogleMetrics(params, req);
      case "mock":
        return await handleMockMetrics(params);
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported platform: ${platform}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
    }
  } catch (error) {
    console.error("[paid-media-metrics] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
