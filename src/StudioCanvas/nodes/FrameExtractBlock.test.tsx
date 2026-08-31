import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// `executeWorkflow` reaches the network and the whole graph; the node's contract here is
// which CONTROLS it offers, so the run is stubbed at the module boundary.
const executeWorkflowMock = mock(() => Promise.resolve(undefined as unknown));
mock.module('../utils/executeWorkflow', () => ({ executeWorkflow: executeWorkflowMock }));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { FrameExtractNodeData } from '../types';
import { FrameExtractBlock } from './FrameExtractBlock';

const NODE_ID = 'frames-1';

const updateNodeData = mock();

function renderNode(data: Partial<FrameExtractNodeData> = {}) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <FrameExtractBlock
          id={NODE_ID}
          type="frameExtract"
          data={{ selector: 'last', ...data } as FrameExtractNodeData}
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

describe('FrameExtractBlock', () => {
  beforeEach(() => {
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1', updateNodeData });
    updateNodeData.mockClear();
    executeWorkflowMock.mockClear();
  });

  afterEach(cleanup);

  it('draws a video input and an image output', () => {
    const { container } = renderNode();
    const handles = [...container.querySelectorAll('[data-handleid]')].map((handle) => [
      handle.getAttribute('data-handlepos'),
      handle.getAttribute('data-handleid'),
    ]);
    expect(handles).toEqual([
      ['left', 'video'],
      ['right', 'image'],
    ]);
  });

  it('asks for a clip before it can extract anything', () => {
    renderNode();
    expect(screen.getByText('Connect a video')).toBeDefined();
    expect(screen.getByRole('button', { name: /Extract/ }).hasAttribute('disabled')).toBe(true);
  });

  // The gate #292 is about, on the node that already gets it right: `Sec` is meaningless
  // for the first or last frame, so it is not offered until the selector asks for a time.
  it('offers the timestamp field only for the selector that reads it', () => {
    renderNode({ selector: 'last' });
    expect(screen.queryByText('Sec')).toBeNull();

    cleanup();
    renderNode({ selector: 'timestamp', timestampSec: 2.5 });
    expect(screen.getByText('Sec')).toBeDefined();
  });

  it('writes the selector the user picked', () => {
    renderNode({ selector: 'last' });

    fireEvent.change(screen.getByLabelText('Which frame to extract'), {
      target: { value: 'first' },
    });

    expect(updateNodeData).toHaveBeenCalledWith(NODE_ID, { selector: 'first' });
  });

  it('shows the extracted still, labelled by the selector that produced it', () => {
    const { container } = renderNode({
      selector: 'first',
      generatedImage: 'data:image/png;base64,AAAA',
    });
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(image?.getAttribute('alt')).toBe('first extracted video frame');
  });

  it('keeps nodrag on its controls and off its body', () => {
    const { container } = renderNode({ selector: 'timestamp' });

    const body = container.querySelector('[data-slot="card-content"]');
    expect(body).toBeTruthy();
    expect(body?.closest('.nodrag')).toBeNull();

    expect(screen.getByRole('button', { name: /Extract/ }).closest('.nodrag')).toBeTruthy();
    expect(screen.getByLabelText('Which frame to extract').closest('.nodrag')).toBeTruthy();
  });
});
