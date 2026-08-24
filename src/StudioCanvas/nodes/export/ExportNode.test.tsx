import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { EXPORT_MEDIA_INPUT_HANDLE } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../../stores/useStudioStore';
import type { ExportNodeData } from '../../types';
import { ExportNode } from './ExportNode';

const updateNodeData = mock(() => {});

const EXPORT_ID = 'export-1';

function renderNode(data: ExportNodeData) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <ExportNode
          id={EXPORT_ID}
          type="export"
          data={data}
          selected={false}
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          draggable
          selectable
          deletable
        />
      </ReactFlowProvider>
    </ToastProvider>,
  );
}

const wire = (sources: { id: string; type: string; data: Record<string, unknown> }[]) => {
  useStudioStore.setState({
    brandId: 'brand-1',
    updateNodeData,
    nodes: [
      ...sources,
      { id: EXPORT_ID, type: 'export', position: { x: 0, y: 0 }, data: { format: null } },
    ] as never,
    edges: sources.map((source) => ({
      id: `e-${source.id}`,
      source: source.id,
      target: EXPORT_ID,
      targetHandle: EXPORT_MEDIA_INPUT_HANDLE,
    })) as never,
  });
};

describe('ExportNode', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1', updateNodeData });
    updateNodeData.mockClear();
  });

  afterEach(cleanup);

  it('draws exactly one input handle and no output — it is terminal', () => {
    const { container } = renderNode({ format: null });
    const handles = Array.from(container.querySelectorAll('[data-handleid]'));
    expect(handles).toHaveLength(1);
    expect(handles[0].getAttribute('data-handleid')).toBe(EXPORT_MEDIA_INPUT_HANDLE);
    expect(handles[0].getAttribute('data-handlepos')).toBe('left');
  });

  it('asks for an input instead of offering a format when nothing is wired in', () => {
    const { getByText, queryByTestId } = renderNode({ format: null });
    expect(getByText(/Connect an image or a clip/)).toBeTruthy();
    expect(queryByTestId('studio-export-format')).toBeNull();
  });

  it('offers the still formats and a single Download for one image upstream', () => {
    wire([{ id: 'gen', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/a.png' } }]);
    const { getByTestId } = renderNode({ format: null });
    expect(getByTestId('studio-export-format').textContent).toContain('PNG');
    expect(getByTestId('studio-export-download').textContent).toContain('Download');
    expect(getByTestId('studio-export-download').textContent).not.toContain('Download All');
  });

  it('switches to Download All once a second input joins the pool', () => {
    wire([
      { id: 'gen', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/a.png' } },
      { id: 'gen-2', type: 'nanoGen', data: { generatedImageUrl: 'https://cdn/b.png' } },
    ]);
    const { getByTestId, getByText } = renderNode({ format: null });
    expect(getByTestId('studio-export-download').textContent).toContain('Download All');
    expect(getByText(/saved as one ZIP/)).toBeTruthy();
  });

  it('shows a clip format, not a still one, when a video is wired in', () => {
    wire([{ id: 'clip', type: 'videoGen', data: { generatedVideoUrl: 'https://cdn/a.mp4' } }]);
    const { getByTestId, getByText } = renderNode({ format: null });
    expect(getByTestId('studio-export-format').textContent).toContain('MP4 (H.264)');
    expect(getByText('Video')).toBeTruthy();
  });

  it('ignores a stored format belonging to the other modality', () => {
    wire([{ id: 'clip', type: 'videoGen', data: { generatedVideoUrl: 'https://cdn/a.mp4' } }]);
    const { getByTestId } = renderNode({ format: 'webp' });
    expect(getByTestId('studio-export-format').textContent).toContain('MP4 (H.264)');
  });

  it('surfaces the GIF caps so the format is not a surprise', () => {
    wire([{ id: 'clip', type: 'videoGen', data: { generatedVideoUrl: 'https://cdn/a.mp4' } }]);
    const { getByText } = renderNode({ format: 'gif' });
    expect(getByText(/15fps and 480px/)).toBeTruthy();
  });
});
