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

type MetaAd = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: { id?: string };
  preview_shareable_link?: string;
  created_time?: string;
  updated_time?: string;
};

type MetaCreative = {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  thumbnail_url?: string;
  image_url?: string;
  call_to_action_type?: string;
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-meta-ads] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let brandId: string | null = null;
    let adAccountId: string | null = null;
    let adSetId: string | null = null;
    let datePreset: string | null = null;
    let timeRange: string | null = null;

    const url = new URL(req.url);
    brandId = url.searchParams.get("brandId") || url.searchParams.get("brandProfileId");
    adAccountId =
      url.searchParams.get("adAccountId") ||
      url.searchParams.get("accountId") ||
      url.searchParams.get("ad_account_id") ||
      url.searchParams.get("metaAccountId");
    adSetId =
      url.searchParams.get("adSetId") ||
      url.searchParams.get("adsetId") ||
      url.searchParams.get("adset_id");
    datePreset = url.searchParams.get("date_preset") || url.searchParams.get("datePreset");
    timeRange = url.searchParams.get("time_range") || url.searchParams.get("timeRange");

    if (req.method === "POST") {
      try {
        const text = await req.text();
        log("Received POST body text:", text);
        if (text) {
          const body = JSON.parse(text);
          brandId = brandId || body.brandId || body.brandProfileId;
          adAccountId =
            adAccountId || body.adAccountId || body.accountId || body.ad_account_id || body.metaAccountId;
          adSetId = adSetId || body.adSetId || body.adsetId || body.adset_id;
          datePreset = datePreset || body.date_preset || body.datePreset;
          if (!timeRange && body.time_range) {
            timeRange = JSON.stringify(body.time_range);
          }
          if (!timeRange && body.timeRange) {
            timeRange = JSON.stringify(body.timeRange);
          }
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

    log("Final extracted params:", { brandId, adAccountId, adSetId, datePreset, timeRange });

    if (!brandId || !adAccountId || !adSetId) {
      return new Response(
        JSON.stringify({ error: "brandId, adAccountId, and adSetId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Supabase environment not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(supabaseToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Looking for access token for ad account:", adAccountId);

    const cacheScopeSuffix = datePreset || timeRange ? `${datePreset ?? "none"}:${timeRange ?? "none"}` : "default";
    const cacheKey = buildMetaEdgeCacheKey({
      resource: "ads",
      adAccountId,
      scopeId: `${adSetId}:${cacheScopeSuffix}`,
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

    const { data: accessToken, error: tokenError } = await supabase.rpc("get_meta_access_token", {
      p_ad_account_id: adAccountId,
    });

    if (tokenError) {
      log("Error fetching access token via RPC:", tokenError);
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adsParams = new URLSearchParams({
      fields:
        "id,name,status,effective_status,adset_id,campaign_id,creative,preview_shareable_link,created_time,updated_time",
      limit: "100",
      access_token: accessToken,
    });

    if (datePreset) {
      adsParams.set("date_preset", datePreset);
    }

    if (timeRange) {
      adsParams.set("time_range", timeRange);
    }

    const adsEndpoint = `https://graph.facebook.com/v23.0/${adSetId}/ads`;
    const adsResponse = await fetch(`${adsEndpoint}?${adsParams.toString()}`);

    if (!adsResponse.ok) {
      const errorData = await adsResponse.json();
      log("Meta ads API error", { status: adsResponse.status, error: errorData });
      return new Response(JSON.stringify({ error: "Failed to fetch ads from Meta API" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adsPayload = await adsResponse.json();
    const ads: MetaAd[] = adsPayload.data || [];

    const uniqueCreativeIds = Array.from(
      new Set(ads.map((ad) => ad.creative?.id).filter((id): id is string => Boolean(id)))
    );

    const creativeEntries = await Promise.all(
      uniqueCreativeIds.map(async (creativeId) => {
        const creativeParams = new URLSearchParams({
          fields: "id,name,title,body,thumbnail_url,image_url,call_to_action_type",
          thumbnail_width: "1200",
          thumbnail_height: "1200",
          access_token: accessToken,
        });

        const creativeEndpoint = `https://graph.facebook.com/v23.0/${creativeId}`;
        const creativeResponse = await fetch(`${creativeEndpoint}?${creativeParams.toString()}`);

        if (!creativeResponse.ok) {
          const errorData = await creativeResponse.json();
          log("Meta creative API error", {
            creativeId,
            status: creativeResponse.status,
            error: errorData,
          });
          return [creativeId, null] as const;
        }

        const creativeData: MetaCreative = await creativeResponse.json();
        return [creativeId, creativeData] as const;
      })
    );

    const creativesById = new Map(creativeEntries);

    const hydratedAds = ads.map((ad) => {
      const creativeId = ad.creative?.id;
      const creative = creativeId ? creativesById.get(creativeId) : null;

      return {
        id: ad.id,
        name: ad.name ?? "Untitled ad",
        status: ad.status ?? "UNKNOWN",
        effectiveStatus: ad.effective_status ?? "UNKNOWN",
        adsetId: ad.adset_id ?? adSetId,
        campaignId: ad.campaign_id ?? null,
        previewShareableLink: ad.preview_shareable_link ?? null,
        createdTime: ad.created_time ?? null,
        updatedTime: ad.updated_time ?? null,
        creativeId: creativeId ?? null,
        creative: creative
          ? {
              id: creative.id,
              name: creative.name ?? null,
              title: creative.title ?? null,
              body: creative.body ?? null,
              thumbnailUrl: creative.thumbnail_url ?? null,
              imageUrl: creative.image_url ?? null,
              callToActionType: creative.call_to_action_type ?? null,
            }
          : null,
      };
    });

    log("success", {
      adCount: hydratedAds.length,
      creativeCount: uniqueCreativeIds.length,
      adSetId,
      adAccountId,
    });

    const responsePayload = { ads: hydratedAds };

    await writeMetaEdgeCache({
      supabase: supabase as any,
      cacheKey,
      accountId: adAccountId,
      scopeType: "meta_ads",
      scopeId: `${adSetId}:${cacheScopeSuffix}`,
      rangePreset: datePreset ?? "edge_1h",
      payload: responsePayload,
      log,
    });

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[fetch-meta-ads] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
