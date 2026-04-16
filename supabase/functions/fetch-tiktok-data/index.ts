import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { corsHeaders } from "./lib/cors.ts";
import { lookupIntegrationAccount, resolveTikTokAccessToken } from "./lib/token.ts";
import { fetchUserInfo, fetchVideoList, fetchVideosByIds } from "./lib/tiktok-api.ts";
import type { RequestBody, TikTokResponse, TikTokScope } from "./lib/types.ts";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

function jsonResponse(
  body: unknown,
  status: number,
  extra?: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

const VALID_SCOPES: TikTokScope[] = ["user_info", "videos", "video_query", "all"];

function buildCacheKey(params: {
  scope: TikTokScope;
  brandId: string;
  integrationAccountId: string;
  externalAccountId: string;
  videoCursor?: number;
  videoCount?: number;
  videoIds?: string[];
}): string {
  return [
    "tiktok",
    "organic_data",
    params.scope,
    params.brandId,
    params.integrationAccountId,
    params.externalAccountId,
    String(params.videoCursor ?? 0),
    String(params.videoCount ?? 20),
    (params.videoIds ?? []).sort().join("+") || "_",
  ].join(":");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createSupabaseAdminClient();

    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(supabaseToken);
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // --- Validate request ---
    const body: RequestBody = await req.json();
    if (
      !body.brandId ||
      !body.integrationAccountId ||
      !body.scope ||
      !VALID_SCOPES.includes(body.scope)
    ) {
      return jsonResponse(
        {
          error:
            "brandId, integrationAccountId, and scope (user_info | videos | video_query | all) are required",
        },
        400
      );
    }

    if (body.scope === "video_query" && (!body.videoIds || body.videoIds.length === 0)) {
      return jsonResponse(
        { error: "videoIds is required when scope is video_query" },
        400
      );
    }

    // --- Verify brand-account linkage ---
    const { data: brandAssignment } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .select("id")
      .eq("brand_profile_id", body.brandId)
      .eq("integration_account_id", body.integrationAccountId)
      .maybeSingle();

    if (!brandAssignment) {
      return jsonResponse(
        { error: "Integration account is not linked to this brand" },
        404
      );
    }

    // --- Look up integration account ---
    const account = await lookupIntegrationAccount(
      supabase,
      body.integrationAccountId
    );
    if (!account?.external_account_id) {
      return jsonResponse(
        { error: "Integration account details not found" },
        404
      );
    }

    // --- Cache check ---
    const cacheKey = buildCacheKey({
      scope: body.scope,
      brandId: body.brandId,
      integrationAccountId: body.integrationAccountId,
      externalAccountId: account.external_account_id,
      videoCursor: body.videoCursor,
      videoCount: body.videoCount,
      videoIds: body.videoIds,
    });

    if (!body.forceRefresh) {
      const nowIso = new Date().toISOString();
      const { data: cached } = await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .select("payload,expires_at")
        .eq("cache_key", cacheKey)
        .gt("expires_at", nowIso)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.payload && cached.expires_at) {
        const expiresAt = new Date(cached.expires_at).getTime();
        if (expiresAt > Date.now()) {
          return jsonResponse(cached.payload, 200, { "X-Cache": "HIT" });
        }
      }
    }

    // --- Resolve access token ---
    const accessToken = await resolveTikTokAccessToken(
      supabase,
      account.integration_id
    );

    // --- Fetch data ---
    const warnings: string[] = [];
    const response: TikTokResponse = {
      platform: "tiktok",
      scope: body.scope,
      brandId: body.brandId,
      integrationAccountId: body.integrationAccountId,
      externalAccountId: account.external_account_id,
      fetchedAt: new Date().toISOString(),
    };

    const shouldFetchUserInfo =
      body.scope === "user_info" || body.scope === "all";
    const shouldFetchVideos =
      body.scope === "videos" || body.scope === "all";
    const shouldQueryVideos = body.scope === "video_query";

    if (shouldFetchUserInfo) {
      try {
        response.userInfo = await fetchUserInfo(accessToken);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "User info fetch failed";
        warnings.push(`User info: ${msg}`);
        response.userInfo = null;
      }
    }

    if (shouldFetchVideos) {
      try {
        const videoCount = Math.min(body.videoCount ?? 20, 20);
        const result = await fetchVideoList(
          accessToken,
          body.videoCursor,
          videoCount
        );
        response.videos = result.videos;
        response.videoCursor = result.cursor;
        response.hasMore = result.hasMore;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Video list fetch failed";
        warnings.push(`Video list: ${msg}`);
        response.videos = [];
        response.hasMore = false;
      }
    }

    if (shouldQueryVideos && body.videoIds) {
      try {
        response.videos = await fetchVideosByIds(accessToken, body.videoIds);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Video query failed";
        warnings.push(`Video query: ${msg}`);
        response.videos = [];
      }
    }

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    // --- Persist to organic tables ---
    try {
      if (response.userInfo) {
        await supabase
          .schema("organic")
          .from("tiktok_account_metrics")
          .insert({
            brand_id: body.brandId,
            integration_account_id: body.integrationAccountId,
            external_account_id: account.external_account_id,
            display_name: response.userInfo.display_name ?? null,
            username: response.userInfo.username ?? null,
            avatar_url: response.userInfo.avatar_url ?? null,
            bio_description: response.userInfo.bio_description ?? null,
            profile_deep_link: response.userInfo.profile_deep_link ?? null,
            is_verified: response.userInfo.is_verified ?? null,
            follower_count: response.userInfo.follower_count ?? null,
            following_count: response.userInfo.following_count ?? null,
            likes_count: response.userInfo.likes_count ?? null,
            video_count: response.userInfo.video_count ?? null,
            fetched_at: response.fetchedAt,
          });
      }

      if (response.videos && response.videos.length > 0) {
        const videoRows = response.videos.map((v) => ({
          brand_id: body.brandId,
          integration_account_id: body.integrationAccountId,
          external_account_id: account.external_account_id,
          video_id: v.id,
          title: v.title ?? null,
          video_description: v.video_description ?? null,
          create_time: v.create_time
            ? new Date(v.create_time * 1000).toISOString()
            : null,
          duration: v.duration ?? null,
          height: v.height ?? null,
          width: v.width ?? null,
          cover_image_url: v.cover_image_url ?? null,
          share_url: v.share_url ?? null,
          embed_html: v.embed_html ?? null,
          embed_link: v.embed_link ?? null,
          like_count: v.like_count ?? null,
          comment_count: v.comment_count ?? null,
          share_count: v.share_count ?? null,
          view_count: v.view_count ?? null,
          fetched_at: response.fetchedAt,
          updated_at: response.fetchedAt,
        }));
        await supabase
          .schema("organic")
          .from("tiktok_videos")
          .upsert(videoRows, { onConflict: "brand_id,video_id" });
      }
    } catch (persistError) {
      console.error("[fetch-tiktok-data] organic persist failed", persistError);
      // Non-blocking — data still returned from cache/response
    }

    // --- Write to cache ---
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);
      await supabase
        .schema("brand_profiles")
        .from("reporting_cache")
        .insert({
          cache_key: cacheKey,
          provider: "tiktok",
          scope_type: `organic_data_tiktok_${body.scope}`,
          account_id: body.integrationAccountId,
          scope_id: account.external_account_id,
          range_preset: body.scope,
          range_since: null,
          range_until: null,
          payload: response,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        });
    } catch (cacheWriteError) {
      console.error(
        "[fetch-tiktok-data] cache write failed",
        cacheWriteError
      );
    }

    return jsonResponse(response, 200, { "X-Cache": "MISS" });
  } catch (error) {
    console.error("[fetch-tiktok-data] unhandled error", error);
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Unexpected error",
      },
      500
    );
  }
});
