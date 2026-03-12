import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleMetaMetrics } from "./meta/handler.ts";
import { handleMockMetrics } from "./mock/handler.ts";
import { handleGoogleMetrics } from "./google/handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RangePreset = "last_7d" | "last_14d" | "last_30d" | "custom";
type NormalizedRange = {
  preset: RangePreset;
  since?: string;
  until?: string;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_PRESETS = new Set<RangePreset>(["last_7d", "last_14d", "last_30d", "custom"]);

function coerceDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed) {
      return trimmed;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeRange(params: Record<string, unknown>): NormalizedRange {
  const rangeInput =
    params.range && typeof params.range === "object" && !Array.isArray(params.range)
      ? (params.range as Record<string, unknown>)
      : {};

  const presetCandidate =
    rangeInput.preset ?? params.rangePreset ?? params.range_preset ?? params.preset ?? "last_7d";
  const preset = typeof presetCandidate === "string" && SUPPORTED_PRESETS.has(presetCandidate as RangePreset)
    ? (presetCandidate as RangePreset)
    : "last_7d";

  if (preset !== "custom") {
    return { preset };
  }

  const since = coerceDateOnly(
    rangeInput.since ?? params.rangeSince ?? params.range_since ?? params.since,
  );
  const until = coerceDateOnly(
    rangeInput.until ?? params.rangeUntil ?? params.range_until ?? params.until,
  );

  if (!since || !until) {
    throw new Error("Custom range requires valid since and until dates.");
  }

  if (since > until) {
    throw new Error("Custom range requires since to be on or before until.");
  }

  return {
    preset: "custom",
    since,
    until,
  };
}

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
    try {
      params.range = normalizeRange(params);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Invalid range parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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
