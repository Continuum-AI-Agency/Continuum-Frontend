
// Type definitions for the edge function

export type PlatformType = 'facebook' | 'instagram';

export type DateRangePreset = 
  | 'yesterday'
  | 'previous_day'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_month'
  | 'custom';

export interface DateParams {
  since: string;
  until: string;
  date_preset: string;
}

export interface MetricComparison {
  current: number;
  previous: number;
  percentage_change: number;
}

export interface FacebookMetricsResponse {
  platform: 'facebook';
  account_id: string;
  range: string;
  metrics: {
    net_likes: number;
    reach: number;
    impressions: number;
    engagement: number;
  };
  comparison?: {
    net_likes?: MetricComparison;
    reach?: MetricComparison;
    impressions?: MetricComparison;
    engagement?: MetricComparison;
  };
}

export interface InstagramMetricsResponse {
  platform: 'instagram';
  account_id: string;
  range: string;
  metrics: {
    new_followers: number;
    reach: number;
    views: number;
    accounts_engaged: number;
    reels_views: number;
    post_views: number;
    profile_visits_yesterday: number;
    non_follower_reach: number;
  };
  comparison?: {
    new_followers?: MetricComparison;
    reach?: MetricComparison;
    views?: MetricComparison;
    accounts_engaged?: MetricComparison;
    reels_views?: MetricComparison;
    post_views?: MetricComparison;
    non_follower_reach?: MetricComparison;
  };
}

export interface RequestParams {
  platform: PlatformType;
  accountId: string;
  dateRange: DateRangePreset;
  userToken: string;
  pageId?: string;
  instagramId?: string;
  customDateRange?: {
    from: string;
    to: string;
  };
}
