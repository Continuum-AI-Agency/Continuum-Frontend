import { describe, expect, it } from 'bun:test';
import { creativeAssetIdsOf, isPublishedGroup } from './jaina-activity-client';

describe('isPublishedGroup', () => {
  it('offers only a group whose current version is published', () => {
    expect(isPublishedGroup({ versionId: 'v1', versionStatus: 'ready' })).toBe(true);
    expect(isPublishedGroup({ versionId: null, versionStatus: null })).toBe(false);
    expect(isPublishedGroup({ versionId: 'v1', versionStatus: 'awaiting_approval' })).toBe(false);
    expect(isPublishedGroup({ versionId: 'v1', versionStatus: null })).toBe(false);
  });
});

describe('creativeAssetIdsOf', () => {
  it('names every asset the plan and the rows attach, once each', () => {
    const rows = [
      { creativeAssetId: 'single', creativeMedia: null },
      { creativeAssetId: null, creativeMedia: { kind: 'carousel', cards: [{ asset_id: 'row-card' }, {}] } },
    ] as unknown as Parameters<typeof creativeAssetIdsOf>[0];
    const plan = {
      ads: [{ creative: { format: 'carousel', cards: [{ asset_id: 'plan-card' }, { asset_id: 'single' }] } }],
    } as unknown as Parameters<typeof creativeAssetIdsOf>[1];
    expect(creativeAssetIdsOf(rows, plan).sort()).toEqual(['plan-card', 'row-card', 'single']);
    expect(creativeAssetIdsOf([], null)).toEqual([]);
  });
});
