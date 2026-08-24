import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

import { buildElementDragPayload, ELEMENT_DRAG_TYPE } from '@/lib/ai-studio/referenceDrop';
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
type BurnInDropOffer = ReturnType<
  typeof import('../utils/resolveSidebarDropTarget').resolveBurnInDropTarget
>;
let burnInDropTarget: BurnInDropOffer = null;

const resolveCreativeAssetDrop = mock(async () => creativeAssetDropResult);
const resolveSidebarDropTarget = mock(() => sidebarDropTarget);
const resolveBurnInDropTarget = mock(() => burnInDropTarget);

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
mock.module('../utils/resolveSidebarDropTarget', () => ({
  resolveSidebarDropTarget,
  resolveBurnInDropTarget,
}));

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
    burnInDropTarget = null;
    preventDefault.mockClear();
    show.mockClear();
    takeSnapshot.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    triggerSave.mockClear();
    screenToFlowPosition.mockClear();
    resolveCreativeAssetDrop.mockClear();
    resolveSidebarDropTarget.mockClear();
    resolveBurnInDropTarget.mockClear();
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

  it('drops an Element as an element NODE bound to the Element id', async () => {
    const { result } = renderHook(() => useCanvasDnD());

    await act(async () => {
      await result.current.onDrop(
        buildDragEvent({
          data: {
            [ELEMENT_DRAG_TYPE]: buildElementDragPayload({
              elementId: 'element-1',
              name: 'Aria',
              category: 'model',
              previewUrl: 'https://storage/ref-1.png',
            }),
          },
        }),
      );
    });

    const nodes = appendedNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('element');
    expect(nodes[0].position).toEqual(FLOW_POSITION);
    expect(nodes[0].data).toMatchObject({
      elementId: 'element-1',
      elementName: 'Aria',
      elementCategory: 'model',
      previewUrl: 'https://storage/ref-1.png',
    });
    expect(triggerSave).toHaveBeenCalledTimes(1);
    // The element envelope must never reach the creative-asset path, which would
    // build an image node out of the JSON.
    expect(resolveCreativeAssetDrop).not.toHaveBeenCalled();
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

describe('useCanvasDnD burn-in offer', () => {
  const CLIP: StudioNode = {
    id: 'clip-1',
    type: 'video',
    position: { x: 0, y: 0 },
    data: {},
  } as StudioNode;

  const dropOnClip = async () => {
    burnInDropTarget = { videoNodeId: 'clip-1', videoHandleId: 'video' };
    const { result } = renderHook(() => useCanvasDnD());
    await act(async () => {
      await result.current.onDrop(buildDragEvent({ data: { 'text/plain': 'asset-payload' } }));
    });
    const accept = show.mock.calls.at(-1)?.[0]?.action;
    if (!accept) throw new Error('the burn-in offer was never shown');
    const appended = setNodes.mock.calls.at(-1)?.[0] as StudioNode[];
    return { imageNode: appended.at(-1) as StudioNode, accept };
  };

  // A sibling describe, so the suite-level beforeEach above does not reach it — the
  // state it resets is reset here too, or a leftover sidebarDropTarget from the last
  // test sends this drop down the connect path and no offer is ever shown.
  beforeEach(() => {
    store.nodes = [CLIP];
    store.edges = [];
    sidebarDropTarget = null;
    burnInDropTarget = null;
    creativeAssetDropResult = {
      status: 'success',
      nodeType: 'image',
      dataUrl: 'data:image/png;base64,AAA',
      mimeType: 'image/png',
    };
    show.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    takeSnapshot.mockClear();
    triggerSave.mockClear();
  });

  afterEach(cleanup);

  it('reads FRESH canvas state when the offer is accepted, not the arrays from drop time', async () => {
    const { imageNode, accept } = await dropOnClip();

    // Everything the drop captured is now stale: another node arrived and an edge with
    // it. Committing the captured arrays would silently delete both.
    const arrivedLater: StudioNode = {
      id: 'arrived-later',
      type: 'nanoGen',
      position: { x: 900, y: 900 },
      data: {},
    } as StudioNode;
    const edgeArrivedLater = { id: 'e-later', source: 'a', target: 'b' };
    store.nodes = [CLIP, imageNode, arrivedLater];
    store.edges = [edgeArrivedLater];
    setNodes.mockClear();
    setEdges.mockClear();

    act(() => accept.onClick());

    const written = setNodes.mock.calls.at(-1)?.[0] as StudioNode[];
    const writtenEdges = setEdges.mock.calls.at(-1)?.[0] as { id: string }[];
    expect(written.map((node) => node.id)).toContain('arrived-later');
    expect(written.filter((node) => node.id === imageNode.id)).toHaveLength(1);
    expect(written.some((node) => node.type === 'action')).toBe(true);
    expect(writtenEdges.map((edge) => edge.id)).toContain('e-later');
    expect(writtenEdges).toHaveLength(3);
  });

  it('does nothing when the dropped image is gone by the time the offer is accepted', async () => {
    const { accept } = await dropOnClip();
    store.nodes = [CLIP];
    setNodes.mockClear();
    setEdges.mockClear();
    takeSnapshot.mockClear();

    act(() => accept.onClick());

    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
  });
});
