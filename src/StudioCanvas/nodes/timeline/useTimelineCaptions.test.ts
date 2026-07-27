import { describe, expect, it } from 'bun:test';
import type { TimelineInputSource, TimelineItem } from '../../types';
import { resolveCaptionSourceAssetId } from './useTimelineCaptions';

const items: TimelineItem[] = [
  { id: 'clip-1', order: 0, sourceNodeId: 'canvas-node-1', kind: 'video' },
];

describe('resolveCaptionSourceAssetId', () => {
  it('uses the durable asset id for a Canvas-backed source', () => {
    const pool: TimelineInputSource[] = [
      {
        nodeId: 'canvas-node-1',
        sourceAssetId: '4e250533-6dc0-46c9-98db-fd8902cfa847',
        kind: 'video',
        label: 'Talking head',
      },
    ];

    expect(resolveCaptionSourceAssetId('canvas', items, pool)).toBe(
      '4e250533-6dc0-46c9-98db-fd8902cfa847',
    );
  });

  it('keeps the Library source-id compatibility path', () => {
    const libraryItems: TimelineItem[] = [
      {
        id: 'clip-1',
        order: 0,
        sourceNodeId: '76466a9d-c1e4-4c64-b21c-01206d587e39',
        kind: 'video',
      },
    ];
    const pool: TimelineInputSource[] = [
      { nodeId: '76466a9d-c1e4-4c64-b21c-01206d587e39', kind: 'video', label: 'Source' },
    ];

    expect(resolveCaptionSourceAssetId('library', libraryItems, pool)).toBe(
      '76466a9d-c1e4-4c64-b21c-01206d587e39',
    );
  });

  it('does not mistake a Canvas node id for a Library asset id', () => {
    const pool: TimelineInputSource[] = [
      { nodeId: 'canvas-node-1', kind: 'video', label: 'Generated source' },
    ];

    expect(resolveCaptionSourceAssetId('canvas', items, pool)).toBeUndefined();
  });
});
