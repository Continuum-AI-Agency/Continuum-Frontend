import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { resolveBurnInDropTarget, resolveSidebarDropTarget } from './resolveSidebarDropTarget';

// Fake DOM elements shaped just enough to exercise the hit-test decision
// logic — real document.elementsFromPoint isn't meaningfully testable under
// happy-dom (no real layout), so the function takes an injectable lookup.
function fakeHandle(nodeId: string, handleId: string): Element {
  const el = document.createElement('div');
  el.classList.add('react-flow__handle');
  el.dataset.nodeid = nodeId;
  el.dataset.handleid = handleId;
  return el;
}

function fakeNode(nodeId: string): Element {
  const el = document.createElement('div');
  el.classList.add('react-flow__node');
  el.dataset.id = nodeId;
  return el;
}

describe('resolveSidebarDropTarget', () => {
  const nanoGenNode: StudioNode = {
    id: 'nano-1',
    type: 'nanoGen',
    position: { x: 0, y: 0 },
    data: {},
  };

  it('wires directly to a compatible handle the drop lands on exactly', () => {
    const hits = [fakeHandle('nano-1', 'ref-image')];
    const result = resolveSidebarDropTarget(0, 0, 'image', [nanoGenNode], [], () => hits);
    expect(result).toEqual({ nodeId: 'nano-1', handleId: 'ref-image' });
  });

  it('returns null when the exact handle hit is type-incompatible, without falling back', () => {
    const hits = [fakeHandle('nano-1', 'ref-image'), fakeNode('nano-1')];
    const result = resolveSidebarDropTarget(0, 0, 'audio', [nanoGenNode], [], () => hits);
    expect(result).toBeNull();
  });

  it('falls back to the node body highest-priority open handle when no handle was hit directly', () => {
    const hits = [fakeNode('nano-1')];
    const result = resolveSidebarDropTarget(0, 0, 'image', [nanoGenNode], [], () => hits);
    expect(result).toEqual({ nodeId: 'nano-1', handleId: 'ref-image' });
  });

  it('returns null for a node-body drop once the resolved handle is at its connection limit', () => {
    const limitedNode: StudioNode = {
      ...nanoGenNode,
      data: { maxReferenceImages: 1 },
    };
    const existingEdge: Edge = {
      id: 'e-existing',
      source: 'other-image',
      sourceHandle: 'image',
      target: 'nano-1',
      targetHandle: 'ref-image',
    };
    const hits = [fakeNode('nano-1')];
    const result = resolveSidebarDropTarget(
      0,
      0,
      'image',
      [limitedNode],
      [existingEdge],
      () => hits,
    );
    expect(result).toBeNull();
  });

  it('returns null when nothing compatible is anywhere in the hit list', () => {
    const hits = [document.createElement('div')];
    const result = resolveSidebarDropTarget(0, 0, 'image', [nanoGenNode], [], () => hits);
    expect(result).toBeNull();
  });

  it('returns null on an empty hit list (drop over the bare pane)', () => {
    const result = resolveSidebarDropTarget(0, 0, 'image', [nanoGenNode], [], () => []);
    expect(result).toBeNull();
  });
});

describe('resolveBurnInDropTarget', () => {
  const videoNode: StudioNode = {
    id: 'clip-1',
    type: 'video',
    position: { x: 0, y: 0 },
    data: {},
  };
  const imageNode: StudioNode = {
    id: 'still-1',
    type: 'image',
    position: { x: 0, y: 0 },
    data: {},
  };

  it('offers a burn-in when an image lands on a node that emits video', () => {
    const hits = [fakeNode('clip-1')];
    expect(resolveBurnInDropTarget(0, 0, 'image', [videoNode], () => hits)).toEqual({
      videoNodeId: 'clip-1',
      videoHandleId: 'video',
    });
  });

  it('offers nothing for a non-image asset', () => {
    const hits = [fakeNode('clip-1')];
    for (const kind of ['video', 'audio', 'document'] as const) {
      expect(resolveBurnInDropTarget(0, 0, kind, [videoNode], () => hits)).toBeNull();
    }
  });

  it('offers nothing over a node that emits no video', () => {
    const hits = [fakeNode('still-1')];
    expect(resolveBurnInDropTarget(0, 0, 'image', [imageNode], () => hits)).toBeNull();
  });

  it('offers a burn-in over an action node whose op emits video', () => {
    // The reason "emits video" is asked of the handle resolver rather than the node
    // TYPE: an action node's output modality is its op's, and it changes with config.
    const speedNode: StudioNode = {
      id: 'act-1',
      type: 'action',
      position: { x: 0, y: 0 },
      data: { actionId: 'video.speed', config: {} },
    } as StudioNode;
    const textNode: StudioNode = {
      ...speedNode,
      id: 'act-2',
      data: { actionId: 'text.concat', config: {} },
    } as StudioNode;
    expect(resolveBurnInDropTarget(0, 0, 'image', [speedNode], () => [fakeNode('act-1')])).toEqual({
      videoNodeId: 'act-1',
      videoHandleId: 'out',
    });
    expect(
      resolveBurnInDropTarget(0, 0, 'image', [textNode], () => [fakeNode('act-2')]),
    ).toBeNull();
  });

  it('offers nothing over the bare pane', () => {
    expect(resolveBurnInDropTarget(0, 0, 'image', [videoNode], () => [])).toBeNull();
  });
});
