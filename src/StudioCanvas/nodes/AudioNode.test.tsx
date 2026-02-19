import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { AudioNode } from './AudioNode';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { ComponentProps } from 'react';

describe('AudioNode', () => {
  const defaultProps: ComponentProps<typeof AudioNode> = {
    id: '1',
    data: { audio: 'data:audio/mp3;base64,test' },
    selected: false,
    type: 'audio',
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: undefined,
  };

  it('should render correctly', () => {
    const { container } = render(
        <ToastProvider>
            <ReactFlowProvider>
                <AudioNode {...defaultProps} />
            </ReactFlowProvider>
        </ToastProvider>
    );
    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.textContent).toContain('Audio Input');
  });

  it('should show upload state when empty', () => {
    const props = { ...defaultProps, data: { audio: undefined } };
    const { container } = render(
        <ToastProvider>
            <ReactFlowProvider>
                <AudioNode {...props} />
            </ReactFlowProvider>
        </ToastProvider>
    );
    expect(container.textContent).toContain('Upload Audio');
  });
});
