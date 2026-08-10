import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { VideoGenNodeData } from '../types';
import { VideoGenBlock } from './VideoGenBlock';

// The bug: the video node had no duration control anywhere, so every canvas clip
// came back at buildNodePayload's silent 8s fallback and the tester could not ask
// for anything else (Airtable #252/#254). Veo also renders above 720p at 8s only,
// so the length shown has to be the length that will actually render.

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

const nodeData = (): VideoGenNodeData =>
  useStudioStore.getState().nodes.find((node) => node.id === NODE_ID)?.data as VideoGenNodeData;

const renderNode = (data: VideoGenNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [{ id: NODE_ID, type: 'videoGen', position: { x: 0, y: 0 }, data }],
  });
  const view = render(
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
  return {
    ...view,
    select: view.getByTestId('studio-video-duration-select') as HTMLSelectElement,
  };
};

describe('VideoGenBlock duration control', () => {
  beforeEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('surfaces the clip length beside the Brand chip instead of nowhere at all', () => {
    const { select } = renderNode(videoData());

    expect(select.value).toBe('8');
  });

  it('writes the chosen length onto the node', () => {
    const { select } = renderNode(videoData());

    fireEvent.change(select, { target: { value: '6' } });

    expect(nodeData().durationSeconds).toBe(6);
  });

  it('offers only the three lengths Veo renders', () => {
    const { select } = renderNode(videoData());

    expect([...select.options].map((option) => option.value)).toEqual(['4', '6', '8']);
  });

  it('reports 8s at 1080p even when the node still stores 4s', () => {
    // Veo renders anything above 720p at 8s whatever the node says, so showing the
    // stored 4 would promise a clip the user is never going to get.
    const { select } = renderNode(videoData({ resolution: '1080p', durationSeconds: 4 }));

    expect(select.value).toBe('8');
  });

  it('disables the shorter lengths at 1080p and says why on the option itself', () => {
    const { select } = renderNode(videoData({ resolution: '1080p' }));

    const options = [...select.options];
    expect(options.filter((option) => option.disabled).map((option) => option.value)).toEqual([
      '4',
      '6',
    ]);
    expect(options[0].textContent).toContain('720p only');
    expect(select.title).toContain('8 seconds only');
  });

  it('clamps a stored 4s up to 8s when the node is written at 4k', () => {
    const { select } = renderNode(videoData({ resolution: '4k', durationSeconds: 4 }));

    fireEvent.change(select, { target: { value: '4' } });

    expect(nodeData().durationSeconds).toBe(8);
  });
});
