import { describe, expect, it } from 'bun:test';
import { resolvePublishingAssets } from './resolvePublishingAssets';

describe('resolvePublishingAssets', () => {
  it('uses carousel slot handles as the stable creative order', () => {
    expect(
      resolvePublishingAssets({
        nodeId: 'publisher',
        data: {
          format: 'carousel',
          assetSlots: [
            { id: 'second', order: 1 },
            { id: 'first', order: 0 },
          ],
        },
        nodes: [
          { id: 'image', type: 'image', position: { x: 0, y: 0 }, data: { assetId: 'a' } },
          {
            id: 'video',
            type: 'timelineEditor',
            position: { x: 0, y: 0 },
            data: { renderOutputAssetId: 'b' },
          },
        ],
        edges: [
          { id: 'e2', source: 'video', target: 'publisher', targetHandle: 'asset-second' },
          { id: 'e1', source: 'image', target: 'publisher', targetHandle: 'asset-first' },
        ],
      }),
    ).toEqual([
      { assetId: 'a', kind: 'image', order: 0 },
      { assetId: 'b', kind: 'video', order: 1 },
    ]);
  });
});
