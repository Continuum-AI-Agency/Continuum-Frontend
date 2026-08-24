import { afterEach, describe, expect, it } from 'bun:test';
import { ROUTER_INPUT_HANDLE, ROUTER_OUTPUT_HANDLE } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

import { ToastProvider } from '@/components/ui/ToastProvider';
import type { RouterNodeData } from '../types';
import { RouterNode } from './RouterNode';

function renderNode(data: RouterNodeData) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <RouterNode
          id="router-1"
          type="router"
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

const handleIds = (container: HTMLElement, position: 'left' | 'right') =>
  Array.from(container.querySelectorAll('[data-handleid]'))
    .filter((element) => element.getAttribute('data-handlepos') === position)
    .map((element) => element.getAttribute('data-handleid') ?? '');

describe('RouterNode', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the modality it is locked to', () => {
    const { getByText } = renderNode({ lockedType: 'video' });

    expect(getByText('Router')).toBeDefined();
    expect(getByText('Video')).toBeDefined();
  });

  it('reads as unset before anything is connected', () => {
    const { getByText } = renderNode({ lockedType: null });

    expect(getByText('Unset')).toBeDefined();
    expect(getByText('Connect a source')).toBeDefined();
  });

  it('previews what is passing through, keyed on the locked modality', () => {
    const { container, getByText } = renderNode({
      lockedType: 'text',
      value: 'routed copy',
    });

    expect(getByText('routed copy')).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws one target handle and ONE source handle — the fan-out is many edges', () => {
    const { container } = renderNode({ lockedType: 'image' });

    expect(handleIds(container, 'left')).toEqual([ROUTER_INPUT_HANDLE]);
    expect(handleIds(container, 'right')).toEqual([ROUTER_OUTPUT_HANDLE]);
  });
});
