import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAllBreakdowns,
  fetchCampaignMetrics,
  fetchDailyTimeSeries,
  buildObjectiveBreakdowns,
} from "./breakdowns.ts";
import { fetchAdLevelInsights } from "./creative.ts";
import { computeHeuristicInsights } from "./compute.ts";
import { generateParallelInsights } from "./gemini.ts";
import { detectAllAnomalies } from "./anomalies.ts";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INSIGHT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PARTIAL_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour (if Gemini fails)
const REFRESH_AHEAD_MS = 6 * 60 * 60 * 1000; // background refresh when <6h remaining
const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDay = (date: Date): string => date.toISOString().slice(0, 10);

function buildCacheKey(args: {
  accountId: string;
  rangePreset: string;
}) {
  return ["meta", "account_insights", args.accountId, args.rangePreset].join(":");
}

function computePeriodComparison(
  current: { placements: { spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }[] },
  previous: { placements: { spend: number; impressions: number; clicks: number; conversions: number; conversion_value: number }[] }
) {
  const sum = (arr: typeof current.placements, key: keyof typeof current.placements[0]) =>
    arr.reduce((s, p) => s + (p[key] as number), 0);

  const curSpend = sum(current.placements, "spend");
  const prevSpend = sum(previous.placements, "spend");
  const curConvValue = sum(current.placements, "conversion_value");
  const prevConvValue = sum(previous.placements, "conversion_value");
  const curConv = sum(current.placements, "conversions");
  const prevConv = sum(previous.placements, "conversions");
  const curClicks = sum(current.placements, "clicks");
  const prevClicks = sum(previous.placements, "clicks");
  const curImpressions = sum(current.placements, "impressions");
  const prevImpressions = sum(previous.placements, "impressions");

  const curRoas = curSpend > 0 ? curConvValue / curSpend : 0;
  const prevRoas = prevSpend > 0 ? prevConvValue / prevSpend : 0;
  const curCtr = curImpressions > 0 ? (curClicks / curImpressions) * 100 : 0;
  const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

  const deltaPct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;

  return {
    spend_delta_pct: deltaPct(curSpend, prevSpend),
    roas_delta_pct: deltaPct(curRoas, prevRoas),
    ctr_delta_pct: deltaPct(curCtr, prevCtr),
    conversions_delta_pct: deltaPct(curConv, prevConv),
  };
}

async function readCampaignObjectives(
  supabase: ReturnType<typeof createClient>,
  adAccountId: string,
  log: (msg: string, extra?: unknown) => void
): Promise<Map<string, string>> {
  const cacheKey = `meta-edge:campaigns:${adAccountId}:all`;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .select("payload")
    .eq("cache_key", cacheKey)
    .gt("expires_at", nowIso)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.payload) {
    log("Campaign cache miss — no objective data available", error ?? "");
    return new Map();
  }

  const payload = data.payload as { campaigns?: { id?: string; objective?: string }[] };
  const campaigns = Array.isArray(payload?.campaigns) ? payload.campaigns : [];
  const objectiveMap = new Map<string, string>();
  for (const c of campaigns) {
    if (c.id && c.objective) {
      objectiveMap.set(c.id, c.objective);
    }
  }

  log(`Loaded ${objectiveMap.size} campaign objectives from cache`);
  return objectiveMap;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[get-account-insights] ${requestId} ${msg}`, extra ?? "");

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

    // --- Resolve date range ---
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

    // --- Compute previous period (equal duration, immediately prior) ---
    const durationMs = until.getTime() - since.getTime();
    const prevUntil = new Date(since.getTime() - DAY_MS);
    const prevSince = new Date(prevUntil.getTime() - durationMs);
    const prevSinceStr = toIsoDay(prevSince);
    const prevUntilStr = toIsoDay(prevUntil);

    // --- Check cache ---
    const cacheKey = buildCacheKey({
      accountId: adAccountId,
      rangePreset: range?.preset || "last_7d",
    });

    if (!forceRefresh) {
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .select("payload, expires_at")
        .eq("cache_key", cacheKey)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        log("Cache read error", error);
      } else if (data?.payload && data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        const cachedPayload = data.payload as {
          range?: { since?: string; until?: string };
        };
        const rangeMatches =
          cachedPayload?.range?.since === sinceStr &&
          cachedPayload?.range?.until === untilStr;

        if (expiresAt.getTime() > Date.now() && rangeMatches) {
          log("Cache HIT (3-day insights)");

          // Background refresh when <6h remaining
          const timeRemaining = expiresAt.getTime() - Date.now();
          if (timeRemaining < REFRESH_AHEAD_MS) {
            log("Cache near expiry — triggering background refresh");
            // deno-lint-ignore no-explicit-any
            const runtime = (globalThis as any).EdgeRuntime;
            if (runtime?.waitUntil) {
              runtime.waitUntil(
                generateFreshInsights({
                  supabase,
                  brandId,
                  supabaseToken,
                  adAccountId,
                  sinceStr,
                  untilStr,
                  prevSinceStr,
                  prevUntilStr,
                  rangePreset: range?.preset || "last_7d",
                  cacheKey,
                  log: (msg: string, extra?: unknown) =>
                    console.log(`[get-account-insights] ${requestId} [bg] ${msg}`, extra ?? ""),
                })
              );
            }
          }

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

    // --- Cache MISS: generate fresh insights ---
    log("Cache MISS — generating insights");

    const response = await generateFreshInsights({
      supabase,
      brandId,
      supabaseToken,
      adAccountId,
      sinceStr,
      untilStr,
      prevSinceStr,
      prevUntilStr,
      rangePreset: range?.preset || "last_7d",
      cacheKey,
      log,
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

// --- Extracted insight generation (used for both foreground and background refresh) ---

async function generateFreshInsights(args: {
  supabase: ReturnType<typeof createClient>;
  brandId: string;
  supabaseToken: string;
  adAccountId: string;
  sinceStr: string;
  untilStr: string;
  prevSinceStr: string;
  prevUntilStr: string;
  rangePreset: string;
  cacheKey: string;
  log: (msg: string, extra?: unknown) => void;
}) {
  const {
    supabase,
    brandId,
    supabaseToken,
    adAccountId,
    sinceStr,
    untilStr,
    prevSinceStr,
    prevUntilStr,
    rangePreset,
    cacheKey,
    log,
  } = args;

  // Step 0: Fetch access token + read campaign objectives from cache (parallel)
  const [accessToken, objectiveMap] = await Promise.all([
    resolveMetaAccessToken({
      brandId,
      adAccountId,
      userToken: supabaseToken,
      actorKind: "user",
      log,
    }),
    readCampaignObjectives(supabase, adAccountId, log),
  ]);

  if (!accessToken) {
    log("No access token for ad account", { adAccountId });
    throw new Error("Meta account not configured or access token missing");
  }

  const fetchArgs = { adAccountId, accessToken, log };

  // Step 1: Parallel fetch — current + previous breakdowns + daily time series + campaign metrics + ad-level creatives
  const [breakdowns, previousBreakdowns, timeSeries, campaignMetrics, adCreatives] =
    await Promise.all([
      fetchAllBreakdowns({ ...fetchArgs, since: sinceStr, until: untilStr }),
      fetchAllBreakdowns({
        ...fetchArgs,
        since: prevSinceStr,
        until: prevUntilStr,
      }),
      fetchDailyTimeSeries({ ...fetchArgs, since: sinceStr, until: untilStr }),
      fetchCampaignMetrics({ ...fetchArgs, since: sinceStr, until: untilStr }),
      fetchAdLevelInsights({ ...fetchArgs, since: sinceStr, until: untilStr }),
    ]);

  // Step 1b: Build objective breakdowns
  const objectives = buildObjectiveBreakdowns(campaignMetrics, objectiveMap);

  log("Breakdowns fetched", {
    current: {
      placements: breakdowns.placements.length,
      demographics: breakdowns.demographics.length,
      formats: breakdowns.formats.length,
      devices: breakdowns.devices.length,
    },
    previous: {
      placements: previousBreakdowns.placements.length,
      demographics: previousBreakdowns.demographics.length,
    },
    timeSeries: timeSeries.length,
    campaigns: campaignMetrics.length,
    objectives: objectives.length,
    adCreatives: adCreatives.length,
  });

  // Step 2: Compute heuristic insights (with period comparison + objectives + ad-level creatives)
  const computed = computeHeuristicInsights(
    breakdowns,
    previousBreakdowns,
    objectives,
    adCreatives
  );
  log(`Computed ${computed.length} heuristic insights`);

  // Step 2b: Detect statistical anomalies across all dimensions
  const anomalies = detectAllAnomalies({
    current: breakdowns,
    previous: previousBreakdowns,
    timeSeries,
    objectives,
  });
  log(`Detected ${anomalies.length} anomalies`);

  // Step 3: Generate LLM insights via 4 parallel Gemini sub-agents
  const llmInsights = await generateParallelInsights({
    data: breakdowns,
    previousData: previousBreakdowns,
    timeSeries,
    objectives,
    anomalies,
    computedInsights: computed,
    adCreatives,
    log,
  });

  const hasLlmInsights = llmInsights.length > 0;
  log(
    hasLlmInsights
      ? `Gemini returned ${llmInsights.length} insights`
      : "Gemini unavailable — returning computed-only"
  );

  // Step 4: Compute period comparison summary
  const periodComparison = computePeriodComparison(
    breakdowns,
    previousBreakdowns
  );

  // Step 5: Merge insights
  const allInsights = [...computed, ...llmInsights];

  // Step 6: Compute cache expiry
  const ttl = hasLlmInsights ? INSIGHT_TTL_MS : PARTIAL_TTL_MS;
  const nowTime = new Date();
  const expiresAt = new Date(nowTime.getTime() + ttl);

  const response = {
    insights: allInsights,
    generated_at: nowTime.toISOString(),
    expires_at: expiresAt.toISOString(),
    range: {
      since: sinceStr,
      until: untilStr,
      preset: rangePreset,
    },
    time_series: timeSeries,
    period_comparison: periodComparison,
  };

  // Step 7: Write cache
  try {
    // Delete old cache entry for this key (manual upsert)
    await supabase
      .schema("brand_profiles")
      .from("reporting_cache")
      .delete()
      .eq("cache_key", cacheKey);

    await supabase
      .schema("brand_profiles")
      .from("reporting_cache")
      .insert({
        cache_key: cacheKey,
        provider: "meta",
        scope_type: "account_insights",
        account_id: adAccountId,
        scope_id: "all",
        range_preset: rangePreset,
        range_since: sinceStr,
        range_until: untilStr,
        payload: response,
        fetched_at: nowTime.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: nowTime.toISOString(),
      });

    log(
      `Cached insights with ${hasLlmInsights ? "3-day" : "1h (partial)"} TTL`
    );
  } catch (cacheError) {
    log("Cache write failed", cacheError);
  }

  return response;
}
