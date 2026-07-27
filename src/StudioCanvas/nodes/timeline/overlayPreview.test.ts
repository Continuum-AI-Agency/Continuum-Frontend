import { describe, expect, it } from 'bun:test';
import type { TimelineInputSource, TimelineTrack } from '../../types';
import { resolveOverlayPreviewLayers } from './overlayPreview';

const pool: TimelineInputSource[] = [
  { nodeId: 'video-1', kind: 'video', label: 'Product', previewUrl: 'blob:product' },
  { nodeId: 'image-1', kind: 'image', label: 'Logo', previewUrl: 'blob:logo' },
];

const tracks: TimelineTrack[] = [
  {
    id: 'overlay-1',
    kind: 'overlay',
    items: [
      {
        id: 'product',
        order: 0,
        sourceNodeId: 'video-1',
        kind: 'video',
        startSec: 2,
        trimStartSec: 1,
        trimEndSec: 5,
        muteAudio: false,
        volume: 0.4,
        effects: { speed: 2, opacity: 0.7 },
      },
      {
        id: 'logo',
        order: 1,
        sourceNodeId: 'image-1',
        kind: 'image',
        startSec: 0,
        durationSec: 8,
      },
    ],
  },
];

describe('resolveOverlayPreviewLayers', () => {
  it('resolves every active visual layer at the requested output time', () => {
    const layers = resolveOverlayPreviewLayers({
      document: { items: [], overlayTracks: tracks },
      pool,
      playheadSec: 2.5,
      sourceDurations: new Map([['video-1', 10]]),
    });

    expect(layers.map((layer) => layer.id)).toEqual(['product', 'logo']);
    expect(layers[0]).toMatchObject({
      url: 'blob:product',
      sourceSec: 2,
      playbackRate: 2,
      muted: false,
      volume: 0.4,
    });
    expect(layers[0].mediaStyle.opacity).toBe(0.7);
  });

  it('omits inactive and unresolved layers', () => {
    expect(
      resolveOverlayPreviewLayers({
        document: { items: [], overlayTracks: tracks },
        pool,
        playheadSec: 7,
        sourceDurations: new Map([['video-1', 10]]),
      }).map((layer) => layer.id),
    ).toEqual(['logo']);
  });
});
