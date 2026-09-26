import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import type { StudioNode } from '../types';

const push = mock((_href: string) => {});
const show = mock((_toast: unknown) => {});

type MockStore = { nodes: StudioNode[]; edges: unknown[] };

const store: MockStore = { nodes: [], edges: [] };

// useApplyBackToPlanner reads through a selector; usePlannerSeedHydration reads the
// whole store. One mock that answers both keeps the two suites from fighting.
const useStudioStoreMock = (selector?: (state: MockStore) => unknown) =>
  selector ? selector(store) : store;
useStudioStoreMock.getState = () => store;
useStudioStoreMock.setState = () => {};
useStudioStoreMock.subscribe = () => () => {};

// bun's mock.module MERGES into an already-loaded module and REPLACES one that has
// never been loaded, and it is process-wide for the whole run. Loading the real
// modules first keeps the override to a single export, and the originals are put
// back in afterAll so the store and router this file borrows are not poisoned for
// the suites that own them later in the run.
const { useStudioStore: realUseStudioStore } = await import('../stores/useStudioStore');
const { useRouter: realUseRouter } = await import('next/navigation');
const { useToast: realUseToast } = await import('@/components/ui/ToastProvider');

mock.module('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
}));
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show }),
}));
mock.module('../stores/useStudioStore', () => ({
  useStudioStore: useStudioStoreMock,
}));

const { buildPendingApplyStorageKey } = await import('@/lib/organic/ai-studio-bridge');
const { useApplyBackToPlanner } = await import('./useApplyBackToPlanner');

type ApplyBack = ReturnType<typeof useApplyBackToPlanner>;

let applyOk = true;
let applyBody: unknown = null;
const fetchMock = mock(async (_input: unknown, _init?: unknown) => ({
  ok: applyOk,
  json: async () => applyBody,
}));
const originalFetch = global.fetch;

function makeSeed(overrides: Partial<PlannerAiStudioHandoff> = {}): PlannerAiStudioHandoff {
  return {
    schemaVersion: 'planner_ai_handoff_v1',
    draftId: 'draft-1',
    sourceUpdatedAt: '2026-08-23T00:00:00.000Z',
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

function imageNode(id: string, source: string, x: number): StudioNode {
  return {
    id,
    type: 'nanoGen',
    selected: true,
    position: { x, y: 0 },
    data: { generatedImage: source },
  } as unknown as StudioNode;
}

function videoNode(id: string, source: string, x: number): StudioNode {
  return {
    id,
    type: 'videoGen',
    selected: true,
    position: { x, y: 0 },
    data: { generatedVideo: source },
  } as unknown as StudioNode;
}

function persistedResponse(
  seed: PlannerAiStudioHandoff,
  assets: Array<{ role: string; kind: 'image' | 'video'; slideIndex?: number }>,
) {
  return {
    schemaVersion: 'planner_ai_apply_v1',
    draftId: seed.draftId,
    brandProfileId: 'brand-1',
    postType: seed.postType,
    platform: seed.platform,
    overwrite: true,
    contentPatch: { title: seed.title },
    assets: assets.map((asset) => ({
      ...asset,
      storagePath: `planner/${asset.role}.png`,
      storageUrl: `https://cdn.example.com/${asset.role}.png`,
    })),
    appliedAt: '2026-08-23T12:00:00.000Z',
  };
}

function renderApply(seed: PlannerAiStudioHandoff | null, brandProfileId?: string) {
  const renders: ApplyBack[] = [];
  const view = renderHook(() => {
    const value = useApplyBackToPlanner({
      brandProfileId,
      organicPlannerSeed: seed,
    });
    renders.push(value);
    return value;
  });
  return { ...view, renders };
}

function requestBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('useApplyBackToPlanner', () => {
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    mock.module('../stores/useStudioStore', () => ({ useStudioStore: realUseStudioStore }));
    mock.module('next/navigation', () => ({ useRouter: realUseRouter }));
    mock.module('@/components/ui/ToastProvider', () => ({ useToast: realUseToast }));
  });

  beforeEach(() => {
    store.nodes = [];
    store.edges = [];
    push.mockClear();
    show.mockClear();
    fetchMock.mockClear();
    applyOk = true;
    applyBody = null;
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it('is disabled without a Planner seed and enabled with one', () => {
    const withoutSeed = renderApply(null, 'brand-1');
    expect(withoutSeed.result.current.enabled).toBe(false);
    expect(withoutSeed.result.current.applyReadiness).toBeNull();
    expect(withoutSeed.result.current.workflowSummaryLabel).toBeNull();
    cleanup();

    const withSeed = renderApply(makeSeed(), 'brand-1');
    expect(withSeed.result.current.enabled).toBe(true);
    expect(withSeed.result.current.applyReadiness).not.toBeNull();
  });

  // The whole point of the round trip: open the creative in Studio, EDIT it, apply it back.
  // Editing happens on `layerEditor`, which apply-back could not see, so readiness sat at
  // "0/1 image ready" and the button stayed disabled however much work the user did.
  it('counts an edited creative from the Layer Editor, not just a fresh generation', () => {
    const { result, rerender } = renderApply(makeSeed(), 'brand-1');

    expect(result.current.applyReadiness?.ready).toBe(false);

    store.nodes = [
      {
        id: 'layers-1',
        type: 'layerEditor',
        selected: true,
        position: { x: 0, y: 0 },
        data: { generatedImage: 'data:image/png;base64,EDITED' },
      } as unknown as StudioNode,
    ];
    rerender();

    expect(result.current.applyReadiness).toEqual({
      ready: true,
      completed: 1,
      total: 1,
      label: '1/1 image ready',
      detail: 'Ready to apply this draft back to Planner.',
    });
  });

  it('gates a reel workflow on a single video candidate', () => {
    const seed = makeSeed({ postType: 'reel', format: 'Reel' });
    const { result, rerender } = renderApply(seed, 'brand-1');

    expect(result.current.applyReadiness).toEqual({
      ready: false,
      completed: 0,
      total: 1,
      label: '0/1 video ready',
      detail: 'Generate one video output to enable apply-back.',
    });

    // An image candidate is the wrong kind for a reel and must not count.
    store.nodes = [imageNode('img-1', 'data:image/png;base64,AAA', 0)];
    rerender();
    expect(result.current.applyReadiness?.ready).toBe(false);

    store.nodes = [videoNode('vid-1', 'https://cdn.example.com/reel.mp4', 0)];
    rerender();
    expect(result.current.applyReadiness).toEqual({
      ready: true,
      completed: 1,
      total: 1,
      label: '1/1 video ready',
      detail: 'Ready to apply this reel back to Planner.',
    });
  });

  it('gates an ordered carousel on the seed authoritativeCount', () => {
    const seed = makeSeed({ postType: 'carousel', format: 'Carousel', authoritativeCount: 3 });
    const { result, rerender } = renderApply(seed, 'brand-1');

    expect(result.current.applyReadiness).toEqual({
      ready: false,
      completed: 0,
      total: 3,
      label: '0/3 slides ready',
      detail: 'Generate all required carousel slides before applying.',
    });

    store.nodes = [
      imageNode('organic-seed-carousel-draft-1-1', 'data:image/png;base64,AAA', 0),
      imageNode('organic-seed-carousel-draft-1-2', 'data:image/png;base64,BBB', 100),
    ];
    rerender();
    expect(result.current.applyReadiness?.ready).toBe(false);
    expect(result.current.applyReadiness?.label).toBe('2/3 slides ready');

    store.nodes = [
      imageNode('organic-seed-carousel-draft-1-1', 'data:image/png;base64,AAA', 0),
      imageNode('organic-seed-carousel-draft-1-2', 'data:image/png;base64,BBB', 100),
      imageNode('organic-seed-carousel-draft-1-3', 'data:image/png;base64,CCC', 200),
      imageNode('img-4', 'data:image/png;base64,DDD', 300),
    ];
    rerender();
    // Completed is capped at total, so a surplus generator never reads as 4/3.
    expect(result.current.applyReadiness).toEqual({
      ready: true,
      completed: 3,
      total: 3,
      label: '3/3 slides ready',
      detail: 'Ordered carousel outputs are ready to apply.',
    });
  });

  it('falls back to one slide when a carousel seed carries no authoritativeCount', () => {
    const seed = makeSeed({ postType: 'carousel', format: 'Carousel' });
    store.nodes = [imageNode('organic-seed-carousel-draft-1-1', 'data:image/png;base64,AAA', 0)];
    const { result } = renderApply(seed, 'brand-1');

    expect(result.current.applyReadiness?.total).toBe(1);
    expect(result.current.applyReadiness?.ready).toBe(true);
  });

  it('gates a single-image workflow on one image candidate', () => {
    const seed = makeSeed();
    const { result, rerender } = renderApply(seed, 'brand-1');

    expect(result.current.applyReadiness).toEqual({
      ready: false,
      completed: 0,
      total: 1,
      label: '0/1 image ready',
      detail: 'Generate one image output to enable apply-back.',
    });

    store.nodes = [imageNode('img-1', 'data:image/png;base64,AAA', 0)];
    rerender();
    expect(result.current.applyReadiness).toEqual({
      ready: true,
      completed: 1,
      total: 1,
      label: '1/1 image ready',
      detail: 'Ready to apply this draft back to Planner.',
    });
  });

  it('ignores an older unselected room output when applying this draft', async () => {
    const seed = makeSeed();
    applyBody = persistedResponse(seed, [{ role: 'image_1', kind: 'image' }]);
    const prior = imageNode('older-draft-output', 'data:image/png;base64,OLD', 0);
    prior.selected = false;
    const current = imageNode('organic-seed-image-draft-1', 'data:image/png;base64,NEW', 500);
    current.selected = false;
    store.nodes = [prior, current];
    const { result } = renderApply(seed, 'brand-1');
    expect(result.current.applyReadiness?.ready).toBe(true);
    await act(async () => {
      await result.current.onApplyBack();
    });
    expect(requestBody().assets).toEqual([
      { role: 'image_1', kind: 'image', sourceDataUrl: 'data:image/png;base64,NEW' },
    ]);
  });

  it('applies a selected edited output instead of the original seed image', async () => {
    const seed = makeSeed();
    applyBody = persistedResponse(seed, [{ role: 'image_1', kind: 'image' }]);
    const original = imageNode('organic-seed-image-draft-1', 'data:image/png;base64,OLD', 0);
    original.selected = false;
    store.nodes = [original, imageNode('edited-output', 'data:image/png;base64,EDITED', 500)];
    const { result } = renderApply(seed, 'brand-1');
    await act(async () => {
      await result.current.onApplyBack();
    });
    expect(requestBody().assets).toEqual([
      { role: 'image_2', kind: 'image', sourceDataUrl: 'data:image/png;base64,EDITED' },
    ]);
  });

  it('saves edited TikTok copy through the Planner field endpoint with the seed revision', async () => {
    const seed = makeSeed({
      platform: 'tiktok',
      workflowConcept: 'tt_text',
      backendDraftId: 'server-draft-1',
      sourceUpdatedAt: '2026-09-22T00:00:00Z',
      captionPreview: 'Original caption',
    });
    store.nodes = [
      {
        id: 'organic-seed-text-draft-1',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'Edited TikTok caption' },
      } as StudioNode,
    ];
    applyBody = { updated_at: '2026-09-22T00:01:00Z' };
    const { result } = renderApply(seed, 'brand-1');
    expect(result.current.applyReadiness?.ready).toBe(true);
    await act(async () => {
      await result.current.onApplyBack();
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/organic/calendar/drafts/server-draft-1/fields',
    );
    const request = fetchMock.mock.calls[0]?.[1] as { body: string; method: string };
    expect(request.method).toBe('PATCH');
    expect(JSON.parse(request.body)).toEqual({
      caption: 'Edited TikTok caption',
      expected_updated_at: '2026-09-22T00:00:00Z',
    });
    expect(push).toHaveBeenCalledWith(
      '/organic?tab=planner&draftId=draft-1&weekStartId=2026-08-17&from=ai-studio',
    );
  });

  it('requires a real pick for a multi-output LinkedIn draft', () => {
    const seed = makeSeed({ platform: 'linkedin', format: 'LinkedIn post' });
    store.nodes = [
      imageNode('img-1', 'data:image/png;base64,AAA', 0),
      imageNode('img-2', 'data:image/png;base64,BBB', 100),
    ];
    const { result } = renderApply(seed, 'brand-1');

    expect(result.current.selectedLinkedinNodeId).toBeNull();
    expect(result.current.applyReadiness).toEqual({
      ready: false,
      completed: 1,
      total: 1,
      label: '1/1 image ready',
      detail: 'Select one image output before applying.',
    });

    act(() => result.current.setSelectedLinkedinNodeId('img-2'));
    expect(result.current.applyReadiness?.ready).toBe(true);
  });

  it('names each workflow shape', () => {
    const shapes: Array<[Partial<PlannerAiStudioHandoff>, string]> = [
      [{ postType: 'reel' }, 'Reel workflow'],
      [{ postType: 'carousel' }, 'Carousel workflow'],
      [{ platform: 'linkedin' }, 'LinkedIn post workflow'],
      [{}, 'Single-image workflow'],
    ];

    for (const [overrides, label] of shapes) {
      const { result } = renderApply(makeSeed(overrides), 'brand-1');
      expect(result.current.workflowSummaryLabel).toBe(label);
      cleanup();
    }
  });

  it('clears a LinkedIn pick when its output disappears', () => {
    const seed = makeSeed({ platform: 'linkedin', format: 'LinkedIn post' });
    store.nodes = [
      imageNode('img-1', 'data:image/png;base64,AAA', 0),
      imageNode('img-2', 'data:image/png;base64,BBB', 100),
    ];
    const { result, rerender } = renderApply(seed, 'brand-1');

    expect(result.current.requiresExplicitSelection).toBe(true);
    expect(result.current.linkedinImageCandidates.map((candidate) => candidate.nodeId)).toEqual([
      'img-1',
      'img-2',
    ]);
    expect(result.current.selectedLinkedinNodeId).toBeNull();

    act(() => result.current.setSelectedLinkedinNodeId('img-2'));
    expect(result.current.selectedLinkedinNodeId).toBe('img-2');

    // The selected node disappears from the canvas: the effect clears it.
    store.nodes = [
      imageNode('img-3', 'data:image/png;base64,CCC', 0),
      imageNode('img-4', 'data:image/png;base64,DDD', 100),
    ];
    rerender();
    expect(result.current.selectedLinkedinNodeId).toBeNull();
    expect(result.current.applyReadiness?.ready).toBe(false);

    // Down to a single candidate an explicit pick is no longer required, and the
    // selection is cleared.
    store.nodes = [imageNode('img-3', 'data:image/png;base64,CCC', 0)];
    rerender();
    expect(result.current.requiresExplicitSelection).toBe(false);
    expect(result.current.selectedLinkedinNodeId).toBeNull();
  });

  it('posts ordered carousel slides, stores the pending apply and returns to Planner', async () => {
    const seed = makeSeed({
      draftId: 'draft-carousel',
      postType: 'carousel',
      format: 'Carousel',
      authoritativeCount: 2,
    });
    applyBody = persistedResponse(seed, [
      { role: 'slide_1', kind: 'image', slideIndex: 0 },
      { role: 'slide_2', kind: 'image', slideIndex: 1 },
    ]);
    store.nodes = [
      imageNode('organic-seed-carousel-draft-carousel-1', 'data:image/png;base64,AAA', 0),
      imageNode('organic-seed-carousel-draft-carousel-2', 'https://cdn.example.com/two.png', 100),
    ];
    const { result } = renderApply(seed, 'brand-1');

    await act(async () => {
      await result.current.onApplyBack();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/organic/ai-studio/apply');
    expect((fetchMock.mock.calls[0]?.[1] as { method: string }).method).toBe('POST');

    const body = requestBody();
    expect(body.schemaVersion).toBe('planner_ai_apply_v1');
    expect(body.draftId).toBe('draft-carousel');
    expect(body.brandProfileId).toBe('brand-1');
    expect(body.overwrite).toBe(true);
    expect(body.assets).toEqual([
      {
        role: 'slide_1',
        kind: 'image',
        slideIndex: 0,
        sourceDataUrl: 'data:image/png;base64,AAA',
      },
      {
        role: 'slide_2',
        kind: 'image',
        slideIndex: 1,
        sourceUrl: 'https://cdn.example.com/two.png',
      },
    ]);
    expect(body.selection).toEqual({ required: false });
    expect(body.contentPatch).toEqual({});

    expect(window.localStorage.getItem(buildPendingApplyStorageKey('draft-carousel'))).toBe(
      JSON.stringify(applyBody),
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect((show.mock.calls[0]?.[0] as { variant: string }).variant).toBe('success');
    expect(push).toHaveBeenCalledWith(
      '/organic?tab=planner&draftId=draft-carousel&weekStartId=2026-08-17&from=ai-studio',
    );
    expect(result.current.isApplyingBack).toBe(false);
  });

  it('marks the selection as required and names the picked role for LinkedIn', async () => {
    const seed = makeSeed({ platform: 'linkedin', format: 'LinkedIn post' });
    applyBody = persistedResponse(seed, [{ role: 'image_1', kind: 'image' }]);
    store.nodes = [
      imageNode('img-1', 'data:image/png;base64,AAA', 0),
      imageNode('img-2', 'data:image/png;base64,BBB', 100),
    ];
    const { result } = renderApply(seed, 'brand-1');

    act(() => result.current.setSelectedLinkedinNodeId('img-1'));

    await act(async () => {
      await result.current.onApplyBack();
    });

    const body = requestBody();
    expect(body.selection).toEqual({ required: true, selectedAssetRole: 'image_1' });
    expect(body.assets).toEqual([
      { role: 'image_1', kind: 'image', sourceDataUrl: 'data:image/png;base64,AAA' },
    ]);
  });

  it('resolves data, http and bare-string candidate sources onto distinct fields', async () => {
    const seed = makeSeed({
      draftId: 'draft-sources',
      postType: 'carousel',
      format: 'Carousel',
      authoritativeCount: 3,
    });
    applyBody = persistedResponse(seed, [
      { role: 'slide_1', kind: 'image', slideIndex: 0 },
      { role: 'slide_2', kind: 'image', slideIndex: 1 },
      { role: 'slide_3', kind: 'image', slideIndex: 2 },
    ]);
    store.nodes = [
      imageNode('organic-seed-carousel-draft-sources-1', 'data:image/png;base64,AAA', 0),
      imageNode('organic-seed-carousel-draft-sources-2', 'https://cdn.example.com/two.png', 100),
      imageNode('organic-seed-carousel-draft-sources-3', 'iVBORw0KGgoAAAA', 200),
    ];
    const { result } = renderApply(seed, 'brand-1');

    await act(async () => {
      await result.current.onApplyBack();
    });

    const assets = requestBody().assets as Array<Record<string, unknown>>;
    expect(assets[0]).toEqual({
      role: 'slide_1',
      kind: 'image',
      slideIndex: 0,
      sourceDataUrl: 'data:image/png;base64,AAA',
    });
    expect(assets[1]).toEqual({
      role: 'slide_2',
      kind: 'image',
      slideIndex: 1,
      sourceUrl: 'https://cdn.example.com/two.png',
    });
    expect(assets[2]).toEqual({
      role: 'slide_3',
      kind: 'image',
      slideIndex: 2,
      sourceBase64: 'iVBORw0KGgoAAAA',
    });
  });

  it('warns and never fetches without a seed or a brand', async () => {
    store.nodes = [imageNode('img-1', 'data:image/png;base64,AAA', 0)];
    const withoutSeed = renderApply(null, 'brand-1');

    await act(async () => {
      await withoutSeed.result.current.onApplyBack();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(show.mock.calls[0]?.[0] as { variant: string; title: string }).toMatchObject({
      title: 'Apply unavailable',
      variant: 'warning',
    });
    cleanup();
    show.mockClear();

    const withoutBrand = renderApply(makeSeed(), undefined);
    await act(async () => {
      await withoutBrand.result.current.onApplyBack();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect((show.mock.calls[0]?.[0] as { variant: string }).variant).toBe('warning');
    expect(withoutBrand.result.current.isApplyingBack).toBe(false);
  });

  it('surfaces a failed apply as an error toast and stays on the canvas', async () => {
    const seed = makeSeed();
    applyOk = false;
    applyBody = { error: 'Draft is locked' };
    store.nodes = [imageNode('img-1', 'data:image/png;base64,AAA', 0)];
    const { result } = renderApply(seed, 'brand-1');

    await act(async () => {
      await result.current.onApplyBack();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0]).toMatchObject({
      title: 'Apply failed',
      description: 'Draft is locked',
      variant: 'error',
    });
    expect(push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(buildPendingApplyStorageKey('draft-1'))).toBeNull();
    expect(result.current.isApplyingBack).toBe(false);
  });

  it('rejects an ok response whose payload fails the apply schema', async () => {
    const seed = makeSeed();
    applyBody = { schemaVersion: 'planner_ai_apply_v1', draftId: 'draft-1' };
    store.nodes = [imageNode('img-1', 'data:image/png;base64,AAA', 0)];
    const { result } = renderApply(seed, 'brand-1');

    await act(async () => {
      await result.current.onApplyBack();
    });

    expect(show.mock.calls[0]?.[0]).toMatchObject({
      title: 'Apply failed',
      description: 'Apply response payload is invalid.',
      variant: 'error',
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('returns to Planner without applying', () => {
    const { result } = renderApply(makeSeed({ draftId: 'draft-return' }), 'brand-1');

    act(() => {
      result.current.onReturnToPlanner();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(
      '/organic?tab=planner&draftId=draft-return&weekStartId=2026-08-17&from=ai-studio',
    );
  });
});
