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
  campaignIds?: string[];
  resolution?: "daily" | "hourly";
};

type TimelineSegmentStatus = "ACTIVE" | "PAUSED";

type TimelineEventLike = {
  id?: string;
  date: string;
  type: string;
  summary?: string;
  changes?: Record<string, unknown>;
  adId?: string;
  adName?: string;
  adsetId?: string;
  adsetName?: string;
  campaignId?: string;
  campaignName?: string;
};

type TimelineSegmentLike = {
  start?: string;
  end?: string;
  status: TimelineSegmentStatus;
  spend_start?: number;
  spend_end?: number;
  roas_start?: number;
  roas_end?: number;
  ctr_start?: number;
  ctr_end?: number;
  cpc_start?: number;
  cpc_end?: number;
  conversions_start?: number;
  conversions_end?: number;
};

type TimelineAdLike = {
  id: string;
  name: string;
  segments?: TimelineSegmentLike[];
  events?: TimelineEventLike[];
};

type TimelineAdSetLike = {
  id: string;
  name: string;
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
  id: string;
  name: string;
  status?: string;
  objective?: string;
  start_date?: string;
  end_date?: string;
  metrics_daily?: DailyMetricLike[];
  ad_sets?: TimelineAdSetLike[];
};

type TimelineBlockLike = {
  id: string;
  brand_id: string;
  account_id: string;
  block_start: string;
  block_end: string;
  resolution: string;
  version: number;
  built_at: string;
  summary: Record<string, number>;
  deltas: Record<string, number>;
  campaigns?: TimelineCampaignLike[];
  events?: TimelineEventLike[];
  content_hash?: string;
};

type TimelineAdBlockRow = {
  id: string;
  brand_id: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  block_start: string;
  block_end: string;
  resolution: string;
  version: number;
  built_at: string;
  content_hash: string | null;
  status: string | null;
  active_since: string | null;
  active_until: string | null;
  campaign_status: string | null;
  campaign_objective: string | null;
  campaign_active_since: string | null;
  campaign_active_until: string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  spend: number | string | null;
  conversions: number | string | null;
  revenue: number | string | null;
  ctr_pct: number | string | null;
  cpc: number | string | null;
  cpa: number | string | null;
  roas: number | string | null;
  camp_impressions: number | string | null;
  camp_clicks: number | string | null;
  camp_spend: number | string | null;
  camp_conversions: number | string | null;
  camp_revenue: number | string | null;
  camp_ctr_pct: number | string | null;
  camp_cpc: number | string | null;
  camp_cpa: number | string | null;
  camp_roas: number | string | null;
};

type TimelineEventRow = {
  id: string;
  event_id: string | null;
  timestamp: string;
  type: string;
  summary: string | null;
  changes: Record<string, unknown> | null;
  scope: string;
  scope_id: string | null;
  scope_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  block_start: string;
};

type MetricAccumulator = {
  spend: number;
  roasNumerator: number;
  roasDenominator: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

const TIMELINE_ADSET_ID_PREFIX = "__timeline_adset__";
const TIMELINE_ADSET_NAME = "Timeline Ads";

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

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ratio(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < 0.0000001) return 0;
  return numerator / denominator;
}

function percentageChange(current: number, previous: number): number {
  if (Math.abs(previous) < 0.0000001) {
    return Math.abs(current) < 0.0000001 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function getCampaignMetricValue(row: TimelineAdBlockRow, metric: "spend" | "revenue" | "impressions" | "clicks" | "conversions" | "ctr_pct" | "cpc" | "cpa" | "roas"): number {
  const campaignValue = toNullableNumber(row[`camp_${metric}` as keyof TimelineAdBlockRow]);
  if (campaignValue !== null) {
    return campaignValue;
  }
  return toNumber(row[metric]);
}

function buildMetricAccumulator(): MetricAccumulator {
  return {
    spend: 0,
    roasNumerator: 0,
    roasDenominator: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
  };
}

function addMetrics(accumulator: MetricAccumulator, row: TimelineAdBlockRow) {
  const spend = getCampaignMetricValue(row, "spend");
  const revenue = getCampaignMetricValue(row, "revenue");
  const impressions = getCampaignMetricValue(row, "impressions");
  const clicks = getCampaignMetricValue(row, "clicks");
  const conversions = getCampaignMetricValue(row, "conversions");

  accumulator.spend += spend;
  accumulator.roasNumerator += revenue;
  accumulator.roasDenominator += spend;
  accumulator.impressions += impressions;
  accumulator.clicks += clicks;
  accumulator.conversions += conversions;
  accumulator.revenue += revenue;
}

function summarizeMetrics(accumulator: MetricAccumulator): DailyMetricLike {
  const ctrPct = ratio(accumulator.clicks, accumulator.impressions) * 100;
  const cpc = ratio(accumulator.spend, accumulator.clicks);
  const roas = ratio(accumulator.roasNumerator, accumulator.roasDenominator);

  return {
    date: "",
    spend: accumulator.spend,
    roas,
    ctr_pct: ctrPct,
    cpc,
    revenue: accumulator.revenue,
    impressions: accumulator.impressions,
    clicks: accumulator.clicks,
    conversions: accumulator.conversions,
  };
}

function toTimelineSegmentStatus(value: string | null): TimelineSegmentStatus {
  return (value ?? "").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED";
}

function buildEventPayload(row: TimelineEventRow): TimelineEventLike {
  const scope = (row.scope ?? "").toUpperCase();
  const isAdScope = scope === "AD";
  const isAdSetScope = scope === "ADSET";

  return {
    id: row.event_id ?? row.id,
    date: row.timestamp,
    type: row.type,
    summary: row.summary ?? undefined,
    changes: row.changes ?? undefined,
    adId: isAdScope ? row.scope_id ?? undefined : undefined,
    adName: isAdScope ? row.scope_name ?? undefined : undefined,
    adsetId: isAdSetScope ? row.scope_id ?? undefined : undefined,
    adsetName: isAdSetScope ? row.scope_name ?? undefined : undefined,
    campaignId: row.campaign_id ?? undefined,
    campaignName: row.campaign_name ?? undefined,
  };
}

function buildTimelineBlocks(adRows: TimelineAdBlockRow[], timelineEvents: TimelineEventRow[]): TimelineBlockLike[] {
  const rowsByBlock = new Map<string, TimelineAdBlockRow[]>();
  for (const row of adRows) {
    const key = `${row.block_start}::${row.block_end}::${row.resolution}`;
    const current = rowsByBlock.get(key);
    if (current) {
      current.push(row);
    } else {
      rowsByBlock.set(key, [row]);
    }
  }

  const eventsByBlockStart = new Map<string, TimelineEventLike[]>();
  for (const eventRow of timelineEvents) {
    const event = buildEventPayload(eventRow);
    const current = eventsByBlockStart.get(eventRow.block_start);
    if (current) {
      current.push(event);
    } else {
      eventsByBlockStart.set(eventRow.block_start, [event]);
    }
  }

  for (const events of eventsByBlockStart.values()) {
    events.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  }

  const blocks: TimelineBlockLike[] = [];

  for (const rows of rowsByBlock.values()) {
    if (rows.length === 0) continue;
    const first = rows[0];
    const canonicalRowByCampaign = new Map<string, TimelineAdBlockRow>();

    for (const row of rows) {
      const existing = canonicalRowByCampaign.get(row.campaign_id);
      if (!existing) {
        canonicalRowByCampaign.set(row.campaign_id, row);
        continue;
      }
      if (existing.ad_id !== null && row.ad_id === null) {
        canonicalRowByCampaign.set(row.campaign_id, row);
      }
    }

    const accountAccumulator = buildMetricAccumulator();
    let activeCampaigns = 0;
    let pausedCampaigns = 0;

    for (const canonicalRow of canonicalRowByCampaign.values()) {
      addMetrics(accountAccumulator, canonicalRow);
      if ((canonicalRow.campaign_status ?? canonicalRow.status ?? "").toUpperCase() === "ACTIVE") {
        activeCampaigns += 1;
      } else {
        pausedCampaigns += 1;
      }
    }

    const summaryMetric = summarizeMetrics(accountAccumulator);
    const summary: Record<string, number> = {
      total_spend: summaryMetric.spend ?? 0,
      total_impressions: summaryMetric.impressions ?? 0,
      total_clicks: summaryMetric.clicks ?? 0,
      total_conversions: summaryMetric.conversions ?? 0,
      total_revenue: summaryMetric.revenue ?? 0,
      avg_ctr_pct: summaryMetric.ctr_pct ?? 0,
      avg_cpc: summaryMetric.cpc ?? 0,
      avg_roas: summaryMetric.roas ?? 0,
      active_campaigns: activeCampaigns,
      paused_campaigns: pausedCampaigns,
    };

    const campaignMap = new Map<string, TimelineCampaignLike>();
    const campaignMetricsByDate = new Map<string, Map<string, MetricAccumulator>>();
    const campaignAdSetMap = new Map<string, Map<string, TimelineAdSetLike>>();
    const campaignAdMap = new Map<string, Map<string, TimelineAdLike>>();

    for (const canonicalRow of canonicalRowByCampaign.values()) {
      const campaignId = canonicalRow.campaign_id;
      const campaignName = canonicalRow.campaign_name?.trim() || campaignId;
      const status = canonicalRow.campaign_status ?? canonicalRow.status ?? undefined;

      campaignMap.set(campaignId, {
        id: campaignId,
        name: campaignName,
        status: status ?? undefined,
        objective: canonicalRow.campaign_objective ?? undefined,
        start_date: canonicalRow.campaign_active_since ?? canonicalRow.active_since ?? undefined,
        end_date: canonicalRow.campaign_active_until ?? canonicalRow.active_until ?? undefined,
        metrics_daily: [],
        ad_sets: [],
      });

      const metricsByDate = campaignMetricsByDate.get(campaignId) ?? new Map<string, MetricAccumulator>();
      const metricDate =
        canonicalRow.resolution === "hourly"
          ? canonicalRow.block_start
          : toDayString(canonicalRow.block_start) ?? canonicalRow.block_start;
      const metricAccumulator = metricsByDate.get(metricDate) ?? buildMetricAccumulator();
      addMetrics(metricAccumulator, canonicalRow);
      metricsByDate.set(metricDate, metricAccumulator);
      campaignMetricsByDate.set(campaignId, metricsByDate);
    }

    for (const row of rows) {
      if (!row.ad_id) continue;
      const campaignId = row.campaign_id;
      const adSetId = `${TIMELINE_ADSET_ID_PREFIX}${campaignId}`;

      const adSetsById = campaignAdSetMap.get(campaignId) ?? new Map<string, TimelineAdSetLike>();
      if (!adSetsById.has(adSetId)) {
        adSetsById.set(adSetId, {
          id: adSetId,
          name: TIMELINE_ADSET_NAME,
          ads: [],
        });
      }
      campaignAdSetMap.set(campaignId, adSetsById);

      const adsById = campaignAdMap.get(campaignId) ?? new Map<string, TimelineAdLike>();
      if (!adsById.has(row.ad_id)) {
        adsById.set(row.ad_id, {
          id: row.ad_id,
          name: row.ad_name?.trim() || row.ad_id,
          segments: [],
          events: [],
        });
      }
      campaignAdMap.set(campaignId, adsById);

      const ad = adsById.get(row.ad_id);
      if (!ad) continue;
      ad.segments = ad.segments ?? [];
      ad.segments.push({
        start: row.block_start,
        end: row.block_end,
        status: toTimelineSegmentStatus(row.status),
        spend_start: toNumber(row.spend),
        spend_end: toNumber(row.spend),
        roas_start: toNumber(row.roas),
        roas_end: toNumber(row.roas),
        ctr_start: toNumber(row.ctr_pct),
        ctr_end: toNumber(row.ctr_pct),
        cpc_start: toNumber(row.cpc),
        cpc_end: toNumber(row.cpc),
        conversions_start: toNumber(row.conversions),
        conversions_end: toNumber(row.conversions),
      });
    }

    const campaigns = Array.from(campaignMap.values())
      .map((campaign) => {
        const metricsByDate = campaignMetricsByDate.get(campaign.id) ?? new Map<string, MetricAccumulator>();
        campaign.metrics_daily = Array.from(metricsByDate.entries())
          .map(([date, accumulator]) => {
            const metric = summarizeMetrics(accumulator);
            return {
              ...metric,
              date,
            };
          })
          .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

        const adSetsById = campaignAdSetMap.get(campaign.id);
        const adsById = campaignAdMap.get(campaign.id);

        if (adSetsById && adSetsById.size > 0 && adsById && adsById.size > 0) {
          const sharedAds = Array.from(adsById.values()).map((ad) => {
            const segments = [...(ad.segments ?? [])].sort(
              (left, right) => new Date(left.start ?? 0).getTime() - new Date(right.start ?? 0).getTime()
            );
            return {
              ...ad,
              segments,
            };
          });
          campaign.ad_sets = Array.from(adSetsById.values()).map((adSet) => ({
            ...adSet,
            ads: sharedAds,
          }));
        } else {
          campaign.ad_sets = [];
        }

        return campaign;
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const builtAt = rows
      .map((row) => row.built_at)
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? first.block_end;
    const contentHash = rows.map((row) => row.content_hash).find((value) => typeof value === "string" && value.length > 0) ?? "";
    const version = rows.reduce((maxVersion, row) => Math.max(maxVersion, row.version ?? 1), 1);

    blocks.push({
      id: first.id,
      brand_id: first.brand_id,
      account_id: first.account_id,
      block_start: first.block_start,
      block_end: first.block_end,
      resolution: first.resolution,
      version,
      built_at: builtAt,
      summary,
      deltas: {},
      campaigns,
      events: eventsByBlockStart.get(first.block_start) ?? [],
      content_hash: contentHash,
    });
  }

  blocks.sort((left, right) => new Date(left.block_start).getTime() - new Date(right.block_start).getTime());

  for (let index = 0; index < blocks.length; index += 1) {
    const current = blocks[index];
    const previous = index > 0 ? blocks[index - 1] : undefined;
    const currentSummary = current.summary;
    const previousSummary = previous?.summary;

    current.deltas = {
      spend_delta_pct: previousSummary ? percentageChange(currentSummary.total_spend ?? 0, previousSummary.total_spend ?? 0) : 0,
      roas_delta_pct: previousSummary ? percentageChange(currentSummary.avg_roas ?? 0, previousSummary.avg_roas ?? 0) : 0,
      ctr_delta_pct: previousSummary ? percentageChange(currentSummary.avg_ctr_pct ?? 0, previousSummary.avg_ctr_pct ?? 0) : 0,
      cpc_delta_pct: previousSummary ? percentageChange(currentSummary.avg_cpc ?? 0, previousSummary.avg_cpc ?? 0) : 0,
      impressions_delta_pct: previousSummary
        ? percentageChange(currentSummary.total_impressions ?? 0, previousSummary.total_impressions ?? 0)
        : 0,
      clicks_delta_pct: previousSummary ? percentageChange(currentSummary.total_clicks ?? 0, previousSummary.total_clicks ?? 0) : 0,
      revenue_delta_pct: previousSummary ? percentageChange(currentSummary.total_revenue ?? 0, previousSummary.total_revenue ?? 0) : 0,
      conversions_delta: previousSummary
        ? (currentSummary.total_conversions ?? 0) - (previousSummary.total_conversions ?? 0)
        : 0,
    };
  }

  return blocks;
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
    const campaignIds = Array.isArray(body.campaignIds)
      ? Array.from(new Set(body.campaignIds.map((id) => id.trim()).filter(Boolean)))
      : [];
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

    const { data: accountScopeRow, error: accountScopeError } = await supabase
      .schema("DCO_Campaigns")
      .from("timeline_ad_blocks")
      .select("brand_id")
      .eq("account_id", accountId)
      .limit(1)
      .maybeSingle();

    if (accountScopeError) {
      log("account existence check failed", { accountScopeError });
      return jsonResponse({ error: "Failed to validate account scope" }, 500);
    }

    if ((accountScopeRow?.brand_id ?? "") && accountScopeRow?.brand_id !== brandId) {
      return jsonResponse({ error: "brandId does not match account brand scope" }, 403);
    }

    let query = supabase
      .schema("DCO_Campaigns")
      .from("timeline_ad_blocks")
      .select(
        "id,brand_id,account_id,campaign_id,campaign_name,ad_id,ad_name,block_start,block_end,resolution,version,built_at,content_hash,status,active_since,active_until,campaign_status,campaign_objective,campaign_active_since,campaign_active_until,impressions,clicks,spend,conversions,revenue,ctr_pct,cpc,cpa,roas,camp_impressions,camp_clicks,camp_spend,camp_conversions,camp_revenue,camp_ctr_pct,camp_cpc,camp_cpa,camp_roas"
      )
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

    if (campaignIds.length > 0) {
      query = query.in("campaign_id", campaignIds);
    }

    const { data: adRows, error: queryError } = await query;

    if (queryError) {
      log("timeline query failed", { queryError });
      return jsonResponse({ error: queryError.message }, 500);
    }

    let timelineEvents: TimelineEventRow[] = [];
    let eventsQuery = supabase
      .schema("DCO_Campaigns")
      .from("timeline_events")
      .select("id,event_id,timestamp,type,summary,changes,scope,scope_id,scope_name,campaign_id,campaign_name,block_start")
      .eq("brand_id", brandId)
      .eq("account_id", accountId)
      .order("timestamp", { ascending: true });

    if (startDate) {
      eventsQuery = eventsQuery.gte("timestamp", startDate);
    }

    if (endDate) {
      eventsQuery = eventsQuery.lte("timestamp", endDate);
    }

    if (campaignIds.length > 0) {
      eventsQuery = eventsQuery.in("campaign_id", campaignIds);
    }

    const { data: eventRows, error: eventsError } = await eventsQuery;
    if (eventsError) {
      log("timeline events query failed; returning blocks without events", { eventsError });
    } else {
      timelineEvents = (eventRows ?? []) as TimelineEventRow[];
    }

    const normalizedRows = (adRows ?? []) as TimelineAdBlockRow[];
    return jsonResponse({ blocks: buildTimelineBlocks(normalizedRows, timelineEvents) });
  } catch (error) {
    console.error("[fetch-timeline-blocks] unhandled error", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
