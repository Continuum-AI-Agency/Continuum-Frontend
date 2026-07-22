import { describe, expect, test } from 'bun:test';

import { getNodeTypeToCreateFromHandle } from '@/CampaignCanvas/types/hierarchyNavigation';

describe('hierarchy navigation by handle direction', () => {
  test('creates the next child type from source handles', () => {
    expect(getNodeTypeToCreateFromHandle('campaign', 'source')).toBe('ad-set');
    expect(getNodeTypeToCreateFromHandle('ad-set', 'source')).toBe('ad');
    expect(getNodeTypeToCreateFromHandle('ad', 'source')).toBe('creative');
    expect(getNodeTypeToCreateFromHandle('creative', 'source')).toBeNull();
  });

  test('creates the previous parent type from target handles', () => {
    expect(getNodeTypeToCreateFromHandle('ad-set', 'target')).toBe('campaign');
    expect(getNodeTypeToCreateFromHandle('ad', 'target')).toBe('ad-set');
    expect(getNodeTypeToCreateFromHandle('creative', 'target')).toBe('ad');
    expect(getNodeTypeToCreateFromHandle('audience', 'target')).toBe('ad-set');
    expect(getNodeTypeToCreateFromHandle('campaign', 'target')).toBeNull();
  });
});
