import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  LAYER_EDITOR_IMAGE_INPUT_HANDLE,
  LAYER_EDITOR_IMAGE_OUTPUT_HANDLE,
} from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../../stores/useStudioStore';
import type { LayerEditorLayer, LayerEditorNodeData } from '../../types';
import { LayerEditorBlock } from './LayerEditorBlock';

// The node is a LAUNCHER, not the editor: it has to report the pool, the layer count,
// the frame it will export at, and the composed still. Everything it shows is read
// straight off node data, so these are the assertions that catch a field renamed
// underneath it.

const layer = (id: string): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 100,
  sourceHeight: 100,
  anchor: { x: 50, y: 50 },
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
});

function renderNode(data: LayerEditorNodeData) {
  return render(
    <ToastProvider>
      <ReactFlowProvider>
        <LayerEditorBlock
          id="layers-1"
          type="layerEditor"
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

describe('LayerEditorBlock', () => {
  beforeEach(() => {
    // brandId undefined ⇒ Compose stays a data URL and never reaches storage in tests.
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('carries the pooled image input and the composed image output', () => {
    const { container } = renderNode({});
    expect(handleIds(container, 'left')).toEqual([LAYER_EDITOR_IMAGE_INPUT_HANDLE]);
    expect(handleIds(container, 'right')).toEqual([LAYER_EDITOR_IMAGE_OUTPUT_HANDLE]);
  });

  it('counts the layers it holds', () => {
    expect(renderNode({ layers: [layer('a')] }).getByTestId('layer-editor-count').textContent).toBe(
      '1 layer',
    );
    cleanup();
    expect(
      renderNode({ layers: [layer('a'), layer('b')] }).getByTestId('layer-editor-count')
        .textContent,
    ).toBe('2 layers');
  });

  it('reports the §4.3 default frame before anything sets one', () => {
    const { getByText } = renderNode({});
    expect(getByText('2048 × 2048')).toBeTruthy();
  });

  it('reports the frame the document actually carries', () => {
    const { getByText } = renderNode({ frame: { width: 1080, height: 1920 } });
    expect(getByText('1080 × 1920')).toBeTruthy();
  });

  it('asks for images before any are wired in', () => {
    const { getByText } = renderNode({});
    expect(getByText('Connect images to stack them')).toBeTruthy();
  });

  it('shows the durable composite in preference to the mirrored data URL', () => {
    const { container } = renderNode({
      generatedImage: 'data:image/png;base64,AAAA',
      generatedImageUrl: 'https://storage.example/composite.png',
      layers: [layer('a')],
    });
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://storage.example/composite.png');
    expect(image?.getAttribute('alt')).toBe('Composed layers');
  });

  it('falls back to the data URL when nothing has been persisted yet', () => {
    const { container } = renderNode({ generatedImage: 'data:image/png;base64,AAAA' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('opens the editor from the node', () => {
    const { getByRole, queryByRole } = renderNode({ layers: [layer('a')] });
    expect(queryByRole('dialog')).toBeNull();

    fireEvent.click(getByRole('button', { name: /Edit/ }));

    expect(queryByRole('dialog')).toBeTruthy();
  });
});
