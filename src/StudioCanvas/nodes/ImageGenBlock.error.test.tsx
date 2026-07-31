import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import { ImageGenBlock } from './ImageGenBlock';

// A generation that comes back with no image has to leave something on the canvas.
// It used to leave the node in its untouched "No Image" empty state, so once the
// five-second toast expired the user could not tell a failed run from one they had
// never started — let alone that the fix was to change the prompt or references.

const baseProps: Omit<ComponentProps<typeof ImageGenBlock>, 'data'> = {
  id: 'img1',
  selected: false,
  type: 'nanoGen',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const renderNode = (node: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>{node}</ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

describe('ImageGenBlock failure state', () => {
  beforeEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('tells the user to change the prompt or references when Gemini returned no image', () => {
    const { getByTestId, queryByText } = renderNode(
      <ImageGenBlock
        {...baseProps}
        data={{
          prompt: 'a sneaker',
          error: 'No image returned by Gemini. Retry only after changing the prompt or references.',
          errorCode: 'image_empty_response',
        }}
      />,
    );

    const panel = getByTestId('studio-image-node-error');
    expect(panel.textContent).toContain('No image came back');
    expect(panel.textContent).toContain('Change the prompt or the reference images');
    expect(queryByText('No Image')).toBeNull();
  });

  it('names the safety block as the thing to work around', () => {
    const { getByTestId } = renderNode(
      <ImageGenBlock
        {...baseProps}
        data={{ prompt: 'a sneaker', error: 'blocked', errorCode: 'image_blocked' }}
      />,
    );

    expect(getByTestId('studio-image-node-error').textContent).toContain('This image was blocked');
  });

  it('falls back to the raw backend message for an unclassified failure', () => {
    const { getByTestId } = renderNode(
      <ImageGenBlock
        {...baseProps}
        data={{ prompt: 'a sneaker', error: 'Vertex is unreachable' }}
      />,
    );

    expect(getByTestId('studio-image-node-error').textContent).toContain('Vertex is unreachable');
  });

  it('shows the ordinary empty state when nothing has failed', () => {
    const { queryByTestId, getByText } = renderNode(
      <ImageGenBlock {...baseProps} data={{ prompt: 'a sneaker' }} />,
    );

    expect(queryByTestId('studio-image-node-error')).toBeNull();
    expect(getByText('No Image')).toBeTruthy();
  });
});
