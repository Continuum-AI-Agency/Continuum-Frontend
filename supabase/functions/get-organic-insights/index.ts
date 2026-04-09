import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { computeOrganicHeuristics, type OrganicDataBundle } from "./compute.ts";
import { detectAllOrganicAnomalies } from "./anomalies.ts";
import { generateOrganicParallelInsights } from "./gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INSIGHT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const PARTIAL_TTL_MS = 1 * 60 * 60 * 1000;       // 1 hour (if Gemini fails)
const REFRESH_AHEAD_MS = 6 * 60 * 60 * 1000;     // background refresh when <6h remaining


function buildCacheKey(args: {
  platform: string;
  integrationAccountId: string;
  rangePreset: string;
}) {
  return ["meta", "organic_insights", args.platform, args.integrationAccountId, args.rangePreset].join(":");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) =>
    console.log(`[get-organic-insights] ${requestId} ${msg}`, extra ?? "");

  try {
    const body = await req.json();
    const { brandId, integrationAccountId, platform, range, forceRefresh } = body;

    if (!brandId || !integrationAccountId) {
      return new Response(
        JSON.stringify({ error: "brandId and integrationAccountId are required" }),
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

    const rangePreset = range?.preset || "last_7d";
    const cacheKey = buildCacheKey({
      platform: platform ?? "facebook",
      integrationAccountId,
      rangePreset,
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

        if (expiresAt.getTime() > Date.now()) {
          log("Cache HIT (3-day insights)");

          const timeRemaining = expiresAt.getTime() - Date.now();
          if (timeRemaining < REFRESH_AHEAD_MS) {
            log("Cache near expiry — triggering background refresh");
            // deno-lint-ignore no-explicit-any
            const runtime = (globalThis as any).EdgeRuntime;
            if (runtime?.waitUntil) {
              runtime.waitUntil(
                generateFreshInsights({
                  supabase,
                  integrationAccountId,
                  platform: platform ?? "facebook",
                  rangePreset,
                  cacheKey,
                  log: (msg: string, extra?: unknown) =>
                    console.log(`[get-organic-insights] ${requestId} [bg] ${msg}`, extra ?? ""),
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

    log("Cache MISS — generating organic insights");

    const response = await generateFreshInsights({
      supabase,
      integrationAccountId,
      platform: platform ?? "facebook",
      rangePreset,
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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function generateFreshInsights(args: {
  supabase: ReturnType<typeof createClient>;
  integrationAccountId: string;
  platform: string;
  rangePreset: string;
  cacheKey: string;
  log: (msg: string, extra?: unknown) => void;
}) {
  const { supabase, integrationAccountId, platform, rangePreset, cacheKey, log } = args;

  // Step 1: Read cached organic data from reporting_cache
  const { data: cachedRow, error: cacheReadError } = await supabase
    .schema("brand_profiles")
    .from("reporting_cache")
    .select("payload")
    .eq("scope_type", `organic_analytics_${platform}`)
    .eq("account_id", integrationAccountId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cacheReadError) {
    log("Organic cache read error", cacheReadError);
  }

  if (!cachedRow?.payload) {
    throw new Error("No cached organic data found — run analytics first");
  }

  // Step 2: Parse the payload
  const payload = cachedRow.payload as Record<string, unknown>;

  const organicData = {
    metrics: payload.metrics ?? {},
    comparison: payload.comparison ?? null,
    trends: Array.isArray(payload.trends) ? payload.trends : [],
    audienceBreakdown: payload.audienceBreakdown ?? undefined,
    audienceDemographics: payload.audienceDemographics ?? undefined,
    contentTypePerformance: Array.isArray(payload.contentTypePerformance) ? payload.contentTypePerformance : [],
    posts: Array.isArray(payload.posts) ? payload.posts : [],
    boostedEvents: Array.isArray(payload.boostedEvents) ? payload.boostedEvents : [],
  } as OrganicDataBundle;

  // Step 3: Compute heuristic insights
  const computed = computeOrganicHeuristics(organicData);
  log(`Computed ${computed.length} heuristic insights`);

  // Step 4: Detect anomalies
  const anomalies = detectAllOrganicAnomalies(organicData);
  log(`Detected ${anomalies.length} anomalies`);

  // Step 5: Generate LLM insights via 4 parallel Gemini sub-agents
  const llmInsights = await generateOrganicParallelInsights({
    organicData,
    anomalies,
    computedInsights: computed,
    log,
  });
  const hasLlmInsights = llmInsights.length > 0;
  log(
    hasLlmInsights
      ? `Gemini returned ${llmInsights.length} insights`
      : "Gemini unavailable — returning computed-only"
  );

  // Step 6: Merge and build response
  const allInsights = [...computed, ...llmInsights];
  const ttl = hasLlmInsights ? INSIGHT_TTL_MS : PARTIAL_TTL_MS;
  const nowTime = new Date();
  const expiresAt = new Date(nowTime.getTime() + ttl);

  const response = {
    insights: allInsights,
    generated_at: nowTime.toISOString(),
    expires_at: expiresAt.toISOString(),
    range: { preset: rangePreset },
  };

  // Step 7: Write cache (delete + insert pattern)
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
        scope_type: "organic_insights",
        account_id: integrationAccountId,
        scope_id: platform,
        range_preset: rangePreset,
        payload: response,
        fetched_at: nowTime.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: nowTime.toISOString(),
      });

    log(`Cached insights with ${hasLlmInsights ? "3-day" : "1h (partial)"} TTL`);
  } catch (cacheError) {
    log("Cache write failed", cacheError);
  }

  // Step 8: Return response
  return response;
}
