import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PURCHASE_ACTION_TYPES = new Set(["purchase", "omni_purchase"]);

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const extractActionMetric = (
  values: unknown,
  actionTypes: Set<string>
): number =>
  asArray(values)
    .map((item) => {
      if (!item || typeof item !== "object") return 0;
      const record = item as Record<string, unknown>;
      const actionType =
        typeof record.action_type === "string" ? record.action_type : "";
      if (!actionTypes.has(actionType)) return 0;
      return toNumber(record.value);
    })
    .reduce((sum, value) => sum + value, 0);

const toIsoDay = (date: Date): string => date.toISOString().slice(0, 10);

function buildCacheKey(params: {
  provider: string;
  scopeType: string;
  accountId: string;
  breakdownType: string;
  rangePreset: string;
  rangeSince?: string;
  rangeUntil?: string;
}) {
  return [
    params.provider,
    params.scopeType,
    params.accountId,
    params.breakdownType,
    params.rangePreset,
    params.rangeSince ?? "",
    params.rangeUntil ?? "",
  ].join(":");
}

type InsightRow = Record<string, unknown>;

function parseMetrics(row: InsightRow) {
  const spend = toNumber(row.spend);
  const impressions = toNumber(row.impressions);
  const clicks = toNumber(row.clicks);
  const purchaseValue = extractActionMetric(
    row.action_values,
    PURCHASE_ACTION_TYPES
  );
  const purchases = extractActionMetric(row.actions, PURCHASE_ACTION_TYPES);

  return {
    spend: round(spend),
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round(spend / clicks) : 0,
    conversions: round(purchases),
    conversion_value: round(purchaseValue),
    roas: spend > 0 ? round(purchaseValue / spend) : 0,
  };
}

async function fetchInsightsWithBreakdowns(args: {
  adAccountId: string;
  accessToken: string;
  since: string;
  until: string;
  breakdowns: string;
  level?: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<InsightRow[]> {
  const url = `https://graph.facebook.com/v23.0/act_${args.adAccountId}/insights`;
  const params = new URLSearchParams({
    fields:
      "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    breakdowns: args.breakdowns,
    level: args.level ?? "account",
    access_token: args.accessToken,
    limit: "500",
  });

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    args.log(`Meta API error for breakdowns=${args.breakdowns}`, {
      status: response.status,
      error: errorData,
    });
    return [];
  }

  const data = await response.json().catch(() => ({}));
  const rows: InsightRow[] = [];

  if (Array.isArray(data?.data)) {
    rows.push(...data.data);
  }

  let nextUrl = data?.paging?.next;
  let pages = 1;
  while (nextUrl && pages < 10) {
    const nextResponse = await fetch(nextUrl);
    if (!nextResponse.ok) break;
    const nextData = await nextResponse.json().catch(() => ({}));
    if (Array.isArray(nextData?.data)) {
      rows.push(...nextData.data);
    }
    nextUrl = nextData?.paging?.next;
    pages += 1;
  }

  return rows;
}

function buildPlacementBreakdowns(rows: InsightRow[]) {
  return rows.map((row) => ({
    publisher_platform: String(row.publisher_platform ?? "unknown"),
    platform_position: String(
      row.platform_position ?? row.impression_device ?? "unknown"
    ),
    ...parseMetrics(row),
  }));
}

function buildDemographicBreakdowns(rows: InsightRow[]) {
  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      age: String(row.age ?? "unknown"),
      gender: String(row.gender ?? "unknown"),
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
      conversion_value: metrics.conversion_value,
    };
  });
}

function buildDeviceBreakdowns(rows: InsightRow[]) {
  return rows.map((row) => {
    const metrics = parseMetrics(row);
    return {
      device_platform: String(row.device_platform ?? "unknown"),
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
    };
  });
}

function buildFormatBreakdowns(adRows: InsightRow[]) {
  const formatMap = new Map<
    string,
    {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
    }
  >();

  for (const row of adRows) {
    const format = inferFormat(row);
    const existing = formatMap.get(format) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversion_value: 0,
    };

    const metrics = parseMetrics(row);
    existing.spend += metrics.spend;
    existing.impressions += metrics.impressions;
    existing.clicks += metrics.clicks;
    existing.conversions += metrics.conversions;
    existing.conversion_value += metrics.conversion_value;
    formatMap.set(format, existing);
  }

  return Array.from(formatMap.entries()).map(([format, totals]) => ({
    format,
    spend: round(totals.spend),
    impressions: Math.round(totals.impressions),
    clicks: Math.round(totals.clicks),
    ctr:
      totals.impressions > 0
        ? round((totals.clicks / totals.impressions) * 100)
        : 0,
    cpc: totals.clicks > 0 ? round(totals.spend / totals.clicks) : 0,
    conversions: round(totals.conversions),
    conversion_value: round(totals.conversion_value),
    roas:
      totals.spend > 0 ? round(totals.conversion_value / totals.spend) : 0,
  }));
}

function inferFormat(row: InsightRow): string {
  const adName = String(row.ad_name ?? "").toLowerCase();
  const objectType = String(row.object_type ?? "").toLowerCase();

  if (objectType === "video" || adName.includes("video") || adName.includes("reel")) {
    return "video";
  }
  if (objectType === "carousel" || adName.includes("carousel") || adName.includes("dpa")) {
    return "carousel";
  }
  if (objectType === "collection" || adName.includes("collection")) {
    return "collection";
  }
  return "image";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(
      `[fetch-account-breakdowns] ${requestId} ${msg}`,
      extra ?? ""
    );

  try {
    const body = await req.json();
    const { brandId, adAccountId, range, forceRefresh } = body;

    if (!brandId || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "brandId and adAccountId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let since: Date;
    let until: Date;

    switch (range?.preset || "last_7d") {
      case "last_7d":
        since = new Date(now.getTime() - 7 * DAY_MS);
        until = now;
        break;
      case "last_14d":
        since = new Date(now.getTime() - 14 * DAY_MS);
        until = now;
        break;
      case "last_30d":
        since = new Date(now.getTime() - 30 * DAY_MS);
        until = now;
        break;
      case "custom":
        since = range.since
          ? new Date(range.since)
          : new Date(now.getTime() - 7 * DAY_MS);
        until = range.until ? new Date(range.until) : now;
        break;
      default:
        since = new Date(now.getTime() - 7 * DAY_MS);
        until = now;
    }

    const sinceStr = toIsoDay(since);
    const untilStr = toIsoDay(until);

    const cacheKey = buildCacheKey({
      provider: "meta",
      scopeType: "account_breakdowns",
      accountId: adAccountId,
      breakdownType: "all",
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
          log("Cache HIT");
          return new Response(JSON.stringify(data.payload), {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "X-Cache": "HIT",
            },
          });
        }
      }
    }

    const accessToken = await resolveMetaAccessToken({
      brandId,
      adAccountId,
      userToken: supabaseToken,
      actorKind: "user",
      log,
    });

    if (!accessToken) {
      log("No access token for ad account", { adAccountId });
      return new Response(
        JSON.stringify({
          error: "Meta account not configured or access token missing",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    log(
      `Fetching breakdowns for account ${adAccountId} from ${sinceStr} to ${untilStr}`
    );

    const [placementRows, demographicRows, adRows, deviceRows] =
      await Promise.all([
        fetchInsightsWithBreakdowns({
          adAccountId,
          accessToken,
          since: sinceStr,
          until: untilStr,
          breakdowns: "publisher_platform,platform_position",
          log,
        }),
        fetchInsightsWithBreakdowns({
          adAccountId,
          accessToken,
          since: sinceStr,
          until: untilStr,
          breakdowns: "age,gender",
          log,
        }),
        fetchInsightsWithBreakdowns({
          adAccountId,
          accessToken,
          since: sinceStr,
          until: untilStr,
          breakdowns: "ad_format_asset",
          level: "ad",
          log,
        }),
        fetchInsightsWithBreakdowns({
          adAccountId,
          accessToken,
          since: sinceStr,
          until: untilStr,
          breakdowns: "device_platform",
          log,
        }),
      ]);

    const response = {
      placements: buildPlacementBreakdowns(placementRows),
      demographics: buildDemographicBreakdowns(demographicRows),
      formats: buildFormatBreakdowns(adRows),
      devices: buildDeviceBreakdowns(deviceRows),
      range: {
        since: sinceStr,
        until: untilStr,
        preset: range?.preset || "last_7d",
      },
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
          scope_type: "account_breakdowns",
          account_id: adAccountId,
          scope_id: "all",
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

    log("Breakdowns processed successfully", {
      placements: response.placements.length,
      demographics: response.demographics.length,
      formats: response.formats.length,
      devices: response.devices.length,
    });

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    log("Error", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
