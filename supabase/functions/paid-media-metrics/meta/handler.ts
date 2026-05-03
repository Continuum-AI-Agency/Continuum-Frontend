import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { resolveMetaAccessToken } from "../../_shared/meta-access-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildCacheKey(params: {
  provider: string;
  scopeType: string;
  accountId: string;
  scopeId: string;
  rangePreset: string;
  rangeSince?: string;
  rangeUntil?: string;
}) {
  const { provider, scopeType, accountId, scopeId, rangePreset, rangeSince, rangeUntil } = params;
  return [
    provider,
    scopeType,
    accountId,
    scopeId,
    rangePreset,
    rangeSince ?? "",
    rangeUntil ?? "",
  ].join(":");
}

type MetaInsightRow = {
  date_start?: string;
  date_stop?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  cpc?: string | number;
  ctr?: string | number;
  actions?: unknown;
  action_values?: unknown;
  cost_per_action_type?: unknown;
};

type NormalizedInsight = {
  date_start: string;
  date_stop: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  ctr: number;
  roas: number;
  cpa: number;
  purchases: number;
  purchase_value: number;
  actions: unknown[];
  action_values: unknown[];
  cost_per_action_type: unknown[];
};

type AggregatedMetrics = {
  spend: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpa: number;
  purchases: number;
  purchase_value: number;
};

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

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const PURCHASE_ACTION_TYPES = new Set(["purchase", "omni_purchase"]);

const extractActionMetric = (values: unknown, actionTypes: Set<string>): number =>
  asArray(values)
    .map((item) => {
      if (!item || typeof item !== "object") return 0;
      const record = item as Record<string, unknown>;
      const actionType = typeof record.action_type === "string" ? record.action_type : "";
      if (!actionTypes.has(actionType)) return 0;
      return toNumber(record.value);
    })
    .reduce((sum, value) => sum + value, 0);

const extractPurchaseValue = (actionValues: unknown): number =>
  extractActionMetric(actionValues, PURCHASE_ACTION_TYPES);

const extractPurchaseCount = (actions: unknown): number =>
  extractActionMetric(actions, PURCHASE_ACTION_TYPES);

const normalizeInsight = (day: MetaInsightRow): NormalizedInsight => {
  const spend = toNumber(day.spend);
  const impressions = toNumber(day.impressions);
  const clicks = toNumber(day.clicks);
  const purchaseValue = extractPurchaseValue(day.action_values);
  const purchases = extractPurchaseCount(day.actions);
  const cpc = toNumber(day.cpc) || (clicks > 0 ? round(spend / clicks) : 0);
  const ctr = toNumber(day.ctr) || (impressions > 0 ? round((clicks / impressions) * 100) : 0);
  const roas = spend > 0 ? round(purchaseValue / spend) : 0;
  const cpa = purchases > 0 ? round(spend / purchases) : 0;

  return {
    date_start: typeof day.date_start === "string" ? day.date_start : "",
    date_stop: typeof day.date_stop === "string" ? day.date_stop : (typeof day.date_start === "string" ? day.date_start : ""),
    spend,
    impressions,
    clicks,
    cpc,
    ctr,
    roas,
    cpa,
    purchases,
    purchase_value: purchaseValue,
    actions: asArray(day.actions),
    action_values: asArray(day.action_values),
    cost_per_action_type: asArray(day.cost_per_action_type),
  };
};

const aggregateInsights = (rows: NormalizedInsight[]): AggregatedMetrics => {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.purchases += row.purchases;
      acc.purchase_value += row.purchase_value;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0 },
  );

  const ctr = totals.impressions > 0 ? round((totals.clicks / totals.impressions) * 100) : 0;
  const cpc = totals.clicks > 0 ? round(totals.spend / totals.clicks) : 0;
  const cpa = totals.purchases > 0 ? round(totals.spend / totals.purchases) : 0;
  const roas = totals.spend > 0 ? round(totals.purchase_value / totals.spend) : 0;

  return {
    spend: round(totals.spend),
    roas,
    impressions: Math.round(totals.impressions),
    clicks: Math.round(totals.clicks),
    ctr,
    cpc,
    cpa,
    purchases: round(totals.purchases),
    purchase_value: round(totals.purchase_value),
  };
};

const computePercentageChange = (current: number, previous: number | null): number | null => {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100, 2);
};

const buildMetricComparison = (current: number, previous: number | null) => ({
  current,
  previous,
  percentageChange: computePercentageChange(current, previous),
});

const toIsoDay = (date: Date): string => date.toISOString().slice(0, 10);

const computePreviousWindow = (sinceStr: string, untilStr: string) => {
  const since = new Date(`${sinceStr}T00:00:00.000Z`);
  const until = new Date(`${untilStr}T00:00:00.000Z`);
  const windowDays = Math.max(1, Math.floor((until.getTime() - since.getTime()) / DAY_MS) + 1);

  const previousUntil = new Date(since.getTime() - DAY_MS);
  const previousSince = new Date(previousUntil.getTime() - (windowDays - 1) * DAY_MS);

  return {
    since: toIsoDay(previousSince),
    until: toIsoDay(previousUntil),
  };
};

const fetchMetaInsights = async (args: {
  entityId: string;
  accessToken: string;
  level: "campaign" | "adset";
  since: string;
  until: string;
  log: (msg: string, extra?: unknown) => void;
  label: "current" | "previous";
}): Promise<MetaInsightRow[]> => {
  const insightsUrl = `https://graph.facebook.com/v23.0/${args.entityId}/insights`;
  const insightsParams = new URLSearchParams({
    fields: "spend,impressions,clicks,cpc,ctr,actions,action_values,cost_per_action_type,date_start,date_stop",
    time_range: JSON.stringify({ since: args.since, until: args.until }),
    level: args.level,
    time_increment: "1",
    limit: "100",
    access_token: args.accessToken,
  });

  const allRows: MetaInsightRow[] = [];
  let nextUrl: string | null = `${insightsUrl}?${insightsParams.toString()}`;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      args.log(`Meta insights API error (${args.label})`, {
        status: response.status,
        error: errorData,
      });
      throw new Error(`Failed to fetch ${args.label} insights from Meta API`);
    }

    const page = await response.json().catch(() => ({}));
    if (Array.isArray(page?.data)) {
      allRows.push(...page.data);
    }

    nextUrl = typeof page?.paging?.next === "string" ? page.paging.next : null;
  }

  return allRows;
};

export async function handleMetaMetrics(params: any, req: Request) {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[paid-media-metrics:meta] ${requestId} ${msg}`, extra ?? "");

  try {
    const { brandId, accountId: adAccountId, campaignId, adsetId, range, forceRefresh } = params;

    if (!brandId || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "brandId and accountId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!campaignId && !adsetId) {
      return new Response(
        JSON.stringify({ error: "Either campaignId or adsetId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get Supabase token from request
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate user
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

    // Parse date range
    const now = new Date();
    let since: Date, until: Date;

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
        since = range.since ? new Date(range.since) : new Date(now.getTime() - 7 * DAY_MS);
        until = range.until ? new Date(range.until) : now;
        break;
      default:
        since = new Date(now.getTime() - 7 * DAY_MS);
        until = now;
    }

    const sinceStr = toIsoDay(since);
    const untilStr = toIsoDay(until);

    const entityId = adsetId || campaignId;
    const level = adsetId ? "adset" : "campaign";
    const scopeType = adsetId ? "paid_adset" : "paid_campaign";

    const cacheKey = buildCacheKey({
      provider: "meta",
      scopeType,
      accountId: adAccountId,
      scopeId: entityId,
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
          return new Response(JSON.stringify(data.payload), {
            headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
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
      log("No access token found for ad account", { adAccountId });
      return new Response(JSON.stringify({ error: "Meta account not configured or access token missing" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log(`Fetching insights for ${level} ${entityId} from ${sinceStr} to ${untilStr}`);

    const currentRows = await fetchMetaInsights({
      entityId,
      accessToken,
      level,
      since: sinceStr,
      until: untilStr,
      log,
      label: "current",
    });
    const insights = currentRows.map(normalizeInsight);
    const metrics = aggregateInsights(insights);

    const previousWindow = computePreviousWindow(sinceStr, untilStr);
    let previousMetrics: AggregatedMetrics | null = null;

    try {
      const previousRows = await fetchMetaInsights({
        entityId,
        accessToken,
        level,
        since: previousWindow.since,
        until: previousWindow.until,
        log,
        label: "previous",
      });
      previousMetrics = aggregateInsights(previousRows.map(normalizeInsight));
    } catch (error) {
      log("Previous-window insights fetch failed; returning null previous comparisons", error);
    }

    const comparison = {
      spend: buildMetricComparison(metrics.spend, previousMetrics?.spend ?? null),
      roas: buildMetricComparison(metrics.roas, previousMetrics?.roas ?? null),
      impressions: buildMetricComparison(metrics.impressions, previousMetrics?.impressions ?? null),
      clicks: buildMetricComparison(metrics.clicks, previousMetrics?.clicks ?? null),
      ctr: buildMetricComparison(metrics.ctr, previousMetrics?.ctr ?? null),
      cpc: buildMetricComparison(metrics.cpc, previousMetrics?.cpc ?? null),
      cpa: buildMetricComparison(metrics.cpa, previousMetrics?.cpa ?? null),
    };

    const trends = insights.map((day) => ({
      date: day.date_start,
      spend: day.spend,
      roas: day.roas,
      impressions: day.impressions,
      clicks: day.clicks,
      ctr: day.ctr,
      cpc: day.cpc,
      cpa: day.cpa,
    }));

    const response = {
      metrics,
      comparison,
      trends,
      insights,
      range: {
        since: sinceStr,
        until: untilStr,
        preset: range?.preset || "last_7d",
      },
      previous_range: previousWindow,
    };

    try {
      const nowTime = new Date();
      const expiresAt = new Date(nowTime.getTime() + CACHE_TTL_MS);
      await supabase.schema("brand_profiles").from("reporting_cache").insert({
        cache_key: cacheKey,
        provider: "meta",
        scope_type: scopeType,
        account_id: adAccountId,
        scope_id: entityId,
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

    log("Meta metrics processed successfully", { entityId, scopeType, dataPoints: trends.length });
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[paid-media-metrics:meta] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}
