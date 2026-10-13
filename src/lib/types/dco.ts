import type { RuleActionLog, RuleActionLogPagination } from '@continuum/contracts';

export type ActionStatus = 'APPROVED' | 'FAILED' | 'PENDING' | 'SUCCESS' | 'EXECUTED' | 'REJECTED';

export type ActionType =
  | 'PAUSE_CAMPAIGN'
  | 'PAUSE_AD'
  | 'ALERT_ACCOUNT'
  | 'NOOP'
  | 'PAUSE_ENTITY'
  | 'SWITCH_CREATIVE'
  | 'CREATIVE_SWITCH_EXTERNAL'
  | 'UPDATE_COPY'
  | 'ADJUST_BUDGET'
  | 'SCALE_BUDGET'
  | 'SCALE_CAMPAIGN'
  | 'SCALE_AD'
  | 'CREATE_VARIANT'
  | 'ARCHIVE_ENTITY';

export type ScopeType = 'GLOBAL' | 'ACCOUNT' | 'CAMPAIGN' | 'ADSET' | 'AD';

export interface ProductSwapProduct {
  name: string;
  brand: string;
  external_id: string;
  reason?: string;
  sizes?: string;
  discount?: number;
  quality_score?: number;
  similarity_score?: number;
}

export interface CreativeSwitchExternalPayload {
  operation: string;
  original_creative_url: string;
  new_creative_url: string;
  outgoing_product?: ProductSwapProduct;
  replacement_product?: ProductSwapProduct;
  plan_timestamp?: string;
  maintenance_file?: string;
}

/** One action log row, as validated at the edge boundary (`@continuum/contracts`). */
export type ActionLog = RuleActionLog;

export type ActionLogResponse = {
  data: ActionLog[];
  pagination: RuleActionLogPagination;
};

export interface ActionLogFilters {
  metaAccountId?: string;
  campaignId?: string;
  actionType?: ActionType;
  status?: ActionStatus;
  scopeType?: ScopeType;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdAccountOption {
  id: string;
  name: string;
}

export interface CampaignOption {
  id: string;
  name: string;
}

export interface CampaignsResponse {
  campaigns: CampaignOption[];
}

export interface AdAccountsResponse {
  accounts: AdAccountOption[];
}

export interface ActionLogSort {
  sortBy: 'occurred_at' | 'campaign_id';
  sortOrder: 'asc' | 'desc';
}

export interface CampaignOption {
  id: string;
  name: string;
}

export interface CampaignsResponse {
  campaigns: CampaignOption[];
}
