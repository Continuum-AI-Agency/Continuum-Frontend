import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAllBreakdowns,
  fetchDailyTimeSeries,
} from "../get-account-insights/breakdowns.ts";
import { computeHeuristicInsights } from "../get-account-insights/compute.ts";
import { detectAllAnomalies } from "../get-account-insights/anomalies.ts";
import {
  computePeriodComparison,
  hasSanePeriodComparison,
} from "../get-account-insights/period-comparison.ts";
import { generateCampaignInsights } from "./gemini.ts";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";
import { cacheGet, cacheSet, TTL_12H } from "../_shared/upstash-cache.ts";
import { persistGeneratedInsights } from "./insight-persistence.ts";

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

function buildCacheKey(accountId: string, campaignId: string, preset: string) {
  return `meta:campaign_insights:${accountId}:${campaignId}:${preset}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[get-campaign-insights] ${requestId} ${msg}`, extra ?? "");

  try {
    const body = await req.json();
    const {
      brandId,
      adAccountId,
      campaignId,
      campaignName,
      campaignObjective,
      range,
      forceRefresh,
    } = body;

    if (!brandId || !adAccountId || !campaignId) {
      return new Response(
        JSON.stringify({ error: "brandId, adAccountId, and campaignId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        since = range.since ? new Date(range.since) : new Date(now.getTime() - 7 * DAY_MS);
        until = range.until ? new Date(range.until) : now;
        break;
      default:
        since = new Date(now.getTime() - 7 * DAY_MS);
        until = now;
    }

    const sinceStr = toIsoDay(since);
    const untilStr = toIsoDay(until);
    const durationMs = until.getTime() - since.getTime();
    const prevUntil = new Date(since.getTime() - DAY_MS);
    const prevSince = new Date(prevUntil.getTime() - durationMs);
    const prevSinceStr = toIsoDay(prevSince);
    const prevUntilStr = toIsoDay(prevUntil);

    // --- Resolve campaign name (from request or cache fallback) ---
    let resolvedName = campaignName ?? "";
    let resolvedObjective = campaignObjective ?? "";

    if (!resolvedName) {
      const campaignCacheKey = `meta-edge:campaigns:${adAccountId}:all`;
      const { data: cacheData } = await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .select("payload")
        .eq("cache_key", campaignCacheKey)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheData?.payload) {
        const payload = cacheData.payload as { campaigns?: { id?: string; name?: string; objective?: string }[] };
        const match = (payload.campaigns ?? []).find((c) => c.id === campaignId);
        if (match) {
          resolvedName = match.name ?? "";
          resolvedObjective = resolvedObjective || (match.objective ?? "");
        }
      }
    }

    log(`Campaign: ${resolvedName || campaignId} (${resolvedObjective || "unknown objective"})`);

    // --- Check cache ---
    const cacheKey = buildCacheKey(adAccountId, campaignId, range?.preset || "last_7d");

    if (!forceRefresh) {
      const upstashHit = await cacheGet<Record<string, unknown>>(cacheKey);
      if (upstashHit) {
        if (hasSanePeriodComparison(upstashHit)) {
          log("Upstash cache HIT");
          return new Response(JSON.stringify(upstashHit), {
            headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
          });
        }

        log("Upstash cache ignored due to invalid period comparison");
      }

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
        const cachedPayload = data.payload as { range?: { since?: string; until?: string } };
        const rangeMatches =
          cachedPayload?.range?.since === sinceStr &&
          cachedPayload?.range?.until === untilStr;

        if (expiresAt.getTime() > Date.now() && rangeMatches && hasSanePeriodComparison(data.payload)) {
          log("Postgres cache HIT");

          await cacheSet(cacheKey, data.payload, TTL_12H);

          const timeRemaining = expiresAt.getTime() - Date.now();
          if (timeRemaining < REFRESH_AHEAD_MS) {
            // deno-lint-ignore no-explicit-any
            const runtime = (globalThis as any).EdgeRuntime;
            if (runtime?.waitUntil) {
              runtime.waitUntil(
                generateFresh({
                  supabase, brandId, supabaseToken, adAccountId, campaignId,
                  campaignName: resolvedName, campaignObjective: resolvedObjective,
                  sinceStr, untilStr, prevSinceStr, prevUntilStr,
                  rangePreset: range?.preset || "last_7d", cacheKey,
                  log: (msg: string, extra?: unknown) =>
                    console.log(`[get-campaign-insights] ${requestId} [bg] ${msg}`, extra ?? ""),
                })
              );
            }
          }

          return new Response(JSON.stringify(data.payload), {
            headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
          });
        } else if (expiresAt.getTime() > Date.now() && rangeMatches) {
          log("Postgres cache ignored due to invalid period comparison");
        }
      }
    }

    // --- Cache MISS ---
    log("Cache MISS — generating campaign insights");

    const response = await generateFresh({
      supabase, brandId, supabaseToken, adAccountId, campaignId,
      campaignName: resolvedName, campaignObjective: resolvedObjective,
      sinceStr, untilStr, prevSinceStr, prevUntilStr,
      rangePreset: range?.preset || "last_7d", cacheKey, log,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    log("Error", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateFresh(args: {
  supabase: ReturnType<typeof createClient>;
  brandId: string;
  supabaseToken: string;
  adAccountId: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string;
  sinceStr: string;
  untilStr: string;
  prevSinceStr: string;
  prevUntilStr: string;
  rangePreset: string;
  cacheKey: string;
  log: (msg: string, extra?: unknown) => void;
}) {
  const {
    supabase, brandId, supabaseToken, adAccountId, campaignId, campaignName, campaignObjective,
    sinceStr, untilStr, prevSinceStr, prevUntilStr, rangePreset, cacheKey, log,
  } = args;

  const accessToken = await resolveMetaAccessToken({
    brandId,
    adAccountId,
    userToken: supabaseToken,
    actorKind: "user",
    log,
  });

  if (!accessToken) {
    log("No access token", { adAccountId });
    throw new Error("Meta account not configured or access token missing");
  }

  const fetchArgs = { adAccountId, accessToken, campaignFilter: campaignId, log };

  // Step 1: Parallel fetch — all scoped to this campaign
  const [breakdowns, previousBreakdowns, timeSeries] = await Promise.all([
    fetchAllBreakdowns({ ...fetchArgs, since: sinceStr, until: untilStr }),
    fetchAllBreakdowns({ ...fetchArgs, since: prevSinceStr, until: prevUntilStr }),
    fetchDailyTimeSeries({ ...fetchArgs, since: sinceStr, until: untilStr }),
  ]);

  log("Campaign breakdowns fetched", {
    placements: breakdowns.placements.length,
    demographics: breakdowns.demographics.length,
    formats: breakdowns.formats.length,
    devices: breakdowns.devices.length,
    timeSeries: timeSeries.length,
  });

  // Step 2: Compute heuristics (no objectives at campaign level)
  const computed = computeHeuristicInsights(breakdowns, previousBreakdowns);
  log(`Computed ${computed.length} heuristic insights`);

  // Step 3: Detect anomalies
  const anomalies = detectAllAnomalies({
    current: breakdowns,
    previous: previousBreakdowns,
    timeSeries,
  });
  log(`Detected ${anomalies.length} anomalies`);

  // Step 4: Generate LLM insights via 4 parallel campaign-aware sub-agents
  const llmInsights = await generateCampaignInsights({
    campaignName: campaignName || campaignId,
    campaignObjective,
    data: breakdowns,
    previousData: previousBreakdowns,
    timeSeries,
    anomalies,
    computedInsights: computed,
    log,
  });

  const hasLlmInsights = llmInsights.length > 0;
  log(hasLlmInsights
    ? `Gemini returned ${llmInsights.length} campaign insights`
    : "Gemini unavailable — returning computed-only");

  // Step 5: Period comparison
  const periodComparison = computePeriodComparison(breakdowns, previousBreakdowns);

  // Step 6: Build response with campaign metadata
  const allInsights = [...computed, ...llmInsights].map((insight) => ({
    ...insight,
    campaign_id: campaignId,
  }));
  const ttl = hasLlmInsights ? INSIGHT_TTL_MS : PARTIAL_TTL_MS;
  const nowTime = new Date();
  const expiresAt = new Date(nowTime.getTime() + ttl);

  const response = {
    campaign_id: campaignId,
    campaign_name: campaignName || undefined,
    campaign_objective: campaignObjective || undefined,
    insights: allInsights,
    generated_at: nowTime.toISOString(),
    expires_at: expiresAt.toISOString(),
    range: { since: sinceStr, until: untilStr, preset: rangePreset },
    time_series: timeSeries,
    period_comparison: periodComparison,
  };

  // Step 7: Write cache (upsert)
  try {
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
        scope_type: "campaign_insights",
        account_id: adAccountId,
        scope_id: campaignId,
        range_preset: rangePreset,
        range_since: sinceStr,
        range_until: untilStr,
        payload: response,
        fetched_at: nowTime.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: nowTime.toISOString(),
      });

    await cacheSet(cacheKey, response, TTL_12H);

    log(`Cached campaign insights with ${hasLlmInsights ? "3-day" : "1h (partial)"} TTL`);
  } catch (cacheError) {
    log("Cache write failed", cacheError);
  }

  try {
    await persistGeneratedInsights({
      supabase,
      brandId,
      adAccountId,
      campaignId,
      campaignName: campaignName || null,
      rangePreset,
      rangeSince: sinceStr,
      rangeUntil: untilStr,
      insights: allInsights,
      generatedAt: nowTime.toISOString(),
      log,
    });
  } catch (persistError) {
    log("Insight persistence failed", persistError);
  }

  return response;
}
