import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { readMetaEdgeCache } from "../_shared/meta-edge-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PACING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toDay = (d: Date) => d.toISOString().slice(0, 10);

type PaceStatus = "on_pace" | "underspending" | "overspending";

interface InsightRow {
  spend: string | number;
  date_start: string;
  date_stop: string;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  spend_cap?: string;
}

interface BudgetPacingEntry {
  campaignId: string;
  campaignName: string;
  status: string;
  budgetType: "daily" | "lifetime";
  totalBudget: number;
  spendToDate: number;
  budgetRemaining: number;
  pacePct: number;
  paceStatus: PaceStatus;
  projectedEndSpend: number;
  daysElapsed: number;
  daysRemaining: number | null;
  flightStart: string | null;
  flightEnd: string | null;
  dailyTrend: Array<{ date: string; spend: number; target: number }>;
}

function derivePaceStatus(pacePct: number): PaceStatus {
  if (pacePct > 115) return "overspending";
  if (pacePct < 80) return "underspending";
  return "on_pace";
}

function calculatePacing(campaign: MetaCampaign, insights: InsightRow[], today: Date): BudgetPacingEntry {
  const budgetType = campaign.lifetime_budget ? "lifetime" : "daily";

  const totalBudget =
    budgetType === "lifetime"
      ? toNumber(campaign.lifetime_budget) / 100
      : toNumber(campaign.daily_budget) / 100;

  const spendToDate = insights.reduce((sum, row) => sum + toNumber(row.spend), 0);

  const flightStart = campaign.start_time ? campaign.start_time.slice(0, 10) : null;
  const flightEnd = campaign.stop_time ? campaign.stop_time.slice(0, 10) : null;

  const startDate = flightStart ? new Date(flightStart) : today;
  const endDate = flightEnd ? new Date(flightEnd) : null;

  const daysElapsed = Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / DAY_MS) + 1);
  const daysRemaining = endDate
    ? Math.max(0, Math.floor((endDate.getTime() - today.getTime()) / DAY_MS))
    : null;
  const totalFlightDays = daysRemaining !== null ? daysElapsed + daysRemaining : null;

  let pacePct = 0;
  let projectedEndSpend = 0;

  if (budgetType === "lifetime" && totalFlightDays && totalFlightDays > 0) {
    const expectedSpendAtThisPoint = totalBudget * (daysElapsed / totalFlightDays);
    pacePct =
      expectedSpendAtThisPoint > 0
        ? round((spendToDate / expectedSpendAtThisPoint) * 100)
        : 0;
    projectedEndSpend =
      daysElapsed > 0 ? round((spendToDate / daysElapsed) * totalFlightDays) : 0;
  } else if (budgetType === "daily") {
    const todayStr = toDay(today);
    const todayRow = insights.find((r) => r.date_start === todayStr);
    const todaySpend = todayRow ? toNumber(todayRow.spend) : 0;
    pacePct = totalBudget > 0 ? round((todaySpend / totalBudget) * 100) : 0;
    projectedEndSpend = 0;
  }

  const pacePctClamped = Math.min(200, Math.max(0, pacePct));
  const budgetRemaining = Math.max(0, totalBudget - spendToDate);

  const dailyTarget =
    budgetType === "lifetime" && totalFlightDays
      ? round(totalBudget / totalFlightDays)
      : totalBudget;

  const dailyTrend = insights.map((row) => ({
    date: row.date_start,
    spend: round(toNumber(row.spend)),
    target: dailyTarget,
  }));

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: campaign.status,
    budgetType,
    totalBudget,
    spendToDate: round(spendToDate),
    budgetRemaining: round(budgetRemaining),
    pacePct: pacePctClamped,
    paceStatus: derivePaceStatus(pacePctClamped),
    projectedEndSpend,
    daysElapsed,
    daysRemaining,
    flightStart,
    flightEnd,
    dailyTrend,
  };
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[get-budget-pacing] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let brandId: string | null = null;
    let adAccountId: string | null = null;
    let forceRefresh = false;

    const url = new URL(req.url);
    brandId = url.searchParams.get("brandId") || url.searchParams.get("brandProfileId");
    adAccountId =
      url.searchParams.get("adAccountId") ||
      url.searchParams.get("accountId") ||
      url.searchParams.get("ad_account_id");
    forceRefresh = url.searchParams.get("forceRefresh") === "true";

    if (req.method === "POST") {
      try {
        const text = await req.text();
        log("Received POST body text:", text);
        if (text) {
          const body = JSON.parse(text);
          brandId = brandId || body.brandId || body.brandProfileId;
          adAccountId =
            adAccountId || body.adAccountId || body.accountId || body.ad_account_id;
          if (body.forceRefresh !== undefined) {
            forceRefresh = Boolean(body.forceRefresh);
          }
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

    log("Final extracted params:", { brandId, adAccountId, forceRefresh });

    if (!brandId || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "brandId and adAccountId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(supabaseToken);

    if (authError || !user) {
      log("Auth failed", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("Auth OK, user:", user.id);

    const cacheKey = `budget-pacing:${adAccountId}:all`;

    if (!forceRefresh) {
      const cacheHit = await readMetaEdgeCache({
        supabase: supabase as any,
        cacheKey,
        log,
      });

      if (cacheHit) {
        log("Cache HIT");
        return new Response(JSON.stringify(cacheHit.payload), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-Cache": "HIT",
          },
        });
      }

      log("Cache MISS");
    } else {
      log("forceRefresh=true, skipping cache read");
    }

    const { data: accessToken, error: tokenError } = await supabase.rpc(
      "get_meta_access_token",
      { p_ad_account_id: adAccountId },
    );

    if (tokenError) {
      log("Error fetching access token via RPC:", tokenError);
    }

    if (!accessToken) {
      log("No access token found for ad account", adAccountId);
      return new Response(
        JSON.stringify({ error: "Meta account not configured or access token missing" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Fetch campaigns (ACTIVE + PAUSED)
    log("Fetching campaigns from Meta API");
    const campaignsUrl = `https://graph.facebook.com/v23.0/${adAccountId}/campaigns`;
    const campaignsParams = new URLSearchParams({
      fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,spend_cap",
      filtering: JSON.stringify([
        { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
      ]),
      limit: "100",
      access_token: accessToken,
    });

    const campaignsResponse = await fetch(`${campaignsUrl}?${campaignsParams}`);
    if (!campaignsResponse.ok) {
      const errorData = await campaignsResponse.json();
      log("Meta API error fetching campaigns", { status: campaignsResponse.status, error: errorData });
      return new Response(
        JSON.stringify({ error: "Failed to fetch campaigns from Meta API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns: MetaCampaign[] = campaignsData.data ?? [];
    log("Fetched campaigns", { count: campaigns.length });

    // Step 2: Fetch insights for each campaign in parallel
    log("Fetching insights for all campaigns in parallel");

    const insightResults = await Promise.allSettled(
      campaigns.map(async (campaign) => {
        const insightsUrl = `https://graph.facebook.com/v23.0/${campaign.id}/insights`;
        const insightsParams = new URLSearchParams({
          fields: "spend,date_start,date_stop",
          time_increment: "1",
          date_preset: "maximum",
          access_token: accessToken,
        });

        const res = await fetch(`${insightsUrl}?${insightsParams}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            `Meta insights API error for campaign ${campaign.id}: ${res.status} — ${JSON.stringify(err)}`,
          );
        }

        const json = await res.json();
        return { campaignId: campaign.id, insights: (json.data ?? []) as InsightRow[] };
      }),
    );

    const insightsByCampaignId = new Map<string, InsightRow[]>();
    for (const result of insightResults) {
      if (result.status === "fulfilled") {
        insightsByCampaignId.set(result.value.campaignId, result.value.insights);
      } else {
        log("Insight fetch failed for a campaign (non-fatal):", result.reason?.message ?? result.reason);
      }
    }

    log("Insights fetched", {
      total: campaigns.length,
      succeeded: insightsByCampaignId.size,
      failed: campaigns.length - insightsByCampaignId.size,
    });

    // Step 3 + 4: Calculate pacing per campaign and build summary
    const today = new Date();

    const campaignEntries: BudgetPacingEntry[] = campaigns.map((campaign) => {
      const insights = insightsByCampaignId.get(campaign.id) ?? [];
      return calculatePacing(campaign, insights, today);
    });

    const totalBudgetAll = campaignEntries.reduce((sum, c) => sum + c.totalBudget, 0);
    const totalSpendAll = campaignEntries.reduce((sum, c) => sum + c.spendToDate, 0);
    const totalBudgetRemainingAll = campaignEntries.reduce((sum, c) => sum + c.budgetRemaining, 0);

    // Weighted average pace — weight by totalBudget; fall back to simple average when all budgets are 0
    let overallPacePct = 0;
    if (totalBudgetAll > 0) {
      overallPacePct = round(
        campaignEntries.reduce((sum, c) => sum + c.pacePct * c.totalBudget, 0) / totalBudgetAll,
      );
    } else if (campaignEntries.length > 0) {
      overallPacePct = round(
        campaignEntries.reduce((sum, c) => sum + c.pacePct, 0) / campaignEntries.length,
      );
    }

    const summary = {
      totalBudget: round(totalBudgetAll),
      totalSpend: round(totalSpendAll),
      totalBudgetRemaining: round(totalBudgetRemainingAll),
      overallPacePct,
      paceStatus: derivePaceStatus(overallPacePct),
    };

    const todayStr = toDay(today);

    // Step 5: Build final response payload
    const responsePayload = {
      campaigns: campaignEntries,
      summary,
      range: { since: todayStr, until: todayStr },
    };

    log("Pacing calculated", {
      campaigns: campaignEntries.length,
      summary,
    });

    // Write to cache with 1h TTL
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PACING_CACHE_TTL_MS);

    await supabase
      .schema("brand_profiles")
      .from("reporting_cache")
      .insert({
        cache_key: cacheKey,
        provider: "meta",
        scope_type: "budget_pacing",
        account_id: adAccountId,
        scope_id: adAccountId,
        range_preset: "budget_pacing_1h",
        range_since: now.toISOString().slice(0, 10),
        range_until: now.toISOString().slice(0, 10),
        payload: responsePayload,
        fetched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      });

    log("Wrote to cache, expires at", expiresAt.toISOString());

    return new Response(JSON.stringify(responsePayload), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("[get-budget-pacing] unhandled error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
