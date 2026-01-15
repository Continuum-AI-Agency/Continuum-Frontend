export type ActionStatus = "SUCCESS" | "FAILED" | "PENDING";

export type ActionType = 
  | "PAUSE_ENTITY"
  | "SWITCH_CREATIVE"
  | "UPDATE_COPY"
  | "ADJUST_BUDGET"
  | "SCALE_BUDGET"
  | "CREATE_VARIANT"
  | "ARCHIVE_ENTITY";

export type ScopeType = "campaign" | "adset" | "ad";

export interface ActionLog {
  id: string;
  brandId: string;
  metaAccountId: string;
  actionType: ActionType;
  status: ActionStatus;
  scopeType: ScopeType;
  scopeId: string;
  occurredAt: string; // ISO 8601
  actionPayload: Record<string, unknown>;
  paramsChanged: Record<string, unknown>;
  result: Record<string, unknown>;
  decisionNote: string | null;
  error: string | null;
}

export interface ActionLogResponse {
  data: ActionLog[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

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
  sortBy: "occurred_at" | "campaign_id";
  sortOrder: "asc" | "desc";
}

export interface CampaignOption {
  id: string;
  name: string;
}

export interface CampaignsResponse {
  campaigns: CampaignOption[];
}
