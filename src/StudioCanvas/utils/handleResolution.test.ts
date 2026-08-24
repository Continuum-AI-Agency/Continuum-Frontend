import { describe, expect, it } from 'bun:test';
import {
  getVideoGeneratorImageReferenceHandle,
  getVideoGeneratorReferenceModes,
  VIDEO_GENERATOR_MODELS,
} from '@continuum/contracts';
import {
  getSourceHandleForNodeType,
  getTargetHandleCandidatesForNodeType,
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
      frameExtract: 'image',
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
      // 'video-in' (publisher sink handle) isn't a video/ref-video
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

describe('getTargetHandleCandidatesForNodeType — reference-mode aware image drops', () => {
  it('lands an image on first-frame when the node is in frames mode', () => {
    expect(
      getTargetHandleForNodeType('videoGen', 'image', {
        model: 'veo-3.1',
        referenceMode: 'frames',
      }),
    ).toBe('first-frame');
  });

  it('lands an image on ref-images when a fast node is in images mode', () => {
    expect(
      getTargetHandleForNodeType('videoGen', 'image', {
        model: 'veo-3.1-fast',
        referenceMode: 'images',
      }),
    ).toBe('ref-images');
  });

  it('offers last-frame after first-frame so a second image has somewhere to go', () => {
    const candidates = getTargetHandleCandidatesForNodeType('videoGen', 'image', {
      model: 'veo-3.1',
      referenceMode: 'frames',
    });

    expect(candidates).toEqual(['first-frame', 'last-frame']);
  });

  it('offers no frame handles at all in images mode', () => {
    const candidates = getTargetHandleCandidatesForNodeType('videoGen', 'image', {
      model: 'veo-3.1',
      referenceMode: 'images',
    });

    expect(candidates).not.toContain('first-frame');
    expect(candidates).not.toContain('last-frame');
  });

  // A drop resolves to an id the node must actually be drawing. Offering the alias
  // the node does NOT render puts the edge on a handle absent from the DOM, where it
  // silently fails to draw — the exact shape of the Veo 3.1 reference-image bug.
  it('never offers the image-reference alias the node does not render', () => {
    for (const model of VIDEO_GENERATOR_MODELS) {
      for (const mode of getVideoGeneratorReferenceModes(model)) {
        const rendered = getVideoGeneratorImageReferenceHandle(model, mode);
        const candidates = getTargetHandleCandidatesForNodeType('videoGen', 'image', {
          model,
          referenceMode: mode,
        });
        const offered = candidates.filter((h) => h === 'ref-image' || h === 'ref-images');

        expect(offered).toEqual(rendered ? [rendered] : []);
      }
    }
  });

  it('lands an image on the singular handle pixverse-v6 renders', () => {
    expect(getTargetHandleForNodeType('videoGen', 'image', { model: 'pixverse-v6' })).toBe(
      'ref-image',
    );
  });
});

describe('Canvas V3 handle resolution', () => {
  it('lands an image on an action whose op takes one', () => {
    expect(
      getTargetHandleForNodeType('action', 'image', { actionId: 'image.rotate' }),
    ).toBe('in');
  });

  it('lands a clip on the base input of a two-port op, not the overlay', () => {
    // `video.watermark` declares `in` (video) and `overlay-in` (image). Resolving to
    // the first ALLOWED handle would be right by luck here and wrong for the image.
    expect(
      getTargetHandleForNodeType('action', 'video', { actionId: 'video.watermark' }),
    ).toBe('in');
    expect(
      getTargetHandleForNodeType('action', 'image', { actionId: 'video.watermark' }),
    ).toBe('overlay-in');
  });

  it('offers nothing for an action with no op chosen', () => {
    // Contracts gives an `actionId: null` node no handles at all — deliberately inert
    // rather than guessing an op the user never picked.
    expect(getTargetHandleCandidatesForNodeType('action', 'image', { actionId: null })).toEqual([]);
  });

  it('lands anything on a router', () => {
    for (const modality of ['text', 'image', 'video'] as const) {
      expect(getTargetHandleForNodeType('router', modality, {}), modality).toBe('in');
    }
  });
});

describe('resolveEdgeDataType — pass-through nodes', () => {
  it('colours an action edge by its OP, not by the handle id', () => {
    // Both an action and a router name their single output `out`, which carries no
    // modality. Without the source node every one of these falls through to 'text'.
    expect(resolveEdgeDataType('out')).toBe('text');
    expect(resolveEdgeDataType('out', { type: 'action', data: { actionId: 'image.rotate' } })).toBe(
      'image',
    );
    expect(resolveEdgeDataType('out', { type: 'action', data: { actionId: 'video.speed' } })).toBe(
      'video',
    );
    expect(
      resolveEdgeDataType('out', { type: 'action', data: { actionId: 'text.findReplace' } }),
    ).toBe('text');
  });

  it('colours a router edge by its locked modality', () => {
    expect(resolveEdgeDataType('out', { type: 'router', data: { lockedType: 'video' } })).toBe(
      'video',
    );
    expect(resolveEdgeDataType('out', { type: 'router', data: { lockedType: null } })).toBe('text');
  });

  it('colours a batch edge by its item kind', () => {
    expect(resolveEdgeDataType('collection', { type: 'batch', data: { itemType: 'image' } })).toBe(
      'image',
    );
  });

  it('leaves every existing edge exactly as it was', () => {
    // The source node is now passed at all three call sites, so a regression here
    // would silently recolour every edge on every saved canvas.
    const generator = { type: 'nanoGen', data: {} };
    expect(resolveEdgeDataType('image', generator)).toBe('image');
    expect(resolveEdgeDataType('video', { type: 'video', data: {} })).toBe('video');
    expect(resolveEdgeDataType('audio', { type: 'audio', data: {} })).toBe('audio');
    expect(resolveEdgeDataType('document', { type: 'document', data: {} })).toBe('document');
    expect(resolveEdgeDataType('text', { type: 'string', data: {} })).toBe('text');
    expect(resolveEdgeDataType(null, { type: 'string', data: {} })).toBe('text');
  });
});

describe('action target handles refuse to guess', () => {
  it('offers nothing when the dragged output modality is unknowable', () => {
    // A drag from another action's `out`: only the SOURCE node's op knows what that
    // carries, and this function is only given the target. Auto-wiring on a guess is
    // how a rotated still ends up in a video port.
    expect(
      getTargetHandleCandidatesForNodeType('action', 'out', { actionId: 'video.watermark' }),
    ).toEqual([]);
  });

  it('offers nothing when no port takes the dragged modality', () => {
    expect(
      getTargetHandleCandidatesForNodeType('action', 'text', { actionId: 'image.rotate' }),
    ).toEqual([]);
  });
});
