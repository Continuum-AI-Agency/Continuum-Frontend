import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';
import type { StudioNode } from '../types';

const show = mock(() => {});
const takeSnapshot = mock(() => {});
const setNodes = mock((_nodes: StudioNode[]) => {});
const setEdges = mock((_edges: unknown[]) => {});
const triggerSave = mock(() => {});
const fitView = mock(() => {});

const FLOW_POSITION = { x: 420, y: 84 };
const screenToFlowPosition = mock((_point: { x: number; y: number }) => FLOW_POSITION);

const store = {
  brandId: 'brand-1',
  nodes: [] as StudioNode[],
  edges: [] as unknown[],
  defaultEdgeType: 'bezier',
  takeSnapshot,
  setNodes,
  setEdges,
  triggerSave,
};

const useStudioStoreMock = () => store;
useStudioStoreMock.getState = () => store;

type CreativeAssetDropResult = Awaited<
  ReturnType<typeof import('../utils/resolveCreativeAssetDrop').resolveCreativeAssetDrop>
>;
type SidebarDropTarget = ReturnType<
  typeof import('../utils/resolveSidebarDropTarget').resolveSidebarDropTarget
>;

let creativeAssetDropResult: CreativeAssetDropResult = {
  status: 'success',
  nodeType: 'image',
  dataUrl: 'data:image/png;base64,AAA',
  mimeType: 'image/png',
};
let sidebarDropTarget: SidebarDropTarget = null;

const resolveCreativeAssetDrop = mock(async () => creativeAssetDropResult);
const resolveSidebarDropTarget = mock(() => sidebarDropTarget);

// bun's mock.module MERGES into an already-loaded module and REPLACES one that
// has never been loaded, and it is process-wide for the whole run. Both matter
// here: the real modules are imported first so the overrides below patch a single
// export instead of blanking the rest (@xyflow/react alone feeds applyEdgeChanges
// and every node component to this hook's import graph), and the two drop utils —
// which own real test files of their own — are put back in afterAll so this file
// does not poison utils/*.test.ts later in the run.
await import('@xyflow/react');
await import('@/components/ui/ToastProvider');
await import('../stores/useStudioStore');
const realResolveCreativeAssetDrop = await import('../utils/resolveCreativeAssetDrop');
const realResolveSidebarDropTarget = await import('../utils/resolveSidebarDropTarget');

mock.module('@xyflow/react', () => ({
  useReactFlow: () => ({ screenToFlowPosition, fitView }),
}));
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show }),
}));
mock.module('../stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));
mock.module('../utils/resolveCreativeAssetDrop', () => ({ resolveCreativeAssetDrop }));
mock.module('../utils/resolveSidebarDropTarget', () => ({ resolveSidebarDropTarget }));

const { useCanvasDnD } = await import('./useCanvasDnD');

type DragEventArg = Parameters<ReturnType<typeof useCanvasDnD>['onDrop']>[0];

const preventDefault = mock(() => {});

function buildDragEvent(options: {
  data?: Record<string, string>;
  clientX?: number;
  clientY?: number;
}) {
  const data = options.data ?? {};
  const event = {
    preventDefault,
    clientX: options.clientX ?? 210,
    clientY: options.clientY ?? 42,
    dataTransfer: {
      dropEffect: 'none',
      getData: (mime: string) => data[mime] ?? '',
    },
  };
  return event as unknown as DragEventArg & typeof event;
}

const appendedNodes = () => setNodes.mock.calls[0]?.[0] as StudioNode[];

describe('useCanvasDnD', () => {
  beforeEach(() => {
    store.nodes = [];
    store.edges = [];
    creativeAssetDropResult = {
      status: 'success',
      nodeType: 'image',
      dataUrl: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
    };
    sidebarDropTarget = null;
    preventDefault.mockClear();
    show.mockClear();
    takeSnapshot.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    triggerSave.mockClear();
    screenToFlowPosition.mockClear();
    resolveCreativeAssetDrop.mockClear();
    resolveSidebarDropTarget.mockClear();
  });

  afterEach(cleanup);

  afterAll(() => {
    mock.module('../utils/resolveCreativeAssetDrop', () => realResolveCreativeAssetDrop);
    mock.module('../utils/resolveSidebarDropTarget', () => realResolveSidebarDropTarget);
  });

  it('advertises the drag source dropEffect so the browser still fires onDrop', () => {
    const { result } = renderHook(() => useCanvasDnD());
    const event = buildDragEvent({});

    act(() => result.current.onDragOver(event));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(event.dataTransfer.dropEffect).toBe(STUDIO_ASSET_DROP_EFFECT);
  });

  it('snapshots on node drag start and saves on node drag stop', () => {
    const { result } = renderHook(() => useCanvasDnD());

    act(() => result.current.onNodeDragStart());
    expect(takeSnapshot).toHaveBeenCalledTimes(1);
    expect(triggerSave).not.toHaveBeenCalled();

    act(() => result.current.onNodeDragStop());
    expect(triggerSave).toHaveBeenCalledTimes(1);
    expect(takeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('appends a catalog node at the flow position the drop landed on', async () => {
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(
        buildDragEvent({
          data: { 'application/reactflow': 'nanoGen' },
          clientX: 300,
          clientY: 150,
        }),
      );
    });

    expect(takeSnapshot).toHaveBeenCalledTimes(1);
    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 300, y: 150 });
    expect(setNodes).toHaveBeenCalledTimes(1);

    const nodes = appendedNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('nanoGen');
    expect(nodes[0].position).toEqual(FLOW_POSITION);
    expect(triggerSave).toHaveBeenCalledTimes(1);
    expect(setEdges).not.toHaveBeenCalled();
  });

  it.each(['veoDirector', 'veoFast'])('canonicalizes %s to a videoGen node', async (dropped) => {
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(buildDragEvent({ data: { 'application/reactflow': dropped } }));
    });

    expect(appendedNodes()[0].type).toBe('videoGen');
  });

  it('falls through an unrecognized node type and bails out when no asset payload rides along', async () => {
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(
        buildDragEvent({ data: { 'application/reactflow': 'notANodeType' } }),
      );
    });

    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(triggerSave).not.toHaveBeenCalled();
    expect(resolveCreativeAssetDrop).not.toHaveBeenCalled();
    // Pinned as-is: the snapshot is taken before the drop is understood, so an
    // ignored drop still pushes an undo entry that undoes nothing.
    expect(takeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('appends a library image node carrying its lineage fields', async () => {
    creativeAssetDropResult = {
      status: 'success',
      nodeType: 'image',
      dataUrl: 'data:image/png;base64,BBB',
      mimeType: 'image/png',
      fileName: 'hero.png',
      assetId: 'asset-77',
      sourcePath: 'brand-1/hero.png',
      bucket: 'creative-assets',
      sourceUrl: 'https://cdn.example.com/hero.png',
    };
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(
        buildDragEvent({ data: { 'application/reactflow-node-data': '{"type":"asset_drop"}' } }),
      );
    });

    expect(resolveCreativeAssetDrop).toHaveBeenCalledTimes(1);
    expect(setNodes).toHaveBeenCalledTimes(1);

    const node = appendedNodes()[0];
    expect(node.type).toBe('image');
    expect(node.position).toEqual(FLOW_POSITION);
    expect(node.data).toMatchObject({
      image: 'data:image/png;base64,BBB',
      fileName: 'hero.png',
      assetId: 'asset-77',
      sourcePath: 'brand-1/hero.png',
      bucket: 'creative-assets',
      sourceUrl: 'https://cdn.example.com/hero.png',
    });
    expect(setEdges).not.toHaveBeenCalled();
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  it('wires the dropped asset into the sidebar drop target it landed on', async () => {
    creativeAssetDropResult = {
      status: 'success',
      nodeType: 'image',
      dataUrl: 'data:image/png;base64,CCC',
      mimeType: 'image/png',
    };
    sidebarDropTarget = { nodeId: 'nano-1', handleId: 'image' };
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(
        buildDragEvent({ data: { 'application/vnd.continuum.asset': '{"path":"a.png"}' } }),
      );
    });

    expect(setEdges).toHaveBeenCalledTimes(1);
    const edges = setEdges.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: appendedNodes()[0].id,
      sourceHandle: 'image',
      target: 'nano-1',
      targetHandle: 'image',
      type: 'dataType',
      data: { dataType: 'image', pathType: store.defaultEdgeType },
    });
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  it('surfaces a resolver error as a toast and adds nothing to the canvas', async () => {
    creativeAssetDropResult = {
      status: 'error',
      title: 'Drop failed',
      description: 'Unrecognized asset payload.',
    };
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(buildDragEvent({ data: { 'text/plain': 'nonsense' } }));
    });

    expect(show).toHaveBeenCalledWith({
      title: 'Drop failed',
      description: 'Unrecognized asset payload.',
      variant: 'error',
    });
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(triggerSave).not.toHaveBeenCalled();
  });
});
