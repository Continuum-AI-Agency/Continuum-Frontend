import { describe, expect, test } from 'bun:test';
import {
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { collectHyperframesAssets } from './startHyperframesAgent';

const node = (id: string, type: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as StudioNode;

const edge = (source: string, handle: string): Edge => ({
  id: `${source}-${handle}`,
  source,
  target: 'agent',
  targetHandle: handle,
});
describe('collectHyperframesAssets', () => {
  test('maps attached canvas media to typed durable asset references', () => {
    const assets = collectHyperframesAssets(
      'agent',
      [
        node('image', 'image', { assetId: 'image-asset' }),
        node('video', 'video', { assetId: 'video-asset' }),
        node('audio', 'audio', { assetId: 'audio-asset' }),
        node('generated', 'videoGen', { renderOutputAssetId: 'generated-video' }),
        node('agent', 'hyperframesAgent', {}),
      ],
      [
        edge('image', HYPERFRAMES_IMAGE_INPUT_HANDLE),
        edge('video', HYPERFRAMES_VIDEO_INPUT_HANDLE),
        edge('audio', HYPERFRAMES_AUDIO_INPUT_HANDLE),
        edge('generated', HYPERFRAMES_VIDEO_INPUT_HANDLE),
      ],
    );

    expect(assets).toEqual([
      { assetId: 'image-asset', kind: 'image' },
      { assetId: 'video-asset', kind: 'video' },
      { assetId: 'audio-asset', kind: 'audio' },
      { assetId: 'generated-video', kind: 'video' },
    ]);
  });

  test('deduplicates shared asset IDs and ignores unsaved local media', () => {
    expect(
      collectHyperframesAssets(
        'agent',
        [
          node('one', 'image', { assetId: 'shared' }),
          node('two', 'image', { assetId: 'shared' }),
          node('local', 'video', { video: 'data:video/mp4;base64,AAAA' }),
        ],
        [
          edge('one', HYPERFRAMES_IMAGE_INPUT_HANDLE),
          edge('two', HYPERFRAMES_IMAGE_INPUT_HANDLE),
          edge('local', HYPERFRAMES_VIDEO_INPUT_HANDLE),
        ],
      ),
    ).toEqual([{ assetId: 'shared', kind: 'image' }]);
  });
});
