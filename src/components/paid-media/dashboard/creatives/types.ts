import type {
  ActionLog,
  ActionStatus,
  ActionType,
  CreativeSwitchExternalPayload,
  ProductSwapProduct,
} from "@/lib/types/dco";

export const CREATIVE_SWAP_ACTION_TYPES: ReadonlyArray<ActionType> = [
  "CREATIVE_SWITCH_EXTERNAL",
  "SWITCH_CREATIVE",
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
