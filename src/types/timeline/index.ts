export interface TimelineSegment {
  start: string; // ISO Date
  end: string; // ISO Date
  status: 'ACTIVE' | 'PAUSED';
  creative_id?: string;
  audience_id?: string;
  roas_start?: number;
  roas_end?: number;
  ctr_start?: number;
  ctr_end?: number;
  cpa_start?: number;
  cpa_end?: number;
  spend_start?: number;
  spend_end?: number;
}

export type TimelineEventType =
  | 'pause'
  | 'resume'
  | 'creative_change'
  | 'budget_increase'
  | 'budget_decrease'
  | 'budget_change'
  | 'audience_change'
  | 'creative_refresh'
  | 'audience_expand';

export interface TimelineEvent {
  id?: string;
  date: string; // ISO Date
  time?: string;
  type: TimelineEventType;
  summary?: string;
  changes?: Record<string, any>;
  adId?: string;
  adName?: string;
  adsetId?: string;
  adsetName?: string;
  campaignId?: string;
  campaignName?: string;
}

export interface DailyMetric {
  date: string;
  spend?: number;
  roas?: number;
  ctr_pct?: number;
  cpc?: number;
  cpa?: number;
  revenue?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

export interface TimelineAd {
  id: string;
  name: string;
  segments?: TimelineSegment[];
  events?: TimelineEvent[];
}

export interface TimelineAdSet {
  id: string;
  name: string;
  targeting?: string;
  ads?: TimelineAd[];
}

export interface TimelineCampaign {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  daily_budget?: number;
  start_date?: string;
  end_date?: string;
  ad_sets?: TimelineAdSet[];
  metrics_daily?: DailyMetric[];
}

export interface TimelineBlock {
  id: string;
  brand_id: string;
  account_id: string;
  block_start: string;
  block_end: string;
  resolution: string;
  version: number;
  built_at: string;
  summary: Record<string, any>;
  campaigns: TimelineCampaign[];
  events: TimelineEvent[];
  deltas: Record<string, any>;
  content_hash: string;
}
