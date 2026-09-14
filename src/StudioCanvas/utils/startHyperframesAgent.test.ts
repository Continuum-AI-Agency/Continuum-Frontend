import { describe, expect, test } from 'bun:test';
import {
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import {
  assertHyperframesRenderCapability,
  inspectHyperframesInputs,
  resolveHyperframesPrompt,
} from './startHyperframesAgent';

const node = (id: string, type: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as StudioNode;

const edge = (source: string, handle: string): Edge => ({
  id: `${source}-${handle}`,
  source,
  target: 'agent',
  targetHandle: handle,
});
describe('inspectHyperframesInputs', () => {
  test('maps attached canvas media to typed durable asset references', () => {
    const result = inspectHyperframesInputs(
      'agent',
      [
        node('image', 'image', {
          assetId: 'image-asset',
          assetVersionId: 'image-version',
          fileName: 'portrait.jpg',
        }),
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

    expect(result.assets).toEqual([
      { assetId: 'image-asset', assetVersionId: 'image-version', kind: 'image' },
      { assetId: 'video-asset', kind: 'video' },
      { assetId: 'audio-asset', kind: 'audio' },
      { assetId: 'generated-video', kind: 'video' },
    ]);
    expect(result.media[0]).toMatchObject({
      sourceNodeId: 'image',
      label: 'portrait.jpg',
      status: 'ready',
    });
    expect(result.issues).toEqual([]);
  });

  test('deduplicates shared assets and reports connected local media instead of dropping it', () => {
    const result = inspectHyperframesInputs(
      'agent',
      [
        node('one', 'image', { assetId: 'shared' }),
        node('two', 'image', { assetId: 'shared' }),
        node('local', 'video', { video: 'data:video/mp4;base64,AAAA', fileName: 'local.mp4' }),
      ],
      [
        edge('one', HYPERFRAMES_IMAGE_INPUT_HANDLE),
        edge('two', HYPERFRAMES_IMAGE_INPUT_HANDLE),
        edge('local', HYPERFRAMES_VIDEO_INPUT_HANDLE),
      ],
    );

    expect(result.assets).toEqual([{ assetId: 'shared', kind: 'image' }]);
    expect(result.issues).toEqual([
      {
        sourceNodeId: 'local',
        kind: 'video',
        message: 'local.mp4 must be saved to Library before HyperFrames can use it.',
      },
    ]);
  });

  test('shows when a connected Text node overrides the prompt field', () => {
    const result = inspectHyperframesInputs(
      'agent',
      [node('copy', 'string', { value: 'Use the portrait as the opening hero' })],
      [edge('copy', 'prompt-in')],
    );

    expect(result.prompt).toEqual({
      sourceNodeId: 'copy',
      value: 'Use the portrait as the opening hero',
    });
  });
});

test('rejects an incapable browser before starting paid agent work', async () => {
  expect(
    assertHyperframesRenderCapability(async () => ({ webCodecs: false, avc: false, aac: false })),
  ).rejects.toThrow('Use desktop Chrome or Edge');
});

test('a targeted revision uses the visible revision prompt instead of connected Text', () => {
  expect(
    resolveHyperframesPrompt(
      {
        prompt: 'Tighten the CTA entrance',
        revisionTarget: {
          revisionId: 'revision-1',
          sceneId: 'cta',
          criterionId: 'motion',
          blocker: 'CTA entrance is static',
        },
      },
      'Create the original launch film',
    ),
  ).toBe('Tighten the CTA entrance');
});
