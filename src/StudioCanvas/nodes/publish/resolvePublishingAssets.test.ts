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

  // A 4-up generator publishes each variation on its own handle. Ignoring
  // `sourceHandle` attached variation 1 to every wire, whichever one was dragged.
  it('takes the variation the wire came from, version pinned', () => {
    expect(
      resolvePublishingAssets({
        nodeId: 'publisher',
        data: { format: 'image' },
        nodes: [
          {
            id: 'gen',
            type: 'nanoGen',
            position: { x: 0, y: 0 },
            data: {
              renderOutputAssetId: 'first-asset',
              generatedImages: [
                { assetId: 'v1', assetVersionId: 'v1-version' },
                { assetId: 'v2', assetVersionId: 'v2-version' },
                { assetId: 'v3', assetVersionId: 'v3-version' },
                { assetId: 'v4', assetVersionId: 'v4-version' },
              ],
            },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'gen',
            sourceHandle: 'image-3',
            target: 'publisher',
            targetHandle: 'image-in',
          },
        ],
      }),
    ).toEqual([{ assetId: 'v4', versionId: 'v4-version', kind: 'image', order: 0 }]);
  });

  // `frameExtract` is a legal image source in the graph contract, so the edge could be
  // drawn — but it resolved to nothing, and a carousel could never become ready.
  it('resolves an extracted frame as an image source', () => {
    expect(
      resolvePublishingAssets({
        nodeId: 'publisher',
        data: { format: 'image' },
        nodes: [
          {
            id: 'frame',
            type: 'frameExtract',
            position: { x: 0, y: 0 },
            data: { assetId: 'frame-asset', assetVersionId: 'frame-version' },
          },
        ],
        edges: [{ id: 'e1', source: 'frame', target: 'publisher', targetHandle: 'image-in' }],
      }),
    ).toEqual([{ assetId: 'frame-asset', versionId: 'frame-version', kind: 'image', order: 0 }]);
  });
});
