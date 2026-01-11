import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ImageNode } from './ImageNode';
import { useStudioStore } from '../stores/useStudioStore';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';

const updateNodeData = mock();
let originalUpdateNodeData: any;

describe('ImageNode', () => {
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
      image: undefined,
      fileName: undefined,
    },
    type: 'image',
    selected: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: '',
  };

  it('should render correctly', () => {
    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...defaultProps} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Upload Image')).toBeTruthy();
  });

  it('should display image preview when data provided', () => {
    const propsWithImage = {
      ...defaultProps,
      data: {
        image: 'base64img',
        fileName: 'test.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithImage} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    const img = screen.getByAltText('Preview');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('base64img');
    expect(screen.getByText('test.png')).toBeTruthy();
  });

  it('should accept dropped image data URLs', async () => {
    const dataUrl = 'data:image/png;base64,drop_base64';
    const { container } = render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...defaultProps} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    const dropTarget = container.querySelector('div.relative.group') as HTMLElement;
    const dataTransfer = {
      getData: (type: string) => (type === 'text/plain' ? dataUrl : ''),
      files: [],
      types: ['text/plain'],
      dropEffect: 'copy',
    };

    fireEvent.dragOver(dropTarget, { dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith('1', { image: dataUrl, fileName: undefined });
    });
  });
});
