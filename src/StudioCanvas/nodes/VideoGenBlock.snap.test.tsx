import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { VideoGenNodeData } from '../types';
import { VIDEO_GENERATOR_NODE_BOUNDS } from '../utils/aspectRatioSizing';
import { VideoGenBlock } from './VideoGenBlock';

// Veo can return a clip whose shape is not the one the node asked for, and every node
// saved before the aspect-ratio work was born 16:9. The box has to become what the clip
// IS, without touching the request that produced it (that request is hashed into
// generationSignature — rewriting it reads as "edited" and regenerates downstream).

const NODE_ID = 'video-1';

const baseProps: Omit<ComponentProps<typeof VideoGenBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'videoGen',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const videoData = (overrides: Partial<VideoGenNodeData> = {}): VideoGenNodeData => ({
  model: 'veo-3.1',
  prompt: 'a dog running',
  enhancePrompt: false,
  aspectRatio: '16:9',
  resolution: '720p',
  durationSeconds: 8,
  ...overrides,
});

let originalCreateElement: typeof document.createElement;
let videosCreated: HTMLVideoElement[] = [];

const renderNode = (data: VideoGenNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [
      {
        id: NODE_ID,
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data,
        style: { width: 512, height: 288 },
      },
    ],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <VideoGenBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const node = () => useStudioStore.getState().nodes.find((n) => n.id === NODE_ID);

describe('VideoGenBlock generated-video preview', () => {
  beforeEach(() => {
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

  it('re-snaps the node box to the returned 9:16 clip and keeps the 16:9 request', async () => {
    const { container } = renderNode(
      videoData({ generatedVideoUrl: 'https://example.com/portrait.mp4' }),
    );

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
    expect(style.width).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minWidth);
    expect(style.height).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minHeight);
    expect((node()?.data as VideoGenNodeData).aspectRatio).toBe('16:9');
  });

  it('renders the clip in a media-chrome scrubber that only fetches metadata', () => {
    const { container } = renderNode(
      videoData({ generatedVideoUrl: 'https://example.com/clip.mp4' }),
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('playsinline')).not.toBeNull();
    expect(video.className).toContain('object-contain');
    expect(container.querySelector('media-controller')).not.toBeNull();
    expect(container.querySelector('media-time-range')).not.toBeNull();
  });
});
