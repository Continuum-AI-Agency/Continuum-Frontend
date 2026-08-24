import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

const fitView = mock(() => {});
const show = mock(() => {});
// Call order matters more than call count: the autosave reads the store when it
// fires, so triggerSave has to come AFTER the merged graph is in it. A save
// triggered first would persist the pre-apply canvas and the applied module
// would vanish on reload.
const calls: string[] = [];
const takeSnapshot = mock(() => {
  calls.push('takeSnapshot');
});
const setNodes = mock(() => {
  calls.push('setNodes');
});
const setEdges = mock(() => {
  calls.push('setEdges');
});
const triggerSave = mock(() => {
  calls.push('triggerSave');
});

const store = {
  brandId: 'brand-1',
  nodes: [],
  edges: [],
  defaultEdgeType: 'bezier',
  takeSnapshot,
  setNodes,
  setEdges,
  triggerSave,
};

const useStudioStoreMock = () => store;
useStudioStoreMock.getState = () => store;

mock.module('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView }),
}));

// The namespace is a uuid; pin it so the applied node ids are assertable.
globalThis.crypto.randomUUID = (() => 'test-uuid') as Crypto['randomUUID'];
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show }),
}));
mock.module('../stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));
mock.module('../utils/rehydrateWorkflowMedia', () => ({
  rehydrateWorkflowMediaNodes: async (nodes: unknown[]) => nodes,
}));

const { useApplyWorkflow } = await import('./useApplyWorkflow');

describe('useApplyWorkflow', () => {
  beforeEach(() => {
    calls.length = 0;
    fitView.mockClear();
    show.mockClear();
    takeSnapshot.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    triggerSave.mockClear();
  });

  afterEach(cleanup);

  it('persists an applied saved workflow into the active workspace', async () => {
    const { result } = renderHook(() => useApplyWorkflow());

    await act(async () => {
      await result.current({
        id: 'workflow-1',
        brandProfileId: 'brand-1',
        name: 'Launch module',
        nodes: [
          {
            id: 'prompt',
            type: 'string',
            position: { x: 0, y: 0 },
            data: { value: 'Launch copy' },
          },
        ],
        edges: [],
        createdAt: '2026-08-06T00:00:00.000Z',
      });
    });

    expect(takeSnapshot).toHaveBeenCalledTimes(1);
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(setEdges).toHaveBeenCalledTimes(1);
    expect(triggerSave).toHaveBeenCalledTimes(1);
    // The autosave must be asked for, and asked for last.
    expect(calls).toEqual(['takeSnapshot', 'setNodes', 'setEdges', 'triggerSave']);
  });

  it('lands the module at the given point without moving anything else', async () => {
    // mergeGraphs pushes incoming work below existing nodes; a technique dropped
    // from a picker has to land where the pointer is instead.
    const existing = {
      id: 'existing',
      type: 'string',
      position: { x: 5, y: 7 },
      data: {},
    };
    store.nodes = [existing] as never;

    const { result } = renderHook(() => useApplyWorkflow());

    await act(async () => {
      await result.current(
        {
          id: 'technique-1',
          brandProfileId: 'brand-1',
          name: 'Palette smash-up',
          nodes: [
            { id: 'a', type: 'string', position: { x: 100, y: 200 }, data: {} },
            { id: 'b', type: 'nanoGen', position: { x: 340, y: 260 }, data: {} },
          ],
          edges: [],
          createdAt: '2026-08-24T00:00:00.000Z',
        },
        { position: { x: 1000, y: 2000 } },
      );
    });

    const applied = setNodes.mock.calls[0][0] as Array<{
      id: string;
      position: { x: number; y: number };
    }>;
    const byId = new Map(applied.map((node) => [node.id, node.position]));

    // The user's own node is untouched.
    expect(byId.get('existing')).toEqual({ x: 5, y: 7 });
    // The module's top-left corner sits on the point, and its internal layout
    // (240 x, 60 y between the two nodes) is preserved.
    const a = byId.get('module:test-uuid:a');
    const b = byId.get('module:test-uuid:b');
    expect(a).toEqual({ x: 1000, y: 2000 });
    expect(b).toEqual({ x: 1240, y: 2060 });

    store.nodes = [] as never;
  });

  it('leaves placement to mergeGraphs when no point is given', async () => {
    store.nodes = [{ id: 'existing', type: 'string', position: { x: 5, y: 7 }, data: {} }] as never;

    const { result } = renderHook(() => useApplyWorkflow());

    await act(async () => {
      await result.current({
        id: 'technique-1',
        brandProfileId: 'brand-1',
        name: 'Palette smash-up',
        nodes: [{ id: 'a', type: 'string', position: { x: 100, y: 200 }, data: {} }],
        edges: [],
        createdAt: '2026-08-24T00:00:00.000Z',
      });
    });

    const applied = setNodes.mock.calls[0][0] as Array<{
      id: string;
      position: { x: number; y: number };
    }>;
    const moved = applied.find((node) => node.id === 'module:test-uuid:a');
    // Pushed below the existing node rather than onto the pointer.
    expect(moved?.position.x).toBe(100);
    expect(moved?.position.y).toBeGreaterThan(200);

    store.nodes = [] as never;
  });
});
