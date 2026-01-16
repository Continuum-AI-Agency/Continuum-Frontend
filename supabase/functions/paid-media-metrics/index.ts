import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleMetaMetrics } from "./meta/handler.ts";
import { handleMockMetrics } from "./mock/handler.ts";

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
    const body = await req.json();
    const { platform = "meta", ...params } = body;

    console.log(`[paid-media-metrics] Processing request for platform: ${platform}`);

    switch (platform) {
      case "meta":
        return await handleMetaMetrics(params, req);
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
