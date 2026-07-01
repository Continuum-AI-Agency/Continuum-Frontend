import { describe, expect, it } from 'bun:test';
import { determineBestNodeType } from './useEdgeDropNode';

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
      for (const sourceHandle of ['image', 'ref-image', 'ref-images', 'first-frame', 'last-frame']) {
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
