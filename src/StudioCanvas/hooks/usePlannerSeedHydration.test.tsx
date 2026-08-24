import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, renderHook } from '@testing-library/react';

import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import type { StudioNode } from '../types';

// Captured before the module mocks land so the mocks can be handed back at the end
// of this file — mock.module is process-wide and would otherwise follow the runner
// into the suites that exercise these two utilities for real.
const { inlineReferenceImageNodes: realInlineReferenceImageNodes } = await import(
  '../utils/inlineReferenceImageNodes'
);
const { inlineRemoteImage: realInlineRemoteImage } = await import(
  '@/lib/ai-studio/inlineRemoteImage'
);
const { useStudioStore: realUseStudioStore } = await import('../stores/useStudioStore');

const takeSnapshot = mock(() => {});
const setNodes = mock((_nodes: StudioNode[]) => {});
const setEdges = mock((_edges: unknown[]) => {});
const triggerSave = mock(() => {});
const updateNodeData = mock((_id: string, _data: unknown) => {});
const inlineReferenceImageNodes = mock(async (_nodes: unknown, _deps: unknown) => {});
const inlineRemoteImage = mock(async (_url: string) => ({
  dataUrl: 'data:image/png;base64,ZZZ',
  mimeType: 'image/png',
}));

type MockStore = {
  brandId: string;
  nodes: StudioNode[];
  edges: unknown[];
  defaultEdgeType: string;
  takeSnapshot: typeof takeSnapshot;
  setNodes: typeof setNodes;
  setEdges: typeof setEdges;
  triggerSave: typeof triggerSave;
  updateNodeData: typeof updateNodeData;
};

const store: MockStore = {
  brandId: 'brand-1',
  nodes: [],
  edges: [],
  defaultEdgeType: 'bezier',
  takeSnapshot,
  setNodes,
  setEdges,
  triggerSave,
  updateNodeData,
};

// usePlannerSeedHydration reads the whole store; sibling hooks read through a
// selector. One mock answers both.
const useStudioStoreMock = (selector?: (state: MockStore) => unknown) =>
  selector ? selector(store) : store;
useStudioStoreMock.getState = () => store;
useStudioStoreMock.setState = () => {};
useStudioStoreMock.subscribe = () => () => {};

mock.module('../stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));
mock.module('../utils/inlineReferenceImageNodes', () => ({
  inlineReferenceImageNodes,
}));
mock.module('@/lib/ai-studio/inlineRemoteImage', () => ({
  inlineRemoteImage,
}));

const { buildStarterFlow } = await import('../utils/seedStarterFlow');
const { usePlannerSeedHydration } = await import('./usePlannerSeedHydration');

function makeSeed(overrides: Partial<PlannerAiStudioHandoff> = {}): PlannerAiStudioHandoff {
  return {
    schemaVersion: 'planner_ai_handoff_v1',
    draftId: 'draft-1',
    brandProfileId: 'brand-1',
    weekStartId: '2026-08-17',
    platform: 'instagram',
    postType: 'post',
    format: 'Single image post',
    title: 'Launch teaser',
    summary: 'Short summary',
    captionPreview: 'Caption preview',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

type HydrationProps = {
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
  activeRoomId?: string;
  isLoading: boolean;
};

function renderHydration(initialProps: HydrationProps) {
  return renderHook((props: HydrationProps) => usePlannerSeedHydration(props), { initialProps });
}

function seededCallCounts() {
  return {
    takeSnapshot: takeSnapshot.mock.calls.length,
    setNodes: setNodes.mock.calls.length,
    setEdges: setEdges.mock.calls.length,
    triggerSave: triggerSave.mock.calls.length,
  };
}

describe('usePlannerSeedHydration', () => {
  beforeEach(() => {
    store.nodes = [];
    store.edges = [];
    takeSnapshot.mockClear();
    setNodes.mockClear();
    setEdges.mockClear();
    triggerSave.mockClear();
    updateNodeData.mockClear();
    inlineReferenceImageNodes.mockClear();
  });

  afterEach(cleanup);

  afterAll(() => {
    mock.module('../stores/useStudioStore', () => ({ useStudioStore: realUseStudioStore }));
    mock.module('../utils/inlineReferenceImageNodes', () => ({
      inlineReferenceImageNodes: realInlineReferenceImageNodes,
    }));
    mock.module('@/lib/ai-studio/inlineRemoteImage', () => ({
      inlineRemoteImage: realInlineRemoteImage,
    }));
  });

  it('waits while the canvas is still loading', () => {
    renderHydration({ organicPlannerSeed: makeSeed(), activeRoomId: 'room-1', isLoading: true });

    expect(seededCallCounts()).toEqual({
      takeSnapshot: 0,
      setNodes: 0,
      setEdges: 0,
      triggerSave: 0,
    });
    expect(inlineReferenceImageNodes).not.toHaveBeenCalled();
  });

  it('does nothing without a Planner seed', () => {
    renderHydration({ organicPlannerSeed: null, activeRoomId: 'room-1', isLoading: false });

    expect(seededCallCounts()).toEqual({
      takeSnapshot: 0,
      setNodes: 0,
      setEdges: 0,
      triggerSave: 0,
    });
  });

  it('never overwrites a canvas that already has nodes', () => {
    store.nodes = [
      {
        id: 'existing',
        type: 'string',
        position: { x: 0, y: 0 },
        data: {},
      } as unknown as StudioNode,
    ];
    renderHydration({ organicPlannerSeed: makeSeed(), activeRoomId: 'room-1', isLoading: false });

    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
  });

  it('never overwrites a canvas that already has edges', () => {
    store.edges = [{ id: 'existing-edge', source: 'a', target: 'b' }];
    renderHydration({ organicPlannerSeed: makeSeed(), activeRoomId: 'room-1', isLoading: false });

    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
    expect(takeSnapshot).not.toHaveBeenCalled();
  });

  it('seeds the starter flow into an empty, loaded canvas', () => {
    const seed = makeSeed();
    renderHydration({ organicPlannerSeed: seed, activeRoomId: 'room-1', isLoading: false });

    const starter = buildStarterFlow(seed);
    expect(seededCallCounts()).toEqual({
      takeSnapshot: 1,
      setNodes: 1,
      setEdges: 1,
      triggerSave: 1,
    });
    expect(setNodes.mock.calls[0]?.[0]).toEqual(starter.nodes);
    expect(setEdges.mock.calls[0]?.[0]).toEqual(starter.edges);
  });

  it('hands the seeded nodes to the reference-image inliner', () => {
    const seed = makeSeed({
      postType: 'reel',
      format: 'Reel',
      mediaSuggestion: { assetUrl: 'https://cdn.example.com/seed.png' },
    });
    renderHydration({ organicPlannerSeed: seed, activeRoomId: 'room-1', isLoading: false });

    const starter = buildStarterFlow(seed);
    expect(inlineReferenceImageNodes).toHaveBeenCalledTimes(1);
    expect(inlineReferenceImageNodes.mock.calls[0]?.[0]).toEqual(starter.nodes);
    const deps = inlineReferenceImageNodes.mock.calls[0]?.[1] as {
      inline: unknown;
      updateNodeData: unknown;
    };
    expect(deps.inline).toBe(inlineRemoteImage);
    expect(deps.updateNodeData).toBe(updateNodeData);
  });

  it('seeds once per room and draft across re-renders', () => {
    const seed = makeSeed();
    const { rerender } = renderHydration({
      organicPlannerSeed: seed,
      activeRoomId: 'room-1',
      isLoading: false,
    });

    rerender({ organicPlannerSeed: seed, activeRoomId: 'room-1', isLoading: false });
    // A fresh seed object with the same draftId is still the same hydration key.
    rerender({ organicPlannerSeed: makeSeed(), activeRoomId: 'room-1', isLoading: false });

    expect(seededCallCounts()).toEqual({
      takeSnapshot: 1,
      setNodes: 1,
      setEdges: 1,
      triggerSave: 1,
    });
  });

  it('seeds again when the room changes', () => {
    const seed = makeSeed();
    const { rerender } = renderHydration({
      organicPlannerSeed: seed,
      activeRoomId: 'room-1',
      isLoading: false,
    });

    rerender({ organicPlannerSeed: seed, activeRoomId: 'room-2', isLoading: false });

    expect(seededCallCounts()).toEqual({
      takeSnapshot: 2,
      setNodes: 2,
      setEdges: 2,
      triggerSave: 2,
    });
  });

  it('seeds again when the draft changes inside the same room', () => {
    const { rerender } = renderHydration({
      organicPlannerSeed: makeSeed({ draftId: 'draft-1' }),
      activeRoomId: 'room-1',
      isLoading: false,
    });

    rerender({
      organicPlannerSeed: makeSeed({ draftId: 'draft-2' }),
      activeRoomId: 'room-1',
      isLoading: false,
    });

    expect(setNodes).toHaveBeenCalledTimes(2);
    expect(setNodes.mock.calls[1]?.[0]).toEqual(
      buildStarterFlow(makeSeed({ draftId: 'draft-2' })).nodes,
    );
  });
});
