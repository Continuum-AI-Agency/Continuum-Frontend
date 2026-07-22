import type { HandleType } from '@xyflow/react';
import type { CampaignNodeType } from './index';

const CHILD_NODE_BY_SOURCE_TYPE: Partial<Record<CampaignNodeType, CampaignNodeType>> = {
  campaign: 'ad-set',
  'ad-set': 'ad',
  ad: 'creative',
};

const PARENT_NODE_BY_TARGET_TYPE: Partial<Record<CampaignNodeType, CampaignNodeType>> = {
  'ad-set': 'campaign',
  ad: 'ad-set',
  creative: 'ad',
  audience: 'ad-set',
};

export function getNodeTypeToCreateFromHandle(
  nodeType: CampaignNodeType,
  handleType: HandleType | null,
): CampaignNodeType | null {
  if (handleType === 'source') {
    return CHILD_NODE_BY_SOURCE_TYPE[nodeType] ?? null;
  }

  if (handleType === 'target') {
    return PARENT_NODE_BY_TARGET_TYPE[nodeType] ?? null;
  }

  return null;
}
