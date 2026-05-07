import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseDateRange } from "./lib/date.ts";
import { fetchFacebookAnalytics } from "./lib/facebook.ts";
import { enrichCityDemographicsWithGoogleGeocoding } from "./lib/geocoding.ts";
import { fetchInstagramAnalytics } from "./lib/instagram.ts";
import type {
  AnalyticsScope,
  IntegrationAccountRow,
  OrganicPlatform,
  OrganicResponse,
  PlatformAnalyticsResult,
  RequestBody,
} from "./lib/types.ts";
import { CACHE_TTL_MS } from "./lib/types.ts";
import { resolveMetaAccessToken as resolveBrandScopedMetaToken } from "../_shared/meta-access-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function resolveMetaAccessToken(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  integrationAccount: IntegrationAccountRow,
  context: { brandId: string; userToken: string },
) {
  if (integrationAccount.ad_account_id) {
    const token = await resolveBrandScopedMetaToken({
      brandId: context.brandId,
      adAccountId: integrationAccount.ad_account_id,
      userToken: context.userToken,
      actorKind: "user",
    });
    if (token && token.length > 0) return token;
  }

  const { data: integrationRow, error: integrationError } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("access_token_encrypted")
    .eq("id", integrationAccount.integration_id)
    .maybeSingle();

  if (integrationError || !integrationRow?.access_token_encrypted) {
    throw new Error("Meta integration token was not found for this account");
  }

  const { data: decryptedToken, error: decryptError } = await supabase
    .schema("brand_profiles")
    .rpc("decrypt_token", {
      ct: integrationRow.access_token_encrypted,
    });

  if (decryptError || !decryptedToken || typeof decryptedToken !== "string") {
    throw new Error("Unable to decrypt Meta integration token");
  }

  return decryptedToken;
}

function buildCacheKey(params: {
  platform: OrganicPlatform;
  scope: AnalyticsScope;
  brandId: string;
  integrationAccountId: string;
  externalAccountId: string;
  since: string;
  until: string;
  selectedPostId: string | null;
  postsLimit: number;
  commentsLimit: number;
}) {
  const {
    platform,
    scope,
    brandId,
    integrationAccountId,
    externalAccountId,
    since,
    until,
    selectedPostId,
    postsLimit,
    commentsLimit,
  } = params;
  return [
    "meta",
    "organic_analytics",
    platform,
    scope,
    brandId,
    integrationAccountId,
    externalAccountId,
    since,
    until,
    selectedPostId ?? "",
    String(postsLimit),
    String(commentsLimit),
  ].join(":");
}

async function fetchPlatformAnalytics(params: {
  account: IntegrationAccountRow;
  platform: OrganicPlatform;
  token: string;
  range: ReturnType<typeof parseDateRange>;
  scope: AnalyticsScope;
  selectedPostId?: string;
  postsLimit: number;
  commentsLimit: number;
  warnings: string[];
}): Promise<PlatformAnalyticsResult> {
  if (params.platform === "facebook") {
    return fetchFacebookAnalytics(params);
  }
  return fetchInstagramAnalytics(params);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (!body.brandId || !body.integrationAccountId || !body.platform || !body.range?.preset) {
      return new Response(JSON.stringify({ error: "brandId, integrationAccountId, platform, and range are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["instagram", "facebook", "tiktok"].includes(body.platform)) {
      return new Response(JSON.stringify({ error: "Unsupported platform" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const scope: AnalyticsScope = body.scope ?? "all";
    if (!["account", "posts", "all", "kpis", "demographics"].includes(scope)) {
      return new Response(JSON.stringify({ error: "Unsupported scope" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseAdminClient();

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);

    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: brandAssignment, error: assignmentError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .select("id")
      .eq("brand_profile_id", body.brandId)
      .eq("integration_account_id", body.integrationAccountId)
      .maybeSingle();

    if (assignmentError || !brandAssignment) {
      return new Response(JSON.stringify({ error: "Integration account is not linked to this brand" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: accountRow, error: accountError } = await supabase
      .schema("brand_profiles")
      .from("integration_accounts_assets")
      .select("id,integration_id,external_account_id,ad_account_id,type,name,raw_payload")
      .eq("id", body.integrationAccountId)
      .maybeSingle();

    if (accountError || !accountRow?.external_account_id) {
      return new Response(JSON.stringify({ error: "Integration account details were not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const account = accountRow as IntegrationAccountRow;
    const range = parseDateRange(body.range);

    const postsLimit = Math.max(1, Math.min(25, body.postsLimit ?? 12));
    const commentsLimit = Math.max(1, Math.min(50, body.commentsLimit ?? 20));

    const cacheKey = buildCacheKey({
      platform: body.platform,
      scope,
      brandId: body.brandId,
      integrationAccountId: body.integrationAccountId,
      externalAccountId: account.external_account_id,
      since: range.since,
      until: range.until,
      selectedPostId: body.selectedPostId ?? null,
      postsLimit,
      commentsLimit,
    });

    if (!body.forceRefresh) {
      const nowIso = new Date().toISOString();
      const { data: cached, error: cacheReadError } = await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .select("payload,expires_at")
        .eq("cache_key", cacheKey)
        .gt("expires_at", nowIso)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheReadError && cached?.payload && cached.expires_at) {
        const expiresAt = new Date(cached.expires_at).getTime();
        if (expiresAt > Date.now()) {
          return new Response(JSON.stringify(cached.payload), {
            headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
          });
        }
      }
    }

    const warnings: string[] = [];

    // TikTok: delegate to fetch-tiktok-data and reshape into OrganicResponse
    if (body.platform === "tiktok") {
      const { data: tiktokData, error: tiktokError } = await supabase.functions.invoke(
        "fetch-tiktok-data",
        {
          body: {
            brandId: body.brandId,
            integrationAccountId: body.integrationAccountId,
            scope: "all",
            forceRefresh: body.forceRefresh ?? false,
          },
        }
      );

      if (tiktokError || !tiktokData) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch TikTok data" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tiktokMetrics: Record<string, number | undefined> = {};
      const userInfo = tiktokData.userInfo as Record<string, unknown> | null;
      if (userInfo) {
        tiktokMetrics.subscribers = (userInfo.follower_count as number) ?? undefined;
        tiktokMetrics.likes = (userInfo.likes_count as number) ?? undefined;
      }

      const videos = (tiktokData.videos ?? []) as Array<Record<string, unknown>>;
      if (videos.length > 0) {
        let totalViews = 0, totalComments = 0, totalShares = 0, totalLikes = 0;
        for (const v of videos) {
          totalViews += (v.view_count as number) ?? 0;
          totalComments += (v.comment_count as number) ?? 0;
          totalShares += (v.share_count as number) ?? 0;
          totalLikes += (v.like_count as number) ?? 0;
        }
        tiktokMetrics.views = totalViews;
        tiktokMetrics.comments = totalComments;
        tiktokMetrics.shares = totalShares;
        if (!tiktokMetrics.likes) tiktokMetrics.likes = totalLikes;
      }

      const posts = videos.map((v) => ({
        id: v.id as string,
        caption: (v.video_description as string) ?? (v.title as string) ?? "",
        media_type: "VIDEO",
        media_url: (v.cover_image_url as string) ?? null,
        permalink: (v.share_url as string) ?? null,
        timestamp: v.create_time
          ? new Date((v.create_time as number) * 1000).toISOString()
          : null,
        like_count: (v.like_count as number) ?? 0,
        comments_count: (v.comment_count as number) ?? 0,
        shares: (v.share_count as number) ?? 0,
        views: (v.view_count as number) ?? 0,
      }));

      const tiktokWarnings = (tiktokData.warnings as string[]) ?? [];
      const response: OrganicResponse = {
        platform: "tiktok",
        scope,
        accountId: account.external_account_id,
        brandId: body.brandId,
        integrationAccountId: body.integrationAccountId,
        externalAccountId: account.external_account_id,
        fetchedAt: new Date().toISOString(),
        range: { preset: range.preset, since: range.since, until: range.until },
        warnings: tiktokWarnings.length > 0 ? tiktokWarnings : undefined,
        metrics: tiktokMetrics,
        comparison: null,
        posts,
      };

      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
        await supabase
          .schema("brand_profiles")
          .from("reporting_cache")
          .insert({
            cache_key: cacheKey,
            provider: "tiktok",
            scope_type: `organic_analytics_tiktok`,
            account_id: body.integrationAccountId,
            scope_id: account.external_account_id,
            range_preset: range.preset,
            range_since: range.since,
            range_until: range.until,
            payload: response,
            fetched_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: now.toISOString(),
          });
      } catch (cacheWriteError) {
        console.error("[fetch-organic-analytics] tiktok cache write failed", cacheWriteError);
      }

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    }

    const token = await resolveMetaAccessToken(supabase, account, {
      brandId: body.brandId,
      userToken: supabaseToken,
    });

    const analytics = await fetchPlatformAnalytics({
      account,
      platform: body.platform,
      token,
      range,
      scope,
      selectedPostId: body.selectedPostId,
      postsLimit,
      commentsLimit,
      warnings,
    });

    if (body.platform === "instagram" && analytics.audienceDemographics?.city?.length) {
      analytics.audienceDemographics.city = await enrichCityDemographicsWithGoogleGeocoding({
        supabase,
        integrationAccountId: body.integrationAccountId,
        externalAccountId: account.external_account_id,
        cityEntries: analytics.audienceDemographics.city,
        countryEntries: analytics.audienceDemographics.country ?? [],
        warnings,
      });
    }

    const response: OrganicResponse = {
      platform: body.platform,
      scope,
      accountId: account.external_account_id,
      brandId: body.brandId,
      integrationAccountId: body.integrationAccountId,
      externalAccountId: account.external_account_id,
      fetchedAt: new Date().toISOString(),
      range: {
        preset: range.preset,
        since: range.since,
        until: range.until,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      metrics: analytics.metrics,
      trends: analytics.trends,
      boostedEvents: analytics.boostedEvents,
      audienceBreakdown: analytics.audienceBreakdown,
      audienceDemographics: analytics.audienceDemographics,
      contentTypePerformance: analytics.contentTypePerformance,
      posts: analytics.posts,
      recentComments: analytics.recentComments,
      comparison: analytics.comparison ?? null,
    };

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
      await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .insert({
          cache_key: cacheKey,
          provider: "meta",
          scope_type: `organic_analytics_${body.platform}`,
          account_id: body.integrationAccountId,
          scope_id: account.external_account_id,
          range_preset: range.preset,
          range_since: range.since,
          range_until: range.until,
          payload: response,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        });
    } catch (cacheWriteError) {
      console.error("[fetch-organic-analytics] cache write failed", cacheWriteError);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    console.error("[fetch-organic-analytics] unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
