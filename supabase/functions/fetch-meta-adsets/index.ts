import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import {
  buildMetaEdgeCacheKey,
  readMetaEdgeCache,
  writeMetaEdgeCache,
} from "../_shared/meta-edge-cache.ts";
import { authorizeSupabaseEdgeRequest, extractBearerToken } from "../_shared/supabase-edge-auth.ts";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const META_API_VERSION = "v23.0";
const ADSET_FIELDS_FULL =
  "id,name,status,daily_budget,lifetime_budget,bid_strategy,targeting,created_time,start_time,end_time";
const ADSET_FIELDS_SAFE =
  "id,name,status,daily_budget,lifetime_budget,bid_strategy,created_time,start_time,end_time";

type MetaErrorEnvelope = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaAttemptResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  attempt: string;
};

function normalizeMetaError(payload: unknown): MetaErrorEnvelope["error"] | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as MetaErrorEnvelope;
  return envelope.error ?? null;
}

function formatMetaErrorSummary(status: number, attempt: string, payload: unknown): string {
  const error = normalizeMetaError(payload);
  if (!error) {
    return `${attempt} failed with HTTP ${status}`;
  }

  const message = error.message ? error.message : "Unknown Meta API error";
  const code = typeof error.code === "number" ? `code ${error.code}` : "no-code";
  const subcode = typeof error.error_subcode === "number" ? `subcode ${error.error_subcode}` : "no-subcode";
  const type = error.type ?? "unknown-type";
  return `${attempt} failed (${type}, ${code}, ${subcode}): ${message}`;
}

function isMetaRateLimitError(payload: unknown): boolean {
  const error = normalizeMetaError(payload);
  if (!error) return false;
  return error.code === 17 || error.error_subcode === 2446079;
}

async function fetchMetaAdsetsAttempt(args: {
  endpoint: string;
  fields: string;
  limit: string;
  accessToken: string;
  campaignId: string;
  attempt: string;
  useCampaignFiltering: boolean;
}): Promise<MetaAttemptResult> {
  const params = new URLSearchParams({
    fields: args.fields,
    limit: args.limit,
    access_token: args.accessToken,
  });

  if (args.useCampaignFiltering) {
    params.set(
      "filtering",
      JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: args.campaignId }])
    );
  }

  const response = await fetch(`${args.endpoint}?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    payload,
    attempt: args.attempt,
  };
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await authorizeSupabaseEdgeRequest({
      authHeader: req.headers.get("Authorization"),
      serviceRoleKey,
      getUser: (accessToken) => supabase.auth.getUser(accessToken),
    });

    if (!auth.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Looking for access token for ad account:", {
      adAccountId,
      actorKind: auth.actorKind,
    });

    const cacheKey = buildMetaEdgeCacheKey({
      resource: "adsets",
      adAccountId,
      scopeId: campaignId,
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

    const accessToken = await resolveMetaAccessToken({
      brandId,
      adAccountId,
      userToken: extractBearerToken(req.headers.get("Authorization")),
      actorKind: auth.actorKind,
      log,
    });

    if (!accessToken) {
      log("No access token found for ad account in any schema", adAccountId);
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Fetching ad sets for campaign:", campaignId);

    const campaignEndpoint = `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/adsets`;
    const adAccountEndpoint = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/adsets`;

    const attempts = [
      {
        attempt: "campaign/full-fields",
        endpoint: campaignEndpoint,
        fields: ADSET_FIELDS_FULL,
        useCampaignFiltering: false,
      },
      {
        attempt: "campaign/safe-fields",
        endpoint: campaignEndpoint,
        fields: ADSET_FIELDS_SAFE,
        useCampaignFiltering: false,
      },
      {
        attempt: "account/filtering/safe-fields",
        endpoint: adAccountEndpoint,
        fields: ADSET_FIELDS_SAFE,
        useCampaignFiltering: true,
      },
    ] as const;

    let finalFailure: MetaAttemptResult | null = null;
    let data: any = null;

    for (const plan of attempts) {
      const result = await fetchMetaAdsetsAttempt({
        endpoint: plan.endpoint,
        fields: plan.fields,
        limit: "100",
        accessToken,
        campaignId,
        attempt: plan.attempt,
        useCampaignFiltering: plan.useCampaignFiltering,
      });

      if (result.ok) {
        data = result.payload as any;
        finalFailure = null;
        break;
      }

      finalFailure = result;
      log("Meta API attempt failed", {
        attempt: result.attempt,
        status: result.status,
        error: normalizeMetaError(result.payload),
      });

      if (isMetaRateLimitError(result.payload)) {
        break;
      }
    }

    if (!data && finalFailure) {
      const summary = formatMetaErrorSummary(
        finalFailure.status,
        finalFailure.attempt,
        finalFailure.payload
      );
      const metaError = normalizeMetaError(finalFailure.payload);

      return new Response(
        JSON.stringify({
          error: `Failed to fetch ad sets from Meta API: ${summary}`,
          rateLimited: isMetaRateLimitError(finalFailure.payload),
          meta: {
            status: finalFailure.status,
            attempt: finalFailure.attempt,
            code: metaError?.code ?? null,
            subcode: metaError?.error_subcode ?? null,
            type: metaError?.type ?? null,
            message: metaError?.message ?? null,
            fbtraceId: metaError?.fbtrace_id ?? null,
          },
          requestId,
        }),
        {
          status: isMetaRateLimitError(finalFailure.payload) ? 429 : 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            ...(isMetaRateLimitError(finalFailure.payload) ? { "Retry-After": "60" } : {}),
          },
        }
      );
    }

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

    const responsePayload = { adsets };

    await writeMetaEdgeCache({
      supabase: supabase as any,
      cacheKey,
      accountId: adAccountId,
      scopeType: "meta_adsets",
      scopeId: campaignId,
      payload: responsePayload,
      log,
    });

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[fetch-meta-adsets] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
