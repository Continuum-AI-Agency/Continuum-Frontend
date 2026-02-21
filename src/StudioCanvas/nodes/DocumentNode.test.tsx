import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { DocumentNode } from './DocumentNode';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { ComponentProps } from 'react';

describe('DocumentNode', () => {
  const defaultProps: ComponentProps<typeof DocumentNode> = {
    id: '1',
    data: { documents: [{ name: 'test.pdf', content: 'base64', type: 'pdf' as const }] },
    selected: false,
    type: 'document',
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: undefined,
  };

  it('should render correctly with documents', () => {
    const { container } = render(
        <ToastProvider>
            <ReactFlowProvider>
                <DocumentNode {...defaultProps} />
            </ReactFlowProvider>
        </ToastProvider>
    );
    expect(container.textContent).toContain('test.pdf');
    expect(container.textContent).toContain('pdf');
  });

  it('should show empty state', () => {
    const props = { ...defaultProps, data: { documents: [] } };
    const { container } = render(
        <ToastProvider>
            <ReactFlowProvider>
                <DocumentNode {...props} />
            </ReactFlowProvider>
        </ToastProvider>
    );
    expect(container.textContent).toContain('No Documents');
  });
});
