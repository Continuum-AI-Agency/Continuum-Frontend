import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';

mock.module('@/app/(post-auth)/settings/actions', () => ({
  switchActiveBrandAction: mock(async () => undefined),
}));

afterAll(() => mock.restore());

import { ToastProvider } from '@/components/ui/ToastProvider';
import { StudioRenderProvider } from '@/lib/studio-render/StudioRenderProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { TimelineEditorNodeData } from '../types';
import { TimelineEditorBlock } from './TimelineEditorBlock';

// The bug: the Video Editor node renders, writes a real media.assets row, and then
// says NOTHING about where the clip went — "Once it renders, where does it go?"
// (Airtable #253). Worse on a stale render, where the node stayed paused with the
// finished clip sitting in the Library, unmentioned.

const NODE_ID = 'timeline-1';
const ASSET_ID = 'a1b2c3d4-0000-4000-8000-000000000000';

const baseProps: Omit<ComponentProps<typeof TimelineEditorBlock>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'timelineEditor',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const renderNode = (data: TimelineEditorNodeData) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [{ id: NODE_ID, type: 'timelineEditor', position: { x: 0, y: 0 }, data }],
  });
  return render(
    <ToastProvider>
      <StudioRenderProvider>
        <ReactFlowProvider>
          <TimelineEditorBlock {...baseProps} data={data} />
        </ReactFlowProvider>
      </StudioRenderProvider>
    </ToastProvider>,
  );
};

describe('TimelineEditorBlock render destination', () => {
  beforeEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('names the Library and links to the asset once a render commits', () => {
    const { getByTestId } = renderNode({
      items: [],
      committed: true,
      generatedVideoUrl: 'https://example.test/clip.mp4',
      renderOutputAssetId: ASSET_ID,
    });

    const link = getByTestId('studio-timeline-render-destination');
    expect(link.textContent).toContain('Saved to Library');
    expect(link.getAttribute('href')).toBe(`/library?assetId=${ASSET_ID}`);
  });

  it('still points at the clip when the timeline went stale mid-render', () => {
    const { getByTestId } = renderNode({
      items: [],
      committed: false,
      awaitingInput: true,
      renderOutputAssetId: ASSET_ID,
      error: 'Timeline changed while this render was running. The clip is in your Library.',
    });

    expect(getByTestId('studio-timeline-render-error').textContent).toContain('in your Library');
    expect(getByTestId('studio-timeline-render-destination').getAttribute('href')).toBe(
      `/library?assetId=${ASSET_ID}`,
    );
  });

  it('shows no destination before anything has rendered', () => {
    const { queryByTestId } = renderNode({ items: [] });

    expect(queryByTestId('studio-timeline-render-destination')).toBeNull();
  });
});
