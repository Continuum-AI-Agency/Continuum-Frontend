import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import { resolveSidebarDropTarget } from './resolveSidebarDropTarget';

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
