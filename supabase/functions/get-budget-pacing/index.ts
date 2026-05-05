import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

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
  budget_remaining?: string;
}

interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  start_time?: string;
  end_time?: string;
}

interface BudgetPacingAdSetEntry {
  adSetId: string;
  adSetName: string;
  status: string;
  budgetType: "daily" | "lifetime";
  totalBudget: number;
  spendToDate: number;
  budgetRemaining: number;
  pacePct: number;
  paceStatus: PaceStatus;
  paceMethod: "budget" | "trend";
  todaySpend: number;
  projectedEndSpend: number;
  daysElapsed: number;
  daysRemaining: number | null;
  flightStart: string | null;
  flightEnd: string | null;
  dailyTrend: Array<{ date: string; spend: number; target: number }>;
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
  paceMethod: "budget" | "trend";
  todaySpend: number;
  projectedEndSpend: number;
  daysElapsed: number;
  daysRemaining: number | null;
  flightStart: string | null;
  flightEnd: string | null;
  dailyTrend: Array<{ date: string; spend: number; target: number }>;
  budgetSource: "campaign" | "adset_sum";
  adSets: BudgetPacingAdSetEntry[];
}

function derivePaceStatus(pacePct: number): PaceStatus {
  if (pacePct > 115) return "overspending";
  if (pacePct < 80) return "underspending";
  return "on_pace";
}

interface PacingParams {
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;  // campaign field
  end_time?: string;   // adset field
  budget_remaining?: string;
  overrideBudgetCents?: number;
  overrideBudgetRemainingCents?: number;
  overrideBudgetType?: "daily" | "lifetime";
}

function computePacing(params: PacingParams, insights: InsightRow[], today: Date) {
  const budgetType = params.overrideBudgetType ??
    (toNumber(params.lifetime_budget) > 0 ? "lifetime" : "daily");

  const totalBudget = params.overrideBudgetCents !== undefined
    ? params.overrideBudgetCents / 100
    : budgetType === "lifetime"
      ? toNumber(params.lifetime_budget) / 100
      : toNumber(params.daily_budget) / 100;

  const spendToDate = insights.reduce((sum, row) => sum + toNumber(row.spend), 0);

  const flightEndRaw = params.stop_time ?? params.end_time ?? null;
  const flightStart = params.start_time ? params.start_time.slice(0, 10) : null;
  const flightEnd = flightEndRaw ? flightEndRaw.slice(0, 10) : null;

  const startDate = flightStart ? new Date(flightStart) : today;
  const endDate = flightEnd ? new Date(flightEnd) : null;

  const daysElapsed = Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / DAY_MS) + 1);
  const daysRemaining = endDate
    ? Math.max(0, Math.floor((endDate.getTime() - today.getTime()) / DAY_MS))
    : null;
  const totalFlightDays = daysRemaining !== null ? daysElapsed + daysRemaining : null;

  const todayStr = toDay(today);
  const todayRow = insights.find((r) => r.date_start === todayStr);
  const todaySpend = todayRow ? round(toNumber(todayRow.spend)) : 0;

  // Rolling 3-day average: use the 3 most recent rows with data (handles Meta's 2-4 day lag)
  const recent3 = insights
    .filter((r) => r.date_start <= todayStr && toNumber(r.spend) > 0)
    .sort((a, b) => b.date_start.localeCompare(a.date_start))
    .slice(0, 3);
  const rolling3dAvg = recent3.length > 0
    ? recent3.reduce((s, r) => s + toNumber(r.spend), 0) / recent3.length
    : 0;

  let pacePct = 0;
  let projectedEndSpend = 0;
  let paceMethod: "budget" | "trend" = "budget";

  if (budgetType === "lifetime" && totalFlightDays && totalFlightDays > 0) {
    const expectedSpendAtThisPoint = totalBudget * (daysElapsed / totalFlightDays);
    pacePct = expectedSpendAtThisPoint > 0
      ? round((spendToDate / expectedSpendAtThisPoint) * 100)
      : 0;
    projectedEndSpend = daysElapsed > 0
      ? round((spendToDate / daysElapsed) * totalFlightDays)
      : 0;
  } else if (budgetType === "daily") {
    if (totalBudget > 0) {
      // Compare rolling 3-day average against daily budget
      pacePct = rolling3dAvg > 0 ? round((rolling3dAvg / totalBudget) * 100) : 0;
    } else {
      // No budget known: pace vs 7-day rolling average daily spend
      const sevenDaysAgo = toDay(new Date(today.getTime() - 7 * DAY_MS));
      const last7 = insights.filter((r) => r.date_start >= sevenDaysAgo && toNumber(r.spend) > 0);
      const sevenDayAvg = last7.length > 0
        ? last7.reduce((s, r) => s + toNumber(r.spend), 0) / last7.length
        : 0;
      if (sevenDayAvg > 0 && rolling3dAvg > 0) {
        pacePct = round((rolling3dAvg / sevenDayAvg) * 100);
        paceMethod = "trend";
      }
    }
  }

  const pacePctClamped = Math.min(200, Math.max(0, pacePct));

  const budgetRemaining = params.overrideBudgetRemainingCents !== undefined
    ? params.overrideBudgetRemainingCents / 100
    : params.budget_remaining != null
      ? toNumber(params.budget_remaining) / 100
      : Math.max(0, totalBudget - spendToDate);

  const dailyTarget = budgetType === "lifetime" && totalFlightDays
    ? round(totalBudget / totalFlightDays)
    : totalBudget;

  const dailyTrend = insights.map((row) => ({
    date: row.date_start,
    spend: round(toNumber(row.spend)),
    target: dailyTarget,
  }));

  return {
    budgetType,
    totalBudget,
    spendToDate: round(spendToDate),
    budgetRemaining: round(budgetRemaining),
    pacePct: pacePctClamped,
    paceStatus: derivePaceStatus(pacePctClamped),
    paceMethod,
    todaySpend,
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
        if (text) {
          const body = JSON.parse(text);
          brandId = brandId || body.brandId || body.brandProfileId;
          adAccountId = adAccountId || body.adAccountId || body.accountId || body.ad_account_id;
          if (body.forceRefresh !== undefined) forceRefresh = Boolean(body.forceRefresh);
        }
      } catch (e) {
        log("Error parsing body text as JSON", e);
      }
    }

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

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = claimsData.claims.sub;
    log("Auth OK, user:", userId);

    // Cache read from dedicated budget_pacing_cache table
    if (!forceRefresh) {
      const { data: cacheRow } = await supabase
        .schema("brand_profiles")
        .from("budget_pacing_cache")
        .select("payload")
        .eq("brand_profile_id", brandId)
        .eq("ad_account_id", adAccountId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cacheRow?.payload) {
        log("Cache HIT");
        return new Response(JSON.stringify(cacheRow.payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
        });
      }
      log("Cache MISS");
    } else {
      log("forceRefresh=true, skipping cache read");
    }

    const accessToken = await resolveMetaAccessToken({
      brandId,
      adAccountId,
      userToken: supabaseToken,
      actorKind: "user",
      log,
    });

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Meta account not configured or access token missing" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Fetch active campaigns only
    log("Fetching campaigns from Meta API");
    const campaignsParams = new URLSearchParams({
      fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,spend_cap,budget_remaining",
      filtering: JSON.stringify([
        { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
      ]),
      limit: "100",
      access_token: accessToken,
    });

    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v23.0/${adAccountId}/campaigns?${campaignsParams}`
    );
    if (!campaignsResponse.ok) {
      const err = await campaignsResponse.json().catch(() => ({}));
      log("Meta campaigns API error", { status: campaignsResponse.status, err });
      return new Response(
        JSON.stringify({ error: "Failed to fetch campaigns from Meta API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const campaigns: MetaCampaign[] = ((await campaignsResponse.json()).data ?? []);
    log("Fetched campaigns", { count: campaigns.length });

    // Step 2: Fetch campaign insights + adsets in one parallel wave
    const wave1 = await Promise.allSettled([
      ...campaigns.map(async (campaign) => {
        const p = new URLSearchParams({
          fields: "spend,date_start,date_stop",
          time_increment: "1",
          date_preset: "maximum",
          access_token: accessToken,
        });
        const res = await fetch(`https://graph.facebook.com/v23.0/${campaign.id}/insights?${p}`);
        if (!res.ok) throw new Error(`Campaign insights ${campaign.id}: ${res.status}`);
        const json = await res.json();
        return { kind: "campaign_insights" as const, id: campaign.id, insights: (json.data ?? []) as InsightRow[] };
      }),
      ...campaigns.map(async (campaign) => {
        const p = new URLSearchParams({
          fields: "id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,end_time",
          filtering: JSON.stringify([
            { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
          ]),
          limit: "50",
          access_token: accessToken,
        });
        const res = await fetch(`https://graph.facebook.com/v23.0/${campaign.id}/adsets?${p}`);
        if (!res.ok) throw new Error(`Adsets ${campaign.id}: ${res.status}`);
        const json = await res.json();
        return { kind: "adsets" as const, campaignId: campaign.id, adSets: (json.data ?? []) as MetaAdSet[] };
      }),
    ]);

    const campaignInsights = new Map<string, InsightRow[]>();
    const campaignAdSets = new Map<string, MetaAdSet[]>();

    for (const result of wave1) {
      if (result.status === "rejected") {
        log("Wave1 fetch failed (non-fatal):", result.reason?.message ?? result.reason);
        continue;
      }
      if (result.value.kind === "campaign_insights") {
        campaignInsights.set(result.value.id, result.value.insights);
      } else {
        campaignAdSets.set(result.value.campaignId, result.value.adSets);
      }
    }

    // Collect all adsets for insights fetch
    const allAdSets: Array<{ campaignId: string; adSet: MetaAdSet }> = [];
    for (const [cid, adSets] of campaignAdSets.entries()) {
      for (const adSet of adSets) allAdSets.push({ campaignId: cid, adSet });
    }
    log("Total adsets to fetch insights for", { count: allAdSets.length });

    // Step 3: Fetch adset insights in parallel
    const wave2 = await Promise.allSettled(
      allAdSets.map(async ({ adSet }) => {
        const p = new URLSearchParams({
          fields: "spend,date_start,date_stop",
          time_increment: "1",
          date_preset: "maximum",
          access_token: accessToken,
        });
        const res = await fetch(`https://graph.facebook.com/v23.0/${adSet.id}/insights?${p}`);
        if (!res.ok) throw new Error(`AdSet insights ${adSet.id}: ${res.status}`);
        const json = await res.json();
        return { adSetId: adSet.id, insights: (json.data ?? []) as InsightRow[] };
      }),
    );

    const adSetInsights = new Map<string, InsightRow[]>();
    for (const result of wave2) {
      if (result.status === "fulfilled") {
        adSetInsights.set(result.value.adSetId, result.value.insights);
      } else {
        log("AdSet insight fetch failed (non-fatal):", result.reason?.message ?? result.reason);
      }
    }

    // Step 4: Build campaign + adset pacing entries
    const today = new Date();

    const campaignEntries: BudgetPacingEntry[] = campaigns.map((campaign) => {
      const insights = campaignInsights.get(campaign.id) ?? [];
      const adSets = campaignAdSets.get(campaign.id) ?? [];

      const isABO = toNumber(campaign.daily_budget) === 0 && toNumber(campaign.lifetime_budget) === 0;
      const budgetSource: "campaign" | "adset_sum" = isABO ? "adset_sum" : "campaign";

      let overrideBudgetCents: number | undefined;
      let overrideBudgetRemainingCents: number | undefined;
      let overrideBudgetType: "daily" | "lifetime" | undefined;

      if (isABO && adSets.length > 0) {
        const hasLifetime = adSets.some((a) => toNumber(a.lifetime_budget) > 0);
        overrideBudgetType = hasLifetime ? "lifetime" : "daily";
        overrideBudgetCents = adSets.reduce(
          (sum, a) => sum + toNumber(hasLifetime ? a.lifetime_budget : a.daily_budget),
          0,
        );
        overrideBudgetRemainingCents = adSets.reduce(
          (sum, a) => sum + toNumber(a.budget_remaining),
          0,
        );
      }

      const adSetEntries: BudgetPacingAdSetEntry[] = adSets.map((adSet) => {
        const pacing = computePacing(
          {
            daily_budget: adSet.daily_budget,
            lifetime_budget: adSet.lifetime_budget,
            start_time: adSet.start_time,
            end_time: adSet.end_time,
            budget_remaining: adSet.budget_remaining,
          },
          adSetInsights.get(adSet.id) ?? [],
          today,
        );
        return { adSetId: adSet.id, adSetName: adSet.name, status: adSet.status, ...pacing };
      });

      // For ABO campaigns: when campaign-level insights are empty, aggregate adset insights
      let insightsForCampaign = insights;
      if (isABO && insights.length === 0 && adSets.length > 0) {
        const merged = new Map<string, number>();
        for (const adSet of adSets) {
          for (const row of (adSetInsights.get(adSet.id) ?? [])) {
            merged.set(row.date_start, (merged.get(row.date_start) ?? 0) + toNumber(row.spend));
          }
        }
        if (merged.size > 0) {
          insightsForCampaign = Array.from(merged.entries()).map(([date_start, spend]) => ({
            spend: String(spend),
            date_start,
            date_stop: date_start,
          }));
        }
      }

      const pacing = computePacing(
        {
          daily_budget: campaign.daily_budget,
          lifetime_budget: campaign.lifetime_budget,
          start_time: campaign.start_time,
          stop_time: campaign.stop_time,
          budget_remaining: campaign.budget_remaining,
          overrideBudgetCents,
          overrideBudgetRemainingCents,
          overrideBudgetType,
        },
        insightsForCampaign,
        today,
      );

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        ...pacing,
        budgetSource,
        adSets: adSetEntries,
      };
    });

    // Step 5: Build summary
    const totalBudgetAll = campaignEntries.reduce((sum, c) => sum + c.totalBudget, 0);
    const totalSpendAll = campaignEntries.reduce((sum, c) => sum + c.spendToDate, 0);
    const totalTodaySpendAll = campaignEntries.reduce((sum, c) => sum + c.todaySpend, 0);
    const totalBudgetRemainingAll = campaignEntries.reduce((sum, c) => sum + c.budgetRemaining, 0);

    // Account budget period: tells the UI whether numbers represent daily caps or flight totals
    const dailyCount = campaignEntries.filter((c) => c.budgetType === "daily").length;
    const lifetimeCount = campaignEntries.filter((c) => c.budgetType === "lifetime").length;
    const accountBudgetPeriod =
      dailyCount > 0 && lifetimeCount > 0 ? "mixed" :
      lifetimeCount > 0 ? "lifetime" : "daily";

    // Overall pace: simple average of campaigns with non-zero pace (budget-weighting breaks
    // when daily caps and lifetime budgets are mixed — they represent different time horizons)
    const campaignsWithPace = campaignEntries.filter((c) => c.pacePct > 0);
    const overallPacePct = campaignsWithPace.length > 0
      ? round(campaignsWithPace.reduce((sum, c) => sum + c.pacePct, 0) / campaignsWithPace.length)
      : 0;

    const summary = {
      totalBudget: round(totalBudgetAll),
      totalSpend: round(totalSpendAll),
      totalTodaySpend: round(totalTodaySpendAll),
      totalBudgetRemaining: round(totalBudgetRemainingAll),
      overallPacePct,
      paceStatus: derivePaceStatus(overallPacePct),
      accountBudgetPeriod,
    };

    const todayStr = toDay(today);
    const responsePayload = {
      campaigns: campaignEntries,
      summary,
      range: { since: todayStr, until: todayStr },
    };

    log("Pacing calculated", { campaigns: campaignEntries.length, summary });

    // Step 6: Write to budget_pacing_cache
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PACING_CACHE_TTL_MS);

    await supabase
      .schema("brand_profiles")
      .from("budget_pacing_cache")
      .upsert(
        {
          brand_profile_id: brandId,
          ad_account_id: adAccountId,
          payload: responsePayload,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "brand_profile_id,ad_account_id" },
      );

    log("Wrote to budget_pacing_cache, expires at", expiresAt.toISOString());

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[get-budget-pacing] unhandled error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
