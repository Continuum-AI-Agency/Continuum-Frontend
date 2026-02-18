import { type Node, type Edge } from '@xyflow/react';

export type CampaignNodeType = 
  | 'campaign' 
  | 'ad-set' 
  | 'ad' 
  | 'audience' 
  | 'creative' 
  | 'budget';

export interface BaseCampaignNodeData extends Record<string, unknown> {
  label: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  validationStatus?: 'valid' | 'warning' | 'error';
  validationErrors?: string[];
  metaId?: string; // ID in Meta Ads Manager
}

export interface CampaignData extends BaseCampaignNodeData {
  objective: 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_APP_PROMOTION';
  buyingType: 'AUCTION' | 'RESERVATION';
  specialAdCategories: string[];
}

export interface AdSetData extends BaseCampaignNodeData {
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy?: string;
  startTime?: string;
  endTime?: string;
  pacingType?: string[];
}

export interface AdData extends BaseCampaignNodeData {
  adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION';
  primaryText: string;
  headline: string;
  description?: string;
  callToAction: string;
}

export interface AudienceData extends BaseCampaignNodeData {
  locations: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: number[]; // 1: Male, 2: Female
  interests?: string[];
  behaviors?: string[];
  customAudiences?: string[];
}

export interface CreativeData extends BaseCampaignNodeData {
  assetType: 'image' | 'video';
  assetUrl?: string;
  thumbnailUrl?: string;
  mediaId?: string;
}

export interface BudgetData extends BaseCampaignNodeData {
  type: 'DAILY' | 'LIFETIME';
  amount: number;
  currency: string;
}

export type CampaignCanvasNodeData = 
  | CampaignData 
  | AdSetData 
  | AdData 
  | AudienceData 
  | CreativeData 
  | BudgetData;

export type CampaignCanvasNode = Node & { 
  type: CampaignNodeType;
  data: CampaignCanvasNodeData; 
};

export type CampaignCanvasEdge = Edge;
