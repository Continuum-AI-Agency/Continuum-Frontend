import type {
  TikTokUserInfo,
  TikTokVideo,
  TikTokApiError,
} from "./types.ts";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

const USER_INFO_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "avatar_url_100",
  "avatar_large_url",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "is_verified",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");

const VIDEO_FIELDS = [
  "id",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "height",
  "width",
  "title",
  "embed_html",
  "embed_link",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function parseApiError(
  payload: Record<string, unknown>
): TikTokApiError | null {
  const err = payload.error as Record<string, unknown> | undefined;
  if (!err) return null;
  if (err.code === "ok" || err.code === "") return null;
  return {
    code: String(err.code ?? "unknown"),
    message: String(err.message ?? "Unknown TikTok API error"),
    log_id: err.log_id ? String(err.log_id) : undefined,
  };
}

export async function fetchUserInfo(
  accessToken: string
): Promise<TikTokUserInfo> {
  const url = new URL(`${TIKTOK_API_BASE}/user/info/`);
  url.searchParams.set("fields", USER_INFO_FIELDS);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  const payload = await response.json();

  if (!response.ok) {
    const apiError = parseApiError(payload);
    throw new Error(
      apiError?.message ?? `TikTok user info request failed (${response.status})`
    );
  }

  const apiError = parseApiError(payload);
  if (apiError) {
    throw new Error(apiError.message);
  }

  return payload.data?.user as TikTokUserInfo;
}

export async function fetchVideoList(
  accessToken: string,
  cursor?: number,
  maxCount = 20
): Promise<{
  videos: TikTokVideo[];
  cursor: number | null;
  hasMore: boolean;
}> {
  const clampedCount = Math.min(Math.max(maxCount, 1), 20);
  const url = new URL(`${TIKTOK_API_BASE}/video/list/`);
  url.searchParams.set("fields", VIDEO_FIELDS);

  const body: Record<string, unknown> = { max_count: clampedCount };
  if (cursor !== undefined && cursor > 0) {
    body.cursor = cursor;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    const apiError = parseApiError(payload);
    throw new Error(
      apiError?.message ?? `TikTok video list request failed (${response.status})`
    );
  }

  const apiError = parseApiError(payload);
  if (apiError) {
    throw new Error(apiError.message);
  }

  const data = payload.data ?? {};
  return {
    videos: (data.videos ?? []) as TikTokVideo[],
    cursor: data.cursor ?? null,
    hasMore: data.has_more ?? false,
  };
}

export async function fetchVideosByIds(
  accessToken: string,
  videoIds: string[]
): Promise<TikTokVideo[]> {
  if (videoIds.length === 0) return [];
  if (videoIds.length > 20) {
    throw new Error("video/query supports a maximum of 20 video IDs per request");
  }

  const url = new URL(`${TIKTOK_API_BASE}/video/query/`);
  url.searchParams.set("fields", VIDEO_FIELDS);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters: { video_ids: videoIds } }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const apiError = parseApiError(payload);
    throw new Error(
      apiError?.message ?? `TikTok video query request failed (${response.status})`
    );
  }

  const apiError = parseApiError(payload);
  if (apiError) {
    throw new Error(apiError.message);
  }

  return (payload.data?.videos ?? []) as TikTokVideo[];
}
