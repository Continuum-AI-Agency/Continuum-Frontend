import { describe, expect, it } from 'bun:test';
import { getTargetHandleForNodeType } from '../utils/handleResolution';
import { determineBestNodeType, SOURCE_DROP_CANDIDATES } from './useEdgeDropNode';

describe('determineBestNodeType', () => {
  describe('dragging from a target (input) handle to empty canvas', () => {
    it('creates a text source for every text-typed input handle', () => {
      for (const sourceHandle of ['prompt', 'prompt-in', 'negative']) {
        expect(
          determineBestNodeType({
            sourceHandle,
            sourceNode: undefined,
            targetPosition: { x: 0, y: 0 },
            handleType: 'target',
          }),
        ).toBe('string');
      }
    });

    it('creates an image source for image-typed input handles', () => {
      for (const sourceHandle of [
        'image',
        'ref-image',
        'ref-images',
        'first-frame',
        'last-frame',
      ]) {
        expect(
          determineBestNodeType({
            sourceHandle,
            sourceNode: undefined,
            targetPosition: { x: 0, y: 0 },
            handleType: 'target',
          }),
        ).toBe('image');
      }
    });

    it('creates a video source for video-typed input handles', () => {
      for (const sourceHandle of ['video', 'ref-video']) {
        expect(
          determineBestNodeType({
            sourceHandle,
            sourceNode: undefined,
            targetPosition: { x: 0, y: 0 },
            handleType: 'target',
          }),
        ).toBe('video');
      }
    });
  });
});

describe('SOURCE_DROP_CANDIDATES', () => {
  it('offers exactly one auto-create candidate for audio and document outputs', () => {
    expect(SOURCE_DROP_CANDIDATES.audio).toEqual([{ nodeType: 'string', label: 'Text Block' }]);
    expect(SOURCE_DROP_CANDIDATES.document).toEqual([{ nodeType: 'string', label: 'Text Block' }]);
  });

  it('offers multiple picker candidates for text, image, and video outputs', () => {
    for (const dataType of ['text', 'image', 'video'] as const) {
      expect(SOURCE_DROP_CANDIDATES[dataType].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every candidate can actually receive the output data type it is offered for', () => {
    // Regression guard for the bug this table replaced: dragging an image
    // output used to auto-create a leaf 'image' node, which has zero target
    // handles, so the "auto-created" edge could never attach. Any candidate
    // whose resolved target handle is undefined would silently repeat that.
    for (const [dataType, candidates] of Object.entries(SOURCE_DROP_CANDIDATES)) {
      for (const candidate of candidates) {
        const handle = getTargetHandleForNodeType(candidate.nodeType, dataType);
        expect(handle).toBeDefined();
      }
    }
  });
});
