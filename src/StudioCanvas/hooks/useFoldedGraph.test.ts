// This hook is what the canvas shell calls, so the two things it must never get wrong
// are pinned here: it costs nothing when no module is folded, and a drag of the
// collapsed card reaches the real nodes through the store rather than being swallowed.

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Connection, Edge, NodeChange } from '@xyflow/react';

import { useModuleFoldStore } from '../stores/useModuleFoldStore';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { COLLAPSED_NODE_TYPE, collapsedNodeId } from '../utils/moduleFold';
import { CANVAS_NODE_TYPES_WITH_FOLD, useFoldedGraph } from './useFoldedGraph';

const MODULE_A = 'module:aaa';

const node = (id: string, type: string, x = 0, y = 0): StudioNode =>
  ({ id, type, position: { x, y }, data: {} }) as unknown as StudioNode;

const nodes: StudioNode[] = [
  node('ref', 'image', 0, 0),
  node(`${MODULE_A}:p`, 'string', 100, 200),
  node(`${MODULE_A}:g`, 'nanoGen', 340, 260),
];

const edges: Edge[] = [
  { id: 'inbound', source: 'ref', target: `${MODULE_A}:g`, targetHandle: 'ref-image' } as Edge,
];

const handlers = () => ({
  onNodesChange: mock(() => {}),
  onConnect: mock(() => {}),
  isValidConnection: mock(() => true),
});

describe('useFoldedGraph', () => {
  beforeEach(() => {
    useModuleFoldStore.getState().reset();
    useStudioStore.getState().setNodes(nodes);
    useStudioStore.getState().setEdges(edges);
  });

  afterEach(cleanup);

  it('mounts the collapsed card alongside the canonical node map', () => {
    // canvasNodeTypes stays untouched — its drift guard refuses anything that is not a
    // StudioNodeType, and techniqueCollapsed deliberately is not one.
    expect(CANVAS_NODE_TYPES_WITH_FOLD[COLLAPSED_NODE_TYPE]).toBeDefined();
    expect(CANVAS_NODE_TYPES_WITH_FOLD.nanoGen).toBeDefined();
  });

  it('passes the graph and every handler straight through when nothing is folded', () => {
    const h = handlers();
    const { result } = renderHook(() => useFoldedGraph(nodes, edges, h));

    expect(result.current.nodes).toBe(nodes);
    expect(result.current.edges).toBe(edges);
    expect(result.current.onNodesChange).toBe(h.onNodesChange);
    expect(result.current.onConnect).toBe(h.onConnect);
    expect(result.current.isValidConnection).toBe(h.isValidConnection);
  });

  it('folds the members away once the module is collapsed', () => {
    useModuleFoldStore.getState().collapseModule(MODULE_A);
    const h = handlers();

    const { result } = renderHook(() => useFoldedGraph(nodes, edges, h));

    expect(result.current.nodes.map((n) => n.id)).toEqual(['ref', collapsedNodeId(MODULE_A)]);
    expect(result.current.onNodesChange).not.toBe(h.onNodesChange);
  });

  it('drags the card by moving its members through the store', () => {
    useModuleFoldStore.getState().collapseModule(MODULE_A);
    const h = handlers();
    const { result } = renderHook(() => useFoldedGraph(nodes, edges, h));

    act(() => {
      result.current.onNodesChange([
        { id: collapsedNodeId(MODULE_A), type: 'position', position: { x: 150, y: 220 } },
      ] as NodeChange<StudioNode>[]);
    });

    const moved = new Map(useStudioStore.getState().nodes.map((n) => [n.id, n.position]));
    expect(moved.get(`${MODULE_A}:p`)).toEqual({ x: 150, y: 220 });
    expect(moved.get(`${MODULE_A}:g`)).toEqual({ x: 390, y: 280 });
    expect(moved.get('ref')).toEqual({ x: 0, y: 0 });
    // The card's own change is consumed, never forwarded to a node list that has no
    // such id.
    expect(h.onNodesChange).not.toHaveBeenCalled();
  });

  it('still forwards changes that name real nodes', () => {
    useModuleFoldStore.getState().collapseModule(MODULE_A);
    const h = handlers();
    const { result } = renderHook(() => useFoldedGraph(nodes, edges, h));
    const change = [{ id: 'ref', type: 'select', selected: true }] as NodeChange<StudioNode>[];

    act(() => {
      result.current.onNodesChange(change);
    });

    expect(h.onNodesChange).toHaveBeenCalledWith(change);
  });

  it('lands a wire dropped on a card port on the real member behind it', () => {
    useModuleFoldStore.getState().collapseModule(MODULE_A);
    const h = handlers();
    const { result } = renderHook(() => useFoldedGraph(nodes, edges, h));
    // The card's own port id, which only the display graph knows about.
    const card = result.current.nodes.find((n) => n.id === collapsedNodeId(MODULE_A));
    const promptPort = (card?.data.inputPorts as Array<{ id: string; handleId: string }>).find(
      (port) => port.handleId === 'prompt',
    );
    const drawn: Connection = {
      source: 'ref',
      sourceHandle: 'image',
      target: collapsedNodeId(MODULE_A),
      targetHandle: promptPort?.id ?? '',
    };

    result.current.isValidConnection(drawn);
    act(() => {
      result.current.onConnect(drawn);
    });

    // Both the validity check and the commit see the member node, never the card.
    expect(h.isValidConnection).toHaveBeenCalledWith({
      source: 'ref',
      sourceHandle: 'image',
      target: `${MODULE_A}:g`,
      targetHandle: 'prompt',
    });
    expect(h.onConnect).toHaveBeenCalledWith({
      source: 'ref',
      sourceHandle: 'image',
      target: `${MODULE_A}:g`,
      targetHandle: 'prompt',
    });
  });
});
