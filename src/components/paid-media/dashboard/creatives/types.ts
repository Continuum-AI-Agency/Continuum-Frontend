import type {
  ActionLog,
  ActionStatus,
  ActionType,
  CreativeSwitchExternalPayload,
  ProductSwapProduct,
} from '@/lib/types/dco';
import type { PaidMetricsTrendPoint } from '../PerformanceDetails';

export const CREATIVE_SWAP_ACTION_TYPES: ReadonlyArray<ActionType> = [
  'CREATIVE_SWITCH_EXTERNAL',
  'SWITCH_CREATIVE',
];

export type RotationEvent = {
  id: string;
  occurredAt: string;
  status: ActionStatus;
  actionType: ActionType;
  beforeUrl: string | null;
  afterUrl: string | null;
  outgoing: ProductSwapProduct | null;
  replacement: ProductSwapProduct | null;
  decisionNote: string | null;
  error: string | null;
  payload: CreativeSwitchExternalPayload | null;
  rawLog: ActionLog;
};

export type UniqueCreative = {
  url: string;
  firstSeenAt: string;
  replacedAt: string | null;
  product: ProductSwapProduct | null;
  isCurrent: boolean;
};

export type RotationSummary = {
  rotations: RotationEvent[];
  uniqueCreatives: UniqueCreative[];
  latestSwap: RotationEvent | null;
};

export type OpenCreativeDetail = {
  adId: string;
  focusLogId?: string;
};

export type CreativeFormat = 'image' | 'video' | 'carousel';

export type CreativeAdMetrics = {
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpa: number;
  impressions: number;
  clicks: number;
};

// Canonical first-party (Meta) ad shape shared between CampaignAdSetWorkspace and
// the creative gallery. `format`/`videoId` are optional so the UI degrades
// gracefully until paid-media-reporting/ads starts returning them.
export type CreativeAd = {
  id: string;
  name: string;
  status: string;
  effectiveStatus?: string;
  adsetId?: string;
  campaignId?: string | null;
  previewShareableLink?: string | null;
  metrics?: CreativeAdMetrics | null;
  trends?: PaidMetricsTrendPoint[];
  creative?: {
    id: string;
    name?: string | null;
    title?: string | null;
    body?: string | null;
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
    callToActionType?: string | null;
    format?: CreativeFormat | null;
    videoId?: string | null;
  } | null;
};

export type CreativeMetricKey = keyof CreativeAdMetrics;
export type CreativeSortKey = CreativeMetricKey | 'name';
export type CreativeStatusFilter = 'all' | 'active' | 'paused';

export type CreativeGalleryFilters = {
  query: string;
  sortKey: CreativeSortKey;
  statusFilter: CreativeStatusFilter;
  selectedOnly: boolean;
  selectedIds: ReadonlySet<string>;
};
