import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ToastOptions } from '@/components/ui/ToastProvider';

const show = mock((_options: ToastOptions) => {});
mock.module('@/components/ui/ToastProvider', () => ({
  useToastContext: () => ({ show }),
}));

const { useStudioStore } = await import('../stores/useStudioStore');
const { useNodeConfigPatch } = await import('./useNodeConfigPatch');

type StoreNode = ReturnType<typeof useStudioStore.getState>['nodes'][number];

const seed = (node: Partial<StoreNode> & { id: string; type: string }) => {
  useStudioStore.setState({
    nodes: [
      {
        position: { x: 0, y: 0 },
        data: {},
        ...node,
      } as StoreNode,
    ],
    saveTrigger: 0,
  });
};

const nodeData = () => useStudioStore.getState().nodes[0].data as Record<string, unknown>;

describe('useNodeConfigPatch', () => {
  beforeEach(() => {
    show.mockClear();
  });

  afterEach(cleanup);

  it('writes only the keys in the patch — a prompt-only patch injects no model', () => {
    seed({ id: 'v1', type: 'videoGen', data: { prompt: 'old' } });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('v1', 'videoGen', { prompt: 'a lighthouse at dusk' }));

    expect(nodeData().prompt).toBe('a lighthouse at dusk');
    expect(nodeData().model).toBeUndefined();
    expect(nodeData().resolution).toBeUndefined();
    expect(nodeData().durationSeconds).toBeUndefined();
    expect(show).not.toHaveBeenCalled();
  });

  it('repairs the Veo resolution/duration pair — 1080p on a 4s node renders at 8s', () => {
    seed({
      id: 'v1',
      type: 'videoGen',
      data: { model: 'veo-3.1', resolution: '720p', durationSeconds: 4 },
    });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('v1', 'videoGen', { resolution: '1080p' }));

    expect(nodeData().resolution).toBe('1080p');
    expect(nodeData().durationSeconds).toBe(8);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].description).toContain('8 seconds');
  });

  it('re-derives the reference mode when a model change makes it illegal', () => {
    seed({
      id: 'v1',
      type: 'videoGen',
      data: { model: 'veo-3.1', referenceMode: 'images' },
    });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('v1', 'videoGen', { model: 'veo-3.1-lite' }));

    // veo-3.1-lite accepts frames only; leaving 'images' behind would silently drop
    // every edge on the reference-image handle at the next load.
    expect(nodeData().referenceMode).toBe('frames');
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('falls the image size back to the model default rather than shipping a 400', () => {
    seed({ id: 'i1', type: 'nanoGen', data: { model: 'nano-banana-2' } });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('i1', 'nanoGen', { imageSize: '1024px' }));

    expect(nodeData().imageSize).toBe('1K');
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('re-snaps the node box when the aspect ratio changes', () => {
    seed({
      id: 'v1',
      type: 'videoGen',
      data: { aspectRatio: '16:9' },
      style: { width: 512, height: 288 },
    });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('v1', 'videoGen', { aspectRatio: '9:16' }));

    const style = useStudioStore.getState().nodes[0].style as { width: number; height: number };
    expect(nodeData().aspectRatio).toBe('9:16');
    expect(style.height).toBeGreaterThan(style.width);
    expect(Math.abs(style.width / style.height - 9 / 16)).toBeLessThan(0.02);
  });

  it('leaves the box alone for a type with no aspect-ratio geometry', () => {
    seed({ id: 't1', type: 'timelineEditor', data: {}, style: { width: 400, height: 300 } });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('t1', 'timelineEditor', { aspectRatio: '9:16' }));

    expect(useStudioStore.getState().nodes[0].style).toEqual({ width: 400, height: 300 });
  });

  it('persists every accepted write', () => {
    seed({ id: 'v1', type: 'videoGen', data: {} });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('v1', 'videoGen', { aspectRatio: '9:16' }));

    expect(useStudioStore.getState().saveTrigger).toBe(1);
  });

  it('is a no-op for a node that is no longer on the canvas', () => {
    seed({ id: 'v1', type: 'videoGen', data: {} });
    const { result } = renderHook(() => useNodeConfigPatch());

    act(() => result.current('gone', 'videoGen', { aspectRatio: '9:16' }));

    expect(useStudioStore.getState().saveTrigger).toBe(0);
    expect(nodeData().aspectRatio).toBeUndefined();
  });
});
