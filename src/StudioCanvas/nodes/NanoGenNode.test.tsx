import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NanoGenNode } from './NanoGenNode';
import { useStudioStore } from '../stores/useStudioStore';
import { ReactFlowProvider } from '@xyflow/react';

// Mock CustomHandle to avoid React Flow context issues if possible, 
// or just wrap in provider. Wrapping in provider is safer.
// But CustomHandle uses useStudioStore? No, it just wraps Handle.

// Mock the store
const updateNodeData = mock();
const getConnectedEdges = mock(() => []);

describe('NanoGenNode', () => {
  beforeEach(() => {
    useStudioStore.setState({
      nodes: [],
      edges: [],
      updateNodeData,
      getConnectedEdges,
    });
    updateNodeData.mockClear();
    getConnectedEdges.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    id: '1',
    data: {
      model: 'nano-banana' as const,
      positivePrompt: '',
      aspectRatio: '1:1',
    },
    type: 'nanoGen',
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
        <NanoGenNode {...defaultProps} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('🍌 Nano Gen (Model)')).toBeTruthy();
    expect(screen.getByText('Prompt')).toBeTruthy();
    expect(screen.getByText('Negative')).toBeTruthy();
  });

  it('should update prompt on change', () => {
    render(
      <ReactFlowProvider>
        <NanoGenNode {...defaultProps} />
      </ReactFlowProvider>
    );

    const promptInput = screen.getByPlaceholderText('A cyberpunk city...');
    fireEvent.change(promptInput, { target: { value: 'New prompt' } });

    expect(updateNodeData).toHaveBeenCalledWith('1', { positivePrompt: 'New prompt' });
  });



  it('should display generated image', () => {
    const propsWithImage = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        generatedImage: 'base64image',
      },
    };

    render(
      <ReactFlowProvider>
        <NanoGenNode {...propsWithImage} />
      </ReactFlowProvider>
    );

    const img = screen.getByAltText('Generated');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('base64image');
  });

  it('should display error message', () => {
    const propsWithError = {
      ...defaultProps,
      data: {
        ...defaultProps.data,
        error: 'Something went wrong',
      },
    };

    render(
      <ReactFlowProvider>
        <NanoGenNode {...propsWithError} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
