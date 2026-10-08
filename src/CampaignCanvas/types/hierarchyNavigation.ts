import type { HandleType } from '@xyflow/react';
import { AUDIENCE_HANDLE_ID, type CampaignNodeType } from './index';

const CHILD_NODE_BY_SOURCE_TYPE: Partial<Record<CampaignNodeType, CampaignNodeType>> = {
  campaign: 'ad-set',
  'ad-set': 'ad',
  ad: 'creative',
  // An audience's only handle is its right-hand source, and the only thing it feeds.
  audience: 'ad-set',
  'openai-campaign': 'openai-ad-group',
  'openai-ad-group': 'openai-ad',
};

const PARENT_NODE_BY_TARGET_TYPE: Partial<Record<CampaignNodeType, CampaignNodeType>> = {
  'ad-set': 'campaign',
  ad: 'ad-set',
  creative: 'ad',
  'openai-ad-group': 'openai-campaign',
  'openai-ad': 'openai-ad-group',
};

/** What dragging a handle into empty canvas creates. The ad set's side handle is the audience's. */
export function getNodeTypeToCreateFromHandle(
  nodeType: CampaignNodeType,
  handleType: HandleType | null,
  handleId: string | null = null,
): CampaignNodeType | null {
  if (handleType === 'source') {
    return CHILD_NODE_BY_SOURCE_TYPE[nodeType] ?? null;
  }

  if (handleType === 'target') {
    if (nodeType === 'ad-set' && handleId === AUDIENCE_HANDLE_ID) return 'audience';
    return PARENT_NODE_BY_TARGET_TYPE[nodeType] ?? null;
  }

  return null;
}

/** The target handle an edge between these two types must land on; null = the default. */
export function getTargetHandleIdFor(
  sourceType: CampaignNodeType | undefined,
  targetType: CampaignNodeType | undefined,
): string | null {
  return sourceType === 'audience' && targetType === 'ad-set' ? AUDIENCE_HANDLE_ID : null;
}
