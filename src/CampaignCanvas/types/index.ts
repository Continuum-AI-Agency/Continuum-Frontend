import type { Edge, Node, NodeProps } from '@xyflow/react';
import type { CanvasGate } from '@/lib/paid-media/jaina-activity-client';

/**
 * The Meta-shaped nodes. Their vocabulary (OUTCOME_SALES, AUCTION, optimization goals) is
 * Meta's, and the only way a graph of them reaches Meta is "Propose via Jaina" -> a
 * human-approved scaffold gate.
 */
export type MetaCampaignNodeType = 'campaign' | 'ad-set' | 'ad' | 'audience' | 'creative';

/**
 * The OpenAI Ads nodes. Deliberately a SEPARATE set rather than a `platform` flag on the
 * Meta ones: the two platforms share no field beyond a name, and widening the live Meta
 * node data to cover both would touch every component that renders them.
 *
 * These are also the first canvas nodes with a direct write path — the canvas publishes
 * them straight to /paid/openai/* rather than through an agent proposal. That is safe
 * because the API creates everything paused and only an explicit activate can serve it.
 */
export type OpenAiCampaignNodeType = 'openai-campaign' | 'openai-ad-group' | 'openai-ad';

export type CampaignNodeType = MetaCampaignNodeType | OpenAiCampaignNodeType;

export const OPENAI_CAMPAIGN_NODE_TYPES: readonly OpenAiCampaignNodeType[] = [
  'openai-campaign',
  'openai-ad-group',
  'openai-ad',
];

export const isOpenAiCampaignNodeType = (
  type: string | undefined,
): type is OpenAiCampaignNodeType =>
  OPENAI_CAMPAIGN_NODE_TYPES.includes(type as OpenAiCampaignNodeType);

/** Which platform a canvas (and every node on it) belongs to. */
export type CampaignCanvasPlatform = 'meta' | 'openai';

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

/**
 * An OpenAI Ads campaign. `openAiId` is the whole difference between a draft and a record:
 * a node that has one is UPDATED on publish, a node without one is CREATED.
 *
 * `biddingType` and `conversionEventSettingIds` are immutable upstream once the campaign
 * exists, so a hydrated node renders them read-only rather than offering an edit the API
 * will refuse.
 */
export interface OpenAiCampaignData extends BaseCampaignNodeData {
  biddingType: 'impressions' | 'clicks' | 'conversions';
  /** Micros. The API's minimum is 1_000_000 (one unit of the account currency). */
  lifetimeSpendLimitMicros?: number;
  currencyCode?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  /** Location ids from /geo_lookup/search. Empty means "all available locations". */
  locationIds?: string[];
  locationLabels?: string[];
  conversionEventSettingIds?: string[];
  openAiId?: string;
  openAiStatus?: string;
}

export interface OpenAiAdGroupData extends BaseCampaignNodeData {
  /** `impression` for CPM campaigns; `click` for BOTH click and conversion campaigns. */
  billingEventType: 'impression' | 'click';
  /** Micros, per billing event. Under oCPC this is the CPA bid despite click billing. */
  maxBidMicros?: number;
  currencyCode?: string;
  description?: string;
  contextHints?: string[];
  openAiId?: string;
  openAiStatus?: string;
}

export interface OpenAiAdData extends BaseCampaignNodeData {
  creativeType: 'chat_card' | 'product_ad_template';
  /** 3-50 chars upstream. */
  title: string;
  /** <= 100 chars upstream. */
  body: string;
  targetUrl?: string;
  /** The uploaded file id. A chat_card cannot be created without one. */
  fileId?: string;
  imageUrl?: string;
  openAiId?: string;
  openAiStatus?: string;
  reviewStatus?: string;
}

type CampaignNodeDataMap = {
  campaign: CampaignData;
  'ad-set': AdSetData;
  ad: AdData;
  audience: AudienceData;
  creative: CreativeData;
  'openai-campaign': OpenAiCampaignData;
  'openai-ad-group': OpenAiAdGroupData;
  'openai-ad': OpenAiAdData;
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
