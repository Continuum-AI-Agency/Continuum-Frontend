import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { OmniGenNodeData } from '../types';
import { OMNI_GENERATOR_NODE_BOUNDS } from '../utils/aspectRatioSizing';
import { OmniGenBlock } from './OmniGenBlock';

const NODE_ID = 'omni-1';

const baseProps: Omit<ComponentProps<typeof OmniGenBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'omniGen',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const omniData = (overrides: Partial<OmniGenNodeData> = {}): OmniGenNodeData =>
  ({ prompt: 'a dog running', aspectRatio: '16:9', ...overrides }) as OmniGenNodeData;

let originalCreateElement: typeof document.createElement;
let videosCreated: HTMLVideoElement[] = [];

const renderNode = (data: OmniGenNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [
      {
        id: NODE_ID,
        type: 'omniGen',
        position: { x: 0, y: 0 },
        data,
        style: { width: 360, height: 203 },
      },
    ],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <OmniGenBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const node = () => useStudioStore.getState().nodes.find((n) => n.id === NODE_ID);

describe('OmniGenBlock generated-video preview', () => {
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

  it('re-snaps the box to the returned clip inside the omni bounds and keeps the request', async () => {
    const { container } = renderNode(
      omniData({ generatedVideoUrl: 'https://example.com/portrait.mp4' }),
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
    expect(style.width).toBeGreaterThanOrEqual(OMNI_GENERATOR_NODE_BOUNDS.minWidth);
    expect(style.height).toBeGreaterThanOrEqual(OMNI_GENERATOR_NODE_BOUNDS.minHeight);
    expect((node()?.data as OmniGenNodeData).aspectRatio).toBe('16:9');
  });

  it('scrubs the main preview and letterboxes it', () => {
    const { container } = renderNode(
      omniData({
        generatedVideoUrl: 'https://example.com/clip.mp4',
        variations: [
          { id: 'v1', status: 'done', videoUrl: 'https://example.com/v1.mp4' },
          { id: 'v2', status: 'done', videoUrl: 'https://example.com/v2.mp4' },
        ],
      } as Partial<OmniGenNodeData>),
    );

    expect(container.querySelector('media-controller')).not.toBeNull();
    expect(container.querySelector('media-time-range')).not.toBeNull();

    const main = container.querySelector('media-controller video') as HTMLVideoElement;
    expect(main.getAttribute('preload')).toBe('metadata');
    expect(main.getAttribute('playsinline')).not.toBeNull();
    expect(main.className).toContain('object-contain');
  });

  // The launcher shows a count, not the rail: the rail lives in the editor now, and
  // the whole point of the rebuild is that the node stops carrying the workspace.
  it('is a launcher — a count and an Open button, no prompt box and no variation rail', () => {
    const { container, getByRole, getByText, queryByPlaceholderText } = renderNode(
      omniData({
        generatedVideoUrl: 'https://example.com/clip.mp4',
        variations: [
          { id: 'v1', status: 'done', videoUrl: 'https://example.com/v1.mp4' },
          { id: 'v2', status: 'done', videoUrl: 'https://example.com/v2.mp4' },
        ],
      } as Partial<OmniGenNodeData>),
    );

    expect(getByRole('button', { name: /open/i })).toBeTruthy();
    expect(getByText('2 variations')).toBeTruthy();
    expect(container.querySelector('textarea')).toBeNull();
    expect(queryByPlaceholderText(/marble/i)).toBeNull();
    expect(container.querySelectorAll('video').length).toBe(1);
  });

  it('opens the editor from the node', async () => {
    const { getByRole, queryByRole } = renderNode(
      omniData({ generatedVideoUrl: 'https://example.com/clip.mp4' }),
    );

    expect(queryByRole('dialog')).toBeNull();
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /open/i }));
    });
    await waitFor(() => expect(queryByRole('dialog')).not.toBeNull());
  });
});
