import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { ExtendVideoNodeData } from '../types';
import { ExtendVideoBlock } from './ExtendVideoBlock';
import { clearVideoAspectCache } from '../hooks/useSnapToVideoAspect';

// This node had a Radix AspectRatio hardcoded to 16/9 around its preview — the exact
// construct #232 removed everywhere else, on the one node whose output shape is
// entirely decided by whatever clip was wired into it.

const NODE_ID = 'extend-1';

const baseProps: Omit<ComponentProps<typeof ExtendVideoBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'extendVideo',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

let originalCreateElement: typeof document.createElement;
let videosCreated: HTMLVideoElement[] = [];

const renderNode = (data: ExtendVideoNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [
      {
        id: NODE_ID,
        type: 'extendVideo',
        position: { x: 0, y: 0 },
        data,
        style: { width: 400, height: 225 },
      },
    ],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <ExtendVideoBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const node = () => useStudioStore.getState().nodes.find((n) => n.id === NODE_ID);

describe('ExtendVideoBlock generated-video preview', () => {
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

  it('takes the shape of the extended clip instead of a hardcoded 16:9', async () => {
    const { container } = renderNode({ generatedVideoUrl: 'https://example.com/portrait.mp4' });

    const rendered = Array.from(container.querySelectorAll('video'));
    const detection = videosCreated.find((element) => !rendered.includes(element));
    if (!detection) throw new Error('detached metadata probe was never created');

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
    expect(style.width).toBeGreaterThanOrEqual(260);
    expect(style.height).toBeGreaterThanOrEqual(160);
  });

  it('scrubs in-node and no longer claims a fixed ratio in its footer', () => {
    const { container, queryByText } = renderNode({
      generatedVideoUrl: 'https://example.com/clip.mp4',
    });

    expect(container.querySelector('media-controller')).not.toBeNull();
    expect(container.querySelector('media-time-range')).not.toBeNull();
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('playsinline')).not.toBeNull();
    expect(video.className).toContain('object-contain');
    expect(queryByText('Extend Video • 16:9')).toBeNull();
  });
});
