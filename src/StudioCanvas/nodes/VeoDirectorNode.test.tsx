import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VeoDirectorNode } from './VeoDirectorNode';
import { useStudioStore } from '../stores/useStudioStore';
import { ReactFlowProvider } from '@xyflow/react';

const updateNodeData = mock();

describe('VeoDirectorNode', () => {
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
      model: 'veo-3.1' as const,
      prompt: '',
      enhancePrompt: false,
    },
    type: 'veoDirector',
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
        <VeoDirectorNode {...defaultProps} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('🎥 Veo Director (Model)')).toBeTruthy();
    expect(screen.getByText('Motion Prompt')).toBeTruthy();
    expect(screen.getByText('Enhance Prompt')).toBeTruthy();
  });

  it('should update prompt on change', () => {
    render(
      <ReactFlowProvider>
        <VeoDirectorNode {...defaultProps} />
      </ReactFlowProvider>
    );

    const promptInput = screen.getByPlaceholderText('Camera pans slowly...');
    fireEvent.change(promptInput, { target: { value: 'Pan right' } });

    expect(updateNodeData).toHaveBeenCalledWith('1', { prompt: 'Pan right' });
  });

  it('should toggle enhance prompt', () => {
    render(
      <ReactFlowProvider>
        <VeoDirectorNode {...defaultProps} />
      </ReactFlowProvider>
    );

    // Find the switch. Usually has role="switch"
    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    // Since Radix Switch might behave differently, let's assume click triggers change.
    // If updateNodeData is called with { enhancePrompt: true }, it works.
    expect(updateNodeData).toHaveBeenCalledWith('1', { enhancePrompt: true });
  });
});
