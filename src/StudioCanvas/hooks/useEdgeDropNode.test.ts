import { describe, expect, it } from 'bun:test';
import { getTargetHandleForNodeType } from '../utils/handleResolution';
import { isValidConnection } from '../utils/isValidConnection';
import {
  buildBurnInOverlay,
  determineBestNodeType,
  SOURCE_DROP_CANDIDATES,
} from './useEdgeDropNode';

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

describe('buildBurnInOverlay', () => {
  const built = buildBurnInOverlay({
    videoNodeId: 'clip-1',
    videoHandleId: 'video',
    imageNodeId: 'still-1',
    position: { x: 100, y: 40 },
    pathType: 'bezier',
  });

  it('creates a Burn In action node set to video.overlay', () => {
    expect(built.node.type).toBe('action');
    expect((built.node.data as { actionId?: string }).actionId).toBe('video.overlay');
  });

  it('wires the clip into "in" and the image into "overlay-in"', () => {
    // The handles are `video.overlay`'s declared ports. A wrong one here draws an edge
    // the canvas accepts and the executor refuses at run time.
    const byHandle = new Map(built.edges.map((edge) => [edge.targetHandle, edge]));
    expect(byHandle.get('in')?.source).toBe('clip-1');
    expect(byHandle.get('in')?.sourceHandle).toBe('video');
    expect(byHandle.get('overlay-in')?.source).toBe('still-1');
    expect(byHandle.get('overlay-in')?.sourceHandle).toBe('image');
  });

  it('agrees with the connection validator about both edges', () => {
    const nodes = [
      { id: 'clip-1', type: 'video', data: {} },
      { id: 'still-1', type: 'image', data: {} },
      { id: built.node.id, type: 'action', data: built.node.data as Record<string, unknown> },
    ];
    for (const edge of built.edges) {
      expect(
        isValidConnection(
          {
            source: edge.source,
            sourceHandle: edge.sourceHandle ?? null,
            target: edge.target,
            targetHandle: edge.targetHandle ?? null,
          },
          [],
          nodes,
        ),
      ).toBe(true);
    }
  });

  it('labels each edge with what actually flows down it', () => {
    const byHandle = new Map(built.edges.map((edge) => [edge.targetHandle, edge]));
    expect((byHandle.get('in')?.data as { dataType?: string })?.dataType).toBe('video');
    expect((byHandle.get('overlay-in')?.data as { dataType?: string })?.dataType).toBe('image');
  });

  it('lands to the right of the clip, never under the pointer', () => {
    expect(built.node.position.x).toBeGreaterThan(100);
    expect(built.node.position.y).toBe(40);
  });

  it('gives the two edges distinct ids', () => {
    expect(new Set(built.edges.map((edge) => edge.id)).size).toBe(2);
  });
});
