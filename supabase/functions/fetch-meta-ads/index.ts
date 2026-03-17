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

type MetaActionValue = {
  action_type?: string;
  value?: string;
};

type MetaAdInsight = {
  ad_id?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpc?: string;
  ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
};

type MetaAdTrendPoint = {
  date: string;
  spend: number;
  roas: number;
  ctr_pct: number;
  cpc: number;
  cpa: number;
  impressions: number;
  clicks: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readActionValue(values: MetaActionValue[] | undefined, actionTypes: string[]): number {
  if (!Array.isArray(values)) return 0;
  const action = values.find((item) => item.action_type && actionTypes.includes(item.action_type));
  return toNumber(action?.value);
}

function readBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

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
    let includeTrends = false;
    let trendResolution = "daily" as const;

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
    includeTrends = readBooleanFlag(url.searchParams.get("includeTrends")) ?? includeTrends;

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
          includeTrends =
            readBooleanFlag(body.includeTrends) ??
            readBooleanFlag(body.include_trends) ??
            includeTrends;
          const bodyTrendResolution = body.trendResolution ?? body.trend_resolution;
          if (bodyTrendResolution === "daily") {
            trendResolution = "daily";
          }
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

    log("Final extracted params:", {
      brandId,
      adAccountId,
      adSetId,
      datePreset,
      timeRange,
      includeTrends,
      trendResolution,
    });

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

    const cacheScopeSuffix = [
      datePreset ?? "none",
      timeRange ?? "none",
      includeTrends ? "trends:1" : "trends:0",
      `trend_res:${trendResolution}`,
    ].join(":");
    const cacheKey = buildMetaEdgeCacheKey({
      resource: "ads",
      adAccountId,
      scopeId: `${adSetId}:${cacheScopeSuffix}`,
    });
    const cacheClient = supabase as unknown as Parameters<typeof readMetaEdgeCache>[0]["supabase"];

    const cacheHit = await readMetaEdgeCache({
      supabase: cacheClient,
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

    const adMetricsById = new Map<
      string,
      {
        spend: number;
        roas: number;
        ctr: number;
        cpc: number;
        cpa: number;
        impressions: number;
        clicks: number;
      }
    >();
    const adTrendsById = new Map<string, MetaAdTrendPoint[]>();

    try {
      const insightsParams = new URLSearchParams({
        fields: "ad_id,spend,impressions,clicks,cpc,ctr,actions,action_values",
        level: "ad",
        limit: "200",
        access_token: accessToken,
      });

      if (datePreset) {
        insightsParams.set("date_preset", datePreset);
      }

      if (timeRange) {
        insightsParams.set("time_range", timeRange);
      }

      const insightsEndpoint = `https://graph.facebook.com/v23.0/${adSetId}/insights`;
      const insightsResponse = await fetch(`${insightsEndpoint}?${insightsParams.toString()}`);
      if (insightsResponse.ok) {
        const insightsPayload = await insightsResponse.json();
        const insightsRows: MetaAdInsight[] = Array.isArray(insightsPayload?.data) ? insightsPayload.data : [];

        insightsRows.forEach((row) => {
          const adId = row.ad_id;
          if (!adId) return;

          const spend = toNumber(row.spend);
          const clicks = toNumber(row.clicks);
          const impressions = toNumber(row.impressions);
          const ctr = toNumber(row.ctr);
          const cpc = toNumber(row.cpc);
          const purchases = readActionValue(row.actions, ["purchase", "omni_purchase"]);
          const purchaseValue = readActionValue(row.action_values, ["purchase", "omni_purchase"]);
          const roas = spend > 0 ? purchaseValue / spend : 0;
          const cpa = purchases > 0 ? spend / purchases : 0;

          adMetricsById.set(adId, {
            spend,
            roas,
            ctr,
            cpc,
            cpa,
            impressions,
            clicks,
          });
        });
      } else {
        const insightsError = await insightsResponse.json();
        log("Meta ad insights API error", { status: insightsResponse.status, error: insightsError });
      }

      if (includeTrends) {
        const trendInsightsParams = new URLSearchParams({
          fields: "ad_id,date_start,spend,impressions,clicks,cpc,ctr,actions,action_values",
          level: "ad",
          time_increment: "1",
          limit: "500",
          access_token: accessToken,
        });

        if (datePreset) {
          trendInsightsParams.set("date_preset", datePreset);
        }

        if (timeRange) {
          trendInsightsParams.set("time_range", timeRange);
        }

        const trendInsightsEndpoint = `https://graph.facebook.com/v23.0/${adSetId}/insights`;
        const trendInsightsResponse = await fetch(`${trendInsightsEndpoint}?${trendInsightsParams.toString()}`);
        if (trendInsightsResponse.ok) {
          const trendInsightsPayload = await trendInsightsResponse.json();
          const trendRows: MetaAdInsight[] = Array.isArray(trendInsightsPayload?.data)
            ? trendInsightsPayload.data
            : [];

          const trendRowsByAdId = new Map<string, Map<string, MetaAdTrendPoint>>();

          trendRows.forEach((row) => {
            const adId = row.ad_id;
            const date = row.date_start;
            if (!adId || !date) return;

            const spend = toNumber(row.spend);
            const clicks = toNumber(row.clicks);
            const impressions = toNumber(row.impressions);
            const ctr = toNumber(row.ctr);
            const cpc = toNumber(row.cpc);
            const purchases = readActionValue(row.actions, ["purchase", "omni_purchase"]);
            const purchaseValue = readActionValue(row.action_values, ["purchase", "omni_purchase"]);
            const roas = spend > 0 ? purchaseValue / spend : 0;
            const cpa = purchases > 0 ? spend / purchases : 0;

            const current = trendRowsByAdId.get(adId) ?? new Map<string, MetaAdTrendPoint>();
            current.set(date, {
              date,
              spend,
              roas,
              ctr_pct: ctr,
              cpc,
              cpa,
              impressions,
              clicks,
            });
            trendRowsByAdId.set(adId, current);
          });

          trendRowsByAdId.forEach((dailyRows, adId) => {
            const normalized = Array.from(dailyRows.values()).sort((left, right) =>
              left.date.localeCompare(right.date)
            );
            adTrendsById.set(adId, normalized);
          });
        } else {
          const trendInsightsError = await trendInsightsResponse.json();
          log("Meta ad trend insights API error", {
            status: trendInsightsResponse.status,
            error: trendInsightsError,
          });
        }
      }
    } catch (insightsError) {
      log("Failed to load ad insights", insightsError);
    }

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
        metrics: adMetricsById.get(ad.id) ?? null,
        trends: includeTrends ? adTrendsById.get(ad.id) ?? [] : undefined,
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
      metricsCount: adMetricsById.size,
      trendsEnabled: includeTrends,
      trendAdCount: adTrendsById.size,
      adSetId,
      adAccountId,
    });

    const responsePayload = { ads: hydratedAds };

    await writeMetaEdgeCache({
      supabase: cacheClient,
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
