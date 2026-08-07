import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

const fitView = mock(() => {});
const show = mock(() => {});
const takeSnapshot = mock(() => {});
const setNodes = mock(() => {});
const setEdges = mock(() => {});
const triggerSave = mock(() => {});

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
  });
});
