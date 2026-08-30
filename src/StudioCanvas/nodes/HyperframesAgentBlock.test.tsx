import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { clearVideoAspectCache } from '../hooks/useSnapToVideoAspect';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData } from '../types';
import { HyperframesAgentBlock } from './HyperframesAgentBlock';

const NODE_ID = 'hyper-1';

const baseProps: Omit<ComponentProps<typeof HyperframesAgentBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'hyperframesAgent',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const hyperData = (overrides: Partial<HyperframesAgentNodeData> = {}): HyperframesAgentNodeData =>
  ({
    label: 'HyperFrames Agent',
    model: 'gemini-3.6-flash',
    prompt: '',
    aspectRatio: '16:9',
    durationSeconds: 10,
    fps: 30,
    resolution: '1080p',
    status: 'idle',
    ...overrides,
  }) as HyperframesAgentNodeData;

let originalCreateElement: typeof document.createElement;
let videosCreated: HTMLVideoElement[] = [];

const renderNode = (data: HyperframesAgentNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [
      {
        id: NODE_ID,
        type: 'hyperframesAgent',
        position: { x: 0, y: 0 },
        data,
        style: { width: 640, height: 360 },
      },
    ],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <HyperframesAgentBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const node = () => useStudioStore.getState().nodes.find((n) => n.id === NODE_ID);

describe('HyperframesAgentBlock rendered-composition preview', () => {
  beforeEach(() => {
    // The video aspect probe is memoized across the module; a stale entry from another
    // suite would answer instantly and this file's detached-element assertions never fire.
    clearVideoAspectCache();
    videosCreated = [];
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'video') videosCreated.push(element as HTMLVideoElement);
      return element;
    }) as typeof document.createElement;
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    cleanup();
  });

  it('re-snaps the box to the rendered composition, above its resizer minimums', async () => {
    const { container } = renderNode(
      hyperData({ generatedVideoUrl: 'https://example.com/portrait.mp4', status: 'completed' }),
    );

    // The ratio is read from the element ALREADY showing the clip. Measuring with a
    // second, detached element downloaded the same bytes twice — both requests issued
    // in the same instant under the same token, so neither could use the other's cache.
    const rendered = Array.from(container.querySelectorAll('video'));
    const detached = videosCreated.filter((element) => !rendered.includes(element));
    expect(detached).toHaveLength(0);
    const detection = rendered[0];
    if (!detection) throw new Error('the node rendered no video to measure');

    Object.defineProperty(detection, 'videoWidth', { configurable: true, value: 1080 });
    Object.defineProperty(detection, 'videoHeight', { configurable: true, value: 1920 });
    await act(async () => {
      fireEvent.loadedMetadata(detection);
    });

    await waitFor(() => {
      const style = node()?.style as { width: number; height: number };
      expect(style.width / style.height).toBeCloseTo(9 / 16, 2);
    });
    const style = node()?.style as { width: number; height: number };
    expect(style.width).toBeGreaterThanOrEqual(360);
    expect(style.height).toBeGreaterThanOrEqual(360);
    expect((node()?.data as HyperframesAgentNodeData).aspectRatio).toBe('16:9');
  });

  it('scrubs the composition in-node and only fetches metadata', () => {
    const { container } = renderNode(
      hyperData({ generatedVideoUrl: 'https://example.com/clip.mp4', status: 'completed' }),
    );

    expect(container.querySelector('media-controller')).not.toBeNull();
    expect(container.querySelector('media-time-range')).not.toBeNull();
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('playsinline')).not.toBeNull();
    expect(video.className).toContain('object-contain');
  });
});
