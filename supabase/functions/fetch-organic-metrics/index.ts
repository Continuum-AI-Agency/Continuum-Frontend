
// Main entry point for the edge function
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { getDateParams } from "./date-utils.ts";
import { fetchFacebookMetrics } from "./facebook-metrics.ts";
import { fetchInstagramMetrics } from "./instagram-metrics.ts";
import { PlatformType, RequestParams } from "./types.ts";
import { extractBearerToken } from "../_shared/supabase-edge-auth.ts";
import { cacheGet, cacheSet, TTL_12H } from "../_shared/upstash-cache.ts";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type CachePayload = Record<string, unknown>;

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

function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars for cache access");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Main handler function for the edge function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authClient = createSupabaseAdminClient();
    const { data: claimsData, error: authError } = await authClient.auth.getClaims(
      extractBearerToken(req.headers.get("Authorization")),
    );
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      platform, 
      accountId, 
      dateRange, 
      userToken, 
      pageId, 
      instagramId,
      customDateRange,
      forceRefresh
    } = await req.json() as RequestParams;

    console.log(`Fetching ${platform} metrics for account ${accountId} with range ${dateRange}`);
    if (customDateRange) {
      console.log(`Using custom date range: from ${customDateRange.from} to ${customDateRange.to}`);
    }

    // Generate date params based on dateRange and customDateRange (if provided)
    const dateParams = getDateParams(dateRange, customDateRange);
    const scopeId = platform === "instagram" ? (instagramId ?? accountId) : (pageId ?? accountId);
    const scopeType = platform === "instagram" ? "organic_instagram" : "organic_facebook";
    const cacheKey = buildCacheKey({
      provider: "meta",
      scopeType,
      accountId,
      scopeId,
      rangePreset: dateParams.date_preset,
      rangeSince: dateParams.since,
      rangeUntil: dateParams.until,
    });

    if (!forceRefresh) {
      const upstashHit = await cacheGet<CachePayload>(cacheKey);
      if (upstashHit) {
        return new Response(JSON.stringify(upstashHit), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
        });
      }

      try {
        const supabase = createSupabaseAdminClient();
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
          console.error("Cache read error:", error);
        } else if (data?.payload && data.expires_at) {
          const expiresAt = new Date(data.expires_at);
          if (expiresAt.getTime() > Date.now()) {
            await cacheSet(cacheKey, data.payload, TTL_12H);
            return new Response(
              JSON.stringify(data.payload as CachePayload),
              {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "application/json",
                  "X-Cache": "HIT",
                },
              }
            );
          }
        }
      } catch (cacheError) {
        console.error("Cache lookup failed:", cacheError);
      }
    }
    
    if (platform === 'facebook') {
      const response = await fetchFacebookMetrics(pageId, userToken, dateParams);
      const payload = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify(payload), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const supabase = createSupabaseAdminClient();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
        await supabase
          .schema("brand_profiles")
          .from("reporting_cache")
          .insert({
          cache_key: cacheKey,
          provider: "meta",
          scope_type: scopeType,
          account_id: accountId,
          scope_id: scopeId,
          range_preset: dateParams.date_preset,
          range_since: dateParams.since,
          range_until: dateParams.until,
          payload,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        });
        await cacheSet(cacheKey, payload, TTL_12H);
      } catch (cacheError) {
        console.error("Cache write failed:", cacheError);
      }

      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    } else if (platform === 'instagram') {
      const response = await fetchInstagramMetrics(instagramId, userToken, dateParams);
      const payload = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify(payload), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const supabase = createSupabaseAdminClient();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
        await supabase
          .schema("brand_profiles")
          .from("reporting_cache")
          .insert({
          cache_key: cacheKey,
          provider: "meta",
          scope_type: scopeType,
          account_id: accountId,
          scope_id: scopeId,
          range_preset: dateParams.date_preset,
          range_since: dateParams.since,
          range_until: dateParams.until,
          payload,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        });
        await cacheSet(cacheKey, payload, TTL_12H);
      } catch (cacheError) {
        console.error("Cache write failed:", cacheError);
      }

      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Invalid platform specified' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching organic metrics:', error);
    if (error instanceof Error && error.message === "meta_login_required") {
      return new Response(
        JSON.stringify({
          error: "Your Facebook account requires a security check. Log in to www.facebook.com, complete any verification steps, then reconnect your Instagram integration in Settings.",
          errorCode: "meta_login_required",
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
