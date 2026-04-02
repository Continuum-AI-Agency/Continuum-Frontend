import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { fetchAllBreakdowns } from "./breakdowns.ts";
import { computeHeuristicInsights } from "./compute.ts";
import { generateLlmInsights } from "./gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INSIGHT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PARTIAL_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour (if Gemini fails)
const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDay = (date: Date): string => date.toISOString().slice(0, 10);

function buildCacheKey(args: {
  accountId: string;
  rangePreset: string;
  rangeSince: string;
  rangeUntil: string;
}) {
  return [
    "meta",
    "account_insights",
    args.accountId,
    args.rangePreset,
    args.rangeSince,
    args.rangeUntil,
  ].join(":");
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

    // --- Check 3-day insight cache ---
    const cacheKey = buildCacheKey({
      accountId: adAccountId,
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
          log("Cache HIT (3-day insights)");
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

    const { data: accessToken, error: tokenError } = await supabase.rpc(
      "get_meta_access_token",
      { p_ad_account_id: adAccountId }
    );

    if (tokenError || !accessToken) {
      log("No access token for ad account", {
        adAccountId,
        error: tokenError,
      });
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

    // Step 1: Fetch breakdowns from Meta API
    const breakdowns = await fetchAllBreakdowns({
      adAccountId,
      accessToken,
      since: sinceStr,
      until: untilStr,
      log,
    });

    log("Breakdowns fetched", {
      placements: breakdowns.placements.length,
      demographics: breakdowns.demographics.length,
      formats: breakdowns.formats.length,
      devices: breakdowns.devices.length,
    });

    // Step 2: Compute heuristic insights (3 per category)
    const computed = computeHeuristicInsights(breakdowns);
    log(`Computed ${computed.length} heuristic insights`);

    // Step 3: Generate LLM insights via Gemini (2 per category)
    const llmInsights = await generateLlmInsights({
      data: breakdowns,
      computedInsights: computed,
      log,
    });

    const hasLlmInsights = llmInsights.length > 0;
    log(
      hasLlmInsights
        ? `Gemini returned ${llmInsights.length} insights`
        : "Gemini unavailable — returning computed-only"
    );

    // Step 4: Merge 3:2 per category
    const allInsights = [...computed, ...llmInsights];

    const response = {
      insights: allInsights,
      generated_at: new Date().toISOString(),
      range: {
        since: sinceStr,
        until: untilStr,
        preset: range?.preset || "last_7d",
      },
    };

    // Step 5: Cache — 3 days if complete, 1 hour if Gemini failed
    try {
      const ttl = hasLlmInsights ? INSIGHT_TTL_MS : PARTIAL_TTL_MS;
      const nowTime = new Date();
      const expiresAt = new Date(nowTime.getTime() + ttl);

      await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .insert({
          cache_key: cacheKey,
          provider: "meta",
          scope_type: "account_insights",
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

      log(
        `Cached insights with ${hasLlmInsights ? "3-day" : "1-hour (partial)"} TTL`
      );
    } catch (cacheError) {
      log("Cache write failed", cacheError);
    }

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
