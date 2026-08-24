import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { useStudioStore } from '../stores/useStudioStore';
import { VIDEO_GENERATOR_NODE_BOUNDS } from '../utils/aspectRatioSizing';
import { useSnapToVideoAspect } from './useSnapToVideoAspect';

// The gap: a generator asked for 16:9, Veo handed back a 9:16 clip, and the node box
// stayed landscape — the clip letterboxed inside it until someone dragged the corner.
// Images have re-snapped to their real dimensions since #232; video never did.

const NODE_ID = 'clip-1';

let originalCreateElement: typeof document.createElement;
let detectionVideos: HTMLVideoElement[] = [];

const seedNode = (data: Record<string, unknown>, style: { width: number; height: number }) => {
  useStudioStore.setState({
    nodes: [{ id: NODE_ID, type: 'videoGen', position: { x: 0, y: 0 }, data, style }],
    edges: [],
  });
};

const nodeNow = () => useStudioStore.getState().nodes.find((node) => node.id === NODE_ID);

const resolveMetadata = async (width: number, height: number) => {
  await waitFor(() => {
    expect(detectionVideos.length).toBeGreaterThan(0);
  });
  const element = detectionVideos[detectionVideos.length - 1];
  Object.defineProperty(element, 'videoWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'videoHeight', { configurable: true, value: height });
  await act(async () => {
    fireEvent.loadedMetadata(element);
  });
};

describe('useSnapToVideoAspect', () => {
  beforeEach(() => {
    detectionVideos = [];
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'video') detectionVideos.push(element as HTMLVideoElement);
      return element;
    }) as typeof document.createElement;
    useStudioStore.setState({ nodes: [], edges: [] });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    cleanup();
  });

  it('snaps a 16:9 box to the 9:16 clip it is actually showing, inside the family bounds', async () => {
    seedNode({ aspectRatio: '16:9' }, { width: 512, height: 288 });

    renderHook(() =>
      useSnapToVideoAspect({
        nodeId: NODE_ID,
        src: 'https://example.com/portrait.mp4',
        bounds: VIDEO_GENERATOR_NODE_BOUNDS,
      }),
    );

    await resolveMetadata(1080, 1920);

    await waitFor(() => {
      const style = nodeNow()?.style as { width: number; height: number };
      expect(style.width / style.height).toBeCloseTo(9 / 16, 2);
    });
    const style = nodeNow()?.style as { width: number; height: number };
    expect(style.width).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minWidth);
    expect(style.height).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minHeight);
  });

  it('leaves data.aspectRatio alone — it is the request, and a generationSignature field', async () => {
    seedNode({ aspectRatio: '16:9' }, { width: 512, height: 288 });

    renderHook(() =>
      useSnapToVideoAspect({
        nodeId: NODE_ID,
        src: 'https://example.com/portrait.mp4',
        bounds: VIDEO_GENERATOR_NODE_BOUNDS,
      }),
    );

    await resolveMetadata(1080, 1920);

    await waitFor(() => {
      expect((nodeNow()?.style as { width: number }).width).not.toBe(512);
    });
    expect((nodeNow()?.data as { aspectRatio?: string }).aspectRatio).toBe('16:9');
  });

  it('persists the detected ratio when the node has no request to protect', async () => {
    seedNode({ aspectRatio: '16:9' }, { width: 192, height: 192 });

    renderHook(() =>
      useSnapToVideoAspect({
        nodeId: NODE_ID,
        src: 'https://example.com/portrait.mp4',
        bounds: { minWidth: 160, minHeight: 160, fallbackWidth: 192 },
        writeAspectRatio: true,
      }),
    );

    await resolveMetadata(1080, 1920);

    await waitFor(() => {
      expect((nodeNow()?.data as { aspectRatio?: string }).aspectRatio).toBe('9:16');
    });
  });

  it('does not dirty the canvas when the box is already the right shape', async () => {
    seedNode({ aspectRatio: '16:9' }, { width: 512, height: 288 });
    let saves = 0;
    useStudioStore.setState({
      triggerSave: () => {
        saves += 1;
      },
    });

    renderHook(() =>
      useSnapToVideoAspect({
        nodeId: NODE_ID,
        src: 'https://example.com/landscape.mp4',
        bounds: VIDEO_GENERATOR_NODE_BOUNDS,
      }),
    );

    await resolveMetadata(1920, 1080);

    expect(nodeNow()?.style).toEqual({ width: 512, height: 288 });
    expect(saves).toBe(0);
  });

  it('does nothing without a source', async () => {
    seedNode({ aspectRatio: '16:9' }, { width: 512, height: 288 });

    renderHook(() =>
      useSnapToVideoAspect({
        nodeId: NODE_ID,
        src: undefined,
        bounds: VIDEO_GENERATOR_NODE_BOUNDS,
      }),
    );

    expect(detectionVideos.length).toBe(0);
    expect(nodeNow()?.style).toEqual({ width: 512, height: 288 });
  });
});
