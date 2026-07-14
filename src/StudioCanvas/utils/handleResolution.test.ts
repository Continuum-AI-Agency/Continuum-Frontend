import { describe, expect, it } from 'bun:test';
import {
  getSourceHandleForNodeType,
  getTargetHandleForNodeType,
  type NodeType,
  resolveEdgeDataType,
} from './handleResolution';

describe('getSourceHandleForNodeType', () => {
  it('resolves every NodeType to its single real output handle', () => {
    // Record<NodeType, string> makes this exhaustive — a NodeType member
    // added later without an entry here fails to compile.
    const expected: Record<NodeType, string> = {
      nanoGen: 'image',
      videoGen: 'video',
      veoDirector: 'video',
      extendVideo: 'video',
      string: 'text',
      image: 'image',
      video: 'video',
      audio: 'audio',
      document: 'document',
      videoDecode: 'text',
    };

    for (const [nodeType, handleId] of Object.entries(expected) as Array<[NodeType, string]>) {
      expect(getSourceHandleForNodeType(nodeType)).toBe(handleId);
    }
  });
});

describe('getTargetHandleForNodeType — nanoGen ref-image ordering', () => {
  it('prefers the singular ref-image handle for nanoGen (the only one the node renders)', () => {
    expect(getTargetHandleForNodeType('nanoGen', 'image')).toBe('ref-image');
  });

  it('still prefers the plural ref-images handle for video generators that support reference images', () => {
    // veo-3.1 is not a frame-input model, so its allowed handles include
    // ref-image/ref-images (unlike the default veo-3.1-fast, which only
    // exposes first-frame/last-frame).
    expect(getTargetHandleForNodeType('videoGen', 'image', { model: 'veo-3.1' })).toBe(
      'ref-images',
    );
  });

  it('falls back to first-frame for a frame-input video generator model', () => {
    expect(getTargetHandleForNodeType('videoGen', 'image', { model: 'veo-3.1-fast' })).toBe(
      'first-frame',
    );
  });

  it('resolves a text source into nanoGen prompt handle', () => {
    expect(getTargetHandleForNodeType('nanoGen', 'text')).toBe('prompt');
  });

  it('resolves a text source into a video generator prompt-in handle', () => {
    expect(getTargetHandleForNodeType('videoGen', 'text')).toBe('prompt-in');
  });

  it('resolves omniGen image reference into ref-images', () => {
    expect(getTargetHandleForNodeType('omniGen', 'image')).toBe('ref-images');
  });

  it('returns undefined for a leaf node type with no target handles', () => {
    expect(getTargetHandleForNodeType('image', 'image')).toBeUndefined();
  });
});

describe('resolveEdgeDataType', () => {
  it('resolves every real handle id in the vocabulary to its data type', () => {
    const cases: Array<[string | null | undefined, string]> = [
      ['prompt', 'text'],
      ['prompt-in', 'text'],
      ['negative', 'text'],
      ['text', 'text'],
      ['ref-image', 'image'],
      ['ref-images', 'image'],
      ['first-frame', 'image'],
      ['last-frame', 'image'],
      ['image', 'image'],
      ['video', 'video'],
      ['ref-video', 'video'],
      ['audio', 'audio'],
      ['document', 'document'],
      ['trigger', 'text'],
      ['media-in', 'text'],
      // 'video-in' (publishToPlanner's sink handle) isn't a video/ref-video
      // exact match, so it falls to the universal fallback — unchanged from
      // both prior implementations, not a regression introduced here.
      ['video-in', 'text'],
      ['clip-abc123', 'text'],
      [null, 'text'],
      [undefined, 'text'],
    ];

    for (const [handleId, expected] of cases) {
      expect(resolveEdgeDataType(handleId)).toBe(expected);
    }
  });
});
