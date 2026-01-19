import { describe, it, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { DocumentNode } from './DocumentNode';
import { ReactFlowProvider } from '@xyflow/react';

describe('DocumentNode', () => {
  const defaultProps = {
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
        <ReactFlowProvider>
            <DocumentNode {...defaultProps as any} />
        </ReactFlowProvider>
    );
    expect(container.textContent).toContain('Documents (1)');
    expect(container.textContent).toContain('test.pdf');
  });

  it('should show empty state', () => {
    const props = { ...defaultProps, data: { documents: [] } };
    const { container } = render(
        <ReactFlowProvider>
            <DocumentNode {...props as any} />
        </ReactFlowProvider>
    );
    expect(container.textContent).toContain('No Documents');
  });
});
