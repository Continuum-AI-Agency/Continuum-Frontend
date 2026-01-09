import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ImageNode } from './ImageNode';
import { useStudioStore } from '../stores/useStudioStore';
import { ReactFlowProvider } from '@xyflow/react';

const updateNodeData = mock();

describe('ImageNode', () => {
  beforeEach(() => {
    useStudioStore.setState({
      nodes: [],
      edges: [],
      updateNodeData,
    });
    updateNodeData.mockClear();
  });

  afterEach(() => {
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
      <ReactFlowProvider>
        <ImageNode {...defaultProps} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('Image Input')).toBeTruthy();
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
      <ReactFlowProvider>
        <ImageNode {...propsWithImage} />
      </ReactFlowProvider>
    );

    const img = screen.getByAltText('Preview');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('base64img');
    expect(screen.getByText('test.png')).toBeTruthy();
  });
});
