import type { Edge, Node, NodeProps } from '@xyflow/react';
import type { CanvasGate } from '@/lib/paid-media/jaina-activity-client';

export type CampaignNodeType = 'campaign' | 'ad-set' | 'ad' | 'audience' | 'creative';

export type AdFormat = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'COLLECTION';
export type CreativeAssetType = 'image' | 'video';

/**
 * Present only on a node hydrated from a real row — a RECORD of something Jaina
 * proposed, not a draft someone drew. Its presence is the one thing that distinguishes
 * the two on screen, and the reason an edit to such a node marks the canvas dirty
 * rather than persisting: nothing in this app grants the browser a write to those rows.
 */
export interface CanvasNodeProvenance {
  /** `paid_scaffold_nodes.id`, or the audience group id. */
  sourceId: string;
  /** `c0`, `c0/a1`, `c0/a1/ad2` — the name `paid_scaffold_propose` speaks in. */
  pathKey: string;
  /** The approval standing between this node and Meta. Null when none was opened. */
  gate: CanvasGate | null;
  /** `ACTIVE` / `PAUSED`, once the object actually exists on Meta. */
  metaStatus: string | null;
}

export interface BaseCampaignNodeData extends Record<string, unknown> {
  label: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  validationStatus?: 'valid' | 'warning' | 'error';
  validationErrors?: string[];
  metaId?: string; // ID in Meta Ads Manager
  provenance?: CanvasNodeProvenance;
}

export interface CampaignData extends BaseCampaignNodeData {
  objective:
    | 'OUTCOME_SALES'
    | 'OUTCOME_LEADS'
    | 'OUTCOME_ENGAGEMENT'
    | 'OUTCOME_AWARENESS'
    | 'OUTCOME_TRAFFIC'
    | 'OUTCOME_APP_PROMOTION';
  buyingType: 'AUCTION' | 'RESERVATION';
  specialAdCategories: string[];
}

export interface AdSetData extends BaseCampaignNodeData {
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy?: string;
  budgetType?: 'DAILY' | 'LIFETIME';
  budgetAmount?: number;
  budgetCurrency?: string;
  startTime?: string;
  endTime?: string;
  pacingType?: string[];
}

export interface AdData extends BaseCampaignNodeData {
  adFormat: AdFormat;
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
  assetType: CreativeAssetType;
  assetUrl?: string;
  thumbnailUrl?: string;
  mediaId?: string;
  aspectRatio?: string;
}

type CampaignNodeDataMap = {
  campaign: CampaignData;
  'ad-set': AdSetData;
  ad: AdData;
  audience: AudienceData;
  creative: CreativeData;
};

export type CampaignCanvasNodeData = CampaignNodeDataMap[CampaignNodeType];

export type CampaignCanvasNodeMap = {
  [K in CampaignNodeType]: Node<CampaignNodeDataMap[K], K>;
};

export type CampaignCanvasNode = Node<CampaignCanvasNodeData, CampaignNodeType>;

export type CampaignNodeProps<NodeType extends CampaignNodeType> = NodeProps<
  CampaignCanvasNodeMap[NodeType]
>;

export type CampaignCanvasEdge = Edge;
