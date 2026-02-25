import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TimelineBlocksRequest = {
  brandId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  resolution?: "daily" | "hourly";
};

type TimelineSegmentLike = {
  start?: string;
  end?: string;
  spend_start?: number;
  spend_end?: number;
  roas_start?: number;
  roas_end?: number;
};

type TimelineAdLike = {
  segments?: TimelineSegmentLike[];
};

type TimelineAdSetLike = {
  ads?: TimelineAdLike[];
};

type DailyMetricLike = {
  date: string;
  spend?: number;
  roas?: number;
  ctr_pct?: number;
  cpc?: number;
  revenue?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
};

type TimelineCampaignLike = {
  metrics_daily?: DailyMetricLike[];
  ad_sets?: TimelineAdSetLike[];
  [key: string]: unknown;
};

type TimelineBlockLike = {
  campaigns?: TimelineCampaignLike[];
  [key: string]: unknown;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toDayString(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function deriveMetricsDailyFromSegments(campaign: TimelineCampaignLike): DailyMetricLike[] {
  const byDate = new Map<string, { spend: number; roasSum: number; roasCount: number }>();

  const upsert = (dateRaw: string | undefined, spend?: number, roas?: number) => {
    const date = toDayString(dateRaw);
    if (!date) return;
    const current = byDate.get(date) ?? { spend: 0, roasSum: 0, roasCount: 0 };
    current.spend += typeof spend === "number" ? spend : 0;
    if (typeof roas === "number") {
      current.roasSum += roas;
      current.roasCount += 1;
    }
    byDate.set(date, current);
  };

  for (const adSet of campaign.ad_sets ?? []) {
    for (const ad of adSet.ads ?? []) {
      for (const segment of ad.segments ?? []) {
        upsert(segment.start, segment.spend_start, segment.roas_start);
        upsert(
          segment.end,
          typeof segment.spend_end === "number" ? segment.spend_end : segment.spend_start,
          typeof segment.roas_end === "number" ? segment.roas_end : segment.roas_start
        );
      }
    }
  }

  return Array.from(byDate.entries())
    .map(([date, value]) => ({
      date,
      spend: value.spend,
      roas: value.roasCount > 0 ? value.roasSum / value.roasCount : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeMetricsDaily(metricsDaily: DailyMetricLike[] | undefined): DailyMetricLike[] {
  if (!Array.isArray(metricsDaily) || metricsDaily.length === 0) return [];
  return metricsDaily
    .map((metric) => {
      const date = toDayString(metric.date);
      if (!date) return null;
      return {
        date,
        spend: typeof metric.spend === "number" ? metric.spend : undefined,
        roas: typeof metric.roas === "number" ? metric.roas : undefined,
        ctr_pct: typeof metric.ctr_pct === "number" ? metric.ctr_pct : undefined,
        cpc: typeof metric.cpc === "number" ? metric.cpc : undefined,
        revenue: typeof metric.revenue === "number" ? metric.revenue : undefined,
        impressions: typeof metric.impressions === "number" ? metric.impressions : undefined,
        clicks: typeof metric.clicks === "number" ? metric.clicks : undefined,
        conversions: typeof metric.conversions === "number" ? metric.conversions : undefined,
      };
    })
    .filter((metric): metric is DailyMetricLike => metric !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ensureCampaignMetricsDaily(campaign: TimelineCampaignLike): TimelineCampaignLike {
  const normalizedExisting = normalizeMetricsDaily(campaign.metrics_daily);
  if (normalizedExisting.length > 0) {
    return { ...campaign, metrics_daily: normalizedExisting };
  }

  const derived = deriveMetricsDailyFromSegments(campaign);
  return { ...campaign, metrics_daily: derived };
}

function normalizeTimelineBlocks(data: unknown): TimelineBlockLike[] {
  if (!Array.isArray(data)) return [];
  return data.map((block) => {
    const typedBlock = (block ?? {}) as TimelineBlockLike;
    const campaigns = Array.isArray(typedBlock.campaigns)
      ? typedBlock.campaigns.map(ensureCampaignMetricsDaily)
      : [];
    return { ...typedBlock, campaigns };
  });
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[fetch-timeline-blocks] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!accessToken) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    let body: TimelineBlocksRequest;
    try {
      body = (await req.json()) as TimelineBlocksRequest;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const brandId = body.brandId?.trim();
    const accountId = body.accountId?.trim();
    const startDate = body.startDate?.trim();
    const endDate = body.endDate?.trim();
    const resolution = body.resolution;

    if (!brandId || !accountId) {
      return jsonResponse({ error: "brandId and accountId are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Missing Supabase function configuration" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      log("auth failed", { authError });
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: membership, error: membershipError } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("brand_profile_id")
      .eq("brand_profile_id", brandId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      log("membership check failed", { membershipError });
      return jsonResponse({ error: "Failed to validate brand access" }, 500);
    }

    if (!membership) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { count: accountRowCount, error: accountCountError } = await supabase
      .schema("DCO_Campaigns")
      .from("timeline_blocks")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    if (accountCountError) {
      log("account existence check failed", { accountCountError });
      return jsonResponse({ error: "Failed to validate account scope" }, 500);
    }

    const { count: matchedBrandRowCount, error: brandMatchError } = await supabase
      .schema("DCO_Campaigns")
      .from("timeline_blocks")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("brand_id", brandId);

    if (brandMatchError) {
      log("brand/account match check failed", { brandMatchError });
      return jsonResponse({ error: "Failed to validate brand scope" }, 500);
    }

    if ((accountRowCount ?? 0) > 0 && (matchedBrandRowCount ?? 0) === 0) {
      return jsonResponse({ error: "brandId does not match account brand scope" }, 403);
    }

    let query = supabase
      .schema("DCO_Campaigns")
      .from("timeline_blocks")
      .select("*")
      .eq("brand_id", brandId)
      .eq("account_id", accountId)
      .order("block_start", { ascending: true });

    if (resolution === "daily" || resolution === "hourly") {
      query = query.eq("resolution", resolution);
    }

    if (startDate) {
      query = query.gte("block_end", startDate);
    }

    if (endDate) {
      query = query.lte("block_start", endDate);
    }

    const { data, error: queryError } = await query;

    if (queryError) {
      log("timeline query failed", { queryError });
      return jsonResponse({ error: queryError.message }, 500);
    }

    return jsonResponse({ blocks: normalizeTimelineBlocks(data) });
  } catch (error) {
    console.error("[fetch-timeline-blocks] unhandled error", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
