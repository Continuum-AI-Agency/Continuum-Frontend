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
      expect(updateNodeData).toHaveBeenCalledWith('1', {
        image: dataUrl,
        originalImage: dataUrl,
        markupLayer: undefined,
        hasMarkup: false,
        fileName: undefined,
        sourcePath: undefined,
        sourceUrl: undefined,
      });
    });
  });

  it('should clear a reference image from the quick action button', async () => {
    const propsWithImage = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,clear_me',
        fileName: 'clear-me.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithImage} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    fireEvent.click(screen.getByLabelText('Clear image'));

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith('1', {
        image: undefined,
        originalImage: undefined,
        markupLayer: undefined,
        hasMarkup: false,
        fileName: undefined,
        sourcePath: undefined,
        sourceUrl: undefined,
        aspectRatio: '1:1',
      });
    });
  });

  it('should show markup button when image is present', () => {
    const propsWithImage = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,test_image',
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

    expect(screen.getByLabelText('Markup image')).toBeTruthy();
  });

  it('should not show markup button when no image is present', () => {
    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...defaultProps} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    expect(screen.queryByLabelText('Markup image')).toBeNull();
  });

  it('should display markup badge when hasMarkup is true', () => {
    const propsWithMarkup = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,test_image',
        originalImage: 'data:image/png;base64,original_image',
        markupLayer: 'data:image/png;base64,markup_layer',
        hasMarkup: true,
        fileName: 'test.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithMarkup} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Marked up')).toBeTruthy();
  });

  it('should render markup overlay when markupLayer is present', () => {
    const propsWithMarkup = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,test_image',
        originalImage: 'data:image/png;base64,original_image',
        markupLayer: 'data:image/png;base64,markup_layer',
        hasMarkup: true,
        fileName: 'test.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithMarkup} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    const overlayImg = screen.getByAltText('Markup overlay');
    expect(overlayImg).toBeTruthy();
    expect(overlayImg.getAttribute('src')).toBe('data:image/png;base64,markup_layer');
  });

  it('should clear markup data when clearing the image', async () => {
    const propsWithMarkup = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,test_image',
        originalImage: 'data:image/png;base64,original_image',
        markupLayer: 'data:image/png;base64,markup_layer',
        hasMarkup: true,
        fileName: 'test.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithMarkup} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    fireEvent.click(screen.getByLabelText('Clear image'));

    await waitFor(() => {
      expect(updateNodeData).toHaveBeenCalledWith('1', {
        image: undefined,
        originalImage: undefined,
        markupLayer: undefined,
        hasMarkup: false,
        fileName: undefined,
        sourcePath: undefined,
        sourceUrl: undefined,
        aspectRatio: '1:1',
      });
    });
  });

  it('should highlight markup button when hasMarkup is true', () => {
    const propsWithMarkup = {
      ...defaultProps,
      data: {
        image: 'data:image/png;base64,test_image',
        hasMarkup: true,
        fileName: 'test.png',
      },
    };

    render(
      <ToastProvider>
        <ReactFlowProvider>
          <ImageNode {...propsWithMarkup} />
        </ReactFlowProvider>
      </ToastProvider>
    );

    const markupButton = screen.getByLabelText('Markup image');
    expect(markupButton.className).toContain('text-amber-500');
  });
});
