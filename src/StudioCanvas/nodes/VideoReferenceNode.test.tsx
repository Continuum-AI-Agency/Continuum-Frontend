import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { VideoReferenceNode } from './VideoReferenceNode';
import { useStudioStore } from '../stores/useStudioStore';
import { ToastProvider } from '@/components/ui/ToastProvider';

const updateNodeData = mock();
let originalUpdateNodeData: any;

describe('VideoReferenceNode', () => {
  beforeEach(() => {
    originalUpdateNodeData = useStudioStore.getState().updateNodeData;
    useStudioStore.setState({
      nodes: [],
      edges: [],
      updateNodeData,
    });
    updateNodeData.mockClear();
  });

  afterEach(() => {
    if (originalUpdateNodeData) {
      useStudioStore.setState({ updateNodeData: originalUpdateNodeData });
    }
    cleanup();
  });

  const defaultProps = {
    id: '1',
    data: {
      video: undefined,
      fileName: undefined,
    },
    type: 'video',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: '',
  };

  it('should render correctly', async () => {
    let renderResult: ReturnType<typeof render> | undefined;
    await act(async () => {
      renderResult = render(
        <ToastProvider>
          <ReactFlowProvider>
            <VideoReferenceNode {...defaultProps} />
          </ReactFlowProvider>
        </ToastProvider>
      );
    });

    expect(screen.getByText('Upload Video')).toBeTruthy();
  });

  it('should accept dropped video data URLs', async () => {
    const dataUrl = 'data:video/mp4;base64,drop_video_base64';
    let renderResult: ReturnType<typeof render> | undefined;
    await act(async () => {
      renderResult = render(
        <ToastProvider>
          <ReactFlowProvider>
            <VideoReferenceNode {...defaultProps} />
          </ReactFlowProvider>
        </ToastProvider>
      );
    });
    if (!renderResult) throw new Error('Render failed');
    const { container } = renderResult;

    const dropTarget = container.querySelector('div.relative.group') as HTMLElement;
    const dataTransfer = {
      getData: (type: string) => (type === 'text/plain' ? dataUrl : ''),
      files: [],
      types: ['text/plain'],
      dropEffect: 'copy',
    };

    await act(async () => {
      fireEvent.dragOver(dropTarget, { dataTransfer });
      fireEvent.drop(dropTarget, { dataTransfer });
    });

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith('1', { video: dataUrl, fileName: undefined });
    });
  });
});
