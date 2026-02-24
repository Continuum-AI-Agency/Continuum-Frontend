export const CACHE_TTL_MS = 60 * 60 * 1000;
export const META_API_VERSION = "v23.0";

export type OrganicPlatform = "instagram" | "facebook";
export type AnalyticsScope = "account" | "posts" | "all";
export type RangePreset =
  | "yesterday"
  | "previous_day"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "last_month"
  | "custom";

export type RequestBody = {
  brandId: string;
  integrationAccountId: string;
  platform: OrganicPlatform;
  range: {
    preset: RangePreset;
    custom?: { from: string; to: string };
  };
  scope?: AnalyticsScope;
  selectedPostId?: string;
  forceRefresh?: boolean;
  postsLimit?: number;
  commentsLimit?: number;
};

export type DateRange = {
  preset: RangePreset;
  since: string;
  until: string;
  untilExclusive: string;
};

export type IntegrationAccountRow = {
  id: string;
  integration_id: string;
  external_account_id: string;
  ad_account_id: string | null;
  type: string | null;
  name: string | null;
  raw_payload: Record<string, unknown> | null;
};

export type OrganicResponse = {
  platform: OrganicPlatform;
  scope: AnalyticsScope;
  accountId: string;
  brandId: string;
  integrationAccountId: string;
  externalAccountId: string;
  fetchedAt: string;
  range: {
    preset: RangePreset;
    since: string;
    until: string;
  };
  warnings?: string[];
  metrics: Record<string, number | undefined>;
  comparison?: Record<string, { current: number; previous: number; percentageChange: number }> | null;
  trends?: Array<Record<string, string | number | boolean | undefined>>;
  boostedEvents?: Array<{ id: string; date: string; postId?: string; label?: string; boostedAt?: string }>;
  audienceBreakdown?: {
    followers: number;
    nonFollowers: number;
  };
  contentTypePerformance?: Array<{
    contentType: string;
    posts?: number;
    reach?: number;
    views?: number;
    engagement?: number;
    comments?: number;
  }>;
  posts?: Array<Record<string, unknown>>;
  recentComments?: Array<Record<string, unknown>>;
};

export type PlatformAnalyticsResult = {
  metrics: Record<string, number | undefined>;
  comparison?: Record<string, { current: number; previous: number; percentageChange: number }> | null;
  trends?: Array<Record<string, string | number | boolean | undefined>>;
  boostedEvents?: Array<{ id: string; date: string; postId?: string; label?: string; boostedAt?: string }>;
  audienceBreakdown?: {
    followers: number;
    nonFollowers: number;
  };
  contentTypePerformance?: Array<{
    contentType: string;
    posts?: number;
    reach?: number;
    views?: number;
    engagement?: number;
    comments?: number;
  }>;
  posts?: Array<Record<string, unknown>>;
  recentComments?: Array<Record<string, unknown>>;
};
