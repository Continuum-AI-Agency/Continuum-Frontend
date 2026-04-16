export type TikTokScope = "user_info" | "videos" | "video_query" | "all";

export type RequestBody = {
  brandId: string;
  integrationAccountId: string;
  scope: TikTokScope;
  videoCursor?: number;
  videoCount?: number;
  videoIds?: string[];
  forceRefresh?: boolean;
};

export type TikTokUserInfo = {
  open_id: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
  avatar_url_100?: string;
  avatar_large_url?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

export type TikTokVideo = {
  id: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  duration?: number;
  height?: number;
  width?: number;
  title?: string;
  embed_html?: string;
  embed_link?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
};

export type TikTokResponse = {
  platform: "tiktok";
  scope: TikTokScope;
  brandId: string;
  integrationAccountId: string;
  externalAccountId: string;
  fetchedAt: string;
  warnings?: string[];
  userInfo?: TikTokUserInfo | null;
  videos?: TikTokVideo[];
  videoCursor?: number | null;
  hasMore?: boolean;
};

export type TikTokApiError = {
  code: string;
  message: string;
  log_id?: string;
};
